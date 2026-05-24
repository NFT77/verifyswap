// app/api/trending/route.js
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

// Daftar token valid sebagai fallback terakhir
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

// ========== SUMBER 1: GeckoTerminal (Paling Akurat untuk Trending) ==========
async function fetchFromGeckoTerminal(limit) {
  try {
    const res = await fetchWithTimeout(
      'https://api.geckoterminal.com/api/v1/networks/base/trending_pools',
      { headers: { 'Accept': 'application/json' } },
      8000
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.data?.length) return null;

    const tokens = data.data.slice(0, limit).map(pool => {
      const attrs = pool.attributes;
      const tokenAddress = pool.relationships?.base_token?.data?.id?.split('_')[1];
      return {
        address: tokenAddress,
        symbol: attrs?.base_token_symbol?.toUpperCase(),
        name: attrs?.base_token_name,
        priceUSD: parseFloat(attrs?.base_token_price_usd || 0),
        priceChange24h: parseFloat(attrs?.price_change_percentage?.h24 || 0),
        volume24h: parseFloat(attrs?.volume_usd?.h24 || 0),
        liquidityUSD: parseFloat(attrs?.reserve_in_usd || 0),
        dexId: attrs?.dex_name,
        source: 'geckoterminal',
      };
    }).filter(t => t.address && t.symbol && !t.symbol.includes('BASE')); // Filter token mencurigakan

    return tokens.length > 0 ? tokens : null;
  } catch (err) {
    console.error('GeckoTerminal error:', err.message);
    return null;
  }
}

// ========== SUMBER 2: DexScreener (Fallback dengan Filter Lebih Ketat) ==========
async function fetchFromDexScreener(limit) {
  try {
    // Gunakan endpoint trending yang sebenarnya, bukan search
    const res = await fetchWithTimeout(
      'https://api.dexscreener.com/latest/dex/trending?chain=base',
      { headers: { 'Accept': 'application/json' } },
      8000
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.pairs?.length) return null;

    // Filter yang lebih ketat
    const validPairs = data.pairs
      .filter(p => 
        p.chainId === 'base' && 
        p.baseToken?.address && 
        p.baseToken?.symbol &&
        !p.baseToken.symbol.includes('BASE') && // Buang yang ada kata BASE
        p.baseToken.symbol.length <= 10 &&      // Simbol terlalu panjang mencurigakan
        (p.liquidity?.usd || 0) > 10000         // Minimal likuiditas $10k
      )
      .slice(0, limit);

    if (validPairs.length === 0) return null;

    return validPairs.map(p => ({
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

// ========== SUMBER 3: Fallback Cerdas dengan Harga Real ==========
async function fetchRealPrices(tokens) {
  const results = [];
  for (const token of tokens) {
    try {
      const url = `https://api.dexscreener.com/latest/dex/tokens/${token.address}`;
      const res = await fetchWithTimeout(url, 4000);
      if (res.ok) {
        const data = await res.json();
        const pair = data.pairs?.find(p => p.chainId === 'base');
        if (pair && pair.priceUsd) {
          results.push({
            ...token,
            priceUSD: parseFloat(pair.priceUsd || 0),
            priceChange24h: parseFloat(pair.priceChange?.h24 || 0),
            volume24h: parseFloat(pair.volume?.h24 || 0),
            liquidityUSD: parseFloat(pair.liquidity?.usd || 0),
            dexId: pair.dexId,
            source: 'real-fallback',
          });
          continue;
        }
      }
      results.push({ ...token, priceUSD: 0, priceChange24h: 0, volume24h: 0, liquidityUSD: 0, source: 'minimal' });
    } catch (err) {
      results.push({ ...token, priceUSD: 0, priceChange24h: 0, volume24h: 0, liquidityUSD: 0, source: 'error' });
    }
    await new Promise(r => setTimeout(r, 200));
  }
  return results;
}

// ========== MAIN HANDLER ==========
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get('limit') || '8'), 20);

  // Cek cache
  if (cache && cacheTime && Date.now() - cacheTime < CACHE_TTL) {
    return NextResponse.json({ 
      success: true, 
      trending: cache.slice(0, limit), 
      timestamp: cacheTime, 
      source: 'cache' 
    }, { headers: CORS_HEADERS });
  }

  try {
    let tokens = null;
    let source = '';

    // 1. Coba GeckoTerminal dulu (paling akurat)
    tokens = await fetchFromGeckoTerminal(limit);
    if (tokens && tokens.length >= 3) {
      source = 'geckoterminal';
    }

    // 2. Jika gagal, coba DexScreener
    if (!tokens || tokens.length < 3) {
      tokens = await fetchFromDexScreener(limit);
      if (tokens && tokens.length >= 3) {
        source = 'dexscreener';
      }
    }

    // 3. Jika masih gagal, pakai fallback token valid dengan harga real
    if (!tokens || tokens.length === 0) {
      console.log('All APIs failed, using real fallback tokens');
      tokens = await fetchRealPrices(FALLBACK_TOKENS.slice(0, limit));
      source = 'fallback';
    }

    // Update cache
    cache = tokens;
    cacheTime = Date.now();

    return NextResponse.json({ 
      success: true, 
      trending: tokens, 
      timestamp: cacheTime, 
      source 
    }, { headers: CORS_HEADERS });

  } catch (error) {
    console.error('Trending API error:', error);
    
    // Emergency fallback
    const fallbackTokens = await fetchRealPrices(FALLBACK_TOKENS.slice(0, limit));
    return NextResponse.json({ 
      success: true, 
      trending: fallbackTokens, 
      timestamp: Date.now(), 
      source: 'emergency' 
    }, { headers: CORS_HEADERS });
  }
}