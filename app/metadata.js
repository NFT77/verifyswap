// app/metadata.js
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