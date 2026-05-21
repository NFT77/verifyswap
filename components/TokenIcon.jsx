// components/TokenIcon.jsx
'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';

// Multiple fallback sources for token icons
const FALLBACK_SOURCES = [
  // Trust Wallet assets (Base)
  (address) => `https://assets.trustwalletapp.com/blockchains/base/assets/${address}/logo.png`,
  // Uniswap assets repository
  (address) => `https://raw.githubusercontent.com/Uniswap/assets/master/blockchains/base/assets/${address}/logo.png`,
  // 1inch token icons
  (address) => `https://raw.githubusercontent.com/1inch/assets/master/blockchains/base/assets/${address}/logo.png`,
  // CoinGecko via symbol (placeholder)
  (symbol) => symbol ? `https://assets.coingecko.com/coins/images/placeholder.png` : null,
];

export default function TokenIcon({ tokenAddress, symbol, logoUrl, size = 40, className = '', onError, onLoad }) {
  const [imgError, setImgError] = useState(false);
  const [fallbackIndex, setFallbackIndex] = useState(0);
  const [currentImageUrl, setCurrentImageUrl] = useState(null);

  // Determine the image URL based on priority
  useEffect(() => {
    if (logoUrl && !imgError) {
      setCurrentImageUrl(logoUrl);
      return;
    }
    
    if (tokenAddress?.startsWith('0x') && !imgError) {
      // Try fallback sources
      if (fallbackIndex < FALLBACK_SOURCES.length) {
        const source = FALLBACK_SOURCES[fallbackIndex];
        const url = source(tokenAddress);
        if (url) {
          setCurrentImageUrl(url);
        } else {
          // Move to next fallback
          setFallbackIndex(prev => prev + 1);
        }
      } else {
        setCurrentImageUrl(null);
      }
    } else {
      setCurrentImageUrl(null);
    }
  }, [logoUrl, tokenAddress, imgError, fallbackIndex]);

  const handleError = () => {
    if (fallbackIndex < FALLBACK_SOURCES.length - 1) {
      // Try next fallback source
      setFallbackIndex(prev => prev + 1);
    } else {
      setImgError(true);
    }
    onError?.();
  };

  const handleLoad = () => {
    onLoad?.();
  };

  // Placeholder with initial symbol
  if (imgError || !currentImageUrl) {
    const backgroundColor = getColorFromSymbol(symbol);
    
    return (
      <div
        className={`bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold shadow-lg ${className}`}
        style={{ 
          width: size, 
          height: size, 
          fontSize: size * 0.4,
          background: backgroundColor || 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
        }}
      >
        {symbol?.charAt(0)?.toUpperCase() || '?'}
      </div>
    );
  }
  
  return (
    <div 
      style={{ width: size, height: size }} 
      className={`relative flex-shrink-0 ${className}`}
    >
      <Image
        src={currentImageUrl}
        alt={symbol || 'Token'}
        width={size}
        height={size}
        className="rounded-full object-cover"
        onError={handleError}
        onLoad={handleLoad}
        unoptimized
      />
    </div>
  );
}

// Helper function to generate consistent color from symbol
function getColorFromSymbol(symbol) {
  if (!symbol) return null;
  
  const colors = [
    'linear-gradient(135deg, #3b82f6, #8b5cf6)', // Blue to Purple
    'linear-gradient(135deg, #10b981, #06b6d4)', // Green to Cyan
    'linear-gradient(135deg, #f59e0b, #ef4444)', // Amber to Red
    'linear-gradient(135deg, #ec4899, #8b5cf6)', // Pink to Purple
    'linear-gradient(135deg, #06b6d4, #3b82f6)', // Cyan to Blue
  ];
  
  // Use symbol to determine color index
  const index = symbol.charCodeAt(0) % colors.length;
  return colors[index];
}

// Skeleton component for loading state
export function TokenIconSkeleton({ size = 40, className = '' }) {
  return (
    <div
      className={`bg-gray-700 rounded-full animate-pulse ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

// Component for multiple token icons in a row (e.g., for pools)
export function TokenIconPair({ token1, token2, size = 40 }) {
  const iconSize = Math.floor(size * 0.7);
  
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <div className="absolute -left-1 -top-1 z-10">
        <TokenIcon 
          tokenAddress={token1.address} 
          symbol={token1.symbol} 
          logoUrl={token1.logo} 
          size={iconSize} 
        />
      </div>
      <div className="absolute -right-1 -bottom-1">
        <TokenIcon 
          tokenAddress={token2.address} 
          symbol={token2.symbol} 
          logoUrl={token2.logo} 
          size={iconSize} 
        />
      </div>
    </div>
  );
}