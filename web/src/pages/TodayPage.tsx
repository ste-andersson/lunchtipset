import {
  directionsUrl,
  type MenuItem,
  rankRestaurants,
  type SentimentCounts,
  type Suggestion,
  type TodayRestaurant,
} from '@lunch/shared'
import { Fragment, type ReactNode, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { useAppAuth } from '../auth.tsx'
import { MealForm } from '../components/MealForm.tsx'
import { AuthorAvatar, formatDistance, Notice, SENTIMENT_ICON, Sheet } from '../components/ui.tsx'
import { useChoosePlan, useTaste, useToday, useUserData } from '../data.ts'

const TOP_SUGGESTIONS = 3

export function TodayPage() {
  const { t } = useTranslation()
  const today = useToday()
  const user = useUserData()
  const choosePlan = useChoosePlan()
  const [showAll, setShowAll] = useState(false)
  const [eating, setEating] = useState<TodayRestaurant | null>(null)

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

  return (
    <div className="stack">
      {today.data.restaurants.length === 0 ? (
        <Notice>{t('today.noRestaurants')}</Notice>
      ) : (
        <>
          {ranked.length > 0 && (
            <Chalkboard suggestions={ranked.slice(0, TOP_SUGGESTIONS)}>
              {eatenToday && (
                <p className="chalkboard__note">
                  {t('today.eatenAt', { place: eatenToday.restaurantName })}
                </p>
              )}
            </Chalkboard>
          )}

          <section className="stack">
            <h2 className="menu-heading">{t('today.allRestaurants')}</h2>
            {restaurants.map((r) => (
              <RestaurantCard
                key={r.id}
                r={r}
                filtered={!visibleIds.has(r.id)}
                onEat={() => setEating(r)}
                onChoose={(id) => choosePlan(today.data.date, id)}
              />
            ))}
            {hidden > 0 && (
              <button
                type="button"
                className="text-link center"
                onClick={() => setShowAll((v) => !v)}
              >
                {showAll ? t('today.hideFiltered') : t('today.showFiltered', { count: hidden })}
              </button>
            )}
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
    </div>
  )
}

/** "Dagens förslag" written in chalk: dish and price, then where and why. */
function Chalkboard({
  suggestions,
  children,
}: {
  suggestions: Suggestion[]
  children?: ReactNode
}) {
  const { t } = useTranslation()
  return (
    <section className="chalkboard">
      <h2 className="chalkboard__title">{t('today.suggestions')}</h2>
      {suggestions.map((s) => {
        const why = s.pros[0] ? t(`reasons.pro.${s.pros[0]}`).toLowerCase() : null
        return (
          <div key={s.restaurant.id} className="chalkboard__row">
            <p className="chalkboard__dish">
              <span>{s.item?.title ?? s.restaurant.name}</span>
              {s.item?.priceSek != null && <span>{s.item.priceSek}:-</span>}
            </p>
            <p className="chalkboard__where">
              {s.item && `${s.restaurant.name}, `}
              {formatDistance(s.restaurant.distanceMeters)}
              {why && ` – ${why}`}
            </p>
          </div>
        )
      })}
      {children}
    </section>
  )
}

function colleagueLine(c: SentimentCounts): string | null {
  const total = c.positive + c.neutral + c.negative
  if (total === 0) return null
  if (c.positive >= 2 * Math.max(c.negative, 1)) return 'today.colleaguesLike'
  if (c.negative >= 2 * Math.max(c.positive, 1)) return 'today.colleaguesDislike'
  return 'today.colleaguesMixed'
}

function RestaurantCard({
  r,
  filtered,
  onEat,
  onChoose,
}: {
  r: TodayRestaurant
  filtered: boolean
  onEat: () => void
  onChoose: (restaurantId: number | null) => Promise<unknown>
}) {
  const { t } = useTranslation()
  const daily = r.items.filter((i) => !i.fixed)
  const fixed = r.items.filter((i) => i.fixed)
  const opinion = colleagueLine(r.colleagues)
  const subtitle = [r.category?.toLowerCase(), formatDistance(r.distanceMeters)]
    .filter(Boolean)
    .join(' · ')

  if (daily.length === 0 && fixed.length === 0) {
    const failed = r.lastFetch?.status === 'error' || r.lastFetch?.status === 'empty'
    return (
      <article className={`menu-card menu-card--empty ${filtered ? 'is-filtered' : ''}`}>
        <h3 className="menu-card__name">{r.name}</h3>
        <p className="menu-card__sub">
          {failed ? t('today.fetchFailed') : t('today.noMenuYet')}{' '}
          <Link to={`/installningar/bidra?restaurant=${r.id}`}>{t('today.photoIt')}</Link>{' '}
          {t('today.or')}{' '}
          <Link to={`/installningar/bidra?restaurant=${r.id}`}>{t('today.typeIt')}</Link>
        </p>
        <GoingSection r={r} onChoose={onChoose} />
        <CardLinks r={r} onEat={onEat} canEditMenu={false} />
      </article>
    )
  }

  return (
    <article className={`menu-card ${filtered ? 'is-filtered' : ''}`}>
      <header className="menu-card__head">
        <h3 className="menu-card__name">{r.name}</h3>
        <p className="menu-card__sub">{subtitle}</p>
      </header>

      {daily.length > 0 ? (
        <MenuList items={daily} />
      ) : (
        <>
          <p className="menu-card__sub">{t('today.fixedMenuOnly')}</p>
          <MenuList items={fixed} />
        </>
      )}
      {daily.length > 0 && fixed.length > 0 && (
        <>
          <p className="menu-card__section">{t('today.fixedMenuTitle')}</p>
          <MenuList items={fixed} />
        </>
      )}

      {(opinion || r.menuSource === 'upload') && (
        <p className="menu-card__sub menu-card__note">
          {opinion && t(opinion)}
          {opinion && r.menuSource === 'upload' && ' · '}
          {r.menuSource === 'upload' && t('today.fromUpload')}
        </p>
      )}

      {r.notes.length > 0 && (
        <details className="menu-card__more">
          <summary>{t('today.readReviews', { count: r.notes.length })}</summary>
          <ul className="reviews">
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

      <GoingSection r={r} onChoose={onChoose} />
      <CardLinks r={r} onEat={onEat} canEditMenu={daily.length > 0} />
    </article>
  )
}

/**
 * "Jag går hit": choose where to have lunch today. Shows the faces of everyone who
 * has chosen this place, the viewer's own first. Choosing another place moves you.
 */
function GoingSection({
  r,
  onChoose,
}: {
  r: TodayRestaurant
  onChoose: (restaurantId: number | null) => Promise<unknown>
}) {
  const { t } = useTranslation()
  const auth = useAppAuth()
  const [busy, setBusy] = useState(false)
  const going = r.goers.some((g) => g.isMe)
  const signedIn = !!auth.userId
  // Guests can't choose, so with nobody to show there is nothing to offer.
  if (!signedIn && (r.goers.length === 0 || !auth.enabled)) return null

  const toggle = async () => {
    if (!signedIn) return auth.signIn()
    setBusy(true)
    try {
      await onChoose(going ? null : r.id)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="going">
      <p className="menu-card__section going__hint">
        {going ? t('today.goingHint') : t('today.goHint')}
      </p>
      {r.goers.length > 0 && (
        <div className="going__people">
          {r.goers.map((g, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: names can repeat
            <span key={i} className={g.isMe ? 'going__me' : ''}>
              <AuthorAvatar author={g} />
            </span>
          ))}
          <span className="going__label">{t('today.goingHere', { count: r.goers.length })}</span>
        </div>
      )}
      <button
        type="button"
        className={`btn btn--small ${going ? 'btn--ghost' : ''}`}
        disabled={busy}
        onClick={toggle}
      >
        {!signedIn ? t('today.signInToGo') : going ? t('today.notGoing') : t('today.goHere')}
      </button>
    </div>
  )
}

/** "Recensera · Ändra meny · …" as a row of plain text links. */
function CardLinks({
  r,
  onEat,
  canEditMenu,
}: {
  r: TodayRestaurant
  onEat: () => void
  canEditMenu: boolean
}) {
  const { t } = useTranslation()
  const links: ReactNode[] = [
    <button key="ate" type="button" className="text-link" onClick={onEat}>
      {t('today.ateHere')}
    </button>,
  ]
  if (canEditMenu) {
    links.push(
      <Link key="edit" className="text-link" to={`/installningar/bidra?restaurant=${r.id}`}>
        {t('today.editMenu')}
      </Link>,
    )
  }
  if (r.address) {
    links.push(
      <a
        key="map"
        className="text-link"
        href={directionsUrl(r.address)}
        target="_blank"
        rel="noreferrer"
      >
        {t('today.directions')}
      </a>,
    )
  }
  const site = r.menuUrl ?? r.website
  if (site) {
    links.push(
      <a key="web" className="text-link" href={site} target="_blank" rel="noreferrer">
        {t('today.website')}
      </a>,
    )
  }
  return (
    <nav className="menu-card__links">
      {links.map((link, i) => (
        <Fragment key={(link as { key: string }).key}>
          {i > 0 && (
            <span className="menu-card__dot" aria-hidden>
              ·
            </span>
          )}
          {link}
        </Fragment>
      ))}
    </nav>
  )
}

function MenuList({ items }: { items: MenuItem[] }) {
  return (
    <ul className="dishes">
      {items.map((item) => (
        <li key={item.title}>
          <p className="dish">
            <span>{item.title}</span>
            {item.priceSek != null && (
              <>
                <span className="dish__dots" aria-hidden />
                <span className="dish__price">{item.priceSek} kr</span>
              </>
            )}
          </p>
          {item.description && <p className="dish__desc">{item.description}</p>}
        </li>
      ))}
    </ul>
  )
}
