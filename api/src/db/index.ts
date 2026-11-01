import { fileURLToPath } from 'node:url'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { env } from '../env.ts'
import * as schema from './schema.ts'

// onnotice: migrations log "already exists, skipping" on every start otherwise.
const client = postgres(env.DATABASE_URL, { max: 5, onnotice: () => {} })
export const db = drizzle(client, { schema })

export async function runMigrations() {
  const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url))
  await migrate(db, { migrationsFolder })
}
