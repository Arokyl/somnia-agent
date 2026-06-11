// ─── Chain configs ───────────────────────────────────────────────────────────

export const CHAIN_IDS = {
  SOMNIA: 50312,
  ETHEREUM: 1,
  BASE: 8453,
  ARBITRUM: 42161,
} as const

export type ChainId = (typeof CHAIN_IDS)[keyof typeof CHAIN_IDS]

export const CHAIN_NAMES: Record<ChainId, string> = {
  [CHAIN_IDS.SOMNIA]: 'Somnia',
  [CHAIN_IDS.ETHEREUM]: 'Ethereum',
  [CHAIN_IDS.BASE]: 'Base',
  [CHAIN_IDS.ARBITRUM]: 'Arbitrum',
}

// ─── Token types ─────────────────────────────────────────────────────────────

export interface Token {
  address: string
  symbol: string
  name: string
  decimals: number
  chainId: ChainId
  logoURI?: string
}

export interface TokenBalance extends Token {
  balance: string        // raw bigint as string
  balanceFormatted: string
  balanceUsd: number
}

// ─── Quote types ─────────────────────────────────────────────────────────────

export type Aggregator = 'oneinch' | 'zerox' | 'odos' | 'direct'

export interface RouteStep {
  protocol: string
  tokenIn: string
  tokenOut: string
  share: number          // percentage of trade going through this step
}

export interface AggregatedQuote {
  aggregator: Aggregator
  amountIn?: string       // bigint as string
  tokenIn?: string
  tokenOut?: string
  amountOut: string      // bigint as string
  amountOutFormatted: string
  priceImpact: number
  gasEstimate: string    // bigint as string
  gasEstimateUsd: number
  route: RouteStep[]
  calldata?: string
  to?: string
  value?: string
  effectiveRate: number  // amountOut in USD minus gas cost
}

// ─── Gas types ───────────────────────────────────────────────────────────────

export type GasRecommendation = 'execute' | 'wait' | 'queue'
export type GasTrend = 'rising' | 'falling' | 'stable'

export interface GasAssessment {
  currentBaseFeeGwei: number
  suggestedMaxFeeGwei: number
  suggestedPriorityFeeGwei: number
  isOptimal: boolean
  trend: GasTrend
  recommendation: GasRecommendation
  predictedDropMinutes: number | null
}

// ─── AI / Agent types ────────────────────────────────────────────────────────

export type AmountType = 'exact' | 'percentage' | 'all'
export type Urgency = 'low' | 'medium' | 'high'

export interface SwapCondition {
  type: 'maxGas' | 'minPrice' | 'time'
  value: number
  unit?: string
}

export interface SwapIntent {
  tokenIn: string        // symbol or address
  tokenOut: string
  amountIn: string
  amountType: AmountType
  urgency: Urgency
  conditions: SwapCondition[]
  raw: string            // original command
}

export interface ExecutionPlan {
  intent: SwapIntent
  quote: AggregatedQuote
  gasAssessment: GasAssessment
  shouldExecuteNow: boolean
  estimatedOutput: string
  warnings: string[]
  unsignedTx?: UnsignedTransaction
}

export interface UnsignedTransaction {
  to: string
  data: string
  value: string
  gasLimit: string
  maxFeePerGas: string
  maxPriorityFeePerGas: string
  chainId: number
  amountIn?: string
  approvalTarget?: string
  aggregatorTarget?: string
  tokenIn?: string
  tokenOut?: string
}

// ─── Order types ─────────────────────────────────────────────────────────────

export type OrderStatus = 'active' | 'executed' | 'cancelled' | 'expired'

export interface ConditionalOrder {
  id: string
  userId: string
  chainId: ChainId
  tokenIn: string
  tokenOut: string
  amountIn: string
  condition: SwapCondition
  status: OrderStatus
  expiresAt: string
  originalCommand: string
  createdAt: string
}

// ─── Trade history ────────────────────────────────────────────────────────────

export type TradeStatus = 'pending' | 'confirmed' | 'failed'

export interface Trade {
  id: string
  txHash: string
  chainId: ChainId
  tokenIn: string
  tokenOut: string
  amountIn: string
  amountOut: string
  aggregator: Aggregator
  gasPaidGwei: number
  priceImpact: number
  status: TradeStatus
  executedAt: string
  aiIntent?: string
}

// ─── Portfolio ────────────────────────────────────────────────────────────────

export interface Portfolio {
  address: string
  chainId: ChainId
  tokens: TokenBalance[]
  totalUsdValue: number
  updatedAt: string
}

// ─── API response wrapper ─────────────────────────────────────────────────────

export interface ApiResponse<T> {
  data?: T
  error?: string
  ok: boolean
}
