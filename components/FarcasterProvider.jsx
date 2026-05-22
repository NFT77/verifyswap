// components/FarcasterProvider.jsx
'use client';

import { useEffect, useState, useRef } from 'react';
import sdk from '@farcaster/miniapp-sdk';

export function FarcasterProvider({ children }) {
  const [isInFarcaster, setIsInFarcaster] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const readyCalledRef = useRef(false);

  // Cek lingkungan Farcaster dan langsung panggil ready()
  useEffect(() => {
    const checkEnvironment = async () => {
      try {
        // Cek apakah window ada (client-side)
        if (typeof window === 'undefined') return;
        
        // Cek URL params untuk indikasi Farcaster
        const urlParams = new URLSearchParams(window.location.search);
        const isFromFarcaster = urlParams.get('farcaster') === 'true';
        
        // Coba panggil SDK context
        const context = await sdk.context();
        
        if (context?.client?.isFarcaster || isFromFarcaster) {
          setIsInFarcaster(true);
          console.log('✅ Running in Farcaster Mini App');
          
          // LANGSUNG panggil ready() tanpa timeout
          if (!readyCalledRef.current) {
            readyCalledRef.current = true;
            await sdk.actions.ready();
            console.log('✅ ready() called - splash screen will disappear');
          }
        } else {
          console.log('🌐 Running in regular browser');
        }
      } catch (error) {
        // SDK tidak tersedia, berarti bukan di Farcaster
        console.log('🌐 Not in Farcaster environment');
        setIsInFarcaster(false);
      } finally {
        setIsLoading(false);
      }
    };
    
    checkEnvironment();
  }, []);

  // Tampilkan loading state saat deteksi lingkungan
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-900 via-purple-900/20 to-slate-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto mb-4"></div>
          <p className="text-gray-400">Loading VerifySwap...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}