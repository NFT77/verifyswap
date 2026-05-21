// app/api/portfolio/route.js
import { NextResponse } from 'next/server';

// Cache untuk mengurangi panggilan API
const cache = new Map();
const CACHE_TTL = 30 * 1000; // 30 detik

/**
 * Fetch ERC20 tokens from Blockscout API (Base)
 */
async function fetchBaseTokens(address) {
  try {
    const response = await fetch(
      `https://api.blockscout.com/base/api/v2/addresses/${address}/tokens?type=ERC-20`
    );
    
    if (!response.ok) return [];
    
    const data = await response.json();
    const tokenItems = data.items || [];
    
    return tokenItems
      .filter(t => {
        const balanceNum = parseFloat(t.balance) / Math.pow(10, t.token.decimals);
        return balanceNum > 0;
      })
      .map(t => ({
        address: t.token.contract_address,
        symbol: t.token.symbol || 'Unknown',
        name: t.token.name || t.token.symbol || 'Token',
        balance: (parseFloat(t.balance) / Math.pow(10, t.token.decimals)).toFixed(6),
        decimals: t.token.decimals,
        priceUSD: t.token.exchange_rate || 0,
        valueUSD: ((parseFloat(t.balance) / Math.pow(10, t.token.decimals)) * (t.token.exchange_rate || 0)).toFixed(2),
        logo: t.token.logo || null,
      }));
  } catch (error) {
    console.error('Blockscout error:', error);
    return [];
  }
}

/**
 * Fetch ETH balance from RPC
 */
async function fetchBaseBalance(address, rpcUrl = 'https://mainnet.base.org') {
  try {
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_getBalance',
        params: [address, 'latest'],
        id: 1,
      }),
    });
    
    const data = await response.json();
    const ethBalance = parseInt(data.result, 16) / 1e18;
    
    // Fetch real ETH price from CoinGecko
    let ethPrice = 3200; // fallback
    try {
      const priceRes = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');
      const priceData = await priceRes.json();
      ethPrice = priceData.ethereum?.usd || 3200;
    } catch (priceError) {
      console.error('Failed to fetch ETH price:', priceError);
    }
    
    return {
      formatted: ethBalance.toFixed(4),
      symbol: 'ETH',
      value: ethBalance * ethPrice,
    };
  } catch (error) {
    console.error('Base balance error:', error);
    return { formatted: '0', symbol: 'ETH', value: 0 };
  }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get('address');
  const chain = searchParams.get('chain') || 'base';

  if (!address) {
    return NextResponse.json({ error: 'Address required' }, { status: 400 });
  }

  // Hanya support Base
  if (chain !== 'base') {
    return NextResponse.json(
      { error: `Unsupported chain: ${chain}. Only base is supported` },
      { status: 400 }
    );
  }

  // Validate EVM address format
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return NextResponse.json({ error: 'Invalid EVM address format' }, { status: 400 });
  }

  // Check cache
  const cacheKey = `base:${address}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return NextResponse.json(cached.data);
  }

  try {
    const [nativeBalance, tokenList] = await Promise.all([
      fetchBaseBalance(address),
      fetchBaseTokens(address),
    ]);

    // Calculate total value
    const totalValue = (nativeBalance?.value || 0) + tokenList.reduce((sum, t) => sum + parseFloat(t.valueUSD || 0), 0);

    const responseData = {
      address,
      chain: 'base',
      balance: nativeBalance,
      tokens: tokenList,
      totalValue: totalValue.toFixed(2),
      tokenCount: tokenList.length,
      timestamp: Date.now(),
    };

    // Cache response
    cache.set(cacheKey, { data: responseData, timestamp: Date.now() });

    return NextResponse.json(responseData);

  } catch (error) {
    console.error('Portfolio error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch portfolio', balance: null, tokens: [] },
      { status: 500 }
    );
  }
}