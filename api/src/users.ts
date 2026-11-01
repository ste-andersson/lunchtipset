import { createClerkClient } from '@clerk/backend'
import type { Author } from '@lunch/shared'
import { env } from './env.ts'

const TTL_MS = 60 * 60_000
const cache = new Map<string, { author: Author | null; at: number }>()
const clerk = env.CLERK_SECRET_KEY ? createClerkClient({ secretKey: env.CLERK_SECRET_KEY }) : null

/** Name and profile picture for Clerk user ids, cached for an hour. */
export async function authors(userIds: string[]): Promise<Map<string, Author | null>> {
  const now = Date.now()
  const result = new Map<string, Author | null>()
  const missing: string[] = []
  for (const id of new Set(userIds)) {
    const hit = cache.get(id)
    if (hit && now - hit.at < TTL_MS) result.set(id, hit.author)
    else missing.push(id)
  }

  if (clerk && missing.length) {
    try {
      const { data } = await clerk.users.getUserList({ userId: missing, limit: missing.length })
      for (const u of data) {
        const name =
          [u.firstName, u.lastName].filter(Boolean).join(' ') ||
          u.username ||
          u.primaryEmailAddress?.emailAddress.split('@')[0] ||
          'Kollega'
        const author: Author = { name, imageUrl: u.hasImage ? u.imageUrl : null }
        cache.set(u.id, { author, at: now })
        result.set(u.id, author)
      }
    } catch (err) {
      console.warn('Could not look up Clerk users', err instanceof Error ? err.message : err)
    }
  }
  for (const id of missing) {
    if (!result.has(id)) {
      cache.set(id, { author: null, at: now })
      result.set(id, null)
    }
  }
  return result
}
