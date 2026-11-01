import type { Assistant } from '@lunch/shared'

/** Server-only fields; stripped before assistants are sent to the browser. */
export interface ServerAssistant extends Assistant {
  /** Settings for this character's ElevenLabs agent; ElevenLabs defaults when left out. */
  agent?: {
    /** e.g. 'gemini-2.5-flash', 'claude-sonnet-4-5' */
    llm?: string
    /** e.g. 'eleven_flash_v2_5' */
    ttsModelId?: string
  }
}

/**
 * The lunch assistants you can call. Placeholders until the real characters are in.
 *
 * - prompt: personality only. Facts about today's menus and the user are appended
 *   by the web client when the call starts.
 * - voiceId: an ElevenLabs voice id, or null for the agent's default voice.
 * - ambience: a file in web/public/phone-sounds/ played quietly during the call.
 *
 * Each assistant gets its own ElevenLabs agent, created and kept in sync by
 * api/src/voice/syncAgents.ts when the API starts.
 */
export const assistants: ServerAssistant[] = [
  {
    id: 'greta',
    name: 'Greta',
    language: 'sv',
    tagline: 'Lunchkunnig kollega som alltid vet var kön är kortast',
    prompt:
      'Du är Greta, en varm och lite pratglad kollega på Coops huvudkontor som har ätit lunch överallt i Solna. Du är rak med vad du tycker, gillar husmanskost och skämtar gärna om köerna.',
    firstMessage: 'Hej, Greta här! Har du hunnit bli hungrig?',
    voiceId: null,
    imageUrl: null,
    ambience: 'mumbai.mp3',
  },
  {
    id: 'sam',
    name: 'Sam',
    language: 'en',
    tagline: 'Calm foodie who helps you pick in under a minute',
    prompt:
      'You are Sam, a calm and curious food lover working at the Coop head office in Solna. You keep things short, ask one good question and then make a clear recommendation.',
    firstMessage: "Hi, it's Sam. Lunch time soon. Shall we figure out where to go?",
    voiceId: null,
    imageUrl: null,
    ambience: null,
  },
]
