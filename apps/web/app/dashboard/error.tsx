'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface DashboardErrorProps {
  error: Error
  reset: () => void
}

export default function DashboardError({ error, reset }: DashboardErrorProps) {
  const router = useRouter()

  useEffect(() => {
    console.error('Dashboard render error:', error)
  }, [error])

  return (
    <div className="min-h-screen bg-[var(--bg)] flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="max-w-xl rounded-3xl border border-red-700 bg-gray-950/90 p-10 shadow-2xl shadow-red-900/20">
        <h1 className="text-3xl font-bold text-red-400 mb-4">Something went wrong.</h1>
        <p className="text-gray-300 mb-6">The dashboard failed to load due to an unexpected error.</p>
        <p className="mb-6 text-sm text-gray-500">{error.message}</p>
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            onClick={() => reset()}
            className="px-6 py-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold"
          >
            Retry
          </button>
          <button
            onClick={() => router.push('/')}
            className="px-6 py-3 rounded-xl border border-gray-700 text-gray-200 hover:border-white"
          >
            Go home
          </button>
        </div>
      </div>
    </div>
  )
}
