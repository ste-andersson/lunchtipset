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
              <strong>{a.name}</strong>
              <span className="muted small">{a.tagline}</span>
            </div>
            <span className="contact__lang">{a.language.toUpperCase()}</span>
            <span className="contact__call" aria-hidden>
              📞
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
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
