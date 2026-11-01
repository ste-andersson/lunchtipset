import { isoDate, type MealLog, type Sentiment } from '@lunch/shared'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppAuth } from '../auth.tsx'
import { newId, useRestaurants, useToday } from '../data.ts'
import { SentimentPicker } from './ui.tsx'

const OTHER = '__other'

/** Log (or edit) what was eaten on a day, optionally with a rating. */
export function MealForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Partial<MealLog>
  onSave: (m: MealLog) => void | Promise<void>
  onCancel?: () => void
}) {
  const { t } = useTranslation()
  const { userId } = useAppAuth()
  const restaurants = useRestaurants()
  const [date, setDate] = useState(initial?.date ?? isoDate())
  const [restaurantId, setRestaurantId] = useState<number | null>(initial?.restaurantId ?? null)
  const [isOther, setIsOther] = useState(initial?.restaurantId == null && !!initial?.restaurantName)
  const [otherName, setOtherName] = useState(isOther ? (initial?.restaurantName ?? '') : '')
  const [dish, setDish] = useState(initial?.dish ?? '')
  const [sentiment, setSentiment] = useState<Sentiment | null>(initial?.sentiment ?? null)
  const [comment, setComment] = useState(initial?.comment ?? '')
  const day = useToday(date)

  const menu = day.data?.restaurants.find((r) => r.id === restaurantId)?.items ?? []
  const restaurantName =
    restaurantId != null
      ? (restaurants.data?.find((r) => r.id === restaurantId)?.name ??
        initial?.restaurantName ??
        '')
      : isOther
        ? otherName.trim()
        : ''

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!restaurantName) return
    await onSave({
      id: initial?.id ?? newId(),
      date,
      restaurantId,
      restaurantName,
      dish: dish.trim() || null,
      sentiment,
      comment: comment.trim() || null,
    })
  }

  return (
    <form className="form" onSubmit={submit}>
      <label className="field">
        <span>{t('meal.date')}</span>
        <input type="date" value={date} max={isoDate()} onChange={(e) => setDate(e.target.value)} />
      </label>
      <label className="field">
        <span>{t('meal.restaurant')}</span>
        <select
          value={restaurantId ?? (isOther ? OTHER : '')}
          onChange={(e) => {
            const other = e.target.value === OTHER
            setIsOther(other)
            setRestaurantId(other ? null : Number(e.target.value))
            setDish('')
          }}
          required
        >
          <option value="" disabled>
            {t('meal.choose')}
          </option>
          {restaurants.data?.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
          <option value={OTHER}>{t('meal.otherPlace')}</option>
        </select>
      </label>
      {isOther && (
        <label className="field">
          <span>{t('meal.placeName')}</span>
          <input value={otherName} onChange={(e) => setOtherName(e.target.value)} required />
        </label>
      )}
      <label className="field">
        <span>{t('meal.dish')}</span>
        <input
          list="meal-dishes"
          value={dish}
          onChange={(e) => setDish(e.target.value)}
          placeholder={menu.length ? t('meal.dishPickOrType') : t('meal.dishType')}
        />
        <datalist id="meal-dishes">
          {menu.map((i) => (
            <option key={i.title} value={i.title} />
          ))}
        </datalist>
      </label>
      {menu.length > 0 && (
        <div className="chips">
          {menu.map((i) => (
            <button
              key={i.title}
              type="button"
              className={`chip ${dish === i.title ? 'chip--on chip--like' : ''}`}
              onClick={() => setDish(i.title)}
            >
              {i.title}
            </button>
          ))}
        </div>
      )}
      <div className="field">
        <span>{t('meal.howWasIt')}</span>
        <SentimentPicker value={sentiment} onChange={setSentiment} />
      </div>
      <label className="field">
        <span>{userId ? t('meal.comment') : t('meal.commentGuest')}</span>
        <textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} />
      </label>
      <div className="form__actions">
        {onCancel && (
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            {t('common.cancel')}
          </button>
        )}
        <button type="submit" className="btn" disabled={!restaurantName}>
          {t('common.save')}
        </button>
      </div>
    </form>
  )
}
