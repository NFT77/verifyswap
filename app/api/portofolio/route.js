// app/api/portfolio/route.js
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

const cache = new Map();
const CACHE_TTL = 30 * 1000;

// ✅ FIXED: all external fetch calls now use timeout — was missing before
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

async function fetchBaseTokens(address) {
  try {
    const response = await fetchWithTimeout(
      `https://api.blockscout.com/base/api/v2/addresses/${address}/tokens?type=ERC-20`,
      { headers: { 'Accept': 'application/json' } },
      10000
    );

    if (!response.ok) return [];

    const data = await response.json();
    const tokenItems = data.items || [];

    return tokenItems
      .filter(t => {
        const dec = parseInt(t.token?.decimals) || 18;
        const balanceNum = parseFloat(t.balance) / Math.pow(10, dec);
        return balanceNum > 0;
      })
      .map(t => {
        const dec = parseInt(t.token?.decimals) || 18;
        const balance = parseFloat(t.balance) / Math.pow(10, dec);
        const priceUSD = parseFloat(t.token?.exchange_rate) || 0;
        return {
          address: t.token?.contract_address,
          symbol: t.token?.symbol || 'Unknown',
          name: t.token?.name || t.token?.symbol || 'Token',
          balance: balance.toFixed(6),
          decimals: dec,
          priceUSD,
          valueUSD: (balance * priceUSD).toFixed(2),
          logo: t.token?.icon_url || t.token?.logo || null,
        };
      });
  } catch (error) {
    console.error('Blockscout error:', error.message);
    return [];
  }
}

async function fetchBaseBalance(address) {
  // Fetch ETH balance and price in parallel
  const [rpcResult, priceResult] = await Promise.allSettled([
    fetchWithTimeout(
      'https://mainnet.base.org',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_getBalance',
          params: [address, 'latest'],
          id: 1,
        }),
      },
      8000
    ),
    fetchWithTimeout(
      'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd',
      { headers: { 'Accept': 'application/json' } },
      6000
    ),
  ]);

  let ethBalance = 0;
  if (rpcResult.status === 'fulfilled' && rpcResult.value?.ok) {
    const data = await rpcResult.value.json();
    ethBalance = parseInt(data.result, 16) / 1e18;
  }

  let ethPrice = 3200;
  if (priceResult.status === 'fulfilled' && priceResult.value?.ok) {
    const priceData = await priceResult.value.json();
    ethPrice = priceData.ethereum?.usd || 3200;
  }

  return {
    formatted: ethBalance.toFixed(4),
    symbol: 'ETH',
    value: ethBalance * ethPrice,
    priceUSD: ethPrice,
  };
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get('address');
  const chain = searchParams.get('chain') || 'base';

  if (!address) {
    return NextResponse.json({ error: 'Address required' }, { status: 400, headers: CORS_HEADERS });
  }

  if (chain !== 'base') {
    return NextResponse.json(
      { error: `Unsupported chain: ${chain}. Only base is supported` },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return NextResponse.json(
      { error: 'Invalid EVM address format' },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  // Check cache
  const cacheKey = `base:${address.toLowerCase()}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return NextResponse.json(cached.data, { headers: CORS_HEADERS });
  }

  try {
    const [nativeBalance, tokenList] = await Promise.all([
      fetchBaseBalance(address),
      fetchBaseTokens(address),
    ]);

    const totalValue =
      (nativeBalance?.value || 0) +
      tokenList.reduce((sum, t) => sum + parseFloat(t.valueUSD || 0), 0);

    const responseData = {
      address,
      chain: 'base',
      balance: nativeBalance,
      tokens: tokenList,
      totalValue: totalValue.toFixed(2),
      tokenCount: tokenList.length,
      timestamp: Date.now(),
    };

    // ✅ FIXED: cap cache size to avoid memory leak
    if (cache.size > 500) {
      const oldestKey = cache.keys().next().value;
      cache.delete(oldestKey);
    }
    cache.set(cacheKey, { data: responseData, timestamp: Date.now() });

    return NextResponse.json(responseData, { headers: CORS_HEADERS });

  } catch (error) {
    console.error('Portfolio error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch portfolio', balance: null, tokens: [] },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}