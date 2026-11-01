import { verifyToken } from '@clerk/backend'
import { createMiddleware } from 'hono/factory'
import { HTTPException } from 'hono/http-exception'
import { env } from './env.ts'

export type AuthVars = { userId: string | null }

/** Reads the Clerk session token if there is one. Never rejects on its own. */
if (!env.CLERK_SECRET_KEY) {
  console.warn('CLERK_SECRET_KEY is not set: every request is treated as a guest')
}

export const auth = createMiddleware<{ Variables: AuthVars }>(async (c, next) => {
  c.set('userId', null)
  const header = c.req.header('Authorization')
  if (header?.startsWith('Bearer ') && env.CLERK_SECRET_KEY) {
    try {
      const payload = await verifyToken(header.slice(7), { secretKey: env.CLERK_SECRET_KEY })
      c.set('userId', payload.sub)
    } catch (err) {
      // Treated as a guest; routes that need a user will answer 401.
      console.warn('Clerk token rejected:', err instanceof Error ? err.message : err)
    }
  }
  await next()
})

export const requireUser = createMiddleware<{ Variables: AuthVars }>(async (c, next) => {
  if (!c.get('userId')) throw new HTTPException(401, { message: 'Sign in required' })
  await next()
})

export const isAdmin = (userId: string | null) => !!userId && env.ADMIN_USER_IDS.includes(userId)

export const requireAdmin = createMiddleware<{ Variables: AuthVars }>(async (c, next) => {
  if (!isAdmin(c.get('userId'))) throw new HTTPException(403, { message: 'Admin only' })
  await next()
})

/** Narrowing helper for routes behind requireUser. */
export function userIdOf(c: { get: (k: 'userId') => string | null }): string {
  const id = c.get('userId')
  if (!id) throw new HTTPException(401)
  return id
}
