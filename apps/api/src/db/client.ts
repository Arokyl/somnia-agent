import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema.js'

const connectionString = process.env.SUPABASE_URL
  ? `${process.env.SUPABASE_URL}/rest/v1/`   // Supabase connection string format
  : 'postgresql://localhost:5432/somnia_agent'

// Use DATABASE_URL directly if provided (recommended for Supabase)
const sql = postgres(process.env.DATABASE_URL || connectionString)

export const db = drizzle(sql, { schema })
