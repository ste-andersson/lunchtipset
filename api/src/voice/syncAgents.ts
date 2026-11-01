import { createHash } from 'node:crypto'
import { assistants, type ServerAssistant } from '../data/assistants.ts'
import { env } from '../env.ts'
import { type ClientToolDefinition, clientTools } from './toolDefinitions.ts'

/**
 * Creates or updates the ElevenLabs tools and one agent per assistant, so nothing
 * has to be set up in the ElevenLabs dashboard. Agents are found by tag, and only
 * patched when their config hash changes (every patch is a new agent version).
 */

const BASE = 'https://api.elevenlabs.io/v1/convai'
const APP_TAG = 'lunchtipset'
const assistantTag = (id: string) => `${APP_TAG}:${id}`
const HASH_PREFIX = `${APP_TAG}-hash:`

async function el<T>(method: string, path: string, body?: unknown): Promise<T> {
  if (!env.ELEVENLABS_API_KEY) throw new Error('ELEVENLABS_API_KEY is not set')
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'xi-api-key': env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!res.ok) {
    throw new Error(
      `ElevenLabs ${method} ${path}: ${res.status} ${await res.text().catch(() => '')}`,
    )
  }
  return res.json() as Promise<T>
}

async function listAll<T>(path: string, key: string): Promise<T[]> {
  const out: T[] = []
  let cursor: string | null = null
  do {
    const sep = path.includes('?') ? '&' : '?'
    const page: Record<string, unknown> & { has_more: boolean; next_cursor?: string | null } =
      await el(
        'GET',
        `${path}${sep}page_size=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
      )
    out.push(...((page[key] as T[]) ?? []))
    cursor = page.has_more ? (page.next_cursor ?? null) : null
  } while (cursor)
  return out
}

const hash = (v: unknown) =>
  createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 12)

function toolConfig(t: ClientToolDefinition) {
  return {
    type: 'client',
    name: t.name,
    description: t.description,
    expects_response: true,
    response_timeout_secs: 20,
    parameters: {
      type: 'object',
      required: t.required ?? [],
      properties: t.properties,
    },
  }
}

function agentConfig(a: ServerAssistant, toolIds: string[]) {
  return {
    name: `Lunchtipset – ${a.name}`,
    conversation_config: {
      agent: {
        // Replaced per call with the full prompt (menus, preferences, history).
        first_message: a.firstMessage,
        language: a.language,
        prompt: {
          prompt: a.prompt,
          ...(a.agent?.llm ? { llm: a.agent.llm } : {}),
          tool_ids: toolIds,
          built_in_tools: {
            end_call: {
              type: 'system',
              name: 'end_call',
              description: '',
              params: { system_tool_type: 'end_call' },
            },
          },
        },
      },
      tts: {
        ...(a.voiceId ? { voice_id: a.voiceId } : {}),
        ...(a.agent?.ttsModelId ? { model_id: a.agent.ttsModelId } : {}),
      },
    },
    platform_settings: {
      // Only reachable through signed URLs from our API.
      auth: { enable_auth: true },
      overrides: {
        conversation_config_override: {
          agent: { first_message: true, language: true, prompt: { prompt: true } },
          tts: { voice_id: true },
        },
      },
    },
  }
}

type RemoteTool = { id: string; tool_config: { type: string; name?: string } }
type RemoteAgent = { agent_id: string; name: string; tags?: string[] | null }

async function syncTools(): Promise<string[]> {
  const existing = await listAll<RemoteTool>('/tools?types=client', 'tools')
  const ids: string[] = []
  for (const t of clientTools) {
    const body = { tool_config: toolConfig(t) }
    const found = existing.find(
      (e) => e.tool_config.type === 'client' && e.tool_config.name === t.name,
    )
    if (found) {
      await el('PATCH', `/tools/${found.id}`, body)
      ids.push(found.id)
    } else {
      const created = await el<{ id: string }>('POST', '/tools', body)
      ids.push(created.id)
    }
  }
  return ids
}

let agentIds = new Map<string, string>()
let inFlight: Promise<Map<string, string>> | null = null

export async function syncAgents(): Promise<Map<string, string>> {
  const agents = await listAll<RemoteAgent>(`/agents?tags=${APP_TAG}`, 'agents')
  const toolsHash = hash(clientTools.map(toolConfig))
  const plans = assistants.map((a) => {
    const existing = agents.find((r) => r.tags?.includes(assistantTag(a.id)))
    // Tool ids aren't known yet; they're stable per name, so hash the definitions instead.
    const wanted = hash([toolsHash, agentConfig(a, [])])
    const current = existing?.tags
      ?.find((t) => t.startsWith(HASH_PREFIX))
      ?.slice(HASH_PREFIX.length)
    return { a, existing, wanted, upToDate: !!existing && current === wanted }
  })

  const result = new Map<string, string>()
  if (plans.every((p) => p.upToDate)) {
    for (const p of plans) if (p.existing) result.set(p.a.id, p.existing.agent_id)
    return result
  }

  const toolIds = await syncTools()
  for (const p of plans) {
    if (p.upToDate && p.existing) {
      result.set(p.a.id, p.existing.agent_id)
      continue
    }
    const body = {
      ...agentConfig(p.a, toolIds),
      tags: [APP_TAG, assistantTag(p.a.id), `${HASH_PREFIX}${p.wanted}`],
    }
    if (p.existing) {
      await el('PATCH', `/agents/${p.existing.agent_id}`, body)
      result.set(p.a.id, p.existing.agent_id)
      console.log(`ElevenLabs: updated agent for ${p.a.id}`)
    } else {
      const created = await el<{ agent_id: string }>('POST', '/agents/create', body)
      result.set(p.a.id, created.agent_id)
      console.log(`ElevenLabs: created agent for ${p.a.id}`)
    }
  }
  return result
}

/** Starts (or joins) a sync and remembers the agent ids. */
export function ensureAgents(): Promise<Map<string, string>> {
  inFlight ??= syncAgents()
    .then((ids) => {
      agentIds = ids
      return ids
    })
    .finally(() => {
      inFlight = null
    })
  return inFlight
}

export async function agentIdFor(assistantId: string): Promise<string | undefined> {
  return agentIds.get(assistantId) ?? (await ensureAgents()).get(assistantId)
}
