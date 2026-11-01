import { type Author, SENTIMENTS, type Sentiment, type SentimentCounts } from '@lunch/shared'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppAuth } from '../auth.tsx'

export const SENTIMENT_ICON: Record<Sentiment, string> = {
  positive: '👍',
  neutral: '😐',
  negative: '👎',
}

export function formatDistance(m: number) {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`
}

/** Round profile picture; hover shows the name, tap toggles it (for phones). */
export function AuthorAvatar({ author }: { author: Author | null }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const name = author?.name ?? t('today.unknownAuthor')
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
  return (
    <span className="author">
      <button
        type="button"
        className="author__avatar"
        title={name}
        aria-label={name}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {author?.imageUrl ? <img src={author.imageUrl} alt="" /> : initials}
      </button>
      {open && <span className="author__name">{name}</span>}
    </span>
  )
}

export function SentimentPicker({
  value,
  onChange,
}: {
  value: Sentiment | null
  onChange: (v: Sentiment | null) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="segmented">
      {SENTIMENTS.map((s) => (
        <button
          key={s}
          type="button"
          aria-pressed={value === s}
          className={value === s ? 'is-on' : ''}
          onClick={() => onChange(value === s ? null : s)}
        >
          <span aria-hidden>{SENTIMENT_ICON[s]}</span> {t(`sentiment.${s}`)}
        </button>
      ))}
    </div>
  )
}

export function ColleagueBadge({ counts }: { counts: SentimentCounts }) {
  const { t } = useTranslation()
  const total = counts.positive + counts.neutral + counts.negative
  if (!total) return null
  return (
    <span className="badge" title={t('today.colleaguesTitle')}>
      {SENTIMENT_ICON.positive} {counts.positive} · {SENTIMENT_ICON.negative} {counts.negative}
    </span>
  )
}

/** Bottom sheet on mobile, centred dialog on wider screens. */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])
  return (
    <dialog ref={ref} className="sheet" onClose={onClose}>
      <div className="sheet__head">
        <h2>{title}</h2>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Stäng">
          ✕
        </button>
      </div>
      {open && children}
    </dialog>
  )
}

export function Notice({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'warn' | 'ok'
  children: ReactNode
}) {
  return <div className={`notice notice--${tone}`}>{children}</div>
}

export function SignInPrompt({ text }: { text: string }) {
  const { t } = useTranslation()
  const auth = useAppAuth()
  return (
    <Notice>
      <p>{text}</p>
      {auth.enabled ? (
        <button type="button" className="btn btn--small" onClick={auth.signIn}>
          {t('auth.signIn')}
        </button>
      ) : (
        <p className="muted">{t('auth.notConfigured')}</p>
      )}
    </Notice>
  )
}
