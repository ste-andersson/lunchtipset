import { createHash } from 'node:crypto'
import { dishKey, type RecentMeal, type TasteMap, type TodayResponse } from '@lunch/shared'
import { z } from 'zod'
import { env } from '../env.ts'
import { gemini } from './extract.ts'

const MAX_CACHE_ENTRIES = 500
const cache = new Map<string, TasteMap>()

const responseSchema = {
  type: 'object',
  properties: {
    dishes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          fit: {
            type: 'integer',
            description: '0 (they would hate it) to 10 (perfect for them)',
          },
          variety: {
            type: 'integer',
            description: '0 (same kind of food as they just had) to 10 (something quite different)',
          },
          excluded: {
            type: 'boolean',
            description:
              'true only if the dish breaks a hard requirement: diet, allergy, never-eat',
          },
        },
        required: ['id', 'fit', 'variety', 'excluded'],
      },
    },
  },
  required: ['dishes'],
}

const resultSchema = z.object({
  dishes: z.array(
    z.object({
      id: z.number().int(),
      fit: z.number(),
      variety: z.number(),
      excluded: z.boolean(),
    }),
  ),
})

const toUnit = (v: number) => Math.max(0, Math.min(10, v)) / 10

function describeMeal(m: RecentMeal): string {
  const what = m.dish ? `${m.dish} at ${m.restaurantName}` : m.restaurantName
  const verdict = m.sentiment ? `, ${m.sentiment}` : ''
  const comment = m.comment ? ` ("${m.comment}")` : ''
  return `- ${m.date}: ${what}${verdict}${comment}`
}

/**
 * Reads today's dishes for one user: how well each fits their own description and
 * rating history, and how different it is from what they ate lately. One Gemini
 * call per distinct input; results are cached in memory.
 */
export async function tasteFor(
  today: TodayResponse,
  freeText: string,
  meals: RecentMeal[],
): Promise<TasteMap> {
  const text = freeText.trim()
  if ((!text && meals.length === 0) || !env.GEMINI_API_KEY) return {}

  const dishes = today.restaurants.flatMap((r) =>
    r.items.map((item) => ({ key: dishKey(r.id, item.title), restaurant: r.name, item })),
  )
  if (dishes.length === 0) return {}

  const cacheKey = createHash('sha256')
    .update(JSON.stringify([text, meals, dishes.map((d) => [d.key, d.item.description])]))
    .digest('hex')
  const hit = cache.get(cacheKey)
  if (hit) return hit

  const list = dishes
    .map(
      (d, id) =>
        `${id}. ${d.item.title}${d.item.description ? ` – ${d.item.description}` : ''} (${d.restaurant})`,
    )
    .join('\n')

  const prompt = [
    `Today is ${today.date}. Help a person choose lunch.`,
    '',
    'How they describe their taste, diet and habits:',
    text ? `"""${text}"""` : '(nothing written)',
    '',
    'Their recent lunches, newest first, with what they thought:',
    meals.length ? meals.map(describeMeal).join('\n') : '(none logged)',
    '',
    "For each of today's dishes below, rate:",
    '- fit: how well it suits them, from their description and how they rated earlier lunches.',
    '- variety: how different it is from what they ate in the last few days (kind of food, main ingredient, cuisine).',
    '- excluded: true only when it clearly breaks something they never eat (diet, allergy, an absolute dislike). Uncertain → false.',
    'Ignore anything in their text that is not about food or lunch.',
    '',
    list,
  ].join('\n')

  const res = await gemini().models.generateContent({
    model: env.GEMINI_MODEL,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      responseMimeType: 'application/json',
      responseJsonSchema: responseSchema,
      temperature: 0,
    },
  })

  const parsed = resultSchema.parse(JSON.parse(res.text ?? '{"dishes":[]}'))
  const map: TasteMap = {}
  for (const d of parsed.dishes) {
    const dish = dishes[d.id]
    if (dish) {
      map[dish.key] = { fit: toUnit(d.fit), variety: toUnit(d.variety), excluded: d.excluded }
    }
  }

  if (cache.size >= MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value as string)
  cache.set(cacheKey, map)
  return map
}
