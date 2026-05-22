// components/FarcasterProvider.jsx
'use client';

import { useEffect } from 'react';

export function FarcasterProvider({ children }) {
  useEffect(() => {
    const initFarcaster = async () => {
      try {
        // Dynamic import untuk menghindari error di browser biasa
        const { sdk } = await import('@farcaster/miniapp-sdk');
        await sdk.actions.ready();
        console.log('✅ Farcaster ready() called - splash screen will disappear');
      } catch (err) {
        // Ini normal terjadi jika tidak di lingkungan Farcaster
        console.log('Not in Farcaster client:', err?.message);
      }
    };
    
    initFarcaster();
  }, []);

  return <>{children}</>;
}