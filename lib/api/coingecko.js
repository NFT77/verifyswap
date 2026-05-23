// lib/api/coingecko.js - Base only
const COINGECKO_API = 'https://api.coingecko.com/api/v3';

// ✅ FIXED: all fetch calls now have timeout — was missing entirely before
async function fetchWithTimeout(url, options = {}, ms = 8000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return res;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') throw new Error(`CoinGecko timeout after ${ms}ms`);
    throw err;
  }
}

export async function searchTokenOnCoinGecko(tokenAddress, chain = 'base') {
  if (!tokenAddress) {
    console.warn('CoinGecko: No token address provided');
    return null;
  }

  if (chain !== 'base') {
    console.warn(`CoinGecko: Chain ${chain} not supported.`);
    return null;
  }

  try {
    const url = `${COINGECKO_API}/coins/base/contract/${tokenAddress}`;
    console.log(`CoinGecko fetch: ${url}`);

    const response = await fetchWithTimeout(url, {
      headers: { 'Accept': 'application/json' },
    }, 8000);

    if (!response.ok) {
      // Rate limited or not found — try symbol search fallback
      return await searchBySymbol(tokenAddress);
    }

    const data = await response.json();

    return {
      logo: data.image?.large || data.image?.small || null,
      symbol: data.symbol?.toUpperCase() || null,
      name: data.name || null,
      decimals: 18, // CoinGecko doesn't return decimals reliably; use known map in uniswap.js
      marketCap: data.market_data?.market_cap?.usd || 0,
      volume24h: data.market_data?.total_volume?.usd || 0,
      priceUSD: data.market_data?.current_price?.usd || 0,
      priceChange24h: data.market_data?.price_change_percentage_24h || 0,
      marketCapRank: data.market_cap_rank || null,
      totalSupply: data.market_data?.total_supply || null,
      circulatingSupply: data.market_data?.circulating_supply || null,
    };
  } catch (error) {
    console.error('CoinGecko error:', error.message);
    return null;
  }
}

async function searchBySymbol(symbol) {
  if (!symbol) return null;

  try {
    const response = await fetchWithTimeout(
      `${COINGECKO_API}/search?query=${encodeURIComponent(symbol)}`,
      { headers: { 'Accept': 'application/json' } },
      6000
    );
    if (!response.ok) return null;

    const data = await response.json();
    const coin = data.coins?.[0];
    if (!coin) return null;

    return {
      logo: coin.thumb || coin.large || null,
      symbol: coin.symbol?.toUpperCase() || symbol.toUpperCase(),
      name: coin.name || null,
      marketCapRank: coin.market_cap_rank || null,
    };
  } catch (error) {
    console.error('CoinGecko search by symbol error:', error.message);
    return null;
  }
}

export async function getTrendingTokens() {
  try {
    const response = await fetchWithTimeout(
      `${COINGECKO_API}/search/trending`,
      { headers: { 'Accept': 'application/json' } },
      8000
    );
    if (!response.ok) return [];

    const data = await response.json();
    return (data.coins || []).map(coin => ({
      symbol: coin.item.symbol?.toUpperCase(),
      name: coin.item.name,
      logo: coin.item.thumb || coin.item.small,
      priceBTC: coin.item.price_btc,
      rank: coin.item.market_cap_rank,
      id: coin.item.id,
    }));
  } catch (error) {
    console.error('CoinGecko trending error:', error.message);
    return [];
  }
}

export async function searchTokenBySymbol(symbol, limit = 10) {
  if (!symbol) return [];

  try {
    const response = await fetchWithTimeout(
      `${COINGECKO_API}/search?query=${encodeURIComponent(symbol)}`,
      { headers: { 'Accept': 'application/json' } },
      6000
    );
    if (!response.ok) return [];

    const data = await response.json();
    return (data.coins || []).slice(0, limit).map(coin => ({
      id: coin.id,
      symbol: coin.symbol?.toUpperCase(),
      name: coin.name,
      logo: coin.thumb || coin.large,
      marketCapRank: coin.market_cap_rank,
    }));
  } catch (error) {
    console.error('CoinGecko search token error:', error.message);
    return [];
  }
}