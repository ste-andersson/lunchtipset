import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { logger } from 'hono/logger'
import cron from 'node-cron'
import { type AuthVars, auth } from './auth.ts'
import { runMigrations } from './db/index.ts'
import { env } from './env.ts'
import { fetchAllMenus } from './menus/fetcher.ts'
import { adminRoutes } from './routes/admin.ts'
import { contributeRoutes } from './routes/contribute.ts'
import { meRoutes } from './routes/me.ts'
import { publicRoutes } from './routes/public.ts'
import { ensureAgents } from './voice/syncAgents.ts'

const app = new Hono<{ Variables: AuthVars }>()

app.use('/api/*', logger(), auth)
app.route('/api', publicRoutes)
app.route('/api/me', meRoutes)
app.route('/api/admin', adminRoutes)
app.route('/api', contributeRoutes)
app.all('/api/*', (c) => c.json({ error: 'Not found' }, 404))

app.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status)
  console.error(err)
  return c.json({ error: 'Något gick fel' }, 500)
})

// In production the API also serves the built web app.
const webDist = fileURLToPath(new URL('../../web/dist', import.meta.url))
if (existsSync(webDist)) {
  const indexHtml = readFileSync(path.join(webDist, 'index.html'), 'utf8')
  app.use('/*', serveStatic({ root: path.relative(process.cwd(), webDist) }))
  app.get('*', (c) => c.html(indexHtml))
}

await runMigrations()

if (env.ELEVENLABS_API_KEY) {
  // Don't block startup; a call made before this finishes waits for it instead.
  ensureAgents().catch((err) => console.error('ElevenLabs agent sync failed', err))
}

if (env.MENU_FETCH_CRON) {
  cron.schedule(
    env.MENU_FETCH_CRON,
    async () => {
      const results = await fetchAllMenus()
      console.log('Menu fetch done', results.map((r) => `${r.name}: ${r.status}`).join(', '))
    },
    { timezone: 'Europe/Stockholm' },
  )
}

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`API listening on http://localhost:${info.port}`)
})
