import type { AdminRestaurant } from '@lunch/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { RestaurantInput } from '../api.ts'
import { cleanDishes, DishEditor } from '../components/DishEditor.tsx'
import { formatDistance, Notice, Sheet } from '../components/ui.tsx'
import { useApi, useMe } from '../data.ts'

export function AdminPage() {
  const { t } = useTranslation()
  const me = useMe()
  if (me.isLoading) return <p className="muted">{t('common.loading')}</p>
  if (!me.data?.isAdmin) return <Notice tone="warn">{t('admin.notAdmin')}</Notice>
  return (
    <div className="stack">
      <h1>{t('admin.title')}</h1>
      <Restaurants />
      <FetchLog />
    </div>
  )
}

function Restaurants() {
  const { t } = useTranslation()
  const api = useApi()
  const qc = useQueryClient()
  const list = useQuery({ queryKey: ['admin', 'restaurants'], queryFn: api.admin.restaurants })
  const [editing, setEditing] = useState<AdminRestaurant | 'new' | null>(null)

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['admin'] })
    void qc.invalidateQueries({ queryKey: ['restaurants'] })
    void qc.invalidateQueries({ queryKey: ['today'] })
  }
  const fetchOne = useMutation({
    mutationFn: (id: number) => api.admin.fetchMenus(id),
    onSuccess: refresh,
  })

  return (
    <section className="panel">
      <div className="section-head">
        <h2>{t('admin.restaurants')}</h2>
        <button type="button" className="btn btn--small" onClick={() => setEditing('new')}>
          {t('admin.addRestaurant')}
        </button>
      </div>
      <ul className="admin-list">
        {list.data?.map((r) => (
          <li key={r.id} className={r.active ? '' : 'is-inactive'}>
            <div>
              <strong>{r.name}</strong>{' '}
              <span className="muted small">
                {formatDistance(r.distanceMeters)}
                {!r.active && ` · ${t('admin.inactive')}`}
              </span>
              <p className="muted small truncate">{r.menuUrl ?? t('admin.noMenuUrl')}</p>
            </div>
            <div className="admin-list__actions">
              {r.menuUrl && (
                <button
                  type="button"
                  className="btn btn--ghost btn--small"
                  disabled={fetchOne.isPending}
                  onClick={() => fetchOne.mutate(r.id)}
                >
                  {fetchOne.isPending && fetchOne.variables === r.id ? '…' : t('admin.fetch')}
                </button>
              )}
              <button
                type="button"
                className="btn btn--ghost btn--small"
                onClick={() => setEditing(r)}
              >
                {t('common.edit')}
              </button>
            </div>
          </li>
        ))}
      </ul>
      <Sheet
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? t('admin.addRestaurant') : t('admin.editRestaurant')}
      >
        {editing && (
          <RestaurantForm
            initial={editing === 'new' ? null : editing}
            onDone={() => {
              setEditing(null)
              refresh()
            }}
          />
        )}
      </Sheet>
    </section>
  )
}

function RestaurantForm({
  initial,
  onDone,
}: {
  initial: AdminRestaurant | null
  onDone: () => void
}) {
  const { t } = useTranslation()
  const api = useApi()
  const [form, setForm] = useState<RestaurantInput>({
    name: initial?.name ?? '',
    address: initial?.address ?? null,
    distanceMeters: initial?.distanceMeters ?? 300,
    menuUrl: initial?.menuUrl ?? null,
    website: initial?.website ?? null,
    category: initial?.category ?? null,
    description: initial?.description ?? null,
    fixedMenu: initial?.fixedMenu ?? [],
    active: initial?.active ?? true,
  })
  const [error, setError] = useState<string | null>(null)
  const text = (k: 'address' | 'menuUrl' | 'website' | 'category' | 'description') => ({
    value: (form[k] as string | null) ?? '',
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value.trim() ? e.target.value : null })),
  })

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      const body = { ...form, fixedMenu: cleanDishes(form.fixedMenu) }
      if (initial) await api.admin.updateRestaurant(initial.id, body)
      else await api.admin.createRestaurant(body)
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function remove() {
    if (!initial || !confirm(t('admin.confirmDelete', { name: initial.name }))) return
    await api.admin.deleteRestaurant(initial.id)
    onDone()
  }

  return (
    <form className="form" onSubmit={submit}>
      <label className="field">
        <span>{t('admin.name')}</span>
        <input
          required
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        />
      </label>
      <label className="field">
        <span>{t('admin.distance')}</span>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          required
          value={form.distanceMeters}
          onChange={(e) => setForm((f) => ({ ...f, distanceMeters: Number(e.target.value) }))}
        />
      </label>
      <label className="field">
        <span>{t('admin.menuUrl')}</span>
        <input type="url" placeholder="https://" {...text('menuUrl')} />
      </label>
      <label className="field">
        <span>{t('admin.website')}</span>
        <input type="url" placeholder="https://" {...text('website')} />
      </label>
      <label className="field">
        <span>{t('admin.address')}</span>
        <input {...text('address')} />
      </label>
      <label className="field">
        <span>{t('admin.category')}</span>
        <input placeholder={t('admin.categoryPlaceholder')} {...text('category')} />
      </label>
      <label className="field">
        <span>{t('admin.description')}</span>
        <textarea
          rows={3}
          placeholder={t('admin.descriptionPlaceholder')}
          {...text('description')}
        />
      </label>
      <div className="field">
        <span>{t('admin.fixedMenu')}</span>
        <p className="muted small">{t('admin.fixedMenuHint')}</p>
        <DishEditor
          items={form.fixedMenu}
          onChange={(fixedMenu) => setForm((f) => ({ ...f, fixedMenu }))}
        />
      </div>
      <label className="check">
        <input
          type="checkbox"
          checked={form.active}
          onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
        />
        {t('admin.active')}
      </label>
      {error && <p className="error">{error}</p>}
      <div className="form__actions">
        {initial && (
          <button type="button" className="btn btn--danger" onClick={remove}>
            {t('common.delete')}
          </button>
        )}
        <button type="submit" className="btn">
          {t('common.save')}
        </button>
      </div>
    </form>
  )
}

function FetchLog() {
  const { t, i18n } = useTranslation()
  const api = useApi()
  const qc = useQueryClient()
  const log = useQuery({ queryKey: ['admin', 'fetch-log'], queryFn: api.admin.fetchLog })
  const fetchAll = useMutation({
    mutationFn: () => api.admin.fetchMenus(),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin'] })
      void qc.invalidateQueries({ queryKey: ['today'] })
    },
  })

  return (
    <section className="panel">
      <div className="section-head">
        <h2>{t('admin.fetchLog')}</h2>
        <button
          type="button"
          className="btn btn--small"
          disabled={fetchAll.isPending}
          onClick={() => fetchAll.mutate()}
        >
          {fetchAll.isPending ? t('admin.fetching') : t('admin.fetchAll')}
        </button>
      </div>
      <table className="table">
        <tbody>
          {log.data?.slice(0, 30).map((f) => (
            <tr key={f.id}>
              <td className="small muted">
                {new Date(f.fetchedAt).toLocaleString(i18n.language, {
                  weekday: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </td>
              <td>{f.restaurantName}</td>
              <td>
                <span className={`status status--${f.status}`}>{t(`fetchStatus.${f.status}`)}</span>
              </td>
              <td className="small muted">{f.message ?? f.itemCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
