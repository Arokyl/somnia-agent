'use client'

import { useMemo, useState } from 'react'
import { useSendTransaction, useWaitForTransactionReceipt, useWriteContract } from 'wagmi'
import { erc20Abi, zeroAddress } from 'viem'
import type { ExecutionPlan } from '@somnia-agent/shared'

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
    <div className="modal-backdrop">
      <div className="modal-card">
        <div className="modal-head">
          <h2 className="panel-title">
            {step === 'done' ? 'Swap Complete' : step === 'error' ? 'Transaction Issue' : canExecute ? 'Confirm Swap' : 'Review Plan'}
          </h2>
          <button type="button" onClick={onClose} className="icon-button" aria-label="Close review modal">x</button>
        </div>

        {step === 'review' && (
          <div>
            <div className="review-box">
              <div className="review-row">
                <span className="muted">You send</span>
                <span>{plan.intent.amountIn} {plan.intent.tokenIn}</span>
              </div>
              <div className="review-row">
                <span className="muted">You receive</span>
                <span className="success">{plan.estimatedOutput}</span>
              </div>
              <div className="review-row">
                <span className="muted">Best route</span>
                <span>{plan.quote?.aggregator}</span>
              </div>
              <div className="review-row">
                <span className="muted">Price impact</span>
                <span className={plan.quote?.priceImpact > 1 ? 'warning' : ''}>
                  {plan.quote?.priceImpact?.toFixed(3)}%
                </span>
              </div>
              <div className="review-row">
                <span className="muted">Gas estimate</span>
                <span>
                  {plan.gasAssessment?.currentBaseFeeGwei?.toFixed(1)} gwei
                  {' '}(~${plan.quote?.gasEstimateUsd?.toFixed(2)})
                </span>
              </div>
            </div>

            {computedWarnings.length > 0 && (
              <div className="safe-list">
                {computedWarnings.map((warning) => (
                  <p key={warning} className="warning-box">
                    {warning}
                  </p>
                ))}
              </div>
            )}

            <div className="modal-actions">
              <button
                type="button"
                onClick={onClose}
                className="secondary-button"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleExecute}
                disabled={!canExecute}
                className="primary-button"
              >
                {canExecute ? 'Confirm Swap' : 'No transaction yet'}
              </button>
            </div>
          </div>
        )}

        {step === 'approving' && (
          <div className="center-state">
            <div className="spinner" />
            <p>Approving token...</p>
            <p className="muted">Confirm in your wallet.</p>
          </div>
        )}

        {step === 'executing' && (
          <div className="center-state">
            <div className="spinner" />
            <p>Executing swap...</p>
            <p className="muted">Confirm in your wallet.</p>
          </div>
        )}

        {step === 'done' && (
          <div className="center-state">
            <p>{isConfirming ? 'Waiting for confirmation...' : 'Your swap was submitted successfully.'}</p>
            {txHash && (
              <a
                href={`https://shannon-explorer.somnia.network/tx/${txHash}`}
                target="_blank"
                rel="noreferrer"
                className="success"
              >
                View on explorer
              </a>
            )}
            <button
              type="button"
              onClick={onClose}
              className="primary-button"
            >
              Done
            </button>
          </div>
        )}

        {step === 'error' && (
          <div className="center-state">
            <p className="error-box">{errorMsg}</p>
            <button
              type="button"
              onClick={() => setStep('review')}
              className="secondary-button"
            >
              Back to review
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
