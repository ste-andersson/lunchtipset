import type { ChatContent, ChatReply } from '@lunch/shared'
import { env } from '../env.ts'
import { clientTools } from '../voice/toolDefinitions.ts'
import { gemini } from './extract.ts'

const functionDeclarations = clientTools.map((t) => ({
  name: t.name,
  description: t.description,
  parametersJsonSchema: {
    type: 'object',
    properties: t.properties,
    required: t.required ?? [],
  },
}))

/**
 * One assistant turn in a text conversation. The browser owns the history and the
 * tools: when the reply asks for tool calls it runs them and calls this again.
 */
export async function chatTurn(system: string, contents: ChatContent[]): Promise<ChatReply> {
  const res = await gemini().models.generateContent({
    model: env.GEMINI_MODEL,
    contents,
    config: {
      systemInstruction: system,
      tools: [{ functionDeclarations }],
      temperature: 1,
      // A little thinking is what makes it actually read the menus before answering.
      ...(env.GEMINI_MODEL.includes('flash') ? { thinkingConfig: { thinkingBudget: 1024 } } : {}),
    },
  })

  const content = res.candidates?.[0]?.content
  const parts = (content?.parts ?? []) as Record<string, unknown>[]
  if (parts.length === 0) throw new Error('Empty reply from the model')

  const text = parts
    .filter((p) => typeof p.text === 'string' && !p.thought)
    .map((p) => p.text as string)
    .join('')
    .trim()
  const calls = parts.flatMap((p) => {
    const fc = p.functionCall as { name?: string; args?: Record<string, unknown> } | undefined
    return fc?.name ? [{ name: fc.name, args: fc.args ?? {} }] : []
  })
  return { content: { role: 'model', parts }, text, calls }
}
