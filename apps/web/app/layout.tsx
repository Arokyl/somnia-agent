import '@rainbow-me/rainbowkit/styles.css'
import './globals.css'
import type { ReactNode } from 'react'
import { Inter } from 'next/font/google'
import Providers from '@/components/Providers'
import Navbar from '@/components/Navbar'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata = {
  title: 'ArokylAI — Intelligent Monad Agent',
  description: 'AI-powered trading agent for Monad testnet. Swap, compare routes, and execute with confidence.',
  icons: {
    icon: '/somnia-agent-logo.png',
    apple: '/somnia-agent-logo.png',
  },
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable}`}>
      <body className="font-sans antialiased">
        <Providers>
          <Navbar />
          {children}
        </Providers>
      </body>
    </html>
  )
}
