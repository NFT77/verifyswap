'use client';

import { useState, useEffect } from 'react';
import { WagmiProvider } from 'wagmi';
import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { wagmiConfig, farcasterWagmiConfig } from '@/lib/wagmi';
import '@rainbow-me/rainbowkit/styles.css';

const queryClient = new QueryClient();

export function Providers({ children }) {
  const [mounted, setMounted]       = useState(false);
  const [inFarcaster, setInFarcaster] = useState(false);

  useEffect(() => {
    const init = async () => {
      try {
        // ✅ Panggil ready() DULU — baru cek context
        const { sdk } = await import('@farcaster/miniapp-sdk');
        const context = await sdk.context;

        if (context?.user?.fid) {
          // Benar-benar di dalam Farcaster client
          setInFarcaster(true);
          await sdk.actions.ready(); // splash screen hilang
        }
      } catch {
        // Berjalan di browser biasa — tidak apa-apa
      } finally {
        setMounted(true); // render SETELAH context diketahui
      }
    };

    init();
  }, []);

  // Jangan render apapun dulu sebelum context diketahui
  // (hindari flash/switch config)
  if (!mounted) return null;

  // ── Dalam Farcaster: pakai Warplet via farcasterFrame connector ──
  if (inFarcaster) {
    return (
      <WagmiProvider config={farcasterWagmiConfig}>
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      </WagmiProvider>
    );
  }

  // ── Browser biasa: RainbowKit ────────────────────────────────────
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