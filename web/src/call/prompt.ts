import {
  type Assistant,
  addDays,
  colleagueScore,
  dishKey,
  type MealLog,
  type Preferences,
  previousWorkday,
  type Suggestion,
  type TasteMap,
  type TodayResponse,
  WEIGHT_KEYS,
} from '@lunch/shared'

const WALK_METERS_PER_MINUTE = 80
const HISTORY_DAYS = 21

const WEIGHT_NAMES: Record<(typeof WEIGHT_KEYS)[number], string> = {
  distance: 'short walk',
  colleagues: "colleagues' opinions",
  restaurantVariety: 'variety in restaurants',
  dishVariety: 'variety in kinds of dishes',
  taste: 'match with their own description of their taste',
  price: 'low price',
}

/**
 * Everything the assistant needs for every call goes into the system prompt, so
 * it can start talking straight away. Tools are only for changing things.
 */
export function buildSystemPrompt(input: {
  assistant: Assistant
  today: TodayResponse
  prefs: Preferences
  meals: MealLog[]
  ranked: Suggestion[]
  /** The AI's per-dish reading of their taste; excluded dishes are left out of the menus. */
  tasteMap?: TasteMap
  isSignedIn: boolean
  userName: string | null
}): string {
  const { assistant, today, prefs, meals, ranked, isSignedIn } = input
  const tasteMap = input.tasteMap ?? {}
  const language = assistant.language === 'sv' ? 'Swedish' : 'English'
  const rankedIds = new Set(ranked.map((s) => s.restaurant.id))
  const yesterday = previousWorkday(today.date)
  const loggedToday = meals.find((m) => m.date === today.date)
  const loggedYesterday = meals.some((m) => m.date === yesterday)
  const recent = meals.filter((m) => m.date >= addDays(today.date, -HISTORY_DAYS))

  const weekday = new Date(`${today.date}T12:00:00`).toLocaleDateString('en-GB', {
    weekday: 'long',
  })

  const lines: string[] = []
  const add = (...l: string[]) => lines.push(...l)

  add(
    '# Your character',
    assistant.prompt,
    '',
    'The character and speaking style above apply to every single reply in the call, whatever the rules below say about brevity or format. Never slip into a neutral, plain voice.',
    '',
  )
  add(
    '# The situation',
    `You are on a phone call with an employee at Coop's head office in Solna (Englundavägen 4), helping them decide where to have lunch today. Always speak ${language}, unless the caller clearly prefers another language.`,
    `- The call has already started and you have ALREADY greeted the caller. Your opening line, already spoken, was: "${assistant.firstMessage}". Never greet again: no hello/hi/hey/good day, no "nice to hear from you", no repeating your opening question. If the caller answers with a greeting, just carry on with the conversation as if you had both said hello.`,
    '- It is a voice call: short sentences, one question at a time, no lists, no markdown, no URLs read aloud.',
    `- Say distances naturally, in metres or minutes walking (about ${WALK_METERS_PER_MINUTE} m per minute).`,
    '- Be opinionated: recommend one place (and a dish) with a reason or two, and offer an alternative if they hesitate.',
    '- The ranking below is only a starting point for your first suggestion, computed before the call. What the caller says during the call always beats it.',
    '- Whenever the caller states a wish, craving or dislike (e.g. "I want pasta", "something light", "not fish"), drop your earlier suggestion and search ALL restaurants\' menus below for dishes that match, regardless of ranking. Recommend the best matching dish and its restaurant, and name the dish. Only if nothing on today\'s menus matches, say so honestly and offer the closest alternative.',
    '- Never repeat a suggestion the caller has turned down or ignored. Each new thing the caller says should be able to change your recommendation.',
    "- ABSOLUTE RULE: anything the caller never eats or wants to avoid (diet such as vegetarian or vegan, allergies, 'does not eat pork', dislikes, 'never suggest X') overrides everything else: the ranking, their other wishes, your own taste and any colleague tip. Never suggest, recommend, mention as an option or praise a dish that breaks it, even as a runner-up, even if the caller asks for something close to it. Check every dish against their description below before you name it. Dishes that clearly break a rule have already been removed from the menus below; if a dish is unclear (e.g. a sauce or an ingredient you cannot rule out), leave it out or ask rather than risk it. If nothing suitable is left at a place, say so and pick another place.",
    '- Never suggest restaurants marked EXCLUDED unless asked about them directly.',
    '- If the caller tells you something lasting about their taste, diet or habits (e.g. "I am vegetarian now", "I hate walking far", "never suggest X"), save it with the right tool (update_preferences rewrites their whole description, so keep what still holds), then confirm briefly in words.',
    '- If they share something about a restaurant that colleagues would find useful (long queue, great new dish, closed for renovation), offer to save it as a note.',
    "- If they tell you what a restaurant is serving today, or that a listed dish is wrong or sold out, fix today's menu with add_dish / remove_dish (one call per dish). To replace a wrong menu, add the right dishes first, then remove the wrong ones. Briefly confirm what you changed.",
    loggedToday
      ? `- They have already logged today's lunch: ${loggedToday.restaurantName}${loggedToday.dish ? ` (${loggedToday.dish})` : ''}.`
      : '- When they have decided where to go today, log it with log_meal (date today, with the dish if known).',
    loggedYesterday
      ? ''
      : `- Before ending the call, ask where they ate last workday (${yesterday}) and what they thought, and log it with log_meal and a sentiment.`,
    '- End the call politely when the caller is done.',
    '',
  )
  if (!isSignedIn) {
    add(
      'The caller is not signed in: they can change their own preferences and log meals, but save_restaurant_note, add_dish and remove_dish will fail. Tell them they need to sign in in the app for that.',
      '',
    )
  }

  add(`# Today: ${weekday} ${today.date}`, '')

  add('# The caller', `Name: ${input.userName ?? 'unknown'}`)
  add(
    prefs.freeText.trim()
      ? `Their taste, diet and habits, in their own words: """${prefs.freeText.trim()}"""`
      : 'They have not described their taste yet. Ask a little about it and save it with update_preferences.',
  )
  add(`Max walking distance: ${prefs.maxDistanceMeters} m`)
  if (prefs.maxPriceSek) add(`Max price: ${prefs.maxPriceSek} SEK`)
  add(
    `What matters to them (0–10): ${WEIGHT_KEYS.map((k) => `${WEIGHT_NAMES[k]} ${prefs.weights[k]}`).join(', ')}`,
    '',
  )

  add('# What they have eaten recently')
  if (recent.length === 0) add('Nothing logged.')
  for (const m of recent) {
    add(
      `- ${m.date}: ${m.restaurantName}${m.dish ? `, ${m.dish}` : ''}${m.sentiment ? ` (${m.sentiment})` : ''}${m.comment ? ` "${m.comment}"` : ''}`,
    )
  }
  add('')

  add('# Ranking for today (computed from their preferences; score 0–100)')
  if (ranked.length === 0) add('No restaurant matches all their limits today.')
  ranked.slice(0, 6).forEach((s, i) => {
    add(
      `${i + 1}. ${s.restaurant.name} – score ${s.score}${s.item ? `, best dish: ${s.item.title}` : ''}${s.pros.length ? `; good: ${s.pros.map((k) => WEIGHT_NAMES[k]).join(', ')}` : ''}${s.cons.length ? `; weak: ${s.cons.map((k) => WEIGHT_NAMES[k]).join(', ')}` : ''}`,
    )
  })
  add('')

  add("# Restaurants and today's menus")
  for (const r of today.restaurants) {
    const flags = [
      prefs.excludedRestaurantIds.includes(r.id) ? 'EXCLUDED by the caller' : '',
      r.distanceMeters > prefs.maxDistanceMeters ? 'further than their max distance' : '',
      !rankedIds.has(r.id) && !prefs.excludedRestaurantIds.includes(r.id)
        ? 'filtered out today'
        : '',
    ].filter(Boolean)
    const c = r.colleagues
    const opinions = c.positive + c.neutral + c.negative
    add(
      `## ${r.name} (id ${r.id}) – ${r.distanceMeters} m${r.category ? `, ${r.category}` : ''}${flags.length ? ` [${flags.join('; ')}]` : ''}`,
    )
    if (r.description) add(r.description)
    if (opinions) {
      add(
        `Colleagues: ${c.positive} positive, ${c.neutral} neutral, ${c.negative} negative (overall ${Math.round(colleagueScore(c) * 100)}/100)`,
      )
    }
    for (const n of r.notes) {
      add(
        `Colleague tip${n.dish ? ` about ${n.dish}` : ''}${n.sentiment ? ` (${n.sentiment})` : ''}: "${n.text}"`,
      )
    }
    const items = r.items.filter((it) => !tasteMap[dishKey(r.id, it.title)]?.excluded)
    if (r.items.length === 0) add('No menu found for today.')
    else if (items.length === 0) add('Nothing on the menu today suits the caller.')
    for (const it of items) {
      add(
        `- ${it.title}${it.description ? ` – ${it.description}` : ''}${it.priceSek ? `, ${it.priceSek} kr` : ''}${it.fixed ? ' (fixed menu, every day)' : ''}`,
      )
    }
    add('')
  }

  // Ids in the prompt are only for tool calls; don't let them leak into speech.
  add('Restaurant ids are for tools only, never say them out loud.')
  add(
    '',
    '# Remember',
    `Everything above is facts and rules. Say all of it in your own voice, as this character: ${assistant.prompt.split('\n')[0]}`,
  )
  return lines.filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n')
}
