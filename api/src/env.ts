import { z } from 'zod'

const schema = z.object({
  PORT: z.coerce.number().default(3001),
  DATABASE_URL: z.string().min(1),
  CLERK_SECRET_KEY: z.string().optional(),
  CLERK_PUBLISHABLE_KEY: z.string().optional(),
  /** Comma-separated Clerk user ids that may administer restaurants. */
  ADMIN_USER_IDS: z
    .string()
    .default('')
    .transform((s) =>
      s
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean),
    ),
  ELEVENLABS_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default('gemini-2.5-flash'),
  /** Cron expression (Stockholm time) for the automatic menu fetch. Empty disables it. */
  MENU_FETCH_CRON: z.string().default('30 9 * * 1-5'),
})

export const env = schema.parse(process.env)
