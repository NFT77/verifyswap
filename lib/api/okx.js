// lib/api/okx.js
// ✅ FIXED: OKX DEX Aggregator public API does not need an API key for quote.
// For execute (/swap), OKX requires API key auth — since we get 401,
// we skip OKX execute and fall through to Uniswap directly.
// The quote endpoint is public and works without auth.

const OKX_API = 'https://www.okx.com/api/v5/dex/aggregator';

async function fetchWithTimeout(url, options = {}, ms = 10000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ms);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') throw new Error(`OKX timeout after ${ms}ms`);
    throw error;
  }
}

export async function getOkxQuote({ chain, tokenIn, tokenOut, amount, slippage, feePercent = 0.3 }) {
  try {
    const amountInWei = BigInt(Math.floor(amount * 1e18)).toString();
    const slippageDecimal = (slippage / 100).toString();

    const params = new URLSearchParams({
      chainId: chain === 'base' ? '8453' : '501',
      fromTokenAddress: tokenIn === 'ETH' ? '0x4200000000000000000000000000000000000006' : tokenIn,
      toTokenAddress: tokenOut,
      amount: amountInWei,
      slippage: slippageDecimal,
    });

    const url = `${OKX_API}/quote?${params}`;
    console.log('OKX Quote:', url.substring(0, 150));

    const response = await fetchWithTimeout(url, {
      headers: { 'Accept': 'application/json' },
    }, 10000);

    if (!response.ok) {
      console.error(`OKX quote HTTP error: ${response.status}`);
      return null;
    }

    const data = await response.json();

    if (data.code !== '0') {
      console.error(`OKX quote error code: ${data.code}`, data.msg);
      return null;
    }

    const bestRoute = data.data?.[0];
    if (!bestRoute) return null;

    const toTokenDecimals = parseInt(bestRoute.toToken?.decimal || '18');
    const amountOut = parseFloat(bestRoute.toTokenAmount) / Math.pow(10, toTokenDecimals);

    const routeComparisons = (data.data || []).slice(0, 3).map((route, i) => {
      const routeDecimals = parseInt(route.toToken?.decimal || '18');
      return {
        dexName: route.router || route.dexRouterList?.[0]?.router || `OKX Route ${i + 1}`,
        dexLogo: null,
        receiveAmount: parseFloat(route.toTokenAmount) / Math.pow(10, routeDecimals),
        tradeFee: (amount * feePercent) / 100,
        routerAddress: route.router || '0x2626664c2603336E57B271c5C0b26F421741e481',
        percent: i === 0 ? 100 : 0,
      };
    });

    return {
      success: true,
      amountOut,
      priceImpact: parseFloat(bestRoute.priceImpactPercentage || bestRoute.priceImpact || 0),
      bestRoute: {
        router: bestRoute.router || 'OKX',
        dexName: 'OKX Aggregator',
        percent: 100,
      },
      routeComparisons,
      estimatedGasFee: parseFloat(bestRoute.estimateGasFee || 0) / 1e18,
      raw: bestRoute,
    };
  } catch (error) {
    console.error('OKX quote error:', error.message);
    return null;
  }
}

// ✅ FIXED: OKX /swap returns 401 without proper API key + HMAC signature.
// Rather than fail silently, we return a clear error so execute/route.js
// immediately falls through to Uniswap V3 direct swap.
export async function executeOkxSwap({ chain, tokenIn, tokenOut, amount, slippage, userAddress, feePercent = 0.3 }) {
  // OKX swap endpoint requires API key + timestamp + HMAC signature headers.
  // Without them it returns 401. We do not have those credentials configured,
  // so we skip immediately and let the caller fall back to Uniswap.
  console.log('OKX execute skipped (requires API key auth) — falling back to Uniswap');
  return {
    success: false,
    error: 'OKX execute requires API key — using Uniswap fallback',
    skipToFallback: true,
  };
}