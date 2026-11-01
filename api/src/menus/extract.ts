import { GoogleGenAI } from '@google/genai'
import { type MenuDay, menuDay, workWeek } from '@lunch/shared'
import { z } from 'zod'
import { env } from '../env.ts'

export type MenuScope = 'today' | 'week'

export type MenuInput =
  | { kind: 'text'; text: string }
  | { kind: 'file'; mimeType: string; base64: string }

const WEEKDAYS_SV = ['måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag']

const responseSchema = {
  type: 'object',
  properties: {
    days: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'YYYY-MM-DD' },
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                description: { type: ['string', 'null'] },
                priceSek: { type: ['integer', 'null'] },
              },
              required: ['title'],
            },
          },
        },
        required: ['date', 'items'],
      },
    },
  },
  required: ['days'],
}

const resultSchema = z.object({
  days: z.array(
    z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      items: z.array(
        z.object({
          title: z.string().min(1),
          description: z.string().nullish(),
          priceSek: z.number().int().nullish(),
        }),
      ),
    }),
  ),
})

let client: GoogleGenAI | null = null
export function gemini(): GoogleGenAI {
  if (!env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not set')
  client ??= new GoogleGenAI({ apiKey: env.GEMINI_API_KEY })
  return client
}

function instructions(today: string, scope: MenuScope, restaurantName: string): string {
  const week = workWeek(menuDay(today))
  const dates = week.map((d, i) => `${WEEKDAYS_SV[i]} = ${d}`).join(', ')
  return [
    `You read lunch menus for the restaurant "${restaurantName}" in Stockholm, Sweden.`,
    scope === 'today'
      ? `Today is ${today}. Return today's lunch as one day with date ${today}. If the menu covers several days, pick the dishes for today's weekday; if it is a single day's menu or the day is unclear, return all lunch dishes shown.`
      : `Return the lunch dishes for every weekday the menu covers. The week in question: ${dates}.`,
    'Dishes served every day (e.g. "veckans vegetariska", "dagens soppa", always-on salads) belong on each day they apply to.',
    'Keep titles in the original language. Put sides and details (e.g. vegetarian, contains nuts) in description. priceSek is the lunch price in SEK if stated, per dish or shared.',
    'Ignore à la carte, dinner, drinks and dates outside this week. If no lunch menu can be found, return {"days": []}.',
  ].join('\n')
}

/** Turns a web page, PDF or photo into structured menu days. */
export async function extractMenu(
  input: MenuInput,
  opts: { today: string; scope: MenuScope; restaurantName: string },
): Promise<MenuDay[]> {
  const contentPart =
    input.kind === 'text'
      ? { text: `Menu source:\n\n${input.text}` }
      : { inlineData: { mimeType: input.mimeType, data: input.base64 } }

  const res = await gemini().models.generateContent({
    model: env.GEMINI_MODEL,
    contents: [
      {
        role: 'user',
        parts: [{ text: instructions(opts.today, opts.scope, opts.restaurantName) }, contentPart],
      },
    ],
    config: {
      responseMimeType: 'application/json',
      responseJsonSchema: responseSchema,
      temperature: 0.1,
    },
  })

  const parsed = resultSchema.parse(JSON.parse(res.text ?? '{"days":[]}'))
  const week = new Set(workWeek(menuDay(opts.today)))

  // For "today" the user has told us the date; don't let a misread date drop the menu.
  const days =
    opts.scope === 'today'
      ? [{ date: opts.today, items: parsed.days.flatMap((d) => d.items) }]
      : parsed.days.filter((d) => week.has(d.date))

  return days
    .map((d) => ({
      date: d.date,
      items: d.items.map((i) => ({
        title: i.title.trim(),
        description: i.description?.trim() || null,
        priceSek: i.priceSek ?? null,
      })),
    }))
    .filter((d) => d.items.length > 0)
}
