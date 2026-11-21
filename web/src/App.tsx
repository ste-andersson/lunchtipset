import { isoDate } from '@lunch/shared'
import { lazy, Suspense, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, NavLink, Outlet, Route, Routes, useLocation } from 'react-router'
import { useAppAuth } from './auth.tsx'
import { WelcomeSheet } from './components/WelcomeSheet.tsx'
import { useMe, useToday } from './data.ts'
import { ChatPage } from './pages/ChatPage.tsx'
import { ContributePage } from './pages/ContributePage.tsx'
import { HistoryPage } from './pages/HistoryPage.tsx'
import { PreferencesPage } from './pages/PreferencesPage.tsx'
import { RingPage } from './pages/RingPage.tsx'
import { TodayPage } from './pages/TodayPage.tsx'
import { setThemePref, useTheme } from './theme.ts'

// The voice SDK is large; only load it when someone actually calls.
const CallPage = lazy(() => import('./pages/CallPage.tsx').then((m) => ({ default: m.CallPage })))
const AdminPage = lazy(() =>
  import('./pages/AdminPage.tsx').then((m) => ({ default: m.AdminPage })),
)

export function App() {
  const { pathname } = useLocation()
  // The call and message screens take over the whole viewport, like on a phone.
  const inCall = pathname.startsWith('/ring/')

  return (
    <div className="app">
      {!inCall && <TopBar />}
      <main className={inCall ? 'main main--call' : 'main'}>
        <Suspense fallback={null}>
          <Routes>
            <Route path="/" element={<TodayPage />} />
            <Route path="/ring" element={<RingPage />} />
            <Route path="/ring/:assistantId" element={<CallPage />} />
            <Route path="/ring/:assistantId/sms" element={<ChatPage />} />
            <Route path="/installningar" element={<SettingsLayout />}>
              <Route index element={<PreferencesPage />} />
              <Route path="historik" element={<HistoryPage />} />
              <Route path="bidra" element={<ContributePage />} />
              <Route path="admin" element={<AdminPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </main>
      {!inCall && <BottomNav />}
      {!inCall && <WelcomeSheet />}
    </div>
  )
}

/** Standalone (home-screen) apps have no browser pull-to-refresh, so offer our own. */
function usePullToRefresh(onRefresh: () => unknown, enabled: boolean) {
  const cb = useRef(onRefresh)
  cb.current = onRefresh
  useEffect(() => {
    if (!enabled) return
    let startY: number | null = null
    const start = (e: TouchEvent) => {
      startY = window.scrollY <= 0 ? (e.touches[0]?.clientY ?? null) : null
    }
    const end = (e: TouchEvent) => {
      const endY = e.changedTouches[0]?.clientY
      if (startY !== null && endY !== undefined && endY - startY > 90 && window.scrollY <= 0) {
        cb.current()
      }
      startY = null
    }
    window.addEventListener('touchstart', start, { passive: true })
    window.addEventListener('touchend', end, { passive: true })
    return () => {
      window.removeEventListener('touchstart', start)
      window.removeEventListener('touchend', end)
    }
  }, [enabled])
}

/** The gingham tablecloth with a label: logo and the lunch date, on every page. */
function TopBar() {
  const { t, i18n } = useTranslation()
  const auth = useAppAuth()
  const { theme } = useTheme()
  // Same query as the Today page, so this is served from the cache. Until it
  // answers, show today's date so the label never changes text.
  const today = useToday()
  const subtitle = new Date(`${today.data?.date ?? isoDate()}T12:00:00`).toLocaleDateString(
    i18n.language,
    { weekday: 'long', day: 'numeric', month: 'long' },
  )
  const { pathname } = useLocation()
  const refresh = () => today.refetch()
  usePullToRefresh(refresh, pathname === '/')

  return (
    <header className="cloth">
      <div className="cloth__corner">
        {pathname === '/' && (
          <button
            type="button"
            className={`cloth__btn ${today.isFetching ? 'is-spinning' : ''}`}
            onClick={refresh}
            aria-label={t('common.refresh')}
            title={t('common.refresh')}
          >
            <span className="cloth__refresh" aria-hidden>
              ↻
            </span>
          </button>
        )}
        <button
          type="button"
          className="cloth__btn"
          onClick={() => setThemePref(theme === 'dark' ? 'light' : 'dark')}
          aria-label={theme === 'dark' ? t('theme.toLight') : t('theme.toDark')}
          title={theme === 'dark' ? t('theme.toLight') : t('theme.toDark')}
        >
          {theme === 'dark' ? '☀' : '☾'}
        </button>
        {auth.enabled &&
          auth.isLoaded &&
          (auth.userId ? (
            <button type="button" className="cloth__btn" onClick={auth.openProfile}>
              {t('auth.account')}
            </button>
          ) : (
            <button type="button" className="cloth__btn" onClick={auth.signIn}>
              {t('auth.signIn')}
            </button>
          ))}
      </div>
      <NavLink to="/" className="cloth__label">
        <span className="cloth__logo">
          Lunchlinjen
          <span className="cloth__heart" aria-hidden>
            ♥
          </span>
        </span>
        <span className="cloth__sub">{subtitle}</span>
      </NavLink>
    </header>
  )
}

const NAV = [
  { to: '/', key: 'nav.today' },
  { to: '/ring', key: 'nav.call' },
  { to: '/installningar', key: 'nav.settings' },
] as const

/** Floating denim pill, on phones and desktop alike. */
function BottomNav() {
  const { t } = useTranslation()
  return (
    <nav className="pillnav" aria-label={t('nav.main')}>
      {NAV.map((n) => (
        <NavLink key={n.to} to={n.to} end={n.to === '/'} className="pillnav__item">
          {t(n.key)}
        </NavLink>
      ))}
    </nav>
  )
}

/** Preferences, history, contributing and admin live as tabs under Settings. */
function SettingsLayout() {
  const { t } = useTranslation()
  const me = useMe()
  const tabs = [
    { to: '/installningar', key: 'nav.preferences' },
    { to: '/installningar/historik', key: 'nav.history' },
    { to: '/installningar/bidra', key: 'nav.contribute' },
    ...(me.data?.isAdmin ? [{ to: '/installningar/admin', key: 'nav.admin' }] : []),
  ]
  return (
    <div className="stack">
      <nav className="tabs">
        {tabs.map((tab) => (
          <NavLink key={tab.to} to={tab.to} end className="tabs__item">
            {t(tab.key)}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  )
}
