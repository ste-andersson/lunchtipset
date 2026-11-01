import type { Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { z } from 'zod'

export async function parseJson<T extends z.ZodType>(c: Context, schema: T): Promise<z.infer<T>> {
  const body = await c.req.json().catch(() => {
    throw new HTTPException(400, { message: 'Invalid JSON' })
  })
  const result = schema.safeParse(body)
  if (!result.success) {
    throw new HTTPException(400, { message: result.error.issues.map((i) => i.message).join('; ') })
  }
  return result.data
}

export function idParam(c: Context): number {
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id)) throw new HTTPException(400, { message: 'Invalid id' })
  return id
}
