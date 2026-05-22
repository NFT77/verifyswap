// components/FarcasterProvider.jsx
'use client';

import { useEffect, useState, useRef } from 'react';
import sdk from '@farcaster/miniapp-sdk';

export function FarcasterProvider({ children }) {
  const [isInFarcaster, setIsInFarcaster] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const readyCalledRef = useRef(false);

  // Cek lingkungan Farcaster
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

  // Fungsi untuk memanggil ready() - HANYA SEKALI dan HANYA di Farcaster
  const callReady = async () => {
    if (readyCalledRef.current) {
      console.log('⚠️ ready() already called, skipping');
      return;
    }
    
    if (!isInFarcaster) {
      console.log('⚠️ Not in Farcaster, skipping ready()');
      return;
    }
    
    try {
      readyCalledRef.current = true;
      await sdk.actions.ready();
      console.log('✅ ready() called successfully - splash screen will disappear');
    } catch (error) {
      console.error('❌ ready() error:', error);
      readyCalledRef.current = false;
    }
  };

  // Tunggu halaman benar-benar siap
  useEffect(() => {
    if (isLoading) return;
    
    // Gunakan requestIdleCallback atau setTimeout untuk memastikan DOM stabil
    const scheduleReady = () => {
      if (document.readyState === 'complete') {
        callReady();
      } else {
        window.addEventListener('load', callReady, { once: true });
        return () => window.removeEventListener('load', callReady);
      }
    };
    
    // Tunggu sebentar untuk memastikan semua data terload
    const timer = setTimeout(scheduleReady, 1000);
    return () => clearTimeout(timer);
  }, [isLoading]);

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