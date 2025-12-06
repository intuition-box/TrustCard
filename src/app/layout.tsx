import type { ReactNode } from 'react'
import { Providers } from './providers'
import './globals.css'
import '@rainbow-me/rainbowkit/styles.css'

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
