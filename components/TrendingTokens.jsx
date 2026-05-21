// components/TrendingTokens.jsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import TokenIcon from './TokenIcon';

export default function TrendingTokens({ onSelectToken, limit = 10 }) {
  const [trending, setTrending] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const [logos, setLogos] = useState({});

  // Fetch logo from CoinGecko for each token
  const fetchTokenLogo = useCallback(async (address, symbol) => {
    if (!address) return null;
    
    // Check cache
    if (logos[address]) return logos[address];
    
    try {
      const res = await fetch(`/api/search?q=${address}&chain=base`);
      const data = await res.json();
      
      if (data.token?.logo) {
        setLogos(prev => ({ ...prev, [address]: data.token.logo }));
        return data.token.logo;
      }
    } catch (err) {
      console.error('Failed to fetch logo:', err);
    }
    return null;
  }, [logos]);

  const fetchTrending = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const res = await fetch(`/api/trending?chain=base&limit=${limit}`);
      const data = await res.json();
      
      if (data.success) {
        setTrending(data.trending);
        setLastUpdated(data.timestamp);
        
        // Fetch logos for tokens that have addresses
        for (const token of data.trending) {
          if (token.address) {
            await fetchTokenLogo(token.address, token.symbol);
          }
        }
      } else {
        setError('Failed to load trending tokens');
      }
    } catch (err) {
      console.error('Error fetching trending:', err);
      setError('Network error');
    } finally {
      setIsLoading(false);
    }
  }, [limit, fetchTokenLogo]);

  useEffect(() => {
    fetchTrending();
    
    // Refresh every 5 minutes
    const interval = setInterval(fetchTrending, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchTrending]);

  const formatNumber = (num) => {
    if (!num || isNaN(num)) return '$0';
    if (num >= 1e6) return `$${(num / 1e6).toFixed(1)}M`;
    if (num >= 1e3) return `$${(num / 1e3).toFixed(1)}K`;
    return `$${num.toFixed(2)}`;
  };

  const getPriceChangeColor = (change) => {
    if (change > 0) return 'text-green-400';
    if (change < 0) return 'text-red-400';
    return 'text-gray-400';
  };

  const handleTokenClick = (token) => {
    if (token.address && onSelectToken) {
      onSelectToken(token);
    } else if (token.symbol && onSelectToken) {
      onSelectToken({ ...token, address: token.symbol });
    }
  };

  if (isLoading && trending.length === 0) {
    return (
      <div className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-6 h-6 bg-purple-500 rounded-full animate-pulse"></div>
          <div className="h-6 w-32 bg-white/10 rounded animate-pulse"></div>
        </div>
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="flex items-center justify-between p-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/10 rounded-full animate-pulse"></div>
                <div>
                  <div className="h-4 w-20 bg-white/10 rounded animate-pulse mb-1"></div>
                  <div className="h-3 w-24 bg-white/10 rounded animate-pulse"></div>
                </div>
              </div>
              <div className="h-4 w-16 bg-white/10 rounded animate-pulse"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error && trending.length === 0) {
    return (
      <div className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 p-5 text-center">
        <p className="text-red-400 text-sm">{error}</p>
        <button 
          onClick={fetchTrending}
          className="mt-2 text-xs text-purple-400 hover:text-purple-300 transition"
        >
          Try again →
        </button>
      </div>
    );
  }

  if (trending.length === 0) return null;

  return (
    <div className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-xl">🔥</span>
          <h3 className="text-lg font-semibold text-white">Trending on Base</h3>
          {lastUpdated && (
            <span className="text-xs text-gray-500">
              Updated {new Date(lastUpdated).toLocaleTimeString()}
            </span>
          )}
          {trending[0]?.source === 'fallback' && (
            <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded-full">
              Demo Data
            </span>
          )}
        </div>
        <button
          onClick={fetchTrending}
          disabled={isLoading}
          className="text-xs text-purple-400 hover:text-purple-300 transition disabled:opacity-50"
        >
          {isLoading ? '⟳ Refreshing...' : '⟳ Refresh'}
        </button>
      </div>

      <div className="space-y-2">
        {trending.map((token, idx) => (
          <motion.div
            key={token.address || token.symbol + idx}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: idx * 0.03 }}
            onClick={() => handleTokenClick(token)}
            onMouseEnter={() => setHoveredIndex(idx)}
            onMouseLeave={() => setHoveredIndex(null)}
            className={`flex items-center justify-between p-3 rounded-xl transition-all duration-200 cursor-pointer ${
              hoveredIndex === idx 
                ? 'bg-gradient-to-r from-purple-500/20 to-blue-500/20 scale-[1.01]' 
                : 'hover:bg-white/10'
            }`}
          >
            <div className="flex items-center gap-3">
              {/* Ranking Number */}
              <div className="w-8 text-center">
                <span className={`text-sm font-bold ${
                  idx === 0 ? 'text-yellow-400' : 
                  idx === 1 ? 'text-gray-400' : 
                  idx === 2 ? 'text-orange-400' : 'text-gray-500'
                }`}>#{idx + 1}</span>
              </div>
              
              {/* Token Icon with Logo */}
              <TokenIcon 
                tokenAddress={token.address} 
                symbol={token.symbol} 
                logoUrl={logos[token.address]} 
                size={40} 
              />
              
              {/* Token Info */}
              <div>
                <div className="font-semibold text-white flex items-center gap-2">
                  {token.symbol}
                  {hoveredIndex === idx && (
                    <span className="text-xs text-purple-400 animate-pulse">
                      Click to swap →
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray-500">
                  {token.name && token.name !== token.symbol 
                    ? (token.name.length > 25 ? token.name.slice(0, 25) + '...' : token.name)
                    : token.dexId || 'Base'
                  }
                </div>
                <div className="flex items-center gap-3 text-xs mt-1">
                  <span className="text-gray-600">
                    Vol: {formatNumber(token.volume24h)}
                  </span>
                  <span className="text-gray-600">
                    Liq: {formatNumber(token.liquidityUSD)}
                  </span>
                </div>
              </div>
            </div>
            
            {/* Price Info */}
            <div className="text-right">
              <div className="font-mono text-white text-sm">
                {token.priceUSD > 0 ? `$${token.priceUSD.toFixed(token.priceUSD < 0.01 ? 6 : 4)}` : 'N/A'}
              </div>
              <div className={`text-xs font-medium ${getPriceChangeColor(token.priceChange24h)}`}>
                {token.priceChange24h > 0 ? '▲' : token.priceChange24h < 0 ? '▼' : ''}
                {Math.abs(token.priceChange24h).toFixed(2)}%
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="mt-3 pt-2 border-t border-white/10 text-center">
        <p className="text-xs text-gray-500">
          🔥 Click any token to instantly search and swap • Updated every 5 minutes
        </p>
        {trending[0]?.source === 'fallback' && (
          <p className="text-xs text-yellow-500/70 mt-1">
            ⚠️ Demo data shown. Real trending data will appear when APIs are responsive.
          </p>
        )}
      </div>
    </div>
  );
}