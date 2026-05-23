// app/api/swap/quote/route.js
import { NextResponse } from 'next/server';
import { getOkxQuote } from '@/lib/api/okx';
import { getQuote as getUniswapQuote } from '@/lib/api/uniswap';

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

const quoteCache = new Map();
const CACHE_TTL = 3000;

function getCacheKey(tokenIn, tokenOut, amount, slippage) {
  return `base:${tokenIn}:${tokenOut}:${amount}:${slippage}`;
}

function getCachedQuote(key) {
  const cached = quoteCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) return cached.data;
  quoteCache.delete(key);
  return null;
}

function setCachedQuote(key, data) {
  if (quoteCache.size > 100) {
    const oldestKey = quoteCache.keys().next().value;
    quoteCache.delete(oldestKey);
  }
  quoteCache.set(key, { data, timestamp: Date.now() });
}

async function fetchWithTimeout(url, options = {}, ms = 8000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ms);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') throw new Error(`Timeout: ${url.substring(0, 60)}`);
    throw error;
  }
}

const WETH_ADDRESS = '0x4200000000000000000000000000000000000006';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const chain = searchParams.get('chain');
  const tokenIn = searchParams.get('tokenIn');
  const tokenOut = searchParams.get('tokenOut');
  const amount = searchParams.get('amount');
  const slippage = parseFloat(searchParams.get('slippage') || '0.5');

  if (!chain || !tokenOut || !amount) {
    return NextResponse.json(
      { error: 'Missing parameters: chain, tokenOut, amount are required' },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  if (chain !== 'base') {
    return NextResponse.json(
      { error: `Unsupported chain: ${chain}` },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const amountNum = parseFloat(amount);
  if (isNaN(amountNum) || amountNum <= 0) {
    return NextResponse.json(
      { error: 'Invalid amount' },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  if (isNaN(slippage) || slippage < 0 || slippage > 50) {
    return NextResponse.json(
      { error: 'Invalid slippage' },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  if (!tokenIn || (!tokenIn.startsWith('0x') && tokenIn !== 'ETH')) {
    return NextResponse.json(
      { error: 'Invalid tokenIn format' },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  if (!tokenOut.startsWith('0x')) {
    return NextResponse.json(
      { error: 'Invalid tokenOut format' },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const cacheKey = getCacheKey(tokenIn, tokenOut, amount, slippage);
  const cachedResult = getCachedQuote(cacheKey);
  if (cachedResult) {
    return NextResponse.json({ ...cachedResult, cached: true }, { headers: CORS_HEADERS });
  }

  try {
    // ── Attempt 1: OKX Quote (public endpoint, no auth needed) ──────────
    let okxQuote = null;
    try {
      okxQuote = await Promise.race([
        getOkxQuote({
          chain: 'base',
          tokenIn: tokenIn === 'ETH' ? 'ETH' : tokenIn,
          tokenOut,
          amount: amountNum,
          slippage,
          feePercent: 0.3,
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('OKX timeout')), 10000)),
      ]);
    } catch (e) {
      console.error('OKX quote error:', e.message);
    }

    if (okxQuote?.success) {
      const response = {
        success: true,
        amountOut: okxQuote.amountOut,
        priceImpact: okxQuote.priceImpact,
        route: okxQuote.bestRoute?.router || ['OKX Aggregator'],
        bestRoute: okxQuote.bestRoute || null,
        routeComparisons: okxQuote.routeComparisons || [],
        estimatedGas: okxQuote.estimatedGasFee,
        source: 'okx',
        rawQuote: okxQuote.raw,
        timestamp: Date.now(),
      };
      setCachedQuote(cacheKey, response);
      return NextResponse.json(response, { headers: CORS_HEADERS });
    }

    // ── Attempt 2: Uniswap V3 on-chain QuoterV2 (no API key needed) ─────
    console.log('OKX quote failed, using on-chain QuoterV2');

    const tokenInAddress = tokenIn === 'ETH' ? WETH_ADDRESS : tokenIn;
    const amountInWei = BigInt(Math.floor(amountNum * 1e18)).toString();

    let uniswapQuote = null;
    try {
      uniswapQuote = await Promise.race([
        getUniswapQuote({
          tokenIn: tokenInAddress,
          tokenOut,
          amountIn: amountInWei,
          slippage,
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('QuoterV2 timeout')), 12000)),
      ]);
    } catch (e) {
      console.error('QuoterV2 error:', e.message);
    }

    if (uniswapQuote?.success) {
      const response = {
        success: true,
        amountOut: uniswapQuote.amountOut,
        priceImpact: uniswapQuote.priceImpact || 0.3,
        route: ['Uniswap V3'],
        bestRoute: {
          router: '0x2626664c2603336E57B271c5C0b26F421741e481',
          dexName: 'Uniswap V3',
          percent: 100,
        },
        routeComparisons: [{
          dexName: 'Uniswap V3',
          dexLogo: null,
          receiveAmount: uniswapQuote.amountOut,
          tradeFee: amountNum * 0.003,
          routerAddress: '0x2626664c2603336E57B271c5C0b26F421741e481',
          percent: 100,
        }],
        estimatedGas: 0.001,
        source: 'uniswap_onchain',
        rawQuote: uniswapQuote.raw,
        timestamp: Date.now(),
      };
      setCachedQuote(cacheKey, response);
      return NextResponse.json(response, { headers: CORS_HEADERS });
    }

    // ── Attempt 3: DexScreener price fallback ────────────────────────────
    console.warn('QuoterV2 also failed, using DexScreener price fallback');
    try {
      const [ethRes, dexRes] = await Promise.all([
        fetchWithTimeout(
          'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd',
          {},
          5000
        ),
        fetchWithTimeout(
          `https://api.dexscreener.com/latest/dex/tokens/${tokenOut}`,
          {},
          5000
        ),
      ]);

      const ethData = ethRes.ok ? await ethRes.json() : null;
      const ethPrice = ethData?.ethereum?.usd || 3200;

      if (dexRes.ok) {
        const dexData = await dexRes.json();
        const pair = dexData.pairs?.find(p => p.chainId === 'base');

        if (pair?.priceUsd) {
          const tokenPrice = parseFloat(pair.priceUsd);
          const amountOut = (amountNum * ethPrice) / tokenPrice;

          const response = {
            success: true,
            amountOut,
            priceImpact: 0.5,
            route: ['ETH', pair.baseToken?.symbol || 'Unknown'],
            bestRoute: null,
            routeComparisons: [],
            source: 'dexscreener_fallback',
            rawQuote: pair,
            timestamp: Date.now(),
          };
          setCachedQuote(cacheKey, response);
          return NextResponse.json(response, { headers: CORS_HEADERS });
        }
      }
    } catch (e) {
      console.error('DexScreener fallback error:', e.message);
    }

    return NextResponse.json(
      { error: 'Failed to get quote from all sources. Please try again.' },
      { status: 500, headers: CORS_HEADERS }
    );

  } catch (error) {
    console.error('Quote API unhandled error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}