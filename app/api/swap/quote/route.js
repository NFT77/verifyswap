// app/api/swap/quote/route.js
import { NextResponse } from 'next/server';
import { getOkxQuote } from '@/lib/api/okx';
import { getQuote as getUniswapQuote } from '@/lib/api/uniswap';

// Simple in-memory cache for quotes (TTL: 2 seconds)
const quoteCache = new Map();
const CACHE_TTL = 2 * 1000; // 2 seconds

function getCacheKey(tokenIn, tokenOut, amount, slippage) {
  return `base:${tokenIn}:${tokenOut}:${amount}:${slippage}`;
}

function getCachedQuote(key) {
  const cached = quoteCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  return null;
}

function setCachedQuote(key, data) {
  quoteCache.set(key, { data, timestamp: Date.now() });
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const chain = searchParams.get('chain');
  const tokenIn = searchParams.get('tokenIn');
  const tokenOut = searchParams.get('tokenOut');
  const amount = searchParams.get('amount');
  const slippage = parseFloat(searchParams.get('slippage') || '0.5');

  // Validasi parameter wajib
  if (!chain || !tokenOut || !amount) {
    return NextResponse.json(
      { error: 'Missing parameters: chain, tokenOut, amount are required' },
      { status: 400 }
    );
  }

  // Hanya support Base
  if (chain !== 'base') {
    return NextResponse.json(
      { error: `Unsupported chain: ${chain}. Only base is supported` },
      { status: 400 }
    );
  }

  // Validasi amount harus angka positif
  const amountNum = parseFloat(amount);
  if (isNaN(amountNum) || amountNum <= 0) {
    return NextResponse.json(
      { error: 'Invalid amount: must be a positive number' },
      { status: 400 }
    );
  }

  // Validasi slippage
  if (isNaN(slippage) || slippage < 0 || slippage > 50) {
    return NextResponse.json(
      { error: 'Invalid slippage: must be between 0 and 50' },
      { status: 400 }
    );
  }

  // Check cache (2 seconds TTL for price sensitive data)
  const cacheKey = getCacheKey(tokenIn, tokenOut, amount, slippage);
  const cachedResult = getCachedQuote(cacheKey);
  if (cachedResult) {
    return NextResponse.json(cachedResult);
  }

  try {
    // Validate token addresses for Base
    if (!tokenIn || (!tokenIn.startsWith('0x') && tokenIn !== 'ETH')) {
      return NextResponse.json(
        { error: 'Invalid tokenIn format for Base chain' },
        { status: 400 }
      );
    }
    if (!tokenOut.startsWith('0x')) {
      return NextResponse.json(
        { error: 'Invalid tokenOut format for Base chain' },
        { status: 400 }
      );
    }

    // ========== ATTEMPT 1: OKX DEX Aggregator ==========
    const okxQuote = await getOkxQuote({
      chain: 'base',
      tokenIn: tokenIn === 'ETH' ? 'ETH' : tokenIn,
      tokenOut: tokenOut,
      amount: amountNum,
      slippage,
      feePercent: 0.3,
    });

    if (okxQuote && okxQuote.success) {
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
      return NextResponse.json(response);
    }

    // ========== ATTEMPT 2: Uniswap V3 Direct ==========
    console.log('OKX quote failed, falling back to Uniswap V3');
    
    const tokenInAddress = tokenIn === 'ETH' 
      ? '0x4200000000000000000000000000000000000006' // WETH
      : tokenIn;
    const amountInWei = BigInt(Math.floor(amountNum * 1e18)).toString();
    
    const uniswapQuote = await getUniswapQuote({
      tokenIn: tokenInAddress,
      tokenOut: tokenOut,
      amountIn: amountInWei,
      slippage: slippage,
    });

    if (uniswapQuote && uniswapQuote.success) {
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
        routeComparisons: [
          {
            dexName: 'Uniswap V3',
            dexLogo: null,
            receiveAmount: uniswapQuote.amountOut,
            tradeFee: amountNum * 0.003,
            routerAddress: '0x2626664c2603336E57B271c5C0b26F421741e481',
            percent: 100,
          }
        ],
        estimatedGas: uniswapQuote.estimatedGasUsed ? parseFloat(uniswapQuote.estimatedGasUsed) / 1e18 : 0.001,
        source: 'uniswap',
        rawQuote: uniswapQuote.raw,
        timestamp: Date.now(),
      };
      
      setCachedQuote(cacheKey, response);
      return NextResponse.json(response);
    }

    // ========== ATTEMPT 3: DexScreener Fallback ==========
    console.warn('Uniswap also failed, falling back to DexScreener');
    try {
      // Get ETH price from CoinGecko
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const ethPriceRes = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd', {
        signal: controller.signal
      });
      const ethPriceData = await ethPriceRes.json();
      const ethPrice = ethPriceData.ethereum?.usd || 3200;
      
      clearTimeout(timeoutId);
      
      const dexRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenOut}`, {
        signal: controller.signal
      });
      
      if (dexRes.ok) {
        const dexData = await dexRes.json();
        const pair = dexData.pairs?.find(p => p.chainId === 'base');
        
        if (pair && pair.priceUsd) {
          const tokenPrice = parseFloat(pair.priceUsd);
          const amountOut = (amountNum * ethPrice) / tokenPrice;
          
          const response = {
            success: true,
            amountOut: amountOut,
            priceImpact: 0.5,
            route: ['ETH', pair.baseToken?.symbol],
            bestRoute: null,
            routeComparisons: [],
            source: 'dexscreener_fallback',
            rawQuote: pair,
            timestamp: Date.now(),
          };
          
          setCachedQuote(cacheKey, response);
          return NextResponse.json(response);
        }
      }
    } catch (dexError) {
      console.error('DexScreener fallback error:', dexError);
    }

    return NextResponse.json(
      { error: 'Failed to get quote from OKX, Uniswap, and fallback sources' },
      { status: 500 }
    );

  } catch (error) {
    console.error('Quote API error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}