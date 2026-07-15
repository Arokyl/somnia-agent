import { pgTable, uuid, text, numeric, integer, timestamp, jsonb, boolean } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id:        uuid('id').primaryKey().defaultRandom(),
  address:   text('address').notNull().unique(),
  createdAt: timestamp('created_at').defaultNow(),
})

export const trades = pgTable('trades', {
  id:           uuid('id').primaryKey().defaultRandom(),
  userId:       uuid('user_id').references(() => users.id),
  txHash:       text('tx_hash').unique(),
  chainId:      integer('chain_id').notNull(),
  tokenIn:      text('token_in').notNull(),
  tokenOut:     text('token_out').notNull(),
  amountIn:     numeric('amount_in',  { precision: 36, scale: 18 }),
  amountOut:    numeric('amount_out', { precision: 36, scale: 18 }),
  aggregator:   text('aggregator'),
  gasPaidGwei:  numeric('gas_paid_gwei'),
  priceImpact:  numeric('price_impact'),
  status:       text('status').notNull().default('pending'), // pending | confirmed | failed
  executedAt:   timestamp('executed_at'),
  createdAt:    timestamp('created_at').defaultNow(),
  aiIntent:     text('ai_intent'),
  executionPlan: jsonb('execution_plan'),
})

export const conditionalOrders = pgTable('conditional_orders', {
  id:              uuid('id').primaryKey().defaultRandom(),
  userId:          uuid('user_id').references(() => users.id),
  onchainOrderId:  integer('onchain_order_id'),
  chainId:         integer('chain_id').notNull(),
  tokenIn:         text('token_in').notNull(),
  tokenOut:        text('token_out').notNull(),
  amountIn:        numeric('amount_in', { precision: 36, scale: 18 }),
  condition:       jsonb('condition').notNull(),      // { type: 'maxGas', value: 30 }
  status:          text('status').default('active'),  // active | executed | cancelled | expired
  expiresAt:       timestamp('expires_at'),
  txHash:          text('tx_hash'),                    // on-chain tx that executed the order
  executedAt:      timestamp('executed_at'),
  originalCommand: text('original_command'),
  createdAt:       timestamp('created_at').defaultNow(),
})

export const agentSessions = pgTable('agent_sessions', {
  id:                uuid('id').primaryKey().defaultRandom(),
  userId:            uuid('user_id').references(() => users.id),
  messages:          jsonb('messages').notNull().default('[]'),
  portfolioSnapshot: jsonb('portfolio_snapshot'),
  updatedAt:         timestamp('updated_at').defaultNow(),
})
