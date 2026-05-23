'use client';

import { useEffect } from 'react';
import { Providers } from './providers';
import './globals.css';

export default function RootLayout({ children }) {
  const baseUrl = 'https://verifyswap.vercel.app';

  // ============ FARCASTER MINI APP INITIALIZATION (WAJIB) ============
  useEffect(() => {
    const initFarcaster = async () => {
      try {
        const { sdk } = await import('@farcaster/miniapp-sdk');
        const context = await sdk.context;
        
        if (context?.user?.fid) {
          // WAJIB: Beri tahu Warpcast bahwa app sudah siap
          await sdk.actions.ready();
          console.log('✅ Farcaster Mini App ready, FID:', context.user.fid);
        }
      } catch (error) {
        console.log('Not in Farcaster environment:', error);
      }
    };
    
    initFarcaster();
  }, []);

  // Konfigurasi untuk Farcaster Mini App Embed (v2)
  const miniAppEmbed = {
    version: '2',
    imageUrl: `${baseUrl}/og-image.png`,
    button: {
      title: '🚀 Launch VerifySwap',
      action: {
        type: 'launch_frame',
        name: 'VerifySwap',
        url: baseUrl,
        splashImageUrl: `${baseUrl}/splash.png`,
        splashBackgroundColor: '#7c3aed',
      },
    },
  };

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Farcaster Mini App Meta Tags */}
        <meta name="fc:frame" content={JSON.stringify(miniAppEmbed)} />
        
        {/* Frame v2 specific tags */}
        <meta property="fc:frame:image" content={`${baseUrl}/og-image.png`} />
        <meta property="fc:frame:button:1" content="🚀 Launch VerifySwap" />
        <meta property="fc:frame:button:1:action" content="link" />
        <meta property="fc:frame:button:1:target" content={baseUrl} />
        
        {/* Open Graph fallback */}
        <meta property="og:title" content="VerifySwap - The Safest Way to Swap on Base" />
        <meta property="og:description" content="Real-time scam detection, honeypot checker, and Farcaster trust scores. Only 0.3% fee." />
        <meta property="og:image" content={`${baseUrl}/og-image.png`} />
        <meta property="og:url" content={baseUrl} />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="VerifySwap" />
        
        {/* Twitter Card */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="VerifySwap - The Safest Way to Swap on Base" />
        <meta name="twitter:description" content="Real-time scam detection, honeypot checker, and Farcaster trust scores. Only 0.3% fee." />
        <meta name="twitter:image" content={`${baseUrl}/og-image.png`} />
        <meta name="twitter:site" content="@verifyswap" />
        <meta name="twitter:creator" content="@verifyswap" />
        
        {/* Additional Farcaster frame tag */}
        <meta property="fc:frame:post_url" content={`${baseUrl}/api/frame`} />
        
        {/* Preconnect and DNS Prefetch */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://api.uniswap.org" />
        <link rel="dns-prefetch" href="https://api.dexscreener.com" />
        <link rel="dns-prefetch" href="https://api.neynar.com" />
        <link rel="dns-prefetch" href="https://api.coingecko.com" />
        
        {/* Basic meta tags */}
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#7c3aed" />
      </head>
      <body className="bg-gradient-to-br from-slate-900 via-purple-900/20 to-slate-900 min-h-screen antialiased" suppressHydrationWarning>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}