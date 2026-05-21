// app/layout.js
import { Providers } from './providers';
import './globals.css';

export const metadata = {
  title: {
    default: 'VerifySwap - Verify Creator Trust & Swap Tokens on Base',
    template: '%s | VerifySwap',
  },
  description: 'Verify creator trust scores on Farcaster, swap tokens on Base network with low fees (0.3%) and maximum security. Powered by Uniswap V3.',
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
    title: 'VerifySwap - Verify & Swap with Confidence on Base',
    description: 'Verify creator trust scores and swap tokens securely on Base network. Only 0.3% fee.',
    url: 'https://verifyswap.vercel.app',
    siteName: 'VerifySwap',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'VerifySwap - Secure Token Swaps on Base Network',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'VerifySwap - Verify & Swap with Confidence on Base',
    description: 'Verify creator trust scores and swap tokens securely on Base network.',
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
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://api.uniswap.org" />
        <link rel="dns-prefetch" href="https://api.dexscreener.com" />
        <link rel="dns-prefetch" href="https://api.neynar.com" />
        <link rel="dns-prefetch" href="https://api.coingecko.com" />
      </head>
      <body className="bg-gradient-to-br from-slate-900 via-purple-900/20 to-slate-900 min-h-screen antialiased" suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}