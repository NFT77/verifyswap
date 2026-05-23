'use client';

import { useState, useEffect } from 'react';
import { WagmiProvider, createConfig, http } from 'wagmi';
import { base } from 'wagmi/chains';
import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { farcasterFrame } from '@farcaster/miniapp-wagmi-connector'; // ✅ GANTI: pake farcasterFrame
import { wagmiConfig } from '@/lib/wagmi';
import '@rainbow-me/rainbowkit/styles.css';

const queryClient = new QueryClient();

// === Konfigurasi khusus untuk Farcaster Mini App ===
const farcasterConfig = createConfig({
  chains: [base],
  transports: {
    [base.id]: http('https://mainnet.base.org'),
  },
  connectors: [farcasterFrame()], // ✅ GANTI: pake farcasterFrame()
});

export function Providers({ children }) {
  const [mounted, setMounted] = useState(false);
  const [inFarcaster, setInFarcaster] = useState(false);

  useEffect(() => {
    const init = async () => {
      try {
        const { sdk } = await import('@farcaster/miniapp-sdk');
        const context = await sdk.context;

        if (context?.user?.fid) {
          setInFarcaster(true);
          await sdk.actions.ready();
          console.log('✅ Farcaster Mini App ready, FID:', context.user.fid);
        }
      } catch (error) {
        console.log('Not in Farcaster environment:', error);
      } finally {
        setMounted(true);
      }
    };

    init();
  }, []);

  if (!mounted) return null;

  // === FARCASTER MODE ===
  if (inFarcaster) {
    return (
      <WagmiProvider config={farcasterConfig}>
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      </WagmiProvider>
    );
  }

  // === BROWSER MODE ===
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