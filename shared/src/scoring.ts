import { daysBetween } from './dates.ts'
import type {
  MealLog,
  MenuItem,
  Preferences,
  SentimentCounts,
  TasteMap,
  TodayRestaurant,
  WeightKey,
} from './types.ts'
import { dishKey, WEIGHT_KEYS } from './types.ts'

export type Components = Record<WeightKey, number>

export interface Suggestion {
  restaurant: TodayRestaurant
  item: MenuItem | null
  /** 0–100 */
  score: number
  components: Components
  /** Factors that clearly pulled the score up or down, strongest first. */
  pros: WeightKey[]
  cons: WeightKey[]
}

const RESTAURANT_FRESH_DAYS = 10

const clamp = (v: number) => Math.max(0, Math.min(1, v))

export function colleagueScore(c: SentimentCounts): number {
  const total = c.positive + c.neutral + c.negative
  // The +2 keeps a single review from swinging the score to an extreme.
  return 0.5 + (0.5 * (c.positive - c.negative)) / (total + 2)
}

/** Recent rows first. */
function recentMeals(meals: MealLog[], today: string): MealLog[] {
  return meals
    .filter((m) => daysBetween(m.date, today) >= 0 && m.date !== today)
    .sort((a, b) => b.date.localeCompare(a.date))
}

function restaurantVariety(restaurantId: number, meals: MealLog[], today: string): number {
  const last = meals.find((m) => m.restaurantId === restaurantId)
  if (!last) return 1
  return clamp(daysBetween(last.date, today) / RESTAURANT_FRESH_DAYS)
}

/**
 * The AI's reading of the dish against the user's free text and rating history,
 * nudged by how they have rated this restaurant before.
 */
function taste(item: MenuItem, restaurantId: number, tasteMap: TasteMap, meals: MealLog[]): number {
  let v = tasteMap[dishKey(restaurantId, item.title)]?.fit ?? 0.5
  const ownBalance = meals
    .filter((m) => m.restaurantId === restaurantId && m.sentiment && m.sentiment !== 'neutral')
    .reduce((n, m) => n + (m.sentiment === 'positive' ? 1 : -1), 0)
  v += Math.max(-0.3, Math.min(0.2, ownBalance * 0.1))
  return clamp(v)
}

function priceScore(item: MenuItem, min: number, max: number): number {
  if (item.priceSek == null) return 0.5
  if (max === min) return 0.5
  return clamp((max - item.priceSek) / (max - min))
}

function total(c: Components, prefs: Preferences): number {
  let sum = 0
  let weight = 0
  for (const k of WEIGHT_KEYS) {
    sum += prefs.weights[k] * c[k]
    weight += prefs.weights[k]
  }
  return weight === 0 ? 50 : Math.round((sum / weight) * 100)
}

/**
 * Ranks today's restaurants for one user. Restaurants that are excluded, too far
 * away, or where every dish breaks a hard requirement in the user's free text
 * (diet, allergy) or price limit, are left out.
 */
export function rankRestaurants(
  restaurants: TodayRestaurant[],
  prefs: Preferences,
  allMeals: MealLog[],
  today: string,
  tasteMap: TasteMap = {},
): Suggestion[] {
  const meals = recentMeals(allMeals, today)
  const prices = restaurants
    .flatMap((r) => r.items.map((i) => i.priceSek))
    .filter((p): p is number => p != null)
  const minPrice = Math.min(...prices)
  const maxPrice = Math.max(...prices)

  const result: Suggestion[] = []
  for (const r of restaurants) {
    if (prefs.excludedRestaurantIds.includes(r.id)) continue
    if (r.distanceMeters > prefs.maxDistanceMeters) continue

    const base = {
      distance: clamp(1 - r.distanceMeters / Math.max(prefs.maxDistanceMeters, 1)),
      colleagues: colleagueScore(r.colleagues),
      restaurantVariety: restaurantVariety(r.id, meals, today),
    }

    const candidates = r.items.filter(
      (i) =>
        !tasteMap[dishKey(r.id, i.title)]?.excluded &&
        (prefs.maxPriceSek == null || i.priceSek == null || i.priceSek <= prefs.maxPriceSek),
    )
    // No menu today: the place can still be suggested, but on neutral dish factors.
    if (r.items.length > 0 && candidates.length === 0) continue

    let best: Suggestion | null = null
    for (const item of candidates.length ? candidates : [null]) {
      const components: Components = {
        ...base,
        dishVariety: item ? (tasteMap[dishKey(r.id, item.title)]?.variety ?? 0.5) : 0.5,
        taste: item ? taste(item, r.id, tasteMap, meals) : 0.5,
        price: item ? priceScore(item, minPrice, maxPrice) : 0.5,
      }
      const score = total(components, prefs)
      if (!best || score > best.score) {
        best = { restaurant: r, item, score, components, pros: [], cons: [] }
      }
    }
    if (best) result.push(withReasons(best, prefs))
  }
  return result.sort((a, b) => b.score - a.score)
}

function withReasons(s: Suggestion, prefs: Preferences): Suggestion {
  const weighted = WEIGHT_KEYS.filter((k) => prefs.weights[k] > 0).map((k) => ({
    k,
    impact: (s.components[k] - 0.5) * prefs.weights[k],
  }))
  return {
    ...s,
    pros: weighted
      .filter((w) => w.impact >= 1)
      .sort((a, b) => b.impact - a.impact)
      .map((w) => w.k),
    cons: weighted
      .filter((w) => w.impact <= -1)
      .sort((a, b) => a.impact - b.impact)
      .map((w) => w.k),
  }
}
