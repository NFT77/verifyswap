'use client';

import { useState, useEffect } from 'react';
import { WagmiProvider, createConfig, http } from 'wagmi';
import { base } from 'wagmi/chains';
import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { farcasterFrame } from '@farcaster/miniapp-wagmi-connector';
import { wagmiConfig } from '@/lib/wagmi';
import '@rainbow-me/rainbowkit/styles.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // ✅ Hindari retry berlebihan di HP
      retry: 1,
      staleTime: 30000,
    },
  },
});

// ✅ Konfigurasi khusus untuk Farcaster Mini App dengan RPC yang lebih reliable
const farcasterConfig = createConfig({
  chains: [base],
  transports: {
    [base.id]: http('https://base.llamarpc.com', {
      // ✅ Gunakan RPC alternatif yang lebih stabil
      batch: true,
      fetchOptions: {
        timeout: 30000,
      },
    }),
  },
  connectors: [farcasterFrame()],
  // ✅ Penting untuk WebView HP
  syncConnectedChain: true,
});

export function Providers({ children }) {
  const [mounted, setMounted] = useState(false);
  const [inFarcaster, setInFarcaster] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      try {
        // ✅ Cek apakah di Farcaster environment
        const isFarcasterEnv = typeof window !== 'undefined' && 
          (window.parent !== window || 
           navigator.userAgent.includes('Farcaster') ||
           document.referrer.includes('farcaster'));
        
        if (isFarcasterEnv) {
          // ✅ Coba load SDK hanya jika di Farcaster
          try {
            const { sdk } = await import('@farcaster/miniapp-sdk');
            const context = await sdk.context;
            if (context?.user?.fid) {
              setInFarcaster(true);
              await sdk.actions.ready();
              console.log('✅ Farcaster Mini App ready, FID:', context.user.fid);
            } else {
              setInFarcaster(true); // Tetap anggap di Farcaster meski context belum ready
            }
          } catch (sdkError) {
            console.log('SDK not available, but still in Farcaster mode:', sdkError);
            setInFarcaster(true); // Tetap pakai mode Farcaster
          }
        }
      } catch (error) {
        console.log('Not in Farcaster environment:', error);
        setInFarcaster(false);
      } finally {
        setMounted(true);
        setIsLoading(false);
      }
    };

    init();
  }, []);

  // ✅ Tampilkan loading state sementara
  if (!mounted || isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900/20 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-400">Loading VerifySwap...</p>
        </div>
      </div>
    );
  }

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