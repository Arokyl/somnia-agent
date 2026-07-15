'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSendTransaction, useWaitForTransactionReceipt } from 'wagmi'
import { decodeEventLog, parseAbiItem } from 'viem'
import type { Message } from './CommandBar'

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
  const { isLoading: isConfirming, data: receipt } = useWaitForTransactionReceipt({ hash: txHash })
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
    if (!receipt || receipt.status !== 'success') return

    let onchainOrderId: number | undefined
    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({ abi: [ORDER_CREATED_ABI], data: log.data, topics: log.topics })
        if (decoded.eventName === 'OrderCreated') {
          onchainOrderId = Number((decoded.args as any).orderId)
          break
        }
      } catch {
        // not this event
      }
    }

    fetch('/api/orders/update', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: orderCreation.order.id,
        txHash: receipt.transactionHash,
        onchainOrderId,
      }),
    }).catch(() => {
      // best-effort: if the update fails the keeper may not find it,
      // but the on-chain order is already created.
    })

    setStep('done')
  }, [receipt, orderCreation.order.id])

  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <div className="modal-head">
          <h2 className="panel-title">
            {step === 'done' ? 'Order Created' : step === 'error' ? 'Transaction Issue' : 'Confirm Conditional Order'}
          </h2>
          <button type="button" onClick={onClose} className="icon-button" aria-label="Close review modal">x</button>
        </div>

        {step === 'review' && (
          <div>
            <div className="review-box">
              <div className="review-row">
                <span className="muted">Token in</span>
                <span>{orderCreation.order.tokenIn}</span>
              </div>
              <div className="review-row">
                <span className="muted">Token out</span>
                <span>{orderCreation.order.tokenOut}</span>
              </div>
              <div className="review-row">
                <span className="muted">Amount</span>
                <span>{orderCreation.order.amountIn}</span>
              </div>
              <div className="review-row">
                <span className="muted">Condition</span>
                <span>
                  {orderCreation.order.condition.type} &lt; {orderCreation.order.condition.value}
                  {orderCreation.order.condition.type === 'maxGas' ? ' gwei' : ''}
                </span>
              </div>
              <div className="review-row">
                <span className="muted">Expires</span>
                <span>{new Date(orderCreation.order.expiresAt).toLocaleString()}</span>
              </div>
              <div className="review-row">
                <span className="muted">Original command</span>
                <span>{orderCreation.order.originalCommand}</span>
              </div>
            </div>

            <div className="modal-actions">
              <button type="button" onClick={onClose} className="secondary-button">
                Close
              </button>
              <button type="button" onClick={handleExecute} className="primary-button">
                Create order
              </button>
            </div>
          </div>
        )}

        {step === 'executing' && (
          <div className="center-state">
            <div className="spinner" />
            <p>Creating order on-chain...</p>
            <p className="muted">Confirm in your wallet.</p>
          </div>
        )}

        {step === 'done' && (
          <div className="center-state">
            <p>{isConfirming ? 'Waiting for confirmation...' : 'Your conditional order was submitted successfully.'}</p>
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
            <button type="button" onClick={onClose} className="primary-button">
              Done
            </button>
          </div>
        )}

        {step === 'error' && (
          <div className="center-state">
            <p className="error-box">{errorMsg}</p>
            <button type="button" onClick={() => setStep('review')} className="secondary-button">
              Back to review
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

