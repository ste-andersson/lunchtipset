import type { MenuItem } from '@lunch/shared'
import { useTranslation } from 'react-i18next'

export const blankDish = (): MenuItem => ({ title: '', description: null, priceSek: null })

/** Editable dish rows: name, price and an optional description line. */
export function DishEditor({
  items,
  onChange,
}: {
  items: MenuItem[]
  onChange: (items: MenuItem[]) => void
}) {
  const { t } = useTranslation()
  const update = (i: number, patch: Partial<MenuItem>) =>
    onChange(items.map((it, j) => (j === i ? { ...it, ...patch } : it)))

  return (
    <div className="dish-editor">
      {items.map((item, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: rows have no id; titles are being edited
        <div key={i} className="review-item">
          <div className="review-item__row">
            <input
              aria-label={t('menuEditor.dish')}
              placeholder={t('menuEditor.dish')}
              value={item.title}
              onChange={(e) => update(i, { title: e.target.value })}
            />
            <input
              aria-label={t('menuEditor.price')}
              className="review-item__price"
              type="number"
              inputMode="numeric"
              placeholder="kr"
              value={item.priceSek ?? ''}
              onChange={(e) =>
                update(i, { priceSek: e.target.value ? Number(e.target.value) : null })
              }
            />
            <button
              type="button"
              className="icon-btn"
              aria-label={t('common.delete')}
              onClick={() => onChange(items.filter((_, j) => j !== i))}
            >
              ✕
            </button>
          </div>
          <input
            aria-label={t('menuEditor.description')}
            placeholder={t('menuEditor.description')}
            value={item.description ?? ''}
            onChange={(e) => update(i, { description: e.target.value || null })}
          />
        </div>
      ))}
      <button
        type="button"
        className="btn btn--ghost btn--small"
        onClick={() => onChange([...items, blankDish()])}
      >
        {t('menuEditor.addDish')}
      </button>
    </div>
  )
}

/** Trims text and drops rows without a dish name. */
export function cleanDishes(items: MenuItem[]): MenuItem[] {
  return items
    .map((i) => ({ ...i, title: i.title.trim(), description: i.description?.trim() || null }))
    .filter((i) => i.title)
}
