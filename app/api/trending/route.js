import { NextResponse } from 'next/server';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

let cache = null;
let cacheTime = null;
const CACHE_TTL = 5 * 60 * 1000;

const FALLBACK_TOKENS = [
  { symbol: 'AERO', address: '0x940181a94A35A4569E4529A3CDfB74e38FD98631', name: 'Aerodrome Finance' },
  { symbol: 'VIRTUAL', address: '0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b', name: 'Virtual Protocol' },
  { symbol: 'BRETT', address: '0x532f27101965dd16442E59d40670FaF5eBB142E4', name: 'Brett' },
  { symbol: 'DEGEN', address: '0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed', name: 'Degen' },
  { symbol: 'TOSHI', address: '0xac1bd2486aaf3b5c0fc3fd868558b082a531b2b4', name: 'Toshi' },
  { symbol: 'HIGHER', address: '0x0578d8A44db98B23BF096A382e016e29a5Ce0ffe', name: 'Higher' },
  { symbol: 'CLANKER', address: '0x1BCeE93fCb6B3eD3B8F93C1a4F7FaF9F9Dd42E68', name: 'Clanker' },
];

async function fetchWithTimeout(url, ms = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

async function fetchRealPrices(tokens) {
  const results = [];
  for (const token of tokens) {
    try {
      const url = `https://api.dexscreener.com/latest/dex/tokens/${token.address}`;
      const res = await fetchWithTimeout(url, 4000);
      if (res.ok) {
        const data = await res.json();
        const pair = data.pairs?.find(p => p.chainId === 'base');
        if (pair) {
          results.push({
            ...token,
            priceUSD: parseFloat(pair.priceUsd || 0),
            priceChange24h: parseFloat(pair.priceChange?.h24 || 0),
            volume24h: parseFloat(pair.volume?.h24 || 0),
            liquidityUSD: parseFloat(pair.liquidity?.usd || 0),
            dexId: pair.dexId,
            source: 'real',
          });
          continue;
        }
      }
      results.push({ ...token, priceUSD: 0, priceChange24h: 0, volume24h: 0, liquidityUSD: 0, source: 'basic' });
    } catch (err) {
      results.push({ ...token, priceUSD: 0, priceChange24h: 0, volume24h: 0, liquidityUSD: 0, source: 'basic' });
    }
    await new Promise(r => setTimeout(r, 200));
  }
  return results;
}

async function fetchFromDexScreener(limit) {
  try {
    const res = await fetchWithTimeout('https://api.dexscreener.com/latest/dex/search?q=base', 8000);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.pairs) return null;
    
    const basePairs = data.pairs
      .filter(p => p.chainId === 'base' && p.baseToken?.address && (p.liquidity?.usd || 0) > 5000)
      .sort((a, b) => (b.volume?.h24 || 0) - (a.volume?.h24 || 0))
      .slice(0, limit);
    
    if (basePairs.length === 0) return null;
    
    return basePairs.map(p => ({
      address: p.baseToken.address,
      symbol: p.baseToken.symbol?.toUpperCase(),
      name: p.baseToken.name,
      priceUSD: parseFloat(p.priceUsd || 0),
      priceChange24h: parseFloat(p.priceChange?.h24 || 0),
      volume24h: parseFloat(p.volume?.h24 || 0),
      liquidityUSD: parseFloat(p.liquidity?.usd || 0),
      dexId: p.dexId,
      source: 'dexscreener',
    }));
  } catch (err) {
    console.error('DexScreener error:', err.message);
    return null;
  }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get('limit') || '8'), 20);

  if (cache && cacheTime && Date.now() - cacheTime < CACHE_TTL) {
    return NextResponse.json({ success: true, trending: cache.slice(0, limit), timestamp: cacheTime, source: 'cache' }, { headers: CORS_HEADERS });
  }

  try {
    let tokens = await fetchFromDexScreener(limit);
    
    if (!tokens || tokens.length === 0) {
      tokens = await fetchRealPrices(FALLBACK_TOKENS.slice(0, limit));
      cache = tokens;
      cacheTime = Date.now();
      return NextResponse.json({ success: true, trending: tokens, timestamp: cacheTime, source: 'fallback' }, { headers: CORS_HEADERS });
    }
    
    cache = tokens;
    cacheTime = Date.now();
    return NextResponse.json({ success: true, trending: tokens, timestamp: cacheTime, source: 'dexscreener' }, { headers: CORS_HEADERS });
    
  } catch (error) {
    console.error('Trending error:', error);
    const fallbackTokens = await fetchRealPrices(FALLBACK_TOKENS.slice(0, limit));
    return NextResponse.json({ success: true, trending: fallbackTokens, timestamp: Date.now(), source: 'emergency' }, { headers: CORS_HEADERS });
  }
}