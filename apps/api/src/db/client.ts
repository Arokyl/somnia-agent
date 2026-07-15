import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema.js'

// Use DATABASE_URL directly. Supabase exposes a Postgres connection string via
// DATABASE_URL — do NOT append `/rest/v1/` (that is the REST API, not a Postgres
// connection). This keeps the connection string valid for postgres-js / drizzle.
const connectionString =
  process.env.DATABASE_URL || 'postgresql://localhost:5432/somnia_agent'

// `prepare: false` avoids prepared-statement issues behind pooled/Supabase
// connections (pgbouncer) where session-level prepared statements are unsupported.
const sql = postgres(connectionString, { prepare: false })

export const db = drizzle(sql, { schema })

/**
 * Lightweight startup connectivity check (runs `SELECT 1`).
 * Throws if the database cannot be reached so the server logs a clear warning.
 */
export async function checkDatabaseConnection(): Promise<void> {
  await sql`select 1`
}
