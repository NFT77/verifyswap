// lib/api/dexscreener.js - Base only
const DEXSCREENER_API = 'https://api.dexscreener.com/latest/dex';

async function fetchWithTimeout(url, options = {}, ms = 8000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return res;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') throw new Error(`DexScreener timeout after ${ms}ms`);
    throw err;
  }
}

export async function getTokenPrice(tokenAddress, chain = 'base') {
  if (!tokenAddress || chain !== 'base') return null;

  try {
    const response = await fetchWithTimeout(
      `${DEXSCREENER_API}/tokens/${tokenAddress}`,
      {},
      8000
    );
    if (!response.ok) return null;

    const data = await response.json();
    if (!data?.pairs?.length) return null;

    const pair = data.pairs.find(p => p.chainId?.toLowerCase() === 'base') || data.pairs[0];
    if (!pair) return null;

    return {
      priceUSD: parseFloat(pair.priceUsd || 0),
      priceNative: parseFloat(pair.priceNative || 0),
      liquidityUSD: parseFloat(pair.liquidity?.usd || 0),
      volume24h: parseFloat(pair.volume?.h24 || 0),
      priceChange24h: parseFloat(pair.priceChange?.h24 || 0),
      priceChange5m: parseFloat(pair.priceChange?.m5 || 0),
      priceChange1h: parseFloat(pair.priceChange?.h1 || 0),
      priceChange6h: parseFloat(pair.priceChange?.h6 || 0),
      symbol: pair.baseToken?.symbol,
      name: pair.baseToken?.name,
      address: pair.baseToken?.address,
      chainId: pair.chainId,
      dexId: pair.dexId,
      pairAddress: pair.pairAddress,
      fdv: parseFloat(pair.fdv || 0),
      marketCap: parseFloat(pair.marketCap || 0),
      url: pair.url,
    };
  } catch (error) {
    console.error('DexScreener error:', error.message);
    return null;
  }
}

export async function searchTokenBySymbol(symbol, chain = 'base') {
  if (!symbol || chain !== 'base') return [];

  try {
    const response = await fetchWithTimeout(
      `${DEXSCREENER_API}/search?q=${encodeURIComponent(symbol)}`,
      {},
      8000
    );
    if (!response.ok) return [];

    const data = await response.json();
    if (!data?.pairs) return [];

    const pairs = data.pairs.filter(p => p.chainId?.toLowerCase() === 'base');
    const uniqueTokens = new Map();

    for (const pair of pairs) {
      const tokenAddress = pair.baseToken?.address;
      if (tokenAddress && !uniqueTokens.has(tokenAddress)) {
        uniqueTokens.set(tokenAddress, {
          address: tokenAddress,
          symbol: pair.baseToken?.symbol,
          name: pair.baseToken?.name,
          priceUSD: parseFloat(pair.priceUsd || 0),
          priceChange24h: parseFloat(pair.priceChange?.h24 || 0),
          liquidityUSD: parseFloat(pair.liquidity?.usd || 0),
          volume24h: parseFloat(pair.volume?.h24 || 0),
          chainId: pair.chainId,
          dexId: pair.dexId,
        });
      }
    }

    return Array.from(uniqueTokens.values());
  } catch (error) {
    console.error('DexScreener search error:', error.message);
    return [];
  }
}

// ✅ FIXED: was sequential with 100ms artificial delay per token.
// Now all fetches run in parallel.
export async function getMultipleTokenPrices(tokenAddresses) {
  if (!tokenAddresses || tokenAddresses.length === 0) return [];

  const results = await Promise.allSettled(
    tokenAddresses.map(address => getTokenPrice(address))
  );

  return results
    .filter(r => r.status === 'fulfilled' && r.value !== null)
    .map(r => r.value);
}

export async function getTrendingTokens(chain = 'base') {
  try {
    const response = await fetchWithTimeout(
      `${DEXSCREENER_API}/trending?chain=${chain}`,
      {},
      8000
    );
    if (!response.ok) return [];

    const data = await response.json();
    if (!data?.pairs) return [];

    return data.pairs.slice(0, 20).map(pair => ({
      address: pair.baseToken?.address,
      symbol: pair.baseToken?.symbol,
      name: pair.baseToken?.name,
      priceUSD: parseFloat(pair.priceUsd || 0),
      priceChange24h: parseFloat(pair.priceChange?.h24 || 0),
      liquidityUSD: parseFloat(pair.liquidity?.usd || 0),
      volume24h: parseFloat(pair.volume?.h24 || 0),
      chainId: pair.chainId,
      dexId: pair.dexId,
      url: pair.url,
    }));
  } catch (error) {
    console.error('DexScreener trending error:', error.message);
    return [];
  }
}