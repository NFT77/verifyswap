// app/layout.js
import { Providers } from './providers';
import { FarcasterProvider } from '@/components/FarcasterProvider';
import './globals.css';

export const metadata = {
  title: {
    default: 'VerifySwap - Verify Creator Trust & Swap Tokens on Base',
    template: '%s | VerifySwap',
  },
  description: 'VerifySwap: The safest way to swap on Base. Real-time scam detection, honeypot checker, and Farcaster trust scores. Only 0.3% fee. Swap with confidence.',
  keywords: [
    'swap', 'trust check', 'base', 'farcaster', 'uniswap', 'base chain',
    'crypto', 'defi', 'web3', 'token swap', 'creator trust', 'decentralized exchange',
    'base network swap', 'meme tokens', 'token security', 'honeypot checker',
  ],
  authors: [{ name: 'VerifySwap', url: 'https://verifyswap.vercel.app' }],
  creator: 'VerifySwap',
  publisher: 'VerifySwap',
  metadataBase: new URL('https://verifyswap.vercel.app'),
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'VerifySwap - The Safest Way to Swap on Base',
    description: 'Real-time scam detection, honeypot checker, and Farcaster trust scores. Only 0.3% fee. Swap with confidence.',
    url: 'https://verifyswap.vercel.app',
    siteName: 'VerifySwap',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'VerifySwap - Safe Token Swaps on Base Network',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'VerifySwap - The Safest Way to Swap on Base',
    description: 'Real-time scam detection, honeypot checker, and Farcaster trust scores. Only 0.3% fee.',
    images: ['/og-image.png'],
    creator: '@verifyswap',
    site: '@verifyswap',
  },
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico', sizes: 'any' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
    shortcut: ['/favicon.ico'],
  },
  manifest: '/site.webmanifest',
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  verification: {
    google: 'your-google-verification-code',
  },
  formatDetection: {
    telephone: false,
    date: false,
    email: false,
    address: false,
  },
  category: 'finance',
};

// Viewport configuration
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#7c3aed' },
    { media: '(prefers-color-scheme: dark)', color: '#7c3aed' },
  ],
  colorScheme: 'dark',
};

export default function RootLayout({ children }) {
  const baseUrl = 'https://verifyswap.vercel.app';
  
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
        {/* Farcaster Mini App Meta Tags - Gunakan fc:frame untuk kompatibilitas maksimal */}
        <meta name="fc:frame" content={JSON.stringify(miniAppEmbed)} />
        
        {/* Frame v2 specific tags */}
        <meta property="fc:frame:image" content={`${baseUrl}/og-image.png`} />
        <meta property="fc:frame:button:1" content="🚀 Launch VerifySwap" />
        <meta property="fc:frame:button:1:action" content="link" />
        <meta property="fc:frame:button:1:target" content={baseUrl} />
        
        {/* Open Graph fallback untuk sosial media lain */}
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
        
        {/* Additional Farcaster frame tag for compatibility */}
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
        <FarcasterProvider>
          <Providers>
            {children}
          </Providers>
        </FarcasterProvider>
      </body>
    </html>
  );
}