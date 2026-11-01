import type { MenuDay, MenuItem } from '@lunch/shared'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { Notice, SignInPrompt } from '../components/ui.tsx'
import { useApi, useRestaurants, useToday, useUserData } from '../data.ts'

type Tab = 'upload' | 'url'

export function ContributePage() {
  const { t } = useTranslation()
  const user = useUserData()
  const [tab, setTab] = useState<Tab>('upload')

  return (
    <div className="stack">
      <h1>{t('contribute.title')}</h1>
      <div className="segmented">
        {(['upload', 'url'] as const).map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={tab === k}
            className={tab === k ? 'is-on' : ''}
            onClick={() => setTab(k)}
          >
            {t(`contribute.tab.${k}`)}
          </button>
        ))}
      </div>
      {!user.isSignedIn ? (
        <SignInPrompt text={t('contribute.signInNeeded')} />
      ) : tab === 'upload' ? (
        <UploadMenu />
      ) : (
        <SuggestUrl />
      )}
    </div>
  )
}

const MAX_IMAGE_SIDE = 2000

/** Phone photos are often 5–15 MB; a 2000 px JPEG is plenty for reading a menu. */
async function shrinkImage(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) return file
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? file), 'image/jpeg', 0.85))
}

type Step = 'pick' | 'parsing' | 'review' | 'publishing' | 'done'

function UploadMenu() {
  const { t, i18n } = useTranslation()
  const api = useApi()
  const qc = useQueryClient()
  const restaurants = useRestaurants()
  const [params] = useSearchParams()
  const [restaurantId, setRestaurantId] = useState<number | null>(
    params.get('restaurant') ? Number(params.get('restaurant')) : null,
  )
  const [scope, setScope] = useState<'today' | 'week'>('today')
  const [mode, setMode] = useState<'photo' | 'text'>(
    params.get('mode') === 'text' ? 'text' : 'photo',
  )
  const [file, setFile] = useState<File | null>(null)
  const [text, setText] = useState<string | null>(null)
  const today = useToday()
  // Start the text from what is on the menu now, so changing it is just editing.
  const currentMenu =
    today.data?.restaurants
      .find((r) => r.id === restaurantId)
      ?.items.filter((i) => !i.fixed)
      .map((i) =>
        [i.title, i.description, i.priceSek ? `${i.priceSek} kr` : null]
          .filter(Boolean)
          .join(' – '),
      )
      .join('\n') ?? ''
  const menuText = text ?? currentMenu
  const ready = mode === 'photo' ? !!file : !!menuText.trim()
  const [step, setStep] = useState<Step>('pick')
  const [days, setDays] = useState<MenuDay[]>([])
  const [error, setError] = useState<string | null>(null)

  async function parse() {
    if (!ready || restaurantId == null) return
    setStep('parsing')
    setError(null)
    try {
      const form = new FormData()
      if (mode === 'text') form.set('text', menuText)
      else if (file) form.set('file', await shrinkImage(file), file.name)
      form.set('restaurantId', String(restaurantId))
      form.set('scope', scope)
      const res = await api.parseMenu(form)
      setDays(res.days)
      setStep('review')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStep('pick')
    }
  }

  async function publish() {
    if (restaurantId == null) return
    const clean = days
      .map((d) => ({ ...d, items: d.items.filter((i) => i.title.trim()) }))
      .filter((d) => d.items.length)
    setStep('publishing')
    setError(null)
    try {
      await api.publishMenu(restaurantId, clean)
      await qc.invalidateQueries({ queryKey: ['today'] })
      setStep('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStep('review')
    }
  }

  const updateItem = (di: number, ii: number, patch: Partial<MenuItem>) =>
    setDays((ds) =>
      ds.map((d, i) =>
        i !== di
          ? d
          : { ...d, items: d.items.map((it, j) => (j === ii ? { ...it, ...patch } : it)) },
      ),
    )
  const removeItem = (di: number, ii: number) =>
    setDays((ds) =>
      ds.map((d, i) => (i !== di ? d : { ...d, items: d.items.filter((_, j) => j !== ii) })),
    )
  const addItem = (di: number) =>
    setDays((ds) =>
      ds.map((d, i) =>
        i !== di
          ? d
          : {
              ...d,
              items: [...d.items, { title: '', description: null, priceSek: null }],
            },
      ),
    )

  const fmt = (date: string) =>
    new Date(`${date}T12:00:00`).toLocaleDateString(i18n.language, {
      weekday: 'long',
      day: 'numeric',
      month: 'short',
    })

  if (step === 'done') {
    return (
      <Notice tone="ok">
        <p>{t('upload.published')}</p>
        <button
          type="button"
          className="btn btn--small"
          onClick={() => {
            setFile(null)
            setText(null)
            setDays([])
            setStep('pick')
          }}
        >
          {t('upload.another')}
        </button>
      </Notice>
    )
  }

  if (step === 'review' || step === 'publishing') {
    return (
      <div className="stack">
        <Notice>{t('upload.reviewHint')}</Notice>
        {days.length === 0 && <Notice tone="warn">{t('upload.nothingFound')}</Notice>}
        {days.map((d, di) => (
          <section key={d.date} className="panel">
            <div className="section-head">
              <h2>{fmt(d.date)}</h2>
              <button
                type="button"
                className="btn btn--ghost btn--small"
                onClick={() => setDays((ds) => ds.filter((_, i) => i !== di))}
              >
                {t('upload.removeDay')}
              </button>
            </div>
            {d.items.map((item, ii) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: parsed items have no id; titles are being edited
              <div key={`${d.date}-${ii}`} className="review-item">
                <div className="review-item__row">
                  <input
                    aria-label={t('upload.dishTitle')}
                    value={item.title}
                    onChange={(e) => updateItem(di, ii, { title: e.target.value })}
                  />
                  <input
                    aria-label={t('upload.price')}
                    className="review-item__price"
                    type="number"
                    inputMode="numeric"
                    placeholder="kr"
                    value={item.priceSek ?? ''}
                    onChange={(e) =>
                      updateItem(di, ii, {
                        priceSek: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                  />
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={t('common.delete')}
                    onClick={() => removeItem(di, ii)}
                  >
                    ✕
                  </button>
                </div>
                <input
                  aria-label={t('upload.description')}
                  placeholder={t('upload.description')}
                  value={item.description ?? ''}
                  onChange={(e) => updateItem(di, ii, { description: e.target.value || null })}
                />
              </div>
            ))}
            <button type="button" className="btn btn--ghost btn--small" onClick={() => addItem(di)}>
              {t('upload.addDish')}
            </button>
          </section>
        ))}
        {error && <p className="error">{error}</p>}
        <div className="savebar">
          <button type="button" className="btn btn--ghost" onClick={() => setStep('pick')}>
            {t('common.back')}
          </button>
          <button
            type="button"
            className="btn"
            disabled={
              step === 'publishing' || !days.some((d) => d.items.some((i) => i.title.trim()))
            }
            onClick={publish}
          >
            {step === 'publishing' ? t('common.saving') : t('upload.publish')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="panel stack">
      <p className="muted small">{t('upload.intro')}</p>
      <label className="field">
        <span>{t('meal.restaurant')}</span>
        <select
          value={restaurantId ?? ''}
          onChange={(e) => {
            setRestaurantId(e.target.value ? Number(e.target.value) : null)
            setText(null)
          }}
        >
          <option value="">{t('meal.choose')}</option>
          {restaurants.data?.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </label>
      <div className="field">
        <span>{t('upload.scope')}</span>
        <div className="segmented">
          {(['today', 'week'] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={scope === s}
              className={scope === s ? 'is-on' : ''}
              onClick={() => setScope(s)}
            >
              {t(`upload.scope_${s}`)}
            </button>
          ))}
        </div>
      </div>
      <div className="segmented">
        {(['photo', 'text'] as const).map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            className={mode === m ? 'is-on' : ''}
            onClick={() => setMode(m)}
          >
            {t(`upload.mode_${m}`)}
          </button>
        ))}
      </div>
      {mode === 'photo' ? (
        <label className="field">
          <span>{t('upload.photo')}</span>
          <input
            type="file"
            accept="image/*,application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
      ) : (
        <label className="field">
          <span>{t('upload.text')}</span>
          <textarea
            rows={6}
            value={menuText}
            placeholder={t('upload.textPlaceholder')}
            onChange={(e) => setText(e.target.value)}
          />
        </label>
      )}
      {error && <p className="error">{error}</p>}
      <button
        type="button"
        className="btn"
        disabled={!ready || restaurantId == null || step === 'parsing'}
        onClick={parse}
      >
        {step === 'parsing' ? t('upload.parsing') : t('upload.parse')}
      </button>
      {mode === 'photo' && <p className="muted small">{t('upload.privacy')}</p>}
    </div>
  )
}

function SuggestUrl() {
  const { t } = useTranslation()
  const api = useApi()
  const restaurants = useRestaurants()
  const [restaurantId, setRestaurantId] = useState<number | null>(null)
  const [restaurantName, setRestaurantName] = useState('')
  const [url, setUrl] = useState('')
  const [comment, setComment] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await api.suggestUrl({
        restaurantId,
        restaurantName: restaurantId == null ? restaurantName.trim() || null : null,
        url: url.trim(),
        comment: comment.trim() || null,
      })
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  if (sent) {
    return (
      <Notice tone="ok">
        <p>{t('suggest.thanks')}</p>
        <button
          type="button"
          className="btn btn--small"
          onClick={() => {
            setSent(false)
            setUrl('')
            setComment('')
          }}
        >
          {t('suggest.another')}
        </button>
      </Notice>
    )
  }

  return (
    <form className="panel form" onSubmit={submit}>
      <p className="muted small">{t('suggest.intro')}</p>
      <label className="field">
        <span>{t('meal.restaurant')}</span>
        <select
          value={restaurantId ?? ''}
          onChange={(e) => setRestaurantId(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">{t('suggest.newRestaurant')}</option>
          {restaurants.data?.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </label>
      {restaurantId == null && (
        <label className="field">
          <span>{t('suggest.name')}</span>
          <input
            value={restaurantName}
            onChange={(e) => setRestaurantName(e.target.value)}
            required
          />
        </label>
      )}
      <label className="field">
        <span>{t('suggest.url')}</span>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://"
          required
        />
      </label>
      <label className="field">
        <span>{t('suggest.comment')}</span>
        <textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} />
      </label>
      {error && <p className="error">{error}</p>}
      <div className="form__actions">
        <button type="submit" className="btn">
          {t('suggest.submit')}
        </button>
      </div>
    </form>
  )
}
