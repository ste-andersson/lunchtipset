import {
  type Assistant,
  addDays,
  isoDate,
  type MenuItem,
  type MenuSource,
  menuDay,
  type RestaurantNote,
  type Sentiment,
  type SentimentCounts,
  type TodayResponse,
} from '@lunch/shared'
import { and, desc, eq, gte, isNotNull, or } from 'drizzle-orm'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { type AuthVars, isAdmin } from '../auth.ts'
import { assistants } from '../data/assistants.ts'
import { db } from '../db/index.ts'
import { mealLogs, menuFetches, menuItems, restaurantNotes, restaurants } from '../db/schema.ts'
import { env } from '../env.ts'
import { tasteFor } from '../menus/taste.ts'
import { authors } from '../users.ts'
import { agentIdFor } from '../voice/syncAgents.ts'
import { parseJson } from './parse.ts'
import { sentimentSchema } from './validation.ts'

const TASTE_MAX_MEALS = 40

const OPINION_WINDOW_DAYS = 120
const NOTES_PER_RESTAURANT = 5

export const publicRoutes = new Hono<{ Variables: AuthVars }>()

publicRoutes.get('/health', (c) => c.json({ ok: true }))

publicRoutes.get('/me', (c) => {
  const userId = c.get('userId')
  return c.json(userId ? { userId, isAdmin: isAdmin(userId) } : null)
})

publicRoutes.get('/assistants', (c) =>
  c.json(assistants.map(({ agent: _, ...publicFields }): Assistant => publicFields)),
)

publicRoutes.get('/restaurants', async (c) => {
  const rows = await db
    .select()
    .from(restaurants)
    .where(eq(restaurants.active, true))
    .orderBy(restaurants.distanceMeters)
  return c.json(rows.map(({ createdAt: _, fixedMenu: __, ...r }) => r))
})

const dateParam = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .catch(() => isoDate())

/**
 * Without a date: today, unless it's a weekend with no menus at all, in which
 * case the coming Monday is more useful.
 */
publicRoutes.get('/today', async (c) => {
  const asked = c.req.query('date')
  if (asked) return c.json(await buildToday(dateParam.parse(asked)))
  const today = await buildToday(isoDate())
  const next = menuDay(today.date)
  const hasDailyMenus = today.restaurants.some((r) => r.items.some((i) => !i.fixed))
  if (next === today.date || hasDailyMenus) return c.json(today)
  return c.json(await buildToday(next))
})

/** Free-text preferences → how well each of the day's dishes fits. Works for guests. */
publicRoutes.post('/taste', async (c) => {
  const body = await parseJson(
    c,
    z.object({
      date: z.string(),
      freeText: z.string().max(2000),
      meals: z
        .array(
          z.object({
            date: z.string().max(10),
            restaurantName: z.string().max(200),
            dish: z.string().max(300).nullable(),
            sentiment: sentimentSchema.nullable(),
            comment: z.string().max(1000).nullable(),
          }),
        )
        .max(TASTE_MAX_MEALS)
        .default([]),
    }),
  )
  const today = await buildToday(dateParam.parse(body.date))
  return c.json(await tasteFor(today, body.freeText, body.meals))
})

async function buildToday(date: string): Promise<TodayResponse> {
  const since = addDays(date, -OPINION_WINDOW_DAYS)

  const [rs, items, meals, notes, fetches] = await Promise.all([
    db.select().from(restaurants).where(eq(restaurants.active, true)),
    db.select().from(menuItems).where(eq(menuItems.date, date)).orderBy(menuItems.position),
    db
      .select({
        id: mealLogs.id,
        userId: mealLogs.userId,
        restaurantId: mealLogs.restaurantId,
        sentiment: mealLogs.sentiment,
        dish: mealLogs.dish,
        comment: mealLogs.comment,
        createdAt: mealLogs.createdAt,
      })
      .from(mealLogs)
      .where(
        and(
          gte(mealLogs.date, since),
          or(isNotNull(mealLogs.sentiment), isNotNull(mealLogs.comment)),
        ),
      ),
    db.select().from(restaurantNotes).orderBy(desc(restaurantNotes.createdAt)).limit(500),
    db.select().from(menuFetches).orderBy(desc(menuFetches.fetchedAt)).limit(500),
  ])

  const people = await authors([
    ...notes.map((n) => n.userId),
    ...meals.filter((m) => m.comment).map((m) => m.userId),
  ])

  const body: TodayResponse = {
    date,
    restaurants: rs
      .map((r) => {
        const own = items.filter((i) => i.restaurantId === r.id)
        // A user-checked upload wins over what the scraper found.
        const source: MenuSource | null = own.some((i) => i.source === 'upload')
          ? 'upload'
          : own.length
            ? 'web'
            : null
        const counts: SentimentCounts = { positive: 0, neutral: 0, negative: 0 }
        for (const s of [
          ...meals.filter((m) => m.restaurantId === r.id).map((m) => m.sentiment),
          ...notes.filter((n) => n.restaurantId === r.id).map((n) => n.sentiment),
        ]) {
          if (s === 'positive' || s === 'neutral' || s === 'negative') counts[s]++
        }
        const lastFetch = fetches.find((f) => f.restaurantId === r.id)
        return {
          id: r.id,
          name: r.name,
          address: r.address,
          distanceMeters: r.distanceMeters,
          menuUrl: r.menuUrl,
          website: r.website,
          category: r.category,
          description: r.description,
          fixedMenuText: r.fixedMenuText,
          active: r.active,
          menuSource: source,
          // Today's dishes first, then whatever is always on the menu.
          items: [
            ...own
              .filter((i) => i.source === source)
              .map(
                (i): MenuItem => ({
                  title: i.title,
                  description: i.description,
                  priceSek: i.priceSek,
                }),
              ),
            ...(r.fixedMenu as MenuItem[]).map((i) => ({ ...i, fixed: true })),
          ],
          colleagues: counts,
          // Colleague tips: notes left about the place, plus comments on logged lunches.
          notes: [
            ...notes
              .filter((n) => n.restaurantId === r.id)
              .map(
                (n): RestaurantNote => ({
                  id: `n${n.id}`,
                  sentiment: n.sentiment as Sentiment,
                  text: n.text,
                  dish: null,
                  author: people.get(n.userId) ?? null,
                  createdAt: n.createdAt.toISOString(),
                }),
              ),
            ...meals
              .filter((m) => m.restaurantId === r.id && m.comment)
              .map(
                (m): RestaurantNote => ({
                  id: `m${m.id}`,
                  sentiment: (m.sentiment as Sentiment | null) ?? null,
                  text: m.comment ?? '',
                  dish: m.dish,
                  author: people.get(m.userId) ?? null,
                  createdAt: m.createdAt.toISOString(),
                }),
              ),
          ]
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .slice(0, NOTES_PER_RESTAURANT),
          lastFetch: lastFetch
            ? {
                status: lastFetch.status as 'ok' | 'empty' | 'error',
                at: lastFetch.fetchedAt.toISOString(),
                message: lastFetch.message,
              }
            : null,
        }
      })
      .sort((a, b) => a.distanceMeters - b.distanceMeters),
  }
  return body
}

/** The browser connects to ElevenLabs with this; the API key never leaves the server. */
publicRoutes.post('/conversation/signed-url', async (c) => {
  const { assistantId } = await parseJson(c, z.object({ assistantId: z.string() }))
  const assistant = assistants.find((a) => a.id === assistantId)
  if (!assistant) throw new HTTPException(404, { message: 'Okänd assistent' })
  if (!env.ELEVENLABS_API_KEY) {
    throw new HTTPException(503, { message: 'Röstsamtal är inte konfigurerat' })
  }
  const agentId = await agentIdFor(assistant.id)
  if (!agentId) throw new HTTPException(503, { message: 'Assistenten saknar agent' })
  const res = await fetch(
    `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`,
    { headers: { 'xi-api-key': env.ELEVENLABS_API_KEY } },
  )
  if (!res.ok) {
    console.error('ElevenLabs signed url failed', res.status, await res.text().catch(() => ''))
    throw new HTTPException(502, { message: 'Kunde inte starta samtalet' })
  }
  const { signed_url } = (await res.json()) as { signed_url: string }
  return c.json({ signedUrl: signed_url })
})

export async function restaurantExists(id: number) {
  const [row] = await db
    .select({ id: restaurants.id, name: restaurants.name })
    .from(restaurants)
    .where(eq(restaurants.id, id))
  return row ?? null
}
