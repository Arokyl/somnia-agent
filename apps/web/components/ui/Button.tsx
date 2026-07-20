'use client'

import { motion, type HTMLMotionProps } from 'framer-motion'
import { type ReactNode } from 'react'

interface ButtonProps extends Omit<HTMLMotionProps<'button'>, 'size'> {
  children: ReactNode
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  glow?: boolean
}

const variantStyles = {
  primary: `
    bg-gradient-to-br from-primary to-accent
    text-white font-semibold
    shadow-[0_8px_24px_rgba(109,93,252,0.3)]
    hover:shadow-[0_12px_32px_rgba(109,93,252,0.45)]
    hover:brightness-110
  `,
  secondary: `
    bg-white/[0.06] border border-white/[0.12]
    text-white font-medium
    hover:bg-white/[0.1] hover:border-white/[0.2]
  `,
  ghost: `
    bg-transparent border border-transparent
    text-gray-300 font-medium
    hover:bg-white/[0.06] hover:text-white
  `,
  danger: `
    bg-gradient-to-br from-red-500 to-red-600
    text-white font-semibold
    shadow-[0_8px_24px_rgba(239,68,68,0.3)]
    hover:shadow-[0_12px_32px_rgba(239,68,68,0.45)]
    hover:brightness-110
  `,
}

const sizeStyles = {
  sm: 'px-3 py-1.5 text-sm rounded-xl',
  md: 'px-5 py-2.5 text-sm rounded-xl',
  lg: 'px-7 py-3.5 text-base rounded-xl',
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  glow = false,
  className = '',
  disabled,
  ...props
}: ButtonProps) {
  return (
    <motion.button
      whileHover={{ scale: disabled || loading ? 1 : 1.02 }}
      whileTap={{ scale: disabled || loading ? 1 : 0.98 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      className={`
        inline-flex items-center justify-center gap-2
        font-sans font-medium tracking-tight
        transition-all duration-200 ease-out
        disabled:opacity-50 disabled:cursor-not-allowed
        ${variantStyles[variant]}
        ${sizeStyles[size]}
        ${glow && variant === 'primary' ? 'shadow-[0_0_20px_rgba(109,93,252,0.5)]' : ''}
        ${className}
      `}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full"
        />
      )}
      {children}
    </motion.button>
  )
}
