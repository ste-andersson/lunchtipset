import { lazy, Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, NavLink, Outlet, Route, Routes, useLocation } from 'react-router'
import { useAppAuth } from './auth.tsx'
import { useMe } from './data.ts'
import { ContributePage } from './pages/ContributePage.tsx'
import { HistoryPage } from './pages/HistoryPage.tsx'
import { PreferencesPage } from './pages/PreferencesPage.tsx'
import { RingPage } from './pages/RingPage.tsx'
import { TodayPage } from './pages/TodayPage.tsx'

// The voice SDK is large; only load it when someone actually calls.
const CallPage = lazy(() => import('./pages/CallPage.tsx').then((m) => ({ default: m.CallPage })))
const AdminPage = lazy(() =>
  import('./pages/AdminPage.tsx').then((m) => ({ default: m.AdminPage })),
)

export function App() {
  const { pathname } = useLocation()
  // The call screen takes over the whole viewport, like a phone call.
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
    </div>
  )
}

function TopBar() {
  const { t } = useTranslation()
  const auth = useAppAuth()
  return (
    <header className="topbar">
      <NavLink to="/" className="brand">
        <span className="brand__mark" aria-hidden>
          🍽
        </span>
        Lunchtipset
      </NavLink>
      <nav className="topbar__links">
        <NavLink to="/">{t('nav.today')}</NavLink>
        <NavLink to="/ring">{t('nav.call')}</NavLink>
        <NavLink to="/installningar">{t('nav.settings')}</NavLink>
      </nav>
      {auth.enabled && auth.isLoaded && (
        <div className="topbar__account">
          {auth.userId ? (
            <button type="button" className="btn btn--ghost btn--small" onClick={auth.openProfile}>
              {t('auth.account')}
            </button>
          ) : (
            <button type="button" className="btn btn--small" onClick={auth.signIn}>
              {t('auth.signIn')}
            </button>
          )}
        </div>
      )}
    </header>
  )
}

const NAV = [
  { to: '/', key: 'nav.today', icon: '🍽' },
  { to: '/ring', key: 'nav.call', icon: '📞' },
  { to: '/installningar', key: 'nav.settings', icon: '⚙' },
] as const

function BottomNav() {
  const { t } = useTranslation()
  return (
    <nav className="bottomnav">
      {NAV.map((n) => (
        <NavLink key={n.to} to={n.to} end={n.to === '/'} className="bottomnav__item">
          <span aria-hidden className="bottomnav__icon">
            {n.icon}
          </span>
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
