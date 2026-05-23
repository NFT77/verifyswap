'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import TokenIcon from './TokenIcon';

// ✅ FIXED: fetch with timeout — safe for Farcaster iframe
async function fetchWithTimeout(url, ms = 10000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    return res;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') throw new Error('Request timed out');
    throw err;
  }
}

export default function TrendingTokens({ onSelectToken, limit = 10 }) {
  const [trending, setTrending] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [logos, setLogos] = useState({});

  // ✅ FIXED: use ref to track mounted state — prevents state updates after unmount
  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  // ✅ FIXED: logos fetched in batch after trending loads, not one-by-one in a loop
  // inside fetchTrending (which caused sequential API calls blocking the render).
  const fetchLogosForTokens = useCallback(async (tokens) => {
    const tokensNeedingLogo = tokens.filter(t => t.address && !logos[t.address]);
    if (tokensNeedingLogo.length === 0) return;

    // Fetch all logos in parallel with a cap of 5 concurrent requests
    const chunks = [];
    for (let i = 0; i < tokensNeedingLogo.length; i += 5) {
      chunks.push(tokensNeedingLogo.slice(i, i + 5));
    }

    for (const chunk of chunks) {
      await Promise.allSettled(
        chunk.map(async (token) => {
          try {
            const res = await fetchWithTimeout(`/api/search?q=${token.address}&chain=base`, 8000);
            if (!res.ok) return;
            const data = await res.json();
            if (data.token?.logo && isMounted.current) {
              setLogos(prev => ({ ...prev, [token.address]: data.token.logo }));
            }
          } catch {
            // silently skip failed logo fetches
          }
        })
      );
    }
  }, [logos]);

  const fetchTrending = useCallback(async () => {
    if (!isMounted.current) return;
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetchWithTimeout(`/api/trending?chain=base&limit=${limit}`, 10000);

      if (!res.ok) throw new Error(`API error ${res.status}`);

      const data = await res.json();

      if (!isMounted.current) return;

      if (data.success && Array.isArray(data.trending)) {
        setTrending(data.trending);
        setLastUpdated(data.timestamp);
        // Fetch logos separately — don't block render
        fetchLogosForTokens(data.trending);
      } else {
        setError('Failed to load trending tokens');
      }
    } catch (err) {
      if (!isMounted.current) return;
      console.error('Trending fetch error:', err.message);
      setError(err.message?.includes('timed out') ? 'Request timed out' : 'Network error');
    } finally {
      if (isMounted.current) setIsLoading(false);
    }
  }, [limit, fetchLogosForTokens]);

  useEffect(() => {
    fetchTrending();
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
    if (!onSelectToken) return;
    onSelectToken(token.address ? token : { ...token, address: token.symbol });
  };

  if (isLoading && trending.length === 0) {
    return (
      <div className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-6 h-6 bg-purple-500 rounded-full animate-pulse" />
          <div className="h-6 w-32 bg-white/10 rounded animate-pulse" />
        </div>
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="flex items-center justify-between p-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/10 rounded-full animate-pulse" />
                <div>
                  <div className="h-4 w-20 bg-white/10 rounded animate-pulse mb-1" />
                  <div className="h-3 w-24 bg-white/10 rounded animate-pulse" />
                </div>
              </div>
              <div className="h-4 w-16 bg-white/10 rounded animate-pulse" />
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
              {new Date(lastUpdated).toLocaleTimeString()}
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

      {/* ✅ FIXED: removed motion.div (framer-motion) — causes issues in Farcaster iframe */}
      <div className="space-y-2">
        {trending.map((token, idx) => (
          <div
            key={token.address || token.symbol + idx}
            onClick={() => handleTokenClick(token)}
            className="flex items-center justify-between p-3 rounded-xl transition-all duration-200 cursor-pointer hover:bg-gradient-to-r hover:from-purple-500/20 hover:to-blue-500/20 hover:scale-[1.01] active:scale-[0.99]"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 text-center">
                <span className={`text-sm font-bold ${
                  idx === 0 ? 'text-yellow-400' :
                  idx === 1 ? 'text-gray-400' :
                  idx === 2 ? 'text-orange-400' : 'text-gray-500'
                }`}>#{idx + 1}</span>
              </div>

              <TokenIcon
                tokenAddress={token.address}
                symbol={token.symbol}
                logoUrl={logos[token.address]}
                size={40}
              />

              <div>
                <div className="font-semibold text-white">{token.symbol}</div>
                <div className="text-xs text-gray-500">
                  {token.name && token.name !== token.symbol
                    ? (token.name.length > 25 ? token.name.slice(0, 25) + '...' : token.name)
                    : token.dexId || 'Base'}
                </div>
                <div className="flex items-center gap-3 text-xs mt-1">
                  <span className="text-gray-600">Vol: {formatNumber(token.volume24h)}</span>
                  <span className="text-gray-600">Liq: {formatNumber(token.liquidityUSD)}</span>
                </div>
              </div>
            </div>

            <div className="text-right">
              <div className="font-mono text-white text-sm">
                {token.priceUSD > 0
                  ? `$${token.priceUSD.toFixed(token.priceUSD < 0.01 ? 6 : 4)}`
                  : 'N/A'}
              </div>
              <div className={`text-xs font-medium ${getPriceChangeColor(token.priceChange24h)}`}>
                {token.priceChange24h > 0 ? '▲' : token.priceChange24h < 0 ? '▼' : ''}
                {Math.abs(token.priceChange24h || 0).toFixed(2)}%
              </div>
            </div>
          </div>
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