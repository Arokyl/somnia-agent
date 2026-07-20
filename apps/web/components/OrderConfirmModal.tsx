'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSendTransaction, useWaitForTransactionReceipt } from 'wagmi'
import { decodeEventLog, parseAbiItem } from 'viem'
import type { Message } from './CommandBar'
import { motion, AnimatePresence } from 'framer-motion'
import { GlassCard } from '@/components/ui/GlassCard'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'

const ORDER_CREATED_ABI = parseAbiItem(
  'event OrderCreated(uint256 indexed orderId, address indexed user, address tokenIn, address tokenOut, uint256 amountIn)'
)

interface Props {
  orderCreation: NonNullable<Message['orderCreation']>
  address: string
  onClose: () => void
}

type Step = 'review' | 'executing' | 'done' | 'error'

export default function OrderConfirmModal({ orderCreation, address, onClose }: Props) {
  const [step, setStep] = useState<Step>('review')
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>()
  const [errorMsg, setErrorMsg] = useState('')
  const { sendTransactionAsync } = useSendTransaction()
  const isDemoAddress = address.startsWith('0xDemo')

  const handleExecute = async () => {
    if (isDemoAddress) {
      setErrorMsg('Connect a wallet before signing a real order transaction.')
      setStep('error')
      return
    }
    if (!orderCreation.unsignedTx) return

    try {
      setStep('executing')
      const hash = await sendTransactionAsync({
        to: orderCreation.unsignedTx.to as `0x${string}`,
        data: orderCreation.unsignedTx.data as `0x${string}`,
        value: BigInt(orderCreation.unsignedTx.value || '0'),
        gas: BigInt(orderCreation.unsignedTx.gasLimit || '300000'),
      })
      setTxHash(hash)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Transaction failed')
      setStep('error')
    }
  }

  useEffect(() => {
    // Note: useWaitForTransactionReceipt should be used here in production
    // For now, we'll simulate the effect
  }, [])

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
                {step === 'done' ? 'Order Created' : step === 'error' ? 'Transaction Issue' : 'Confirm Conditional Order'}
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
                    <span className="text-sm text-gray-400">Token In</span>
                    <span className="text-sm font-medium text-white">{orderCreation.order.tokenIn}</span>
                  </div>
                  <div className="h-px bg-white/[0.06]" />
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-400">Token Out</span>
                    <span className="text-sm font-medium text-white">{orderCreation.order.tokenOut}</span>
                  </div>
                  <div className="h-px bg-white/[0.06]" />
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-400">Amount</span>
                    <span className="text-sm font-medium text-white">{orderCreation.order.amountIn}</span>
                  </div>
                  <div className="h-px bg-white/[0.06]" />
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-400">Condition</span>
                    <span className="text-sm font-medium text-white">
                      {orderCreation.order.condition.type} &lt; {orderCreation.order.condition.value}
                      {orderCreation.order.condition.type === 'maxGas' ? ' gwei' : ''}
                    </span>
                  </div>
                  <div className="h-px bg-white/[0.06]" />
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-400">Expires</span>
                    <span className="text-sm font-medium text-white">
                      {new Date(orderCreation.order.expiresAt).toLocaleString()}
                    </span>
                  </div>
                  <div className="h-px bg-white/[0.06]" />
                  <div>
                    <span className="text-sm text-gray-400 block mb-1">Original command</span>
                    <p className="text-sm text-white">{orderCreation.order.originalCommand}</p>
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <Button onClick={onClose} variant="secondary" className="flex-1">
                    Close
                  </Button>
                  <Button onClick={handleExecute} className="flex-1">
                    Create Order
                  </Button>
                </div>
              </motion.div>
            )}

            {step === 'executing' && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center py-8"
              >
                <div className="w-12 h-12 mx-auto mb-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <p className="text-white font-medium mb-1">Creating order on-chain...</p>
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
                <p className="text-white font-medium mb-2">Your conditional order was submitted successfully.</p>
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
