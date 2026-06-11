import '@rainbow-me/rainbowkit/styles.css'
import './globals.css'
import Providers from '@/components/Providers'

export const metadata = {
  title: 'Somnia Agent',
  description: 'AI wallet agent for Somnia trading workflows.',
  icons: {
    icon: '/somnia-agent-logo.png',
    apple: '/somnia-agent-logo.png',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
