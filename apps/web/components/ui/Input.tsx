'use client'

import { motion, type HTMLMotionProps } from 'framer-motion'
import { type ReactNode } from 'react'

interface InputProps extends HTMLMotionProps<'input'> {
  label?: string
  error?: string
  icon?: ReactNode
}

export function Input({ label, error, icon, className = '', ...props }: InputProps) {
  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium text-gray-300 mb-1.5">
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
            {icon}
          </div>
        )}
        <motion.input
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className={`
            w-full px-4 py-2.5 rounded-xl
            bg-white/[0.04] border border-white/[0.08]
            text-white placeholder:text-gray-500
            backdrop-blur-sm
            transition-all duration-200 ease-out
            focus:outline-none focus:border-primary/50 focus:bg-white/[0.06]
            focus:shadow-[0_0_0_3px_rgba(109,93,252,0.15)]
            disabled:opacity-50 disabled:cursor-not-allowed
            ${icon ? 'pl-10' : ''}
            ${error ? 'border-red-500/50' : ''}
            ${className}
          `}
          {...props}
        />
      </div>
      {error && (
        <motion.p
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-1.5 text-sm text-red-400"
        >
          {error}
        </motion.p>
      )}
    </div>
  )
}
