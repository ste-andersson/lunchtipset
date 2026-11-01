import { addDays, isoDate, type MealLog, weekdayIndex } from '@lunch/shared'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MealForm } from '../components/MealForm.tsx'
import { Notice, SENTIMENT_ICON, Sheet } from '../components/ui.tsx'
import { useUserData } from '../data.ts'

const RECENT_WORKDAYS = 5

function recentWorkdays(count: number): string[] {
  const days: string[] = []
  let d = isoDate()
  while (days.length < count) {
    if (weekdayIndex(d) < 5) days.push(d)
    d = addDays(d, -1)
  }
  return days
}

export function HistoryPage() {
  const { t, i18n } = useTranslation()
  const user = useUserData()
  const [editing, setEditing] = useState<Partial<MealLog> | null>(null)

  const fmt = (date: string) =>
    new Date(`${date}T12:00:00`).toLocaleDateString(i18n.language, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    })
  const missing = recentWorkdays(RECENT_WORKDAYS).filter(
    (d) => !user.meals.some((m) => m.date === d),
  )

  return (
    <div className="stack">
      <div className="section-head">
        <h1>{t('history.title')}</h1>
        <button type="button" className="btn btn--small" onClick={() => setEditing({})}>
          {t('history.add')}
        </button>
      </div>
      {!user.isSignedIn && <Notice>{t('prefs.guestNotice')}</Notice>}

      {missing.length > 0 && (
        <section className="panel">
          <h2>{t('history.missing')}</h2>
          <div className="chips">
            {missing.map((d) => (
              <button
                key={d}
                type="button"
                className="chip"
                onClick={() => setEditing({ date: d })}
              >
                {fmt(d)}
              </button>
            ))}
          </div>
        </section>
      )}

      {user.meals.length === 0 ? (
        <p className="muted">{t('history.empty')}</p>
      ) : (
        <ul className="history">
          {user.meals.map((m) => (
            <li key={m.id} className="history__row">
              <span className="history__date">{fmt(m.date)}</span>
              <div className="history__body">
                <strong>{m.restaurantName}</strong>
                {m.dish && <span className="muted"> · {m.dish}</span>}
                {m.comment && <p className="muted small">{m.comment}</p>}
              </div>
              <span role="img" aria-label={m.sentiment ? t(`sentiment.${m.sentiment}`) : ''}>
                {m.sentiment ? SENTIMENT_ICON[m.sentiment] : ''}
              </span>
              <div className="history__actions">
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => setEditing(m)}
                  aria-label={t('common.edit')}
                >
                  ✎
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={t('common.delete')}
                  onClick={() => {
                    if (confirm(t('history.confirmDelete'))) void user.deleteMeal(m.id)
                  }}
                >
                  🗑
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Sheet
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? t('history.edit') : t('meal.logTitle')}
      >
        {editing && (
          <MealForm
            key={editing.id ?? editing.date ?? 'new'}
            initial={editing}
            onSave={async (m) => {
              await user.saveMeal(m)
              setEditing(null)
            }}
            onCancel={() => setEditing(null)}
          />
        )}
      </Sheet>
    </div>
  )
}
