import { daysBetween, isoDate } from '@lunch/shared'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { type AuthVars, requireUser, userIdOf } from '../auth.ts'
import { db } from '../db/index.ts'
import { restaurantNotes } from '../db/schema.ts'
import { extractMenu, type MenuInput } from '../menus/extract.ts'
import { saveMenuDays } from '../menus/store.ts'
import { idParam, parseJson } from './parse.ts'
import { restaurantExists } from './public.ts'
import { menuDaysSchema, sentimentSchema } from './validation.ts'

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
const MAX_TEXT_CHARS = 5000
/** Uploads may correct last week or prepare next week; nothing further out. */
const PUBLISH_WINDOW_DAYS = 7

export const contributeRoutes = new Hono<{ Variables: AuthVars }>()
contributeRoutes.use(requireUser)

contributeRoutes.post('/restaurants/:id/notes', async (c) => {
  const id = idParam(c)
  if (!(await restaurantExists(id))) throw new HTTPException(404)
  const body = await parseJson(
    c,
    z.object({
      sentiment: sentimentSchema,
      text: z.string().trim().min(1).max(1000),
      source: z.enum(['user', 'assistant']).default('user'),
    }),
  )
  const [row] = await db
    .insert(restaurantNotes)
    .values({ ...body, restaurantId: id, userId: userIdOf(c) })
    .returning({ id: restaurantNotes.id })
  return c.json(row, 201)
})

/**
 * Step 1 of an upload: interpret a photo or PDF. Nothing is stored, the image is
 * dropped as soon as Gemini has read it.
 */
contributeRoutes.post('/menus/parse', async (c) => {
  const form = await c.req.formData()
  const file = form.get('file')
  const text = form.get('text')
  const scope = z.enum(['today', 'week']).parse(form.get('scope'))
  const restaurantId = Number(form.get('restaurantId'))
  const restaurant = await restaurantExists(restaurantId)
  if (!restaurant) throw new HTTPException(404, { message: 'Okänd restaurang' })

  let input: MenuInput
  if (typeof text === 'string' && text.trim()) {
    // Written by a colleague, e.g. "pad thai 125 kr, grön curry med tofu".
    input = { kind: 'text', text: text.slice(0, MAX_TEXT_CHARS) }
  } else if (file instanceof File) {
    if (file.size > MAX_UPLOAD_BYTES) throw new HTTPException(413, { message: 'Filen är för stor' })
    if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
      throw new HTTPException(415, { message: 'Bara bilder och PDF' })
    }
    input = {
      kind: 'file',
      mimeType: file.type,
      base64: Buffer.from(await file.arrayBuffer()).toString('base64'),
    }
  } else {
    throw new HTTPException(400, { message: 'Skicka en bild eller en text' })
  }

  const days = await extractMenu(input, {
    today: isoDate(),
    scope,
    restaurantName: restaurant.name,
  })
  return c.json({ days })
})

/** Step 2: the user has checked (and maybe corrected) the result. */
contributeRoutes.post('/menus/publish', async (c) => {
  const body = await parseJson(
    c,
    z.object({ restaurantId: z.number().int(), days: menuDaysSchema }),
  )
  if (!(await restaurantExists(body.restaurantId))) throw new HTTPException(404)
  const today = isoDate()
  if (body.days.some((d) => Math.abs(daysBetween(today, d.date)) > PUBLISH_WINDOW_DAYS)) {
    throw new HTTPException(400, {
      message: `Menyer kan bara läggas upp för datum inom ${PUBLISH_WINDOW_DAYS} dagar`,
    })
  }
  await saveMenuDays(body.restaurantId, 'upload', body.days)
  return c.json({ ok: true })
})
