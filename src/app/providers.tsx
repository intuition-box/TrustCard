'use client'

import type { ReactNode } from 'react'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RainbowKitProvider } from '@rainbow-me/rainbowkit'
import { configureClient, API_URL_PROD } from '@0xintuition/graphql'
import { wagmiConfig, intuitionMainnet } from '@/lib/wagmiConfig'

const queryClient = new QueryClient()

configureClient({ apiUrl: API_URL_PROD })

export function Providers({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider initialChain={intuitionMainnet}>
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
