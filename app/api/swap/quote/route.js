// app/api/swap/quote/route.js
// Powered by 0x API v2 — OKX and Uniswap removed entirely

import { NextResponse } from 'next/server';
import { getZeroxPrice, getTokenDecimals } from '@/lib/api/zerox';

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
const CACHE_TTL = 5000; // 5 seconds

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

const WETH_ADDRESS = '0x4200000000000000000000000000000000000006';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const chain = searchParams.get('chain');
  const tokenIn = searchParams.get('tokenIn');
  const tokenOut = searchParams.get('tokenOut');
  const amount = searchParams.get('amount');
  const slippage = parseFloat(searchParams.get('slippage') || '0.5');
  const taker = searchParams.get('taker') || undefined;

  if (!chain || !tokenOut || !amount) {
    return NextResponse.json(
      { error: 'Missing parameters: chain, tokenOut, amount required' },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  if (chain !== 'base') {
    return NextResponse.json(
      { error: 'Only base chain is supported' },
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
    return NextResponse.json({ error: 'Invalid tokenIn' }, { status: 400, headers: CORS_HEADERS });
  }

  if (!tokenOut.startsWith('0x')) {
    return NextResponse.json({ error: 'Invalid tokenOut' }, { status: 400, headers: CORS_HEADERS });
  }

  // Resolve ETH → WETH for 0x API
  const resolvedTokenIn = tokenIn === 'ETH' ? WETH_ADDRESS : tokenIn;

  const cacheKey = getCacheKey(resolvedTokenIn, tokenOut, amount, slippage);
  const cached = getCachedQuote(cacheKey);
  if (cached) {
    return NextResponse.json({ ...cached, cached: true }, { headers: CORS_HEADERS });
  }

  try {
    const quote = await getZeroxPrice({
      tokenIn: resolvedTokenIn,
      tokenOut,
      amount: amountNum,
      slippage,
      taker,
    });

    if (!quote || !quote.success) {
      return NextResponse.json(
        { error: '0x API failed to return a quote. Please try again.' },
        { status: 500, headers: CORS_HEADERS }
      );
    }

    const response = {
      success: true,
      amountOut: quote.buyAmount,
      amountOutRaw: quote.buyAmountRaw,
      outDecimals: quote.outDecimals,
      priceImpact: 0,
      route: ['0x Aggregator'],
      bestRoute: {
        router: '0x',
        dexName: '0x Aggregator',
        percent: 100,
      },
      routeComparisons: [{
        dexName: '0x Aggregator',
        dexLogo: null,
        receiveAmount: quote.buyAmount,
        tradeFee: amountNum * 0.003,
        routerAddress: '0x',
        percent: 100,
      }],
      estimatedGas: quote.estimatedGas,
      source: '0x',
      fees: quote.fees,
      timestamp: Date.now(),
    };

    setCachedQuote(cacheKey, response);
    return NextResponse.json(response, { headers: CORS_HEADERS });

  } catch (error) {
    console.error('Quote route error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}