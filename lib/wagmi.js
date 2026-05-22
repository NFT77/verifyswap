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
import { miniappConnector } from '@farcaster/miniapp-wagmi-connector';

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'dummy';

// Cek apakah sedang di dalam Warpcast/Farcaster
export const isInFarcaster = () => {
  if (typeof window === 'undefined') return false;
  return (
    window.location !== window.parent.location || // dalam iframe
    navigator.userAgent.includes('Warpcast') ||
    document.referrer.includes('warpcast.com') ||
    document.referrer.includes('farcaster') ||
    !!window.farcaster
  );
};

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

// Config khusus Farcaster - menggunakan miniappConnector yang benar
export const farcasterWagmiConfig = createConfig({
  chains: [base],
  ssr: true,
  transports: {
    [base.id]: http('https://mainnet.base.org'),
  },
  connectors: [
    miniappConnector({
      chains: [base],
      options: {
        metadata: {
          name: 'VerifySwap',
          description: 'Swap tokens securely on Base with trust score',
          url: 'https://verifyswap.vercel.app',
          icons: ['https://verifyswap.vercel.app/favicon.svg'],
        },
      },
    }),
  ],
  storage: createStorage({
    storage: cookieStorage,
  }),
});