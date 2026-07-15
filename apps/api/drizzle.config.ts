import type { Config } from 'drizzle-kit'

export default {
  schema: './src/db/schema.ts',
  out: './db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url:
      process.env.DATABASE_URL || 'postgresql://localhost:5432/somnia_agent',
  },
  verbose: true,
  strict: true,
} satisfies Config
