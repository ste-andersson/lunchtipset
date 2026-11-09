import type { Assistant } from '@lunch/shared'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Notice, Sheet } from '../components/ui.tsx'
import { useAssistants } from '../data.ts'

/** True when the browser would still ask the user about the microphone. */
async function shouldAskForMicrophone() {
  try {
    const status = await navigator.permissions?.query({ name: 'microphone' as PermissionName })
    return !status || status.state === 'prompt'
  } catch {
    // Not supported everywhere (e.g. Safari); show the explanation anyway.
    return true
  }
}

async function requestMicrophone() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    for (const track of stream.getTracks()) track.stop()
  } catch {
    // Denied or no microphone; the call page explains it if they try to call.
  }
}

export function RingPage() {
  const { t } = useTranslation()
  const assistants = useAssistants()
  const [intro, setIntro] = useState(false)
  useEffect(() => {
    void shouldAskForMicrophone().then(setIntro)
  }, [])
  return (
    <div className="stack">
      <h1>{t('ring.title')}</h1>
      <p className="muted">{t('ring.intro')}</p>
      {assistants.error && <Notice tone="warn">{t('common.loadError')}</Notice>}
      <div className="contacts">
        {assistants.data?.map((a) => (
          <div key={a.id} className="contact">
            <Link to={`/ring/${a.id}`} className="contact__main">
              <Avatar assistant={a} />
              <div className="contact__body">
                <strong>
                  {a.name} <Flag assistant={a} />
                </strong>
              </div>
            </Link>
            <Link
              to={`/ring/${a.id}/sms`}
              className="contact__btn contact__msg"
              aria-label={t('ring.message', { name: a.name })}
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M4 3h16a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H8.4l-4.1 3.7A.8.8 0 0 1 3 21.1V5a2 2 0 0 1 1-2z" />
              </svg>
            </Link>
            <Link
              to={`/ring/${a.id}`}
              className="contact__btn contact__call"
              aria-label={t('ring.callName', { name: a.name })}
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M6.6 10.8a15.5 15.5 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.6a1 1 0 0 1-.25 1z" />
              </svg>
            </Link>
          </div>
        ))}
      </div>
      <Sheet open={intro} onClose={() => setIntro(false)} title={t('ring.micTitle')}>
        <div className="stack">
          <p>{t('ring.micHeadphones')}</p>
          <p>{t('ring.micAccess')}</p>
          <p>{t('ring.callsSaved')}</p>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setIntro(false)
              void requestMicrophone()
            }}
          >
            {t('ring.micContinue')}
          </button>
        </div>
      </Sheet>
    </div>
  )
}

export function Flag({ assistant }: { assistant: Assistant }) {
  return <img className="flag" src={`/flags/${assistant.flag}.svg`} alt="" />
}

export function Avatar({ assistant, size = 'md' }: { assistant: Assistant; size?: 'md' | 'xl' }) {
  return assistant.imageUrl ? (
    <img className={`avatar avatar--${size}`} src={assistant.imageUrl} alt="" />
  ) : (
    <span className={`avatar avatar--${size} avatar--initial`} aria-hidden>
      {assistant.name.slice(0, 1)}
    </span>
  )
}
