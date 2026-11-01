import { type Preferences, WEIGHT_KEYS, WEIGHT_MAX } from '@lunch/shared'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatDistance, Notice } from '../components/ui.tsx'
import { useRestaurants, useUserData } from '../data.ts'
import { LANGUAGES } from '../i18n.ts'

export function PreferencesPage() {
  const { t, i18n } = useTranslation()
  const user = useUserData()
  const restaurants = useRestaurants()
  const [draft, setDraft] = useState<Preferences>(user.prefs)
  const [saved, setSaved] = useState(false)

  // Pick up changes made elsewhere, e.g. by the assistant during a call.
  useEffect(() => setDraft(user.prefs), [user.prefs])

  const set = (patch: Partial<Preferences>) => {
    setDraft((d) => ({ ...d, ...patch }))
    setSaved(false)
  }
  const dirty = JSON.stringify(draft) !== JSON.stringify(user.prefs)

  async function save() {
    await user.savePrefs(draft)
    setSaved(true)
  }

  return (
    <div className="stack">
      <h1>{t('prefs.title')}</h1>
      {!user.isSignedIn && <Notice>{t('prefs.guestNotice')}</Notice>}

      <section className="panel">
        <h2>{t('prefs.freeText')}</h2>
        <p className="muted small">{t('prefs.freeTextHint')}</p>
        <textarea
          rows={6}
          value={draft.freeText}
          maxLength={2000}
          placeholder={t('prefs.freeTextPlaceholder')}
          onChange={(e) => set({ freeText: e.target.value })}
        />
      </section>

      <section className="panel">
        <h2>{t('prefs.limits')}</h2>
        <label className="field">
          <span>
            {t('prefs.maxDistance')}: <strong>{formatDistance(draft.maxDistanceMeters)}</strong>
          </span>
          <input
            type="range"
            min={100}
            max={3000}
            step={50}
            value={draft.maxDistanceMeters}
            onChange={(e) => set({ maxDistanceMeters: Number(e.target.value) })}
          />
        </label>
        <label className="field">
          <span>{t('prefs.maxPrice')}</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            placeholder={t('prefs.noLimit')}
            value={draft.maxPriceSek ?? ''}
            onChange={(e) => set({ maxPriceSek: e.target.value ? Number(e.target.value) : null })}
          />
        </label>
      </section>

      <section className="panel">
        <h2>{t('prefs.weights')}</h2>
        <p className="muted small">{t('prefs.weightsHint')}</p>
        {WEIGHT_KEYS.map((k) => (
          <label key={k} className="field slider">
            <span className="slider__label">
              {t(`weights.${k}`)}
              <span className="slider__value">{weightLabel(t, draft.weights[k])}</span>
            </span>
            <input
              type="range"
              min={0}
              max={WEIGHT_MAX}
              step={1}
              value={draft.weights[k]}
              onChange={(e) => set({ weights: { ...draft.weights, [k]: Number(e.target.value) } })}
            />
            <span className="muted small">{t(`weightsHelp.${k}`)}</span>
          </label>
        ))}
      </section>

      <section className="panel">
        <h2>{t('prefs.excluded')}</h2>
        <p className="muted small">{t('prefs.excludedHint')}</p>
        <ul className="checklist">
          {restaurants.data?.map((r) => {
            const excluded = draft.excludedRestaurantIds.includes(r.id)
            return (
              <li key={r.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={excluded}
                    onChange={() =>
                      set({
                        excludedRestaurantIds: excluded
                          ? draft.excludedRestaurantIds.filter((id) => id !== r.id)
                          : [...draft.excludedRestaurantIds, r.id],
                      })
                    }
                  />
                  {r.name} <span className="muted small">{formatDistance(r.distanceMeters)}</span>
                </label>
              </li>
            )
          })}
        </ul>
      </section>

      <section className="panel">
        <h2>{t('prefs.language')}</h2>
        <div className="segmented">
          {LANGUAGES.map((l) => (
            <button
              key={l.code}
              type="button"
              aria-pressed={i18n.resolvedLanguage === l.code}
              className={i18n.resolvedLanguage === l.code ? 'is-on' : ''}
              onClick={() => void i18n.changeLanguage(l.code)}
            >
              {l.label}
            </button>
          ))}
        </div>
      </section>

      <div className="savebar">
        {saved && !dirty && <span className="muted">{t('common.saved')}</span>}
        <button type="button" className="btn" disabled={!dirty} onClick={save}>
          {t('common.save')}
        </button>
      </div>
    </div>
  )
}

function weightLabel(t: (k: string) => string, v: number) {
  if (v === 0) return t('weightLevel.off')
  if (v <= 3) return t('weightLevel.low')
  if (v <= 6) return t('weightLevel.medium')
  if (v <= 8) return t('weightLevel.high')
  return t('weightLevel.max')
}
