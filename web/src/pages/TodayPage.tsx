import {
  directionsUrl,
  type MenuItem,
  rankRestaurants,
  type Suggestion,
  type TodayRestaurant,
} from '@lunch/shared'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { MealForm } from '../components/MealForm.tsx'
import { NoteForm } from '../components/NoteForm.tsx'
import {
  AuthorAvatar,
  ColleagueBadge,
  formatDistance,
  Notice,
  SENTIMENT_ICON,
  Sheet,
  SignInPrompt,
} from '../components/ui.tsx'
import { useTaste, useToday, useUserData } from '../data.ts'

const TOP_SUGGESTIONS = 3

export function TodayPage() {
  const { t, i18n } = useTranslation()
  const today = useToday()
  const user = useUserData()
  const [showAll, setShowAll] = useState(false)
  const [eating, setEating] = useState<TodayRestaurant | null>(null)
  const [noting, setNoting] = useState<TodayRestaurant | null>(null)

  const taste = useTaste(today.data?.date, user.prefs.freeText, user.meals)
  const ranked = useMemo(
    () =>
      today.data
        ? rankRestaurants(
            today.data.restaurants,
            user.prefs,
            user.meals,
            today.data.date,
            taste.data,
          )
        : [],
    [today.data, user.prefs, user.meals, taste.data],
  )

  if (today.isLoading) return <p className="muted">{t('common.loading')}</p>
  if (today.error) return <Notice tone="warn">{t('common.loadError')}</Notice>
  if (!today.data) return null

  const visibleIds = new Set(ranked.map((s) => s.restaurant.id))
  const restaurants = today.data.restaurants.filter((r) => showAll || visibleIds.has(r.id))
  const hidden = today.data.restaurants.length - visibleIds.size
  const eatenToday = user.meals.find((m) => m.date === today.data.date)
  const dateLabel = new Date(`${today.data.date}T12:00:00`).toLocaleDateString(i18n.language, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  return (
    <div className="stack">
      <section className="hero">
        <p className="hero__date">{dateLabel}</p>
        {eatenToday && <p>{t('today.eatenAt', { place: eatenToday.restaurantName })}</p>}
      </section>

      {today.data.restaurants.length === 0 ? (
        <Notice>{t('today.noRestaurants')}</Notice>
      ) : (
        <>
          {ranked.length > 0 && (
            <section>
              <h2 className="section-title">{t('today.suggestions')}</h2>
              <ol className="suggestions">
                {ranked.slice(0, TOP_SUGGESTIONS).map((s, i) => (
                  <SuggestionCard key={s.restaurant.id} s={s} rank={i + 1} />
                ))}
              </ol>
            </section>
          )}

          <section>
            <div className="section-head">
              <h2 className="section-title">{t('today.allRestaurants')}</h2>
              {hidden > 0 && (
                <button
                  type="button"
                  className="btn btn--ghost btn--small"
                  onClick={() => setShowAll((v) => !v)}
                >
                  {showAll ? t('today.hideFiltered') : t('today.showFiltered', { count: hidden })}
                </button>
              )}
            </div>
            <div className="cards">
              {restaurants.map((r) => (
                <RestaurantCard
                  key={r.id}
                  r={r}
                  filtered={!visibleIds.has(r.id)}
                  onEat={() => setEating(r)}
                  onNote={() => setNoting(r)}
                />
              ))}
            </div>
          </section>
        </>
      )}

      <Sheet open={!!eating} onClose={() => setEating(null)} title={t('meal.logTitle')}>
        {eating && (
          <MealForm
            initial={{ restaurantId: eating.id, restaurantName: eating.name }}
            onSave={async (m) => {
              await user.saveMeal(m)
              setEating(null)
            }}
            onCancel={() => setEating(null)}
          />
        )}
      </Sheet>

      <Sheet
        open={!!noting}
        onClose={() => setNoting(null)}
        title={t('note.title', { name: noting?.name ?? '' })}
      >
        {noting &&
          (user.isSignedIn ? (
            <NoteForm restaurantId={noting.id} onDone={() => setNoting(null)} />
          ) : (
            <SignInPrompt text={t('note.signInNeeded')} />
          ))}
      </Sheet>
    </div>
  )
}

function SuggestionCard({ s, rank }: { s: Suggestion; rank: number }) {
  const { t } = useTranslation()
  return (
    <li className="suggestion">
      <span className="suggestion__rank">{rank}</span>
      <div className="suggestion__body">
        <div className="suggestion__head">
          <strong>{s.restaurant.name}</strong>
          <span className="suggestion__score" title={t('today.scoreTitle')}>
            {s.score}
          </span>
        </div>
        {s.item && <p className="suggestion__dish">{s.item.title}</p>}
        <p className="reasons">
          {s.pros.slice(0, 3).map((k) => (
            <span key={k} className="reason reason--pro">
              {t(`reasons.pro.${k}`)}
            </span>
          ))}
          {s.cons.slice(0, 2).map((k) => (
            <span key={k} className="reason reason--con">
              {t(`reasons.con.${k}`)}
            </span>
          ))}
          <span className="reason">{formatDistance(s.restaurant.distanceMeters)}</span>
        </p>
      </div>
    </li>
  )
}

function RestaurantCard({
  r,
  filtered,
  onEat,
  onNote,
}: {
  r: TodayRestaurant
  filtered: boolean
  onEat: () => void
  onNote: () => void
}) {
  const { t } = useTranslation()
  const daily = r.items.filter((i) => !i.fixed)
  const fixed = r.items.filter((i) => i.fixed)
  return (
    <article className={`card ${filtered ? 'card--muted' : ''}`}>
      <header className="card__head">
        <div>
          <h3>{r.name}</h3>
          <p className="muted small">
            {formatDistance(r.distanceMeters)}
            {r.category && ` · ${r.category}`}
          </p>
        </div>
        <ColleagueBadge counts={r.colleagues} />
      </header>

      {daily.length > 0 ? (
        <MenuList items={daily} />
      ) : (
        fixed.length === 0 && (
          <p className="muted small">
            {r.lastFetch?.status === 'error' || r.lastFetch?.status === 'empty'
              ? t('today.fetchFailed')
              : t('today.noMenu')}{' '}
            <Link to={`/installningar/bidra?restaurant=${r.id}`}>{t('today.uploadMenu')}</Link>{' '}
            {t('today.or')}{' '}
            <Link to={`/installningar/bidra?restaurant=${r.id}&mode=text`}>
              {t('today.writeMenu')}
            </Link>
          </p>
        )
      )}
      {fixed.length > 0 &&
        (daily.length > 0 ? (
          <details className="fixed-menu">
            <summary>{t('today.fixedMenu', { count: fixed.length })}</summary>
            <MenuList items={fixed} />
          </details>
        ) : (
          <div className="fixed-menu">
            <p className="muted small">{t('today.fixedMenuOnly')}</p>
            <MenuList items={fixed} />
          </div>
        ))}
      {r.menuSource === 'upload' && <p className="muted small">{t('today.fromUpload')}</p>}

      {r.notes.length > 0 && (
        <details className="notes">
          <summary>{t('today.notes', { count: r.notes.length })}</summary>
          <ul>
            {r.notes.map((n) => (
              <li key={n.id} className="review">
                <AuthorAvatar author={n.author} />
                <p>
                  {n.sentiment && <span aria-hidden>{SENTIMENT_ICON[n.sentiment]} </span>}
                  {n.dish && <strong>{n.dish}: </strong>}
                  {n.text}
                </p>
              </li>
            ))}
          </ul>
        </details>
      )}

      <footer className="card__actions">
        <button type="button" className="btn btn--small" onClick={onEat}>
          {t('today.ateHere')}
        </button>
        <button type="button" className="btn btn--ghost btn--small" onClick={onNote}>
          {t('today.review')}
        </button>
        {daily.length > 0 && (
          <Link
            to={`/installningar/bidra?restaurant=${r.id}&mode=text`}
            className="btn btn--ghost btn--small"
          >
            {t('today.editMenu')}
          </Link>
        )}
        {r.address && (
          <a
            className="btn btn--ghost btn--small"
            href={directionsUrl(r.address)}
            target="_blank"
            rel="noreferrer"
          >
            {t('today.directions')}
          </a>
        )}
        {(r.menuUrl ?? r.website) && (
          <a
            className="btn btn--ghost btn--small"
            href={r.menuUrl ?? r.website ?? undefined}
            target="_blank"
            rel="noreferrer"
          >
            {t('today.website')}
          </a>
        )}
      </footer>
    </article>
  )
}

function MenuList({ items }: { items: MenuItem[] }) {
  return (
    <ul className="menu">
      {items.map((item) => (
        <li key={item.title}>
          <div className="menu__line">
            <span>{item.title}</span>
            {item.priceSek != null && <span className="menu__price">{item.priceSek} kr</span>}
          </div>
          {item.description && <p className="muted small">{item.description}</p>}
        </li>
      ))}
    </ul>
  )
}
