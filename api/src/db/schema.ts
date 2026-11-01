import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow()

export const restaurants = pgTable('restaurants', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  address: text('address'),
  distanceMeters: integer('distance_meters').notNull(),
  menuUrl: text('menu_url'),
  website: text('website'),
  category: text('category'),
  description: text('description'),
  /** Dishes served every day: { title, description, priceSek }[]. */
  fixedMenu: jsonb('fixed_menu').notNull().default([]),
  active: boolean('active').notNull().default(true),
  createdAt: createdAt(),
})

export const menuItems = pgTable(
  'menu_items',
  {
    id: serial('id').primaryKey(),
    restaurantId: integer('restaurant_id')
      .notNull()
      .references(() => restaurants.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    priceSek: integer('price_sek'),
    /** 'web' | 'upload' */
    source: text('source').notNull(),
    position: integer('position').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index('menu_items_date_idx').on(t.date, t.restaurantId)],
)

export const menuFetches = pgTable('menu_fetches', {
  id: serial('id').primaryKey(),
  restaurantId: integer('restaurant_id')
    .notNull()
    .references(() => restaurants.id, { onDelete: 'cascade' }),
  /** 'ok' | 'empty' | 'error' */
  status: text('status').notNull(),
  message: text('message'),
  itemCount: integer('item_count').notNull().default(0),
  fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
})

export const restaurantNotes = pgTable('restaurant_notes', {
  id: serial('id').primaryKey(),
  restaurantId: integer('restaurant_id')
    .notNull()
    .references(() => restaurants.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull(),
  /** 'positive' | 'neutral' | 'negative' */
  sentiment: text('sentiment').notNull(),
  text: text('text').notNull(),
  /** 'user' | 'assistant' */
  source: text('source').notNull().default('user'),
  createdAt: createdAt(),
})

export const userProfiles = pgTable('user_profiles', {
  userId: text('user_id').primaryKey(),
  preferences: jsonb('preferences').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const mealLogs = pgTable(
  'meal_logs',
  {
    /** Client-generated uuid, so guest history can be uploaded as is. */
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    date: date('date').notNull(),
    restaurantId: integer('restaurant_id').references(() => restaurants.id, {
      onDelete: 'set null',
    }),
    restaurantName: text('restaurant_name').notNull(),
    dish: text('dish'),
    sentiment: text('sentiment'),
    comment: text('comment'),
    createdAt: createdAt(),
  },
  (t) => [index('meal_logs_user_idx').on(t.userId, t.date)],
)
