import { isoDate } from '@lunch/shared'
import * as cheerio from 'cheerio'
import { and, eq, isNotNull } from 'drizzle-orm'
import { db } from '../db/index.ts'
import { menuFetches, restaurants } from '../db/schema.ts'
import { extractMenu, type MenuInput } from './extract.ts'
import { saveMenuDays } from './store.ts'

const MAX_TEXT_CHARS = 40_000
/** Below this much text the page is probably rendered by JavaScript. */
const MIN_TEXT_CHARS = 150

async function download(url: string): Promise<MenuInput> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; Lunchtipset/1.0)',
      'Accept-Language': 'sv-SE,sv;q=0.9,en;q=0.8',
    },
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)

  const type = res.headers.get('content-type') ?? ''
  if (type.includes('pdf') || type.startsWith('image/')) {
    const buf = Buffer.from(await res.arrayBuffer())
    return { kind: 'file', mimeType: type.split(';')[0] ?? type, base64: buf.toString('base64') }
  }

  const $ = cheerio.load(await res.text())
  $('script, style, noscript, svg, iframe, header nav, footer').remove()
  const text = $('body').text().replace(/\s+/g, ' ').trim()
  if (text.length < MIN_TEXT_CHARS) {
    throw new Error('Sidan innehåller nästan ingen text (laddas troligen med JavaScript)')
  }
  return { kind: 'text', text: text.slice(0, MAX_TEXT_CHARS) }
}

export async function fetchRestaurantMenu(restaurant: {
  id: number
  name: string
  menuUrl: string
}) {
  const today = isoDate()
  try {
    const input = await download(restaurant.menuUrl)
    const days = await extractMenu(input, {
      today,
      scope: 'week',
      restaurantName: restaurant.name,
    })
    await saveMenuDays(restaurant.id, 'web', days)
    const itemCount = days.reduce((n, d) => n + d.items.length, 0)
    await db.insert(menuFetches).values({
      restaurantId: restaurant.id,
      status: itemCount ? 'ok' : 'empty',
      itemCount,
      message: itemCount ? null : 'Ingen lunchmeny hittades för veckan',
    })
    return { status: itemCount ? 'ok' : 'empty', itemCount }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await db
      .insert(menuFetches)
      .values({ restaurantId: restaurant.id, status: 'error', message: message.slice(0, 500) })
    return { status: 'error', itemCount: 0, message }
  }
}

export async function fetchAllMenus(onlyId?: number) {
  const rows = await db
    .select({ id: restaurants.id, name: restaurants.name, menuUrl: restaurants.menuUrl })
    .from(restaurants)
    .where(
      onlyId
        ? eq(restaurants.id, onlyId)
        : and(eq(restaurants.active, true), isNotNull(restaurants.menuUrl)),
    )

  const results = []
  for (const r of rows) {
    if (!r.menuUrl) continue
    results.push({
      id: r.id,
      name: r.name,
      ...(await fetchRestaurantMenu({ ...r, menuUrl: r.menuUrl })),
    })
  }
  return results
}
