import { DEFAULT_PREFERENCES, type MealLog, type Preferences } from '@lunch/shared'
import { and, desc, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { type AuthVars, requireUser, userIdOf } from '../auth.ts'
import { db } from '../db/index.ts'
import { mealLogs, userProfiles } from '../db/schema.ts'
import { parseJson } from './parse.ts'
import { mealSchema, preferencesSchema } from './validation.ts'

const MEAL_HISTORY_LIMIT = 200

export const meRoutes = new Hono<{ Variables: AuthVars }>()
meRoutes.use(requireUser)

meRoutes.get('/preferences', async (c) => {
  const [row] = await db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.userId, userIdOf(c)))
  // null tells the client there is nothing saved yet, so guest data may be imported.
  if (!row) return c.json(null)
  return c.json({ ...DEFAULT_PREFERENCES, ...(row.preferences as Partial<Preferences>) })
})

meRoutes.put('/preferences', async (c) => {
  const prefs = await parseJson(c, preferencesSchema)
  const userId = userIdOf(c)
  await db
    .insert(userProfiles)
    .values({ userId, preferences: prefs })
    .onConflictDoUpdate({
      target: userProfiles.userId,
      set: { preferences: prefs, updatedAt: new Date() },
    })
  return c.json(prefs)
})

meRoutes.get('/meals', async (c) => {
  const rows = await db
    .select()
    .from(mealLogs)
    .where(eq(mealLogs.userId, userIdOf(c)))
    .orderBy(desc(mealLogs.date))
    .limit(MEAL_HISTORY_LIMIT)
  return c.json(rows.map(toMeal))
})

/** Create or replace, keyed by the client-generated id. Accepts one meal or a list. */
meRoutes.put('/meals', async (c) => {
  const meals = await parseJson(c, z.union([mealSchema, z.array(mealSchema).max(500)]))
  const list = Array.isArray(meals) ? meals : [meals]
  const userId = userIdOf(c)
  for (const m of list) {
    await db
      .insert(mealLogs)
      .values({ ...m, userId })
      .onConflictDoUpdate({
        target: mealLogs.id,
        set: { ...m, userId },
        setWhere: eq(mealLogs.userId, userId),
      })
  }
  return c.json({ ok: true })
})

meRoutes.delete('/meals/:id', async (c) => {
  await db
    .delete(mealLogs)
    .where(and(eq(mealLogs.id, c.req.param('id')), eq(mealLogs.userId, userIdOf(c))))
  return c.json({ ok: true })
})

function toMeal(r: typeof mealLogs.$inferSelect): MealLog {
  return {
    id: r.id,
    date: r.date,
    restaurantId: r.restaurantId,
    restaurantName: r.restaurantName,
    dish: r.dish,
    sentiment: r.sentiment as MealLog['sentiment'],
    comment: r.comment,
  }
}
