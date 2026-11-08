export const SENTIMENTS = ['positive', 'neutral', 'negative'] as const
export type Sentiment = (typeof SENTIMENTS)[number]

export const WEIGHT_KEYS = [
  'distance',
  'colleagues',
  'restaurantVariety',
  'dishVariety',
  'taste',
  'price',
] as const
export type WeightKey = (typeof WEIGHT_KEYS)[number]
export type Weights = Record<WeightKey, number>

export const WEIGHT_MAX = 10

export interface Preferences {
  /** Taste, diet, allergies and habits in the user's own words. */
  freeText: string
  maxDistanceMeters: number
  maxPriceSek: number | null
  excludedRestaurantIds: number[]
  weights: Weights
}

export const DEFAULT_PREFERENCES: Preferences = {
  freeText: '',
  maxDistanceMeters: 1000,
  maxPriceSek: null,
  excludedRestaurantIds: [],
  weights: {
    distance: 5,
    colleagues: 5,
    restaurantVariety: 5,
    dishVariety: 5,
    taste: 7,
    price: 3,
  },
}

export interface Restaurant {
  id: number
  name: string
  address: string | null
  distanceMeters: number
  menuUrl: string | null
  website: string | null
  category: string | null
  description: string | null
  active: boolean
}

/** What admins edit: a restaurant including its fixed menu. */
export interface AdminRestaurant extends Restaurant {
  /** Dishes served every day, shown next to (or instead of) the day's menu. */
  fixedMenu: MenuItem[]
}

export interface MenuItem {
  title: string
  description: string | null
  priceSek: number | null
  /** Part of the restaurant's fixed menu rather than today's dishes. */
  fixed?: boolean
}

export interface MenuDay {
  date: string
  items: MenuItem[]
}

export type MenuSource = 'web' | 'upload'

export interface SentimentCounts {
  positive: number
  neutral: number
  negative: number
}

export interface Author {
  name: string
  imageUrl: string | null
}

/** A review: a note about the place, or a comment on a logged lunch. */
export interface RestaurantNote {
  id: string
  sentiment: Sentiment | null
  text: string
  /** Set when the review is a comment on a specific dish someone ate. */
  dish: string | null
  /** Null when the user can't be looked up (e.g. deleted). */
  author: Author | null
  createdAt: string
}

/** Where everyone walks from. */
export const OFFICE_ADDRESS = 'Englundavägen 4, Solna'

export function directionsUrl(destination: string): string {
  const enc = encodeURIComponent
  return `https://www.google.com/maps/dir/?api=1&origin=${enc(OFFICE_ADDRESS)}&destination=${enc(destination)}&travelmode=walking`
}

export type FetchStatus = 'ok' | 'empty' | 'error'

/** Someone who has said they are having lunch at a restaurant today. */
export interface Goer extends Author {
  /** True for the person asking, so the app can show their own choice. */
  isMe: boolean
}

export interface TodayRestaurant extends Restaurant {
  items: MenuItem[]
  menuSource: MenuSource | null
  /** Who has chosen to eat here on this date, the viewer first. */
  goers: Goer[]
  colleagues: SentimentCounts
  notes: RestaurantNote[]
  lastFetch: { status: FetchStatus; at: string; message: string | null } | null
}

export interface TodayResponse {
  date: string
  restaurants: TodayRestaurant[]
}

export interface MealLog {
  id: string
  date: string
  restaurantId: number | null
  restaurantName: string
  dish: string | null
  sentiment: Sentiment | null
  comment: string | null
}

export interface Assistant {
  id: string
  name: string
  language: 'sv' | 'en'
  flag: 'se' | 'skane' | 'gb' | 'us'
  prompt: string
  firstMessage: string
  voiceId: string | null
  imageUrl: string | null
  ambience: string | null
}

export interface MenuFetchLog {
  id: number
  restaurantId: number
  restaurantName: string
  status: FetchStatus
  message: string | null
  itemCount: number
  fetchedAt: string
}

export interface CallLine {
  role: 'user' | 'agent'
  text: string
  /** Seconds since the call was picked up. */
  t: number
}

/** One row in the admin's call list. */
export interface CallLogSummary {
  id: string
  assistantId: string
  /** Null for guests. */
  author: Author | null
  startedAt: string
  durationSec: number
  endReason: string
  lineCount: number
}

/** A saved call: what was said, what the assistant did, and the prompt it ran on. */
export interface CallLog extends CallLogSummary {
  transcript: CallLine[]
  actions: string[]
  prompt: string
}

/**
 * The AI's reading of today's dishes for one user, keyed by dishKey(), all 0–1:
 * fit with their free text and rating history, and how different the dish is
 * from what they ate lately. Missing dishes count as neutral.
 */
export type TasteMap = Record<string, { fit: number; variety: number; excluded: boolean }>

/** What the taste call needs to know about a past lunch. */
export type RecentMeal = Pick<MealLog, 'date' | 'restaurantName' | 'dish' | 'sentiment' | 'comment'>

export const dishKey = (restaurantId: number, title: string) => `${restaurantId}:${title}`

export interface Me {
  userId: string
  isAdmin: boolean
}
