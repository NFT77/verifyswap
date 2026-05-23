import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { createConfig, http, cookieStorage, createStorage } from 'wagmi';
import { base } from 'wagmi/chains';
import {
  metaMaskWallet,
  coinbaseWallet,
  rainbowWallet,
  walletConnectWallet,
  trustWallet,
  rabbyWallet,
  braveWallet,
  zerionWallet,
  okxWallet,
} from '@rainbow-me/rainbowkit/wallets';
import { farcasterFrame } from '@farcaster/miniapp-wagmi-connector';

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'dummy';

// Config untuk browser biasa (RainbowKit)
export const wagmiConfig = getDefaultConfig({
  appName: 'VerifySwap',
  appDescription: 'Swap tokens securely on Base with trust score',
  appUrl: 'https://verifyswap.vercel.app',
  appIcon: 'https://verifyswap.vercel.app/favicon.svg',
  projectId: projectId,
  chains: [base],
  wallets: [
    {
      groupName: '🔥 Populer',
      wallets: [metaMaskWallet, coinbaseWallet, rainbowWallet, trustWallet, rabbyWallet, zerionWallet],
    },
    {
      groupName: '🔒 Lainnya',
      wallets: [braveWallet, okxWallet, walletConnectWallet],
    },
  ],
  ssr: true,
  storage: createStorage({
    storage: cookieStorage,
  }),
});

// ✅ PERBAIKAN: Config khusus Farcaster dengan transport yang lebih stabil
export const farcasterWagmiConfig = createConfig({
  chains: [base],
  ssr: false,
  transports: {
    [base.id]: http('https://mainnet.base.org', {
      fetchOptions: {
        // ✅ Tambahkan timeout untuk mencegah hanging di HP
        timeout: 30000,
      },
    }),
  },
  connectors: [farcasterFrame()],
  // ✅ Tambahkan ini untuk stabilitas di WebView HP
  syncConnectedChain: true,
});