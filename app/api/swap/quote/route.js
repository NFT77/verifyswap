// 0x API Swap Quote Route - Fully working

import { NextResponse } from 'next/server';
import { getZeroxQuote, getZeroxPrice, getTokenDecimals, WETH_ADDRESS } from '@/lib/api/zerox';

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
const CACHE_TTL = 3000; // 3 seconds

function getCacheKey(tokenIn, tokenOut, amount, slippage, taker) {
  return `base:${tokenIn}:${tokenOut}:${amount}:${slippage}:${taker || 'no-taker'}`;
}

function getCachedQuote(key) {
  const cached = quoteCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
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

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const chain = searchParams.get('chain');
  let tokenIn = searchParams.get('tokenIn');
  const tokenOut = searchParams.get('tokenOut');
  const amount = searchParams.get('amount');
  const slippage = parseFloat(searchParams.get('slippage') || '0.5');
  const taker = searchParams.get('taker') || undefined;

  // Validation
  if (!tokenOut || !amount) {
    return NextResponse.json(
      { error: 'Missing parameters: tokenOut, amount required' },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  if (chain !== 'base') {
    return NextResponse.json(
      { error: 'Only Base chain is supported' },
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
      { error: 'Invalid slippage (0-50)' },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  // Convert ETH to WETH for 0x API
  if (tokenIn === 'ETH') {
    tokenIn = WETH_ADDRESS;
  }

  if (!tokenIn || !tokenIn.startsWith('0x')) {
    return NextResponse.json(
      { error: 'Invalid tokenIn address' },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  if (!tokenOut.startsWith('0x')) {
    return NextResponse.json(
      { error: 'Invalid tokenOut address' },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const cacheKey = getCacheKey(tokenIn, tokenOut, amount, slippage, taker);
  const cached = getCachedQuote(cacheKey);
  if (cached) {
    return NextResponse.json({ ...cached, cached: true }, { headers: CORS_HEADERS });
  }

  try {
    // Get quote from 0x
    const quote = await getZeroxQuote({
      tokenIn: tokenIn,
      tokenOut: tokenOut,
      amount: amountNum,
      slippage: slippage,
      taker: taker,
    });

    if (!quote.success) {
      console.error('0x quote failed:', quote.error);
      return NextResponse.json(
        { error: quote.error || 'Failed to get quote from 0x' },
        { status: 500, headers: CORS_HEADERS }
      );
    }

    const response = {
      success: true,
      amountOut: quote.buyAmount,
      amountOutRaw: quote.buyAmountRaw,
      priceImpact: 0,
      route: ['0x Aggregator'],
      bestRoute: {
        router: quote.to || '0x',
        dexName: '0x Aggregator',
        percent: 100,
      },
      routeComparisons: [{
        dexName: '0x Aggregator',
        dexLogo: null,
        receiveAmount: quote.buyAmount,
        tradeFee: amountNum * 0.003,
        routerAddress: quote.to || '0x',
        percent: 100,
      }],
      estimatedGas: quote.estimatedGas,
      source: '0x',
      fees: quote.fees,
      transactionData: {
        to: quote.to,
        data: quote.data,
        value: quote.value,
        gas: quote.estimatedGas,
      },
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