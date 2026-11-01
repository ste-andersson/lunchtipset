import { SENTIMENTS, WEIGHT_KEYS, WEIGHT_MAX } from '@lunch/shared'
import { z } from 'zod'

export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
export const sentimentSchema = z.enum(SENTIMENTS)

export const preferencesSchema = z.object({
  freeText: z.string().max(2000),
  maxDistanceMeters: z.number().int().min(50).max(10_000),
  maxPriceSek: z.number().int().positive().nullable(),
  excludedRestaurantIds: z.array(z.number().int()),
  weights: z.object(
    Object.fromEntries(WEIGHT_KEYS.map((k) => [k, z.number().min(0).max(WEIGHT_MAX)])) as Record<
      (typeof WEIGHT_KEYS)[number],
      z.ZodNumber
    >,
  ),
})

export const mealSchema = z.object({
  id: z.string().min(8).max(64),
  date: isoDateSchema,
  restaurantId: z.number().int().nullable(),
  restaurantName: z.string().min(1).max(200),
  dish: z.string().max(300).nullable(),
  sentiment: sentimentSchema.nullable(),
  comment: z.string().max(1000).nullable(),
})

export const menuItemSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(1000).nullable(),
  priceSek: z.number().int().nonnegative().nullable(),
})

export const menuDaysSchema = z
  .array(z.object({ date: isoDateSchema, items: z.array(menuItemSchema).max(40) }))
  .min(1)
  .max(7)

export const restaurantSchema = z.object({
  name: z.string().min(1).max(200),
  address: z.string().max(300).nullable(),
  distanceMeters: z.number().int().min(0).max(20_000),
  menuUrl: z.url().nullable(),
  website: z.url().nullable(),
  category: z.string().max(100).nullable(),
  description: z.string().max(2000).nullable(),
  fixedMenuText: z.string().max(5000).nullable().default(null),
  active: z.boolean().default(true),
})
