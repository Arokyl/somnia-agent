import { formatGwei } from 'viem'
import { getClient } from '../lib/rpc'
import { cacheGet, cacheSetex, CACHE_TTL } from '../lib/redis'
import type { GasAssessment, GasTrend } from '@somnia-agent/shared'

export class GasService {
  async assess(chainId: number): Promise<GasAssessment> {
    // Check cache first
    const cached = await cacheGet(`gas:${chainId}`)
    if (cached) return JSON.parse(cached)

    const client = getClient(chainId)

    const [block, feeHistory] = await Promise.all([
      client.getBlock({ blockTag: 'latest' }),
      client.getFeeHistory({ blockCount: 20, rewardPercentiles: [10, 50, 90] }),
    ])

    const baseFee = block.baseFeePerGas ?? 0n
    const baseFeeGwei = parseFloat(formatGwei(baseFee))

    const historicalFees = feeHistory.baseFeePerGas.filter(Boolean) as bigint[]
    const avgBaseFee = historicalFees.length
      ? historicalFees.reduce((a, b) => a + b, 0n) / BigInt(historicalFees.length)
      : baseFee

    const trend = this.detectTrend(historicalFees)
    const isOptimal = baseFee <= avgBaseFee * 110n / 100n && trend !== 'rising'

    // EIP-1559 suggested fees
    const priorityFee = 1_500_000_000n // 1.5 gwei default
    const suggestedMaxFee = baseFee * 2n + priorityFee

    const assessment: GasAssessment = {
      currentBaseFeeGwei:     baseFeeGwei,
      suggestedMaxFeeGwei:    parseFloat(formatGwei(suggestedMaxFee)),
      suggestedPriorityFeeGwei: parseFloat(formatGwei(priorityFee)),
      isOptimal,
      trend,
      recommendation: isOptimal ? 'execute' : 'wait',
      predictedDropMinutes: trend === 'rising' ? 15 : null,
    }

    await cacheSetex(`gas:${chainId}`, CACHE_TTL.GAS, JSON.stringify(assessment))
    return assessment
  }

  private detectTrend(fees: bigint[]): GasTrend {
    if (fees.length < 10) return 'stable'
    const recent = fees.slice(-5)
    const older  = fees.slice(0, 5)
    const recentAvg = recent.reduce((a, b) => a + b, 0n) / BigInt(recent.length)
    const olderAvg  = older.reduce((a, b) => a + b, 0n)  / BigInt(older.length)
    if (recentAvg > olderAvg * 115n / 100n) return 'rising'
    if (recentAvg < olderAvg * 90n  / 100n) return 'falling'
    return 'stable'
  }

  average(arr: bigint[]): bigint {
    if (!arr.length) return 0n
    return arr.reduce((a, b) => a + b, 0n) / BigInt(arr.length)
  }
}

export const gasService = new GasService()
