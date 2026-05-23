'use client';

import { useState, useEffect } from 'react';
import { WagmiProvider, createConfig, http } from 'wagmi';
import { base } from 'wagmi/chains';
import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { farcasterFrame } from '@farcaster/miniapp-wagmi-connector';
import { wagmiConfig } from '@/lib/wagmi';
import '@rainbow-me/rainbowkit/styles.css';

// Create a stable QueryClient outside component to avoid recreation
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 30_000,
    },
  },
});

// Farcaster config — stable reference outside component
const farcasterConfig = createConfig({
  chains: [base],
  transports: {
    [base.id]: http('https://mainnet.base.org'),
  },
  connectors: [farcasterFrame()],
});

export function Providers({ children }) {
  const [mounted, setMounted] = useState(false);
  const [inFarcaster, setInFarcaster] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        // Check if we're inside a Farcaster frame/mini app
        const { sdk } = await import('@farcaster/miniapp-sdk');

        // Use a short timeout so we don't hang if SDK fails to respond
        const contextPromise = Promise.race([
          sdk.context,
          new Promise((_, reject) => setTimeout(() => reject(new Error('SDK timeout')), 3000)),
        ]);

        const context = await contextPromise;

        if (!cancelled && context?.user?.fid) {
          setInFarcaster(true);
          // Signal to Farcaster that the mini app is ready to display
          await sdk.actions.ready({ disableNativeGestures: false });
          console.log('✅ Farcaster Mini App ready, FID:', context.user.fid);
        }
      } catch (error) {
        // Not in Farcaster or SDK unavailable — silently fall through to browser mode
        console.log('Browser mode (not in Farcaster):', error?.message || error);
      } finally {
        if (!cancelled) setMounted(true);
      }
    };

    init();
    return () => { cancelled = true; };
  }, []);

  // Avoid hydration mismatch — render nothing until client is ready
  if (!mounted) return null;

  if (inFarcaster) {
    return (
      <WagmiProvider config={farcasterConfig}>
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      </WagmiProvider>
    );
  }

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