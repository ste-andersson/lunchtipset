import type {
  AdminRestaurant,
  Assistant,
  CallLine,
  CallLog,
  CallLogSummary,
  Me,
  MealLog,
  MenuDay,
  MenuFetchLog,
  MenuItem,
  Preferences,
  RecentMeal,
  Restaurant,
  Sentiment,
  TasteMap,
  TodayResponse,
} from '@lunch/shared'

const TOKEN_TIMEOUT_MS = 4000

type GetToken =() => Promise<string | null>

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

async function request<T>(
  getToken: GetToken,
  method: string,
  path: string,
  body?: unknown,
  keepalive = false,
): Promise<T> {
  // In an iOS home-screen web app Clerk can fail to load and getToken() then never
  // settles, which would leave every request (and the page) waiting forever. Give up
  // after a moment and go on as a guest.
  const token = await Promise.race([
    getToken().catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), TOKEN_TIMEOUT_MS)),
  ])
  const headers: Record<string, string> = {}
  if (token) headers.Authorization = `Bearer ${token}`
  let payload: BodyInit | undefined
  if (body instanceof FormData) payload = body
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }
  const res = await fetch(`/api${path}`, { method, headers, body: payload, keepalive })
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { error?: string } | null
    throw new ApiError(res.status, err?.error ?? res.statusText)
  }
  return res.json() as Promise<T>
}

export type RestaurantInput = Omit<AdminRestaurant, 'id'>

export interface CallLogInput {
  assistantId: string
  startedAt: string
  durationSec: number
  endReason: 'ended' | 'left'
  transcript: CallLine[]
  actions: string[]
  prompt: string
}

export function createApi(getToken: GetToken) {
  const get = <T>(p: string) => request<T>(getToken, 'GET', p)
  const send = <T>(m: string, p: string, b?: unknown) => request<T>(getToken, m, p, b)
  return {
    me: () => get<Me | null>('/me'),
    today: (date?: string) => get<TodayResponse>(`/today${date ? `?date=${date}` : ''}`),
    taste: (date: string, freeText: string, meals: RecentMeal[]) =>
      send<TasteMap>('POST', '/taste', { date, freeText, meals }),
    restaurants: () => get<Restaurant[]>('/restaurants'),
    assistants: () => get<Assistant[]>('/assistants'),
    signedUrl: (assistantId: string) =>
      send<{ signedUrl: string }>('POST', '/conversation/signed-url', { assistantId }),

    getPreferences: () => get<Preferences | null>('/me/preferences'),
    putPreferences: (p: Preferences) => send<Preferences>('PUT', '/me/preferences', p),
    getMeals: () => get<MealLog[]>('/me/meals'),
    putMeals: (m: MealLog | MealLog[]) => send('PUT', '/me/meals', m),
    /** Choose where to have lunch on a date; null clears the choice. */
    setPlan: (date: string, restaurantId: number | null) =>
      send('PUT', '/me/plan', { date, restaurantId }),
    deleteMeal: (id: string) => send('DELETE', `/me/meals/${encodeURIComponent(id)}`),

    addNote: (
      restaurantId: number,
      note: { sentiment: Sentiment; text: string; source?: 'user' | 'assistant' },
    ) => send('POST', `/restaurants/${restaurantId}/notes`, note),
    parseMenu: (form: FormData) => send<{ days: MenuDay[] }>('POST', '/menus/parse', form),
    publishMenu: (restaurantId: number, days: MenuDay[]) =>
      send('POST', '/menus/publish', { restaurantId, days }),

    /** keepalive lets the request finish even if the page is closing. */
    logCall: (call: CallLogInput) => request<unknown>(getToken, 'POST', '/calls', call, true),
    publishFixedMenu: (restaurantId: number, items: MenuItem[]) =>
      send('POST', '/menus/fixed', { restaurantId, items }),

    admin: {
      restaurants: () => get<AdminRestaurant[]>('/admin/restaurants'),
      createRestaurant: (r: RestaurantInput) =>
        send<AdminRestaurant>('POST', '/admin/restaurants', r),
      updateRestaurant: (id: number, r: RestaurantInput) =>
        send<AdminRestaurant>('PUT', `/admin/restaurants/${id}`, r),
      deleteRestaurant: (id: number) => send('DELETE', `/admin/restaurants/${id}`),
      calls: () => get<CallLogSummary[]>('/admin/calls'),
      call: (id: string) => get<CallLog>(`/admin/calls/${encodeURIComponent(id)}`),
      fetchLog: () => get<MenuFetchLog[]>('/admin/fetch-log'),
      fetchMenus: (restaurantId?: number) =>
        send<{ id: number; name: string; status: string; itemCount: number; message?: string }[]>(
          'POST',
          `/admin/fetch-menus${restaurantId ? `?restaurantId=${restaurantId}` : ''}`,
        ),
    },
  }
}

export type Api = ReturnType<typeof createApi>
