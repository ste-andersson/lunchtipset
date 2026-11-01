import type { MenuDay, MenuSource } from '@lunch/shared'
import { and, eq, inArray } from 'drizzle-orm'
import { db } from '../db/index.ts'
import { menuItems } from '../db/schema.ts'

/** Replaces this source's items for the given days; other days are left alone. */
export async function saveMenuDays(restaurantId: number, source: MenuSource, days: MenuDay[]) {
  if (days.length === 0) return
  await db.transaction(async (tx) => {
    await tx.delete(menuItems).where(
      and(
        eq(menuItems.restaurantId, restaurantId),
        eq(menuItems.source, source),
        inArray(
          menuItems.date,
          days.map((d) => d.date),
        ),
      ),
    )
    const rows = days.flatMap((d) =>
      d.items.map((item, position) => ({
        restaurantId,
        date: d.date,
        source,
        position,
        title: item.title,
        description: item.description,
        priceSek: item.priceSek,
      })),
    )
    if (rows.length) await tx.insert(menuItems).values(rows)
  })
}
