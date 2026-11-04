import type { Assistant } from '@lunch/shared'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Notice } from '../components/ui.tsx'
import { useAssistants } from '../data.ts'

export function RingPage() {
  const { t } = useTranslation()
  const assistants = useAssistants()
  return (
    <div className="stack">
      <h1>{t('ring.title')}</h1>
      <p className="muted">{t('ring.intro')}</p>
      {assistants.error && <Notice tone="warn">{t('common.loadError')}</Notice>}
      <div className="contacts">
        {assistants.data?.map((a) => (
          <Link key={a.id} to={`/ring/${a.id}`} className="contact">
            <Avatar assistant={a} />
            <div className="contact__body">
              <strong>
                {a.name} <Flag assistant={a} />
              </strong>
            </div>
            <span className="contact__call" aria-hidden>
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M6.6 10.8a15.5 15.5 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.6a1 1 0 0 1-.25 1z" />
              </svg>
            </span>
          </Link>
        ))}
      </div>
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
