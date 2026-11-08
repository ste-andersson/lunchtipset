import type { MealLog, Preferences } from '@lunch/shared'
import { type DBSchema, openDB } from 'idb'

/** Guest data lives here; signed-in users' data lives on the server. */
interface LunchDB extends DBSchema {
  kv: { key: string; value: unknown }
  meals: { key: string; value: MealLog }
}

const dbPromise = openDB<LunchDB>('lunchlinjen', 1, {
  upgrade(db) {
    db.createObjectStore('kv')
    db.createObjectStore('meals', { keyPath: 'id' })
  },
})

export const localStore = {
  async getPreferences(): Promise<Preferences | null> {
    return ((await (await dbPromise).get('kv', 'preferences')) as Preferences | undefined) ?? null
  },
  async putPreferences(p: Preferences) {
    await (await dbPromise).put('kv', p, 'preferences')
  },
  async getMeals(): Promise<MealLog[]> {
    const all = await (await dbPromise).getAll('meals')
    return all.sort((a, b) => b.date.localeCompare(a.date))
  },
  async putMeal(m: MealLog) {
    await (await dbPromise).put('meals', m)
  },
  async deleteMeal(id: string) {
    await (await dbPromise).delete('meals', id)
  },
  async getFlag(key: string) {
    return !!(await (await dbPromise).get('kv', `flag:${key}`))
  },
  async setFlag(key: string) {
    await (await dbPromise).put('kv', true, `flag:${key}`)
  },
}
