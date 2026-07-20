'use client'

import { useMemo, useState } from 'react'
import { useSendTransaction, useWaitForTransactionReceipt, useWriteContract } from 'wagmi'
import { erc20Abi, zeroAddress } from 'viem'
import type { ExecutionPlan } from '@somnia-agent/shared'
import { motion, AnimatePresence } from 'framer-motion'
import { GlassCard } from '@/components/ui/GlassCard'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'

interface Props {
  plan: ExecutionPlan
  address: string
  onClose: () => void
}

type Step = 'review' | 'approving' | 'executing' | 'done' | 'error'

const toBigInt = (value?: string) => {
  try {
    return BigInt(value ?? '0')
  } catch {
    return BigInt(0)
  }
}

export default function SwapConfirmModal({ plan, address, onClose }: Props) {
  const [step, setStep] = useState<Step>('review')
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>()
  const [errorMsg, setErrorMsg] = useState('')

  const computedWarnings = useMemo(() => {
    const warnings: string[] = []
    if (plan.quote?.priceImpact !== undefined && plan.quote.priceImpact > 1) {
      warnings.push(`Price impact is high (${plan.quote.priceImpact.toFixed(2)}%). Review the trade before executing.`)
    }
    if (plan.quote?.gasEstimateUsd !== undefined && plan.quote.gasEstimateUsd > 10) {
      warnings.push(`Estimated gas cost is $${plan.quote.gasEstimateUsd.toFixed(2)}. Confirm that this trade is worth the fee.`)
    }
    return [...(plan.warnings ?? []), ...warnings]
  }, [plan.quote?.priceImpact, plan.quote?.gasEstimateUsd, plan.warnings])

  const { writeContractAsync } = useWriteContract()
  const { sendTransactionAsync } = useSendTransaction()
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({ hash: txHash })
  const tokenInAddress = plan.unsignedTx?.tokenIn || plan.intent.tokenIn
  const amountIn = plan.unsignedTx?.amountIn || plan.quote.amountIn || '0'
  const canExecute = Boolean(plan.unsignedTx && toBigInt(amountIn) > BigInt(0))
  const isDemoAddress = address.startsWith('0xDemo')

  const handleExecute = async () => {
    if (isDemoAddress) {
      setErrorMsg('Connect a wallet before signing a real swap transaction.')
      setStep('error')
      return
    }
    if (!plan.unsignedTx || !canExecute) return

    try {
      if (tokenInAddress.toLowerCase() !== zeroAddress) {
        setStep('approving')
        await writeContractAsync({
          address: tokenInAddress as `0x${string}`,
          abi: erc20Abi,
          functionName: 'approve',
          args: [
            (plan.unsignedTx.approvalTarget || plan.unsignedTx.to) as `0x${string}`,
            toBigInt(amountIn),
          ],
        })
      }

      setStep('executing')
      const hash = await sendTransactionAsync({
        to: plan.unsignedTx.to as `0x${string}`,
        data: plan.unsignedTx.data as `0x${string}`,
        value: toBigInt(plan.unsignedTx.value),
        gas: toBigInt(plan.unsignedTx.gasLimit),
      })
      setTxHash(hash)
      setStep('done')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Transaction failed')
      setStep('error')
    }
  }

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="relative w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border border-white/[0.1] bg-surface/95 backdrop-blur-xl shadow-[0_24px_80px_rgba(0,0,0,0.5)]"
        >
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">
                {step === 'done' ? 'Swap Complete' : step === 'error' ? 'Transaction Issue' : canExecute ? 'Confirm Swap' : 'Review Plan'}
              </h2>
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/[0.06] border border-white/[0.1] text-gray-400 hover:bg-white/[0.1] hover:text-white hover:border-white/[0.2] transition-all"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M1 1L13 13M1 13L13 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            {step === 'review' && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-4"
              >
                <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.08] space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-400">You send</span>
                    <span className="text-sm font-medium text-white">
                      {plan.intent.amountIn} {plan.intent.tokenIn}
                    </span>
                  </div>
                  <div className="h-px bg-white/[0.06]" />
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-400">You receive</span>
                    <span className="text-sm font-medium text-success">{plan.estimatedOutput}</span>
                  </div>
                  <div className="h-px bg-white/[0.06]" />
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-400">Best route</span>
                    <span className="text-sm font-medium text-white">{plan.quote?.aggregator}</span>
                  </div>
                  <div className="h-px bg-white/[0.06]" />
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-400">Price impact</span>
                    <span className={plan.quote?.priceImpact > 1 ? 'text-warning' : 'text-white'}>
                      {plan.quote?.priceImpact?.toFixed(3)}%
                    </span>
                  </div>
                  <div className="h-px bg-white/[0.06]" />
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-400">Gas estimate</span>
                    <span className="text-sm font-medium text-white">
                      {plan.gasAssessment?.currentBaseFeeGwei?.toFixed(1)} gwei
                      {' '}(~${plan.quote?.gasEstimateUsd?.toFixed(2)})
                    </span>
                  </div>
                </div>

                {computedWarnings.length > 0 && (
                  <div className="space-y-2">
                    {computedWarnings.map((warning) => (
                      <div key={warning} className="p-3 rounded-lg bg-warning/10 border border-warning/20 text-warning text-xs">
                        {warning}
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <Button onClick={onClose} variant="secondary" className="flex-1">
                    Close
                  </Button>
                  <Button onClick={handleExecute} disabled={!canExecute} className="flex-1">
                    {canExecute ? 'Confirm Swap' : 'No transaction yet'}
                  </Button>
                </div>
              </motion.div>
            )}

            {step === 'approving' && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center py-8"
              >
                <div className="w-12 h-12 mx-auto mb-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <p className="text-white font-medium mb-1">Approving token...</p>
                <p className="text-sm text-gray-400">Confirm in your wallet</p>
              </motion.div>
            )}

            {step === 'executing' && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center py-8"
              >
                <div className="w-12 h-12 mx-auto mb-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <p className="text-white font-medium mb-1">Executing swap...</p>
                <p className="text-sm text-gray-400">Confirm in your wallet</p>
              </motion.div>
            )}

            {step === 'done' && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center py-8"
              >
                <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-success/20 border border-success/30 flex items-center justify-center">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-success">
                    <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <p className="text-white font-medium mb-2">
                  {isConfirming ? 'Waiting for confirmation...' : 'Your swap was submitted successfully.'}
                </p>
                {txHash && (
                  <a
                    href={`https://testnet.monadvision.com/tx/${txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-block mt-3 text-sm text-primary hover:text-accent transition-colors"
                  >
                    View on explorer →
                  </a>
                )}
                <div className="mt-6">
                  <Button onClick={onClose} className="w-full">
                    Done
                  </Button>
                </div>
              </motion.div>
            )}

            {step === 'error' && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-4"
              >
                <div className="p-4 rounded-xl bg-error/10 border border-error/20 text-error text-sm">
                  {errorMsg}
                </div>
                <Button onClick={() => setStep('review')} variant="secondary" className="w-full">
                  Back to review
                </Button>
              </motion.div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
