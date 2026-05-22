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
import { farcasterFrame } from '@farcaster/miniapp-wagmi-connector'; // ✅ nama yang benar

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'dummy';

// ✅ Hapus isInFarcaster dari sini — deteksi dilakukan via sdk.context di providers.js
// (tidak ada lagi export isInFarcaster)

// Config untuk browser biasa (RainbowKit) — tidak berubah
export const wagmiConfig = getDefaultConfig({
  appName: 'VerifySwap',
  appDescription: 'Swap tokens securely on Base with trust score',
  appUrl: 'https://verifyswap.vercel.app',
  appIcon: 'https://verifyswap.vercel.app/icon.png',
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

// ✅ Config khusus Farcaster — bersih, tanpa options yang salah
export const farcasterWagmiConfig = createConfig({
  chains: [base],
  ssr: false,                          // ✅ false — Mini App tidak butuh SSR
  transports: {
    [base.id]: http('https://mainnet.base.org'),
  },
  connectors: [
    farcasterFrame(),                  // ✅ cukup ini, tanpa options
  ],
                                       // ✅ hapus storage — tidak diperlukan di Mini App
});