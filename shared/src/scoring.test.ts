import { describe, expect, it } from 'vitest'
import { menuDay, menuWeek, previousWorkday, workWeek } from './dates.ts'
import { rankRestaurants } from './scoring.ts'
import {
  DEFAULT_PREFERENCES,
  dishKey,
  type MealLog,
  type MenuItem,
  type Preferences,
  type TasteMap,
  type TodayRestaurant,
  type Weights,
} from './types.ts'

const TODAY = '2026-11-04' // a Wednesday

function restaurant(id: number, distanceMeters: number, items: MenuItem[]): TodayRestaurant {
  return {
    id,
    name: `R${id}`,
    address: null,
    distanceMeters,
    menuUrl: null,
    website: null,
    category: null,
    description: null,
    active: true,
    items,
    menuSource: items.length ? 'web' : null,
    colleagues: { positive: 0, neutral: 0, negative: 0 },
    notes: [],
    lastFetch: null,
  }
}

const dish = (title: string, priceSek: number | null = 125): MenuItem => ({
  title,
  description: null,
  priceSek,
})

const meal = (date: string, restaurantId: number, p: Partial<MealLog> = {}): MealLog => ({
  id: `${date}-${restaurantId}`,
  date,
  restaurantId,
  restaurantName: `R${restaurantId}`,
  dish: null,
  sentiment: null,
  comment: null,
  ...p,
})

const prefs = (p: Partial<Preferences> = {}): Preferences => ({ ...DEFAULT_PREFERENCES, ...p })

/** Only the given factor counts. */
const only = (k: keyof Weights): Preferences =>
  prefs({
    weights: {
      distance: 0,
      colleagues: 0,
      restaurantVariety: 0,
      dishVariety: 0,
      taste: 0,
      price: 0,
      [k]: 10,
    },
  })

describe('rankRestaurants', () => {
  it('drops excluded, too distant and places where every dish breaks a hard requirement', () => {
    const rs = [
      restaurant(1, 200, [dish('Falafel')]),
      restaurant(2, 300, [dish('Biff')]),
      restaurant(3, 5000, [dish('Halloumi')]),
      restaurant(4, 100, [dish('Pasta')]),
    ]
    const taste: TasteMap = { [dishKey(2, 'Biff')]: { fit: 0, variety: 0.5, excluded: true } }
    const ranked = rankRestaurants(rs, prefs({ excludedRestaurantIds: [4] }), [], TODAY, taste)
    expect(ranked.map((s) => s.restaurant.id)).toEqual([1])
  })

  it('ranks by how well dishes fit the free-text preferences', () => {
    const rs = [restaurant(1, 300, [dish('Curry')]), restaurant(2, 300, [dish('Lax')])]
    const taste: TasteMap = {
      [dishKey(1, 'Curry')]: { fit: 0.2, variety: 0.5, excluded: false },
      [dishKey(2, 'Lax')]: { fit: 0.9, variety: 0.5, excluded: false },
    }
    expect(rankRestaurants(rs, only('taste'), [], TODAY, taste)[0]?.restaurant.id).toBe(2)
  })

  it('picks the dish the AI judges most different from recent lunches', () => {
    const rs = [restaurant(1, 300, [dish('Pizza'), dish('Soppa')])]
    const taste: TasteMap = {
      [dishKey(1, 'Pizza')]: { fit: 0.5, variety: 0.1, excluded: false },
      [dishKey(1, 'Soppa')]: { fit: 0.5, variety: 0.9, excluded: false },
    }
    expect(rankRestaurants(rs, only('dishVariety'), [], TODAY, taste)[0]?.item?.title).toBe('Soppa')
  })

  it('prefers a place not visited recently when variety matters', () => {
    const rs = [restaurant(1, 300, [dish('A')]), restaurant(2, 300, [dish('B')])]
    const ranked = rankRestaurants(rs, only('restaurantVariety'), [meal('2026-11-03', 1)], TODAY)
    expect(ranked[0]?.restaurant.id).toBe(2)
    expect(ranked[1]?.cons).toContain('restaurantVariety')
  })

  it('counts earlier ratings of the restaurant', () => {
    const rs = [restaurant(1, 300, [dish('A')]), restaurant(2, 300, [dish('B')])]
    const bad = meal('2026-10-20', 1, { sentiment: 'negative' })
    expect(rankRestaurants(rs, only('taste'), [bad], TODAY)[0]?.restaurant.id).toBe(2)
  })

  it('keeps places without a menu, on neutral dish scores', () => {
    const ranked = rankRestaurants([restaurant(1, 300, [])], prefs(), [], TODAY)
    expect(ranked).toHaveLength(1)
    expect(ranked[0]?.item).toBeNull()
  })
})

describe('dates', () => {
  it('finds the work week and the previous workday', () => {
    expect(workWeek(TODAY)).toEqual([
      '2026-11-02',
      '2026-11-03',
      '2026-11-04',
      '2026-11-05',
      '2026-11-06',
    ])
    expect(previousWorkday('2026-11-02')).toBe('2026-10-30')
  })

  it('treats weekends as the coming week', () => {
    expect(menuDay('2026-11-01')).toBe('2026-11-02') // Sunday → Monday
    expect(menuDay('2026-11-04')).toBe('2026-11-04')
    expect(menuWeek('2026-10-31')[0]).toBe('2026-11-02') // Saturday
  })
})
