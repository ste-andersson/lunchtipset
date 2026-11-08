import type { CallLine, CallLog, CallLogSummary, MenuFetchLog } from '@lunch/shared'
import { desc, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { type AuthVars, requireAdmin, requireUser } from '../auth.ts'
import { db } from '../db/index.ts'
import { callLogs, menuFetches, restaurants } from '../db/schema.ts'
import { fetchAllMenus } from '../menus/fetcher.ts'
import { authors } from '../users.ts'
import { idParam, parseJson } from './parse.ts'
import { restaurantSchema } from './validation.ts'

export const adminRoutes = new Hono<{ Variables: AuthVars }>()
adminRoutes.use(requireUser, requireAdmin)

/** Includes inactive restaurants, unlike the public list. */
adminRoutes.get('/restaurants', async (c) => {
  const rows = await db.select().from(restaurants).orderBy(restaurants.name)
  return c.json(rows.map(({ createdAt: _, ...r }) => r))
})

adminRoutes.post('/restaurants', async (c) => {
  const body = await parseJson(c, restaurantSchema)
  const [row] = await db.insert(restaurants).values(body).returning()
  return c.json(row, 201)
})

adminRoutes.put('/restaurants/:id', async (c) => {
  const body = await parseJson(c, restaurantSchema)
  const [row] = await db
    .update(restaurants)
    .set(body)
    .where(eq(restaurants.id, idParam(c)))
    .returning()
  if (!row) throw new HTTPException(404)
  return c.json(row)
})

adminRoutes.delete('/restaurants/:id', async (c) => {
  await db.delete(restaurants).where(eq(restaurants.id, idParam(c)))
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

adminRoutes.get('/calls', async (c) => {
  const rows = await db
    .select({
      id: callLogs.id,
      userId: callLogs.userId,
      assistantId: callLogs.assistantId,
      startedAt: callLogs.startedAt,
      durationSec: callLogs.durationSec,
      endReason: callLogs.endReason,
      transcript: callLogs.transcript,
    })
    .from(callLogs)
    .orderBy(desc(callLogs.startedAt))
    .limit(100)
  const names = await authors(rows.flatMap((r) => (r.userId ? [r.userId] : [])))
  return c.json(
    rows.map(
      ({ userId, startedAt, transcript, ...r }): CallLogSummary => ({
        ...r,
        author: userId ? (names.get(userId) ?? null) : null,
        startedAt: startedAt.toISOString(),
        lineCount: (transcript as CallLine[]).length,
      }),
    ),
  )
})

adminRoutes.get('/calls/:id', async (c) => {
  const [row] = await db
    .select()
    .from(callLogs)
    .where(eq(callLogs.id, c.req.param('id')))
  if (!row) throw new HTTPException(404)
  const author = row.userId ? ((await authors([row.userId])).get(row.userId) ?? null) : null
  const { userId: _, createdAt: __, ...rest } = row
  return c.json({
    ...rest,
    author,
    startedAt: row.startedAt.toISOString(),
    transcript: row.transcript as CallLine[],
    actions: row.actions as string[],
    lineCount: (row.transcript as CallLine[]).length,
  } satisfies CallLog)
})

adminRoutes.post('/fetch-menus', async (c) => {
  const id = c.req.query('restaurantId')
  return c.json(await fetchAllMenus(id ? Number(id) : undefined))
})
