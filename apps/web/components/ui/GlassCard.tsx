'use client'

import { motion, type HTMLMotionProps } from 'framer-motion'
import { type ReactNode } from 'react'

interface GlassCardProps extends HTMLMotionProps<'div'> {
  children: ReactNode
  className?: string
  glow?: boolean
}

export function GlassCard({ children, className = '', glow = false, ...props }: GlassCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className={`
        relative overflow-hidden rounded-2xl border border-white/[0.08]
        bg-white/[0.03] backdrop-blur-xl
        shadow-[0_8px_32px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.06)]
        transition-all duration-300 ease-out
        hover:border-white/[0.14] hover:shadow-[0_12px_40px_rgba(0,0,0,0.32),inset_0_1px_0_rgba(255,255,255,0.08)]
        ${glow ? 'shadow-[0_0_30px_rgba(109,93,252,0.15)]' : ''}
        ${className}
      `}
      {...props}
    >
      {children}
    </motion.div>
  )
}
