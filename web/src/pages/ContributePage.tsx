import type { MenuDay, MenuItem } from '@lunch/shared'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { blankDish, cleanDishes, DishEditor } from '../components/DishEditor.tsx'
import { Notice, SignInPrompt } from '../components/ui.tsx'
import { useApi, useRestaurants, useToday, useUserData } from '../data.ts'

export function ContributePage() {
  const { t } = useTranslation()
  const user = useUserData()
  return (
    <div className="stack">
      <h1>{t('contribute.title')}</h1>
      {user.isSignedIn ? <MenuEditor /> : <SignInPrompt text={t('contribute.signInNeeded')} />}
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

/**
 * Enter or correct a restaurant's menu by hand. A photo is only a shortcut that
 * fills in the same fields, which are then checked before publishing.
 */
function MenuEditor() {
  const { t, i18n } = useTranslation()
  const api = useApi()
  const qc = useQueryClient()
  const restaurants = useRestaurants()
  const today = useToday()
  const [params] = useSearchParams()
  const [restaurantId, setRestaurantId] = useState<number | null>(
    params.get('restaurant') ? Number(params.get('restaurant')) : null,
  )
  const [days, setDays] = useState<MenuDay[]>([])
  const [touched, setTouched] = useState(false)
  const [photoScope, setPhotoScope] = useState<'today' | 'week'>('today')
  const [busy, setBusy] = useState<'photo' | 'publish' | null>(null)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [photoNote, setPhotoNote] = useState<string | null>(null)

  // Start from what is on the menu today (empty if nothing), until the user edits.
  const date = today.data?.date
  const current = today.data?.restaurants.find((r) => r.id === restaurantId)
  useEffect(() => {
    if (touched || !date) return
    const items = current?.items.filter((i) => !i.fixed) ?? []
    setDays([{ date, items: items.length ? items : [blankDish()] }])
  }, [touched, date, current])

  const edit = (next: (ds: MenuDay[]) => MenuDay[]) => {
    setTouched(true)
    setDays(next)
  }
  const setItems = (di: number, items: MenuItem[]) =>
    edit((ds) => ds.map((d, i) => (i === di ? { ...d, items } : d)))

  async function fillFromPhoto(file: File) {
    if (restaurantId == null) return
    setBusy('photo')
    setError(null)
    setPhotoNote(null)
    try {
      const form = new FormData()
      form.set('file', await shrinkImage(file), file.name)
      form.set('restaurantId', String(restaurantId))
      form.set('scope', photoScope)
      const res = await api.parseMenu(form)
      if (res.days.length) {
        edit(() => res.days)
        setPhotoNote(t('menuEditor.photoFilled'))
      } else {
        setPhotoNote(t('menuEditor.photoEmpty'))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  async function publish() {
    if (restaurantId == null) return
    const clean = days
      .map((d) => ({ ...d, items: cleanDishes(d.items) }))
      .filter((d) => d.items.length)
    setBusy('publish')
    setError(null)
    try {
      await api.publishMenu(restaurantId, clean)
      await qc.invalidateQueries({ queryKey: ['today'] })
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  function reset() {
    setDone(false)
    setTouched(false)
    setPhotoNote(null)
  }

  const fmt = (d: string) =>
    new Date(`${d}T12:00:00`).toLocaleDateString(i18n.language, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    })
  const canPublish =
    restaurantId != null && days.some((d) => d.items.some((i) => i.title.trim())) && !busy

  if (done) {
    return (
      <Notice tone="ok">
        <p>{t('menuEditor.published')}</p>
        <button type="button" className="btn btn--small" onClick={reset}>
          {t('menuEditor.another')}
        </button>
      </Notice>
    )
  }

  return (
    <div className="stack">
      <label className="field">
        <span>{t('meal.restaurant')}</span>
        <select
          value={restaurantId ?? ''}
          onChange={(e) => {
            setRestaurantId(e.target.value ? Number(e.target.value) : null)
            setTouched(false)
            setPhotoNote(null)
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

      {restaurantId != null && (
        <>
          <section className="panel">
            <h2>{t('menuEditor.photoTitle')}</h2>
            <p className="muted small">{t('menuEditor.photoIntro')}</p>
            <div className="segmented">
              {(['today', 'week'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={photoScope === s}
                  className={photoScope === s ? 'is-on' : ''}
                  onClick={() => setPhotoScope(s)}
                >
                  {t(`menuEditor.scope_${s}`)}
                </button>
              ))}
            </div>
            <label className="field">
              <span className="sr-only">{t('menuEditor.photoTitle')}</span>
              <input
                type="file"
                accept="image/*,application/pdf"
                disabled={busy !== null}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  e.target.value = ''
                  if (file) void fillFromPhoto(file)
                }}
              />
            </label>
            {busy === 'photo' && <p className="muted small">{t('menuEditor.reading')}</p>}
            {photoNote && <p className="small">{photoNote}</p>}
          </section>

          {days.map((d, di) => (
            <section key={d.date} className="panel">
              <div className="section-head">
                <h2>{fmt(d.date)}</h2>
                {days.length > 1 && (
                  <button
                    type="button"
                    className="btn btn--ghost btn--small"
                    onClick={() => edit((ds) => ds.filter((_, i) => i !== di))}
                  >
                    {t('menuEditor.removeDay')}
                  </button>
                )}
              </div>
              <DishEditor items={d.items} onChange={(items) => setItems(di, items)} />
            </section>
          ))}

          {error && <p className="error">{error}</p>}
          <div className="savebar">
            <button type="button" className="btn" disabled={!canPublish} onClick={publish}>
              {busy === 'publish' ? t('common.saving') : t('menuEditor.publish')}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
