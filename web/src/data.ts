import {
  addDays,
  DEFAULT_PREFERENCES,
  isoDate,
  type MealLog,
  type Preferences,
  type RecentMeal,
  WEIGHT_KEYS,
} from '@lunch/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { createApi } from './api.ts'
import { useAppAuth } from './auth.tsx'
import { localStore } from './localStore.ts'

export function useApi() {
  const { getToken } = useAppAuth()
  return useMemo(() => createApi(getToken), [getToken])
}

export function useMe() {
  const api = useApi()
  const { userId } = useAppAuth()
  return useQuery({ queryKey: ['me', userId], queryFn: api.me, enabled: !!userId })
}

/** Without a date the API picks: today, or Monday on an empty weekend. */
export function useToday(date?: string) {
  const api = useApi()
  const { userId } = useAppAuth()
  // The answer says which choices are the viewer's own, so it differs per user.
  return useQuery({ queryKey: ['today', date, userId], queryFn: () => api.today(date) })
}

/** Choose (or, with null, clear) where to have lunch on a date, then refresh the menus. */
export function useChoosePlan() {
  const api = useApi()
  const qc = useQueryClient()
  return async (date: string, restaurantId: number | null) => {
    await api.setPlan(date, restaurantId)
    await qc.invalidateQueries({ queryKey: ['today'] })
  }
}

export function useRestaurants() {
  const api = useApi()
  return useQuery({ queryKey: ['restaurants'], queryFn: api.restaurants })
}

export function useAssistants() {
  const api = useApi()
  return useQuery({ queryKey: ['assistants'], queryFn: api.assistants, staleTime: Infinity })
}

const TASTE_HISTORY_DAYS = 30
const TASTE_HISTORY_MAX = 40

/**
 * The AI's reading of today's dishes for this user: fit with their free text and
 * rating history, and variety against recent lunches (cached on the server).
 * Lives under ['today', date] so it refreshes with the menus.
 */
export function useTaste(date: string | undefined, freeText: string, meals: MealLog[]) {
  const api = useApi()
  const text = freeText.trim()
  const recent: RecentMeal[] = useMemo(
    () =>
      date
        ? meals
            .filter((m) => m.date < date && m.date >= addDays(date, -TASTE_HISTORY_DAYS))
            .slice(0, TASTE_HISTORY_MAX)
            .map(({ date, restaurantName, dish, sentiment, comment }) => ({
              date,
              restaurantName,
              dish,
              sentiment,
              comment,
            }))
        : [],
    [date, meals],
  )
  return useQuery({
    queryKey: ['today', date, 'taste', text, recent],
    queryFn: () => api.taste(date ?? isoDate(), text, recent),
    enabled: !!date && (!!text || recent.length > 0),
    staleTime: 10 * 60_000,
  })
}

/** Keeps known fields only (older saves had more) and fills in new ones. */
function normalize(p: Partial<Preferences> | null): Preferences {
  const d = DEFAULT_PREFERENCES
  const weights = { ...d.weights }
  for (const k of WEIGHT_KEYS) weights[k] = p?.weights?.[k] ?? d.weights[k]
  return {
    freeText: p?.freeText ?? d.freeText,
    maxDistanceMeters: p?.maxDistanceMeters ?? d.maxDistanceMeters,
    maxPriceSek: p?.maxPriceSek ?? d.maxPriceSek,
    excludedRestaurantIds: p?.excludedRestaurantIds ?? d.excludedRestaurantIds,
    weights,
  }
}

/**
 * Preferences and meal history, from IndexedDB for guests and from the API when
 * signed in. The first time someone signs in, their guest data is copied up.
 */
export function useUserData() {
  const api = useApi()
  const qc = useQueryClient()
  const { userId, isLoaded } = useAppAuth()
  const owner = userId ?? 'guest'

  const prefsQuery = useQuery({
    queryKey: ['prefs', owner],
    enabled: isLoaded,
    queryFn: async () => {
      if (!userId) return normalize(await localStore.getPreferences())
      const remote = await api.getPreferences()
      if (remote) return normalize(remote)
      const local = await localStore.getPreferences()
      if (local) await api.putPreferences(normalize(local))
      return normalize(local)
    },
  })

  const mealsQuery = useQuery({
    queryKey: ['meals', owner],
    enabled: isLoaded,
    queryFn: async () => {
      if (!userId) return localStore.getMeals()
      const flag = `imported:${userId}`
      if (!(await localStore.getFlag(flag))) {
        const local = await localStore.getMeals()
        if (local.length) await api.putMeals(local)
        await localStore.setFlag(flag)
      }
      return api.getMeals()
    },
  })

  const savePrefs = useMutation({
    mutationFn: async (next: Preferences) => {
      if (userId) await api.putPreferences(next)
      else await localStore.putPreferences(next)
      return next
    },
    onMutate: (next) => qc.setQueryData(['prefs', owner], next),
  })

  const saveMeal = useMutation({
    mutationFn: async (meal: MealLog) => {
      if (userId) await api.putMeals(meal)
      else await localStore.putMeal(meal)
    },
    onMutate: (meal) =>
      qc.setQueryData<MealLog[]>(['meals', owner], (old = []) =>
        [meal, ...old.filter((m) => m.id !== meal.id)].sort((a, b) => b.date.localeCompare(a.date)),
      ),
    onSettled: () => qc.invalidateQueries({ queryKey: ['today'] }),
  })

  const deleteMeal = useMutation({
    mutationFn: async (id: string) => {
      if (userId) await api.deleteMeal(id)
      else await localStore.deleteMeal(id)
    },
    onMutate: (id) =>
      qc.setQueryData<MealLog[]>(['meals', owner], (old = []) => old.filter((m) => m.id !== id)),
  })

  return {
    isSignedIn: !!userId,
    isLoading: prefsQuery.isLoading || mealsQuery.isLoading,
    prefs: prefsQuery.data ?? DEFAULT_PREFERENCES,
    meals: mealsQuery.data ?? [],
    savePrefs: (p: Preferences) => savePrefs.mutateAsync(p),
    /** Reads the cache, not the render's snapshot, so rapid updates (e.g. from a call) stack. */
    updatePrefs: (patch: Partial<Preferences> | ((p: Preferences) => Partial<Preferences>)) => {
      const current = qc.getQueryData<Preferences>(['prefs', owner]) ?? DEFAULT_PREFERENCES
      const changes = typeof patch === 'function' ? patch(current) : patch
      return savePrefs.mutateAsync({ ...current, ...changes })
    },
    saveMeal: (m: MealLog) => saveMeal.mutateAsync(m),
    deleteMeal: (id: string) => deleteMeal.mutateAsync(id),
  }
}

export const newId = () => crypto.randomUUID()
