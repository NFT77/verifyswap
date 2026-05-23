// app/api/trending/route.js
import { NextResponse } from 'next/server';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
  'Cache-Control': 'no-store',
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

// ✅ FIXED: always fresh AbortController — the original code shared one controller
// across multiple fetch calls which caused "signal already aborted" errors
async function fetchWithTimeout(url, options = {}, ms = 8000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return res;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') throw new Error(`Timeout: ${url.substring(0, 60)}`);
    throw err;
  }
}

const FALLBACK_TRENDING = [
  { symbol: 'AERO', name: 'Aerodrome Finance', address: '0x940181a94A35A4569E4529A3CDfB74e38FD98631', priceUSD: 0.85, priceChange24h: 12.5, volume24h: 2500000, liquidityUSD: 5000000, dexId: 'Aerodrome' },
  { symbol: 'VIRTUAL', name: 'Virtual Protocol', address: '0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b', priceUSD: 2.15, priceChange24h: 8.3, volume24h: 1800000, liquidityUSD: 3200000, dexId: 'Uniswap' },
  { symbol: 'BRETT', name: 'Brett', address: '0x532f27101965dd16442E59d40670FaF5eBB142E4', priceUSD: 0.12, priceChange24h: -3.2, volume24h: 4200000, liquidityUSD: 8200000, dexId: 'Uniswap' },
  { symbol: 'CLANKER', name: 'Clanker', address: '0x1BCeE93fCb6B3eD3B8F93C1a4F7FaF9F9Dd42E68', priceUSD: 0.45, priceChange24h: 22.7, volume24h: 980000, liquidityUSD: 1500000, dexId: 'Uniswap' },
  { symbol: 'MOXIE', name: 'Moxie', address: '0x8C9037D1Ef5c6D1f6816278C7AAF549d5C6E1Ff6', priceUSD: 0.08, priceChange24h: 5.2, volume24h: 450000, liquidityUSD: 800000, dexId: 'Aerodrome' },
  { symbol: 'DEGEN', name: 'Degen', address: '0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed', priceUSD: 0.025, priceChange24h: -1.8, volume24h: 2100000, liquidityUSD: 3800000, dexId: 'Uniswap' },
  { symbol: 'HIGHER', name: 'Higher', address: '0x0578d8A44db98B23BF096A382e016e29a5Ce0ffe', priceUSD: 0.035, priceChange24h: 18.3, volume24h: 320000, liquidityUSD: 650000, dexId: 'Aerodrome' },
  { symbol: 'WETH', name: 'Wrapped Ether', address: '0x4200000000000000000000000000000000000006', priceUSD: 3200, priceChange24h: 1.2, volume24h: 5000000, liquidityUSD: 20000000, dexId: 'Uniswap' },
];

function buildFallback(limit) {
  return FALLBACK_TRENDING.slice(0, limit).map(t => ({
    ...t,
    pairAddress: null,
    url: null,
    source: 'fallback',
  }));
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const chain = searchParams.get('chain') || 'base';
  const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 20);

  try {
    // ── Attempt 1: GeckoTerminal ──────────────────────────────────────────
    let geckoRes = null;
    try {
      geckoRes = await fetchWithTimeout(
        `https://api.geckoterminal.com/api/v1/networks/${chain}/trending_pools`,
        { headers: { 'Accept': 'application/json', 'User-Agent': 'VerifySwap/1.0' } },
        8000
      );
    } catch (e) {
      console.error('GeckoTerminal error:', e.message);
    }

    if (geckoRes?.ok) {
      const geckoData = await geckoRes.json();
      if (geckoData?.data?.length > 0) {
        const tokens = geckoData.data
          .slice(0, limit)
          .map(pool => {
            const addressId = pool.relationships?.base_token?.data?.id || '';
            const address = addressId.includes('_') ? addressId.split('_')[1] : null;
            return {
              address,
              symbol: pool.attributes?.base_token_symbol?.toUpperCase() || '?',
              name: pool.attributes?.base_token_name || pool.attributes?.base_token_symbol || 'Unknown',
              priceUSD: parseFloat(pool.attributes?.base_token_price_usd || 0),
              priceChange24h: parseFloat(pool.attributes?.price_change_percentage?.h24 || 0),
              volume24h: parseFloat(pool.attributes?.volume_usd?.h24 || 0),
              liquidityUSD: parseFloat(pool.attributes?.reserve_in_usd || 0),
              dexId: pool.attributes?.dex_name || 'Unknown',
              pairAddress: pool.id?.split('_')[1] || null,
              url: pool.attributes?.url || null,
              source: 'geckoterminal',
            };
          })
          .filter(t => t.symbol && t.symbol !== '?' && t.address);

        if (tokens.length > 0) {
          console.log(`✅ GeckoTerminal: ${tokens.length} tokens`);
          return NextResponse.json(
            { success: true, trending: tokens, timestamp: Date.now(), source: 'geckoterminal' },
            { headers: CORS_HEADERS }
          );
        }
      }
    }

    // ── Attempt 2: DexScreener ────────────────────────────────────────────
    let dexRes = null;
    try {
      dexRes = await fetchWithTimeout(
        `https://api.dexscreener.com/latest/dex/trending?chain=${chain}`,
        { headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' } },
        8000
      );
    } catch (e) {
      console.error('DexScreener error:', e.message);
    }

    if (dexRes?.ok) {
      const dexData = await dexRes.json();
      if (dexData?.pairs?.length > 0) {
        const tokens = dexData.pairs
          .filter(p => p.chainId?.toLowerCase() === chain && p.baseToken?.address)
          .slice(0, limit)
          .map(pair => ({
            address: pair.baseToken?.address,
            symbol: pair.baseToken?.symbol?.toUpperCase(),
            name: pair.baseToken?.name,
            priceUSD: parseFloat(pair.priceUsd || 0),
            priceChange24h: parseFloat(pair.priceChange?.h24 || 0),
            volume24h: parseFloat(pair.volume?.h24 || 0),
            liquidityUSD: parseFloat(pair.liquidity?.usd || 0),
            dexId: pair.dexId,
            pairAddress: pair.pairAddress,
            url: pair.url,
            source: 'dexscreener',
          }));

        if (tokens.length > 0) {
          console.log(`✅ DexScreener: ${tokens.length} tokens`);
          return NextResponse.json(
            { success: true, trending: tokens, timestamp: Date.now(), source: 'dexscreener' },
            { headers: CORS_HEADERS }
          );
        }
      }
    }

    // ── Fallback ──────────────────────────────────────────────────────────
    console.log('All trending APIs failed, using fallback');
    return NextResponse.json(
      {
        success: true,
        trending: buildFallback(limit),
        timestamp: Date.now(),
        source: 'fallback',
        note: 'Demo data — real data appears when APIs are responsive.',
      },
      { headers: CORS_HEADERS }
    );

  } catch (error) {
    console.error('Trending API unhandled error:', error);
    return NextResponse.json(
      { success: true, trending: buildFallback(limit), timestamp: Date.now(), source: 'fallback' },
      { headers: CORS_HEADERS }
    );
  }
}