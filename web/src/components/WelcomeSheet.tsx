import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppAuth } from '../auth.tsx'
import { Sheet } from './ui.tsx'

const SEEN_KEY = 'lunchlinjen:welcome-seen'

function wasSeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === '1'
  } catch {
    return false
  }
}

function markSeen() {
  try {
    localStorage.setItem(SEEN_KEY, '1')
  } catch {
    // Private mode: the box simply comes back next visit.
  }
}

/**
 * Shown once per device to people who are not signed in: why signing in is worth it,
 * and an easy way to carry on as a guest. Skipped when sign-in isn't configured.
 */
export function WelcomeSheet() {
  const { t } = useTranslation()
  const auth = useAppAuth()
  const [seen, setSeen] = useState(wasSeen)
  const open = auth.enabled && auth.isLoaded && !auth.userId && !seen

  const dismiss = () => {
    markSeen()
    setSeen(true)
  }

  return (
    <Sheet open={open} onClose={() => open && dismiss()} title={t('welcome.title')}>
      <div className="stack">
        <ul className="welcome">
          <li>
            <strong>{t('welcome.personalTitle')}</strong>
            <p>{t('welcome.personalText')}</p>
          </li>
          <li>
            <strong>{t('welcome.colleaguesTitle')}</strong>
            <p>{t('welcome.colleaguesText')}</p>
          </li>
          <li>
            <strong>{t('welcome.helpTitle')}</strong>
            <p>{t('welcome.helpText')}</p>
          </li>
        </ul>
        <button
          type="button"
          className="btn"
          onClick={() => {
            dismiss()
            auth.signIn()
          }}
        >
          {t('welcome.signInGoogle')}
        </button>
        <button type="button" className="btn btn--ghost" onClick={dismiss}>
          {t('welcome.guest')}
        </button>
        <p className="muted small welcome__note">{t('welcome.guestNote')}</p>
      </div>
    </Sheet>
  )
}
