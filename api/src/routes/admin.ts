import type { MenuFetchLog } from '@lunch/shared'
import { desc, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { type AuthVars, requireAdmin, requireUser } from '../auth.ts'
import { db } from '../db/index.ts'
import { menuFetches, restaurants } from '../db/schema.ts'
import { fetchAllMenus } from '../menus/fetcher.ts'
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

adminRoutes.post('/fetch-menus', async (c) => {
  const id = c.req.query('restaurantId')
  return c.json(await fetchAllMenus(id ? Number(id) : undefined))
})
