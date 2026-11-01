import {
  isoDate,
  type MealLog,
  type MenuItem,
  type Preferences,
  SENTIMENTS,
  type Sentiment,
  type TodayResponse,
  type TodayRestaurant,
  WEIGHT_KEYS,
  WEIGHT_MAX,
  type WeightKey,
} from '@lunch/shared'
import type { Api } from '../api.ts'
import { newId } from '../data.ts'

/**
 * Client tools the ElevenLabs agent can call during a call. They run in the
 * browser so they work for guests too (preferences and meals live in IndexedDB).
 * Names and parameters must match api/src/voice/toolDefinitions.ts, which is
 * what gets registered on the agents.
 */
export interface ToolContext {
  api: Api
  isSignedIn: boolean
  today: TodayResponse
  updatePrefs: (patch: (p: Preferences) => Partial<Preferences>) => Promise<unknown>
  saveMeal: (m: MealLog) => Promise<unknown>
  /** Shown to the user after the call as "what changed". */
  report: (text: string) => void
  /** Called after the assistant changed a menu, so the app can refetch. */
  onMenuChanged: () => void
}

type Params = Record<string, unknown>

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
const num = (v: unknown) => {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined
}
const oneOf = <T extends string>(list: readonly T[], v: unknown) =>
  list.includes(v as T) ? (v as T) : undefined

export function createLunchTools(get: () => ToolContext) {
  const findRestaurant = (p: Params) => {
    const { today } = get()
    const id = num(p.restaurant_id)
    const name = str(p.restaurant_name)?.toLowerCase()
    return (
      today.restaurants.find((r) => r.id === id) ??
      (name ? today.restaurants.find((r) => r.name.toLowerCase().includes(name)) : undefined)
    )
  }

  // Menus edited during this call. The query refetch is async, so several
  // add/remove calls in a row must build on these rather than on ctx.today.
  const editedMenus = new Map<number, MenuItem[]>()
  // Fixed-menu dishes are kept apart and never copied into a day's menu.
  const menuOf = (r: TodayRestaurant) => editedMenus.get(r.id) ?? r.items.filter((i) => !i.fixed)

  /** Saves the whole day's menu as a user upload; that version wins over the scraped one. */
  async function saveMenu(ctx: ToolContext, r: TodayRestaurant, items: MenuItem[]) {
    await ctx.api.publishMenu(r.id, [{ date: ctx.today.date, items }])
    editedMenus.set(r.id, items)
    ctx.onMenuChanged()
  }

  const sameTitle = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

  return {
    add_dish: async (p: Params) => {
      const ctx = get()
      if (!ctx.isSignedIn) return 'Failed: the caller must sign in in the app to change menus.'
      const r = findRestaurant(p)
      const title = str(p.title)
      if (!r || !title) return 'Need restaurant_id and title.'
      const price = num(p.price_sek)
      const dish: MenuItem = {
        title,
        description: str(p.description) ?? null,
        priceSek: price != null && price > 0 ? Math.round(price) : null,
      }
      const current = menuOf(r)
      const existing = current.find((i) => sameTitle(i.title, title))
      const items = existing ? current.map((i) => (i === existing ? dish : i)) : [...current, dish]
      await saveMenu(ctx, r, items)
      ctx.report(`Menu ${r.name}: + ${title}`)
      return `${existing ? 'Updated' : 'Added'} "${title}" on today's menu at ${r.name}.`
    },

    remove_dish: async (p: Params) => {
      const ctx = get()
      if (!ctx.isSignedIn) return 'Failed: the caller must sign in in the app to change menus.'
      const r = findRestaurant(p)
      const title = str(p.title)
      if (!r || !title) return 'Need restaurant_id and title.'
      const current = menuOf(r)
      const items = current.filter((i) => !sameTitle(i.title, title))
      if (items.length === current.length) {
        return `No dish called "${title}" at ${r.name}. Current dishes: ${current.map((i) => i.title).join('; ') || 'none'}`
      }
      // An empty upload would let the scraped menu show again, so keep at least one dish.
      if (items.length === 0) {
        return 'Cannot remove the last dish. Add the correct dish first, then remove this one.'
      }
      await saveMenu(ctx, r, items)
      ctx.report(`Menu ${r.name}: − ${title}`)
      return `Removed "${title}" from today's menu at ${r.name}.`
    },

    update_preferences: async (p: Params) => {
      const ctx = get()
      const freeText = str(p.free_text)
      const maxDistance = num(p.max_distance_meters)
      const maxPrice = num(p.max_price_sek)
      const changes: string[] = []

      await ctx.updatePrefs(() => {
        const patch: Partial<Preferences> = {}
        if (freeText) {
          patch.freeText = freeText.slice(0, 2000)
          changes.push(`description: "${patch.freeText}"`)
        }
        if (maxDistance != null) {
          patch.maxDistanceMeters = Math.round(Math.max(50, Math.min(10_000, maxDistance)))
          changes.push(`max distance: ${patch.maxDistanceMeters} m`)
        }
        if (maxPrice != null) {
          patch.maxPriceSek = maxPrice > 0 ? Math.round(maxPrice) : null
          changes.push(`max price: ${patch.maxPriceSek ?? 'none'}`)
        }
        return patch
      })

      if (!changes.length) return 'Nothing to change.'
      ctx.report(`Preferences: ${changes.join('; ')}`)
      return `Saved. ${changes.join('; ')}`
    },

    set_weight: async (p: Params) => {
      const ctx = get()
      const factor = oneOf<WeightKey>(WEIGHT_KEYS, p.factor)
      const value = num(p.value)
      if (!factor || value == null) {
        return `Need factor (${WEIGHT_KEYS.join(', ')}) and value 0-${WEIGHT_MAX}.`
      }
      const v = Math.round(Math.max(0, Math.min(WEIGHT_MAX, value)))
      await ctx.updatePrefs((cur) => ({ weights: { ...cur.weights, [factor]: v } }))
      ctx.report(`Weight ${factor}: ${v}`)
      return `Saved: ${factor} = ${v}`
    },

    exclude_restaurant: async (p: Params) => {
      const ctx = get()
      const r = findRestaurant(p)
      if (!r) return 'Unknown restaurant.'
      const exclude = p.exclude !== false && p.exclude !== 'false'
      await ctx.updatePrefs((cur) => ({
        excludedRestaurantIds: exclude
          ? [...new Set([...cur.excludedRestaurantIds, r.id])]
          : cur.excludedRestaurantIds.filter((id) => id !== r.id),
      }))
      ctx.report(`${exclude ? 'Excluded' : 'Included again'}: ${r.name}`)
      return `${r.name} is now ${exclude ? 'excluded' : 'included again'}.`
    },

    log_meal: async (p: Params) => {
      const ctx = get()
      const r = findRestaurant(p)
      const name = r?.name ?? str(p.restaurant_name)
      if (!name) return 'Need restaurant_id or restaurant_name.'
      const date = /^\d{4}-\d{2}-\d{2}$/.test(String(p.date ?? '')) ? String(p.date) : isoDate()
      const dish = str(p.dish) ?? null
      await ctx.saveMeal({
        id: newId(),
        date,
        restaurantId: r?.id ?? null,
        restaurantName: name,
        dish,
        sentiment: oneOf<Sentiment>(SENTIMENTS, p.sentiment) ?? null,
        comment: str(p.comment) ?? null,
      })
      ctx.report(`Logged ${date}: ${name}${dish ? `, ${dish}` : ''}`)
      return `Logged ${name} on ${date}.`
    },

    save_restaurant_note: async (p: Params) => {
      const ctx = get()
      if (!ctx.isSignedIn) return 'Failed: the caller must sign in in the app to leave notes.'
      const r = findRestaurant(p)
      const text = str(p.text)
      const sentiment = oneOf<Sentiment>(SENTIMENTS, p.sentiment) ?? 'neutral'
      if (!r || !text) return 'Need restaurant_id and text.'
      await ctx.api.addNote(r.id, { sentiment, text, source: 'assistant' })
      ctx.report(`Note on ${r.name}: "${text}"`)
      return 'Note saved for colleagues to see.'
    },

    suggest_menu_url: async (p: Params) => {
      const ctx = get()
      if (!ctx.isSignedIn) return 'Failed: the caller must sign in in the app to suggest pages.'
      const url = str(p.url)
      if (!url || !/^https?:\/\//.test(url)) return 'Need a full url starting with https://'
      const r = findRestaurant(p)
      await ctx.api.suggestUrl({
        restaurantId: r?.id ?? null,
        restaurantName: r ? null : (str(p.restaurant_name) ?? null),
        url,
        comment: 'Via röstassistenten',
      })
      ctx.report(`Suggested menu page: ${url}`)
      return 'Thanks, an admin will review it.'
    },
  }
}
