import { http } from 'wagmi'
import { defineChain } from 'viem'
import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import {
  baseAccount,
  metaMaskWallet,
  rabbyWallet,
  rainbowWallet,
  safeWallet,
  walletConnectWallet,
} from '@rainbow-me/rainbowkit/wallets'

export const intuitionMainnet = defineChain({
  id: 1155,
  name: 'Intuition Mainnet',
  nativeCurrency: {
    name: 'TRUST',
    symbol: 'TRUST',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ['https://rpc.intuition.systems/http'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Intuition Explorer',
      url: 'https://explorer.intuition.systems',
    },
  },
})

const walletConnectProjectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ??
  '00000000000000000000000000000000'

export const wagmiConfig = getDefaultConfig({
  appName: 'Trust Card Vote',
  projectId: walletConnectProjectId,
  chains: [intuitionMainnet],
  wallets: [
    {
      groupName: 'Popular',
      wallets: [
        metaMaskWallet,
        rabbyWallet,
        rainbowWallet,
        walletConnectWallet,
        safeWallet,
        baseAccount,
      ],
    },
  ],
  transports: {
    [intuitionMainnet.id]: http('https://rpc.intuition.systems/http'),
  },
  ssr: true,
})
