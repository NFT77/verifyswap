// app/providers.js
'use client';

import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { base } from 'wagmi/chains';
import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { farcasterMiniAppConnector } from '@farcaster/miniapp-wagmi-connector';

import '@rainbow-me/rainbowkit/styles.css';

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

if (!projectId) {
  console.warn('NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID not set');
}

// Konfigurasi dasar dari RainbowKit
const rainbowKitConfig = getDefaultConfig({
  appName: 'VerifySwap',
  projectId: projectId || 'dummy',
  chains: [base],
  ssr: true,
});

// Gabungkan dengan connector Farcaster
const wagmiConfig = {
  ...rainbowKitConfig,
  connectors: [
    ...(rainbowKitConfig.connectors || []),
    farcasterMiniAppConnector(),
  ],
};

const queryClient = new QueryClient();

export function Providers({ children }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider 
          theme={darkTheme({
            accentColor: '#7c3aed',
            accentColorForeground: 'white',
            borderRadius: 'large',
          })}
        >
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}