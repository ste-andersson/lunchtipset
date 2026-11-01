import type { MenuFetchLog, UrlSuggestion } from '@lunch/shared'
import { desc, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { type AuthVars, requireAdmin, requireUser } from '../auth.ts'
import { db } from '../db/index.ts'
import { menuFetches, restaurants, urlSuggestions } from '../db/schema.ts'
import { parseFixedMenu } from '../menus/extract.ts'
import { fetchAllMenus } from '../menus/fetcher.ts'
import { idParam, parseJson } from './parse.ts'
import { restaurantSchema } from './validation.ts'

export const adminRoutes = new Hono<{ Variables: AuthVars }>()
adminRoutes.use(requireUser, requireAdmin)

/** Includes inactive restaurants, unlike the public list. */
adminRoutes.get('/restaurants', async (c) => {
  const rows = await db.select().from(restaurants).orderBy(restaurants.name)
  return c.json(rows.map(({ createdAt: _, fixedMenu: __, ...r }) => r))
})

adminRoutes.post('/restaurants', async (c) => {
  const body = await parseJson(c, restaurantSchema)
  const fixedMenu = await parseFixedMenu(body.fixedMenuText, body.name)
  const [row] = await db
    .insert(restaurants)
    .values({ ...body, fixedMenu })
    .returning()
  return c.json(row, 201)
})

adminRoutes.put('/restaurants/:id', async (c) => {
  const body = await parseJson(c, restaurantSchema)
  const [current] = await db
    .select({ text: restaurants.fixedMenuText })
    .from(restaurants)
    .where(eq(restaurants.id, idParam(c)))
  if (!current) throw new HTTPException(404)
  // Only ask Gemini again when the text actually changed.
  const fixedMenu =
    current.text === body.fixedMenuText
      ? undefined
      : await parseFixedMenu(body.fixedMenuText, body.name)
  const [row] = await db
    .update(restaurants)
    .set({ ...body, ...(fixedMenu ? { fixedMenu } : {}) })
    .where(eq(restaurants.id, idParam(c)))
    .returning()
  if (!row) throw new HTTPException(404)
  return c.json(row)
})

adminRoutes.delete('/restaurants/:id', async (c) => {
  await db.delete(restaurants).where(eq(restaurants.id, idParam(c)))
  return c.json({ ok: true })
})

adminRoutes.get('/url-suggestions', async (c) => {
  const rows = await db
    .select()
    .from(urlSuggestions)
    .where(eq(urlSuggestions.status, 'pending'))
    .orderBy(desc(urlSuggestions.createdAt))
  return c.json(
    rows.map(
      (r): UrlSuggestion => ({
        id: r.id,
        restaurantId: r.restaurantId,
        restaurantName: r.restaurantName,
        url: r.url,
        comment: r.comment,
        status: r.status as UrlSuggestion['status'],
        createdAt: r.createdAt.toISOString(),
      }),
    ),
  )
})

/** Accepting a suggestion for a known restaurant also sets its menu url. */
adminRoutes.put('/url-suggestions/:id', async (c) => {
  const { status } = await parseJson(c, z.object({ status: z.enum(['accepted', 'rejected']) }))
  const [row] = await db
    .update(urlSuggestions)
    .set({ status })
    .where(eq(urlSuggestions.id, idParam(c)))
    .returning()
  if (!row) throw new HTTPException(404)
  if (status === 'accepted' && row.restaurantId) {
    await db
      .update(restaurants)
      .set({ menuUrl: row.url })
      .where(eq(restaurants.id, row.restaurantId))
  }
  return c.json({ ok: true })
})

adminRoutes.get('/fetch-log', async (c) => {
  const rows = await db
    .select({
      id: menuFetches.id,
      restaurantId: menuFetches.restaurantId,
      restaurantName: restaurants.name,
      status: menuFetches.status,
      message: menuFetches.message,
      itemCount: menuFetches.itemCount,
      fetchedAt: menuFetches.fetchedAt,
    })
    .from(menuFetches)
    .innerJoin(restaurants, eq(restaurants.id, menuFetches.restaurantId))
    .orderBy(desc(menuFetches.fetchedAt))
    .limit(100)
  return c.json(
    rows.map(
      (r): MenuFetchLog => ({
        ...r,
        status: r.status as MenuFetchLog['status'],
        fetchedAt: r.fetchedAt.toISOString(),
      }),
    ),
  )
})

adminRoutes.post('/fetch-menus', async (c) => {
  const id = c.req.query('restaurantId')
  return c.json(await fetchAllMenus(id ? Number(id) : undefined))
})
