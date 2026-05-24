// lib/api/coinmarketcap.js

const CMC_API_KEY = process.env.COINMARKETCAP_API_KEY || process.env.NEXT_PUBLIC_COINMARKETCAP_API_KEY;
const CMC_API = 'https://pro-api.coinmarketcap.com/v1';

// Debug log di development (hapus saat production jika tidak perlu)
if (!CMC_API_KEY && process.env.NODE_ENV === 'development') {
  console.warn('⚠️ COINMARKETCAP_API_KEY not set. CMC features will be disabled.');
}

async function fetchWithTimeout(url, options = {}, ms = 8000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return res;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') throw new Error(`CMC timeout after ${ms}ms`);
    throw err;
  }
}

function cmcHeaders() {
  return {
    'X-CMC_PRO_API_KEY': CMC_API_KEY,
    'Accept': 'application/json',
  };
}

export async function searchTokenOnCMC(tokenAddress, chain = 'base') {
  if (!CMC_API_KEY) { 
    if (process.env.NODE_ENV === 'development') {
      console.warn('CoinMarketCap skipped: API key missing');
    }
    return null; 
  }
  if (!tokenAddress) return null;

  try {
    const response = await fetchWithTimeout(
      `${CMC_API}/cryptocurrency/info?address=${tokenAddress}`,
      { headers: cmcHeaders() },
      8000
    );
    if (!response.ok) { 
      console.error(`CMC API error: ${response.status}`); 
      return null; 
    }

    const data = await response.json();
    const tokenData = Object.values(data.data || {})[0];
    if (!tokenData) return null;

    return {
      logo: tokenData.logo || null,
      symbol: tokenData.symbol?.toUpperCase() || null,
      name: tokenData.name || null,
      category: tokenData.category || null,
      platform: tokenData.platform?.name || null,
      contractAddress: tokenData.contract_address?.[0] || null,
    };
  } catch (error) {
    console.error('CoinMarketCap error:', error.message);
    return null;
  }
}

export async function getTokenQuoteCMC(tokenSymbol) {
  if (!CMC_API_KEY || !tokenSymbol) return null;

  try {
    const response = await fetchWithTimeout(
      `${CMC_API}/cryptocurrency/quotes/latest?symbol=${encodeURIComponent(tokenSymbol)}`,
      { headers: cmcHeaders() },
      8000
    );
    if (!response.ok) return null;

    const data = await response.json();
    const quote = Object.values(data.data || {})[0];
    if (!quote) return null;

    return {
      priceUSD: quote.quote?.USD?.price || 0,
      volume24h: quote.quote?.USD?.volume_24h || 0,
      marketCap: quote.quote?.USD?.market_cap || 0,
      percentChange24h: quote.quote?.USD?.percent_change_24h || 0,
      percentChange7d: quote.quote?.USD?.percent_change_7d || 0,
      circulatingSupply: quote.circulating_supply || 0,
      totalSupply: quote.total_supply || 0,
      maxSupply: quote.max_supply || 0,
    };
  } catch (error) {
    console.error('CoinMarketCap quote error:', error.message);
    return null;
  }
}

export async function searchCryptocurrency(symbol, limit = 10) {
  if (!CMC_API_KEY || !symbol) return [];

  try {
    const response = await fetchWithTimeout(
      `${CMC_API}/cryptocurrency/map?symbol=${encodeURIComponent(symbol)}&limit=${limit}`,
      { headers: cmcHeaders() },
      8000
    );
    if (!response.ok) return [];

    const data = await response.json();
    return (data.data || []).map(crypto => ({
      id: crypto.id,
      symbol: crypto.symbol?.toUpperCase(),
      name: crypto.name,
      rank: crypto.rank,
      slug: crypto.slug,
    }));
  } catch (error) {
    console.error('CoinMarketCap search error:', error.message);
    return [];
  }
}