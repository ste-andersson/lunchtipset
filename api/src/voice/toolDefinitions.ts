import { SENTIMENTS, WEIGHT_KEYS, WEIGHT_MAX } from '@lunch/shared'

/**
 * Client tools registered on every ElevenLabs agent. The handlers live in the
 * browser (web/src/call/tools.ts); names and parameters must match.
 */
type Param = {
  type: 'string' | 'number' | 'integer' | 'boolean'
  description: string
  enum?: readonly string[]
}

export interface ClientToolDefinition {
  name: string
  description: string
  required?: string[]
  properties: Record<string, Param>
}

const restaurantId: Param = {
  type: 'integer',
  description: 'Restaurant id from the system prompt',
}

export const clientTools: ClientToolDefinition[] = [
  {
    name: 'get_menus',
    description:
      "Look up all restaurants' lunch menus for another date than today (tomorrow, a weekday this week, last week), or to double-check today's. Use it instead of guessing.",
    required: ['date'],
    properties: { date: { type: 'string', description: 'YYYY-MM-DD' } },
  },
  {
    name: 'update_preferences',
    description:
      "Change the caller's preferences when they tell you about their taste, diet, allergies, habits or limits. Only pass what changes.",
    properties: {
      free_text: {
        type: 'string',
        description:
          'The complete, updated description of their taste, diet and habits, written as they would. Start from their current description in the system prompt, keep what still holds and change or add what they told you.',
      },
      max_distance_meters: { type: 'integer', description: 'Max walking distance in metres' },
      max_price_sek: { type: 'integer', description: 'Max lunch price in SEK, 0 for no limit' },
    },
  },
  {
    name: 'set_weight',
    description:
      'Set how much a factor matters when ranking restaurants for the caller, e.g. when they say price does not matter or they want more variety.',
    required: ['factor', 'value'],
    properties: {
      factor: { type: 'string', enum: WEIGHT_KEYS, description: 'Which factor' },
      value: {
        type: 'integer',
        description: `0 (does not matter) to ${WEIGHT_MAX} (decisive)`,
      },
    },
  },
  {
    name: 'exclude_restaurant',
    description:
      'Hide a restaurant from the caller\'s suggestions ("never suggest X"), or bring it back.',
    required: ['restaurant_id'],
    properties: {
      restaurant_id: restaurantId,
      exclude: { type: 'boolean', description: 'true to exclude, false to include again' },
    },
  },
  {
    name: 'log_meal',
    description:
      'Record where the caller ate, or has decided to eat today, optionally with what they thought.',
    properties: {
      restaurant_id: restaurantId,
      restaurant_name: { type: 'string', description: 'Only if the place is not in the list' },
      date: { type: 'string', description: 'YYYY-MM-DD, defaults to today' },
      dish: { type: 'string', description: 'The dish, ideally its exact title from the menu' },
      sentiment: { type: 'string', enum: SENTIMENTS, description: 'What they thought' },
      comment: { type: 'string', description: 'Short private comment' },
    },
  },
  {
    name: 'choose_restaurant',
    description:
      'Save that the caller is going to have lunch at a restaurant today, once they have decided. Colleagues can see who is going where. Replaces an earlier choice.',
    required: ['restaurant_id'],
    properties: {
      restaurant_id: restaurantId,
      clear: {
        type: 'boolean',
        description: 'true to remove the choice because the caller is not going there after all',
      },
    },
  },
  {
    name: 'save_restaurant_note',
    description:
      'Save info about a restaurant that colleagues will see, e.g. long queues or a great new dish. Ask before saving.',
    required: ['restaurant_id', 'text', 'sentiment'],
    properties: {
      restaurant_id: restaurantId,
      text: { type: 'string', description: 'The info, one or two sentences' },
      sentiment: { type: 'string', enum: SENTIMENTS, description: 'Is it good or bad news' },
    },
  },
  {
    name: 'add_dish',
    description:
      "Add a dish to a restaurant's lunch menu for today, when the caller tells you what is being served. Call once per dish. Everyone sees the change.",
    required: ['restaurant_id', 'title'],
    properties: {
      restaurant_id: restaurantId,
      title: { type: 'string', description: 'Dish name, as the restaurant would write it' },
      description: { type: 'string', description: 'Sides or details, if mentioned' },
      price_sek: { type: 'integer', description: 'Price in SEK, if mentioned' },
    },
  },
  {
    name: 'remove_dish',
    description:
      "Remove a dish from today's menu when the caller says it is wrong, not served or sold out.",
    required: ['restaurant_id', 'title'],
    properties: {
      restaurant_id: restaurantId,
      title: { type: 'string', description: 'The dish title as listed in the system prompt' },
    },
  },
]
