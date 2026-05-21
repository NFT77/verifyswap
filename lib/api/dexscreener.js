// lib/api/dexscreener.js - Base only
const DEXSCREENER_API = 'https://api.dexscreener.com/latest/dex';

/**
 * Get token price and info from DexScreener
 * Supported chain: base
 * @param {string} tokenAddress - Token contract address
 * @param {string} chain - Chain name ('base')
 * @returns {Promise<Object|null>} Token price data
 */
export async function getTokenPrice(tokenAddress, chain = 'base') {
  if (!tokenAddress) {
    console.error('DexScreener error: Missing tokenAddress');
    return null;
  }

  // Hanya support Base
  if (chain !== 'base') {
    console.error(`DexScreener: Chain ${chain} not supported. Only base is supported.`);
    return null;
  }

  try {
    const response = await fetch(`${DEXSCREENER_API}/tokens/${tokenAddress}`);
    if (!response.ok) return null;

    const data = await response.json();
    if (!data?.pairs?.length) return null;

    // Find pair on Base chain
    const pair = data.pairs.find(p => p.chainId?.toLowerCase() === 'base') || data.pairs[0];

    if (!pair) return null;

    return {
      priceUSD: parseFloat(pair.priceUsd || 0),
      priceNative: parseFloat(pair.priceNative || 0),
      liquidityUSD: parseFloat(pair.liquidity?.usd || 0),
      volume24h: parseFloat(pair.volume?.h24 || 0),
      volume24hNative: parseFloat(pair.volume?.h24 || 0),
      priceChange24h: parseFloat(pair.priceChange?.h24 || 0),
      priceChange5m: parseFloat(pair.priceChange?.m5 || 0),
      priceChange1h: parseFloat(pair.priceChange?.h1 || 0),
      priceChange6h: parseFloat(pair.priceChange?.h6 || 0),
      symbol: pair.baseToken?.symbol,
      name: pair.baseToken?.name,
      address: pair.baseToken?.address,
      chainId: pair.chainId,
      dexId: pair.dexId,
      pairAddress: pair.pairAddress,
      fdv: parseFloat(pair.fdv || 0),
      marketCap: parseFloat(pair.marketCap || 0),
      url: pair.url,
    };
  } catch (error) {
    console.error('DexScreener error:', error.message);
    return null;
  }
}

/**
 * Search token by symbol on Base
 * @param {string} symbol - Token symbol
 * @param {string} chain - Chain name ('base')
 * @returns {Promise<Array>} List of matching tokens
 */
export async function searchTokenBySymbol(symbol, chain = 'base') {
  if (!symbol) return [];

  // Hanya support Base
  if (chain !== 'base') {
    console.error(`DexScreener: Chain ${chain} not supported. Only base is supported.`);
    return [];
  }

  try {
    const response = await fetch(`${DEXSCREENER_API}/search?q=${encodeURIComponent(symbol)}`);
    if (!response.ok) return [];

    const data = await response.json();
    if (!data?.pairs) return [];

    const pairs = data.pairs.filter(p => p.chainId?.toLowerCase() === 'base');

    // Remove duplicates by token address
    const uniqueTokens = new Map();
    for (const pair of pairs) {
      const tokenAddress = pair.baseToken?.address;
      if (tokenAddress && !uniqueTokens.has(tokenAddress)) {
        uniqueTokens.set(tokenAddress, {
          address: tokenAddress,
          symbol: pair.baseToken?.symbol,
          name: pair.baseToken?.name,
          priceUSD: parseFloat(pair.priceUsd || 0),
          priceChange24h: parseFloat(pair.priceChange?.h24 || 0),
          liquidityUSD: parseFloat(pair.liquidity?.usd || 0),
          volume24h: parseFloat(pair.volume?.h24 || 0),
          chainId: pair.chainId,
          dexId: pair.dexId,
        });
      }
    }

    return Array.from(uniqueTokens.values());
  } catch (error) {
    console.error('DexScreener search error:', error.message);
    return [];
  }
}

/**
 * Get multiple token prices at once
 * @param {string[]} tokenAddresses - Array of token addresses
 * @returns {Promise<Array>} Array of token price data
 */
export async function getMultipleTokenPrices(tokenAddresses) {
  if (!tokenAddresses || tokenAddresses.length === 0) return [];

  const results = [];
  for (const address of tokenAddresses) {
    const price = await getTokenPrice(address);
    if (price) results.push(price);
    // Add small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  return results;
}

/**
 * Get trending tokens on Base
 * @param {string} chain - Chain name ('base')
 * @returns {Promise<Array>} List of trending tokens
 */
export async function getTrendingTokens(chain = 'base') {
  // Hanya support Base
  const targetChain = chain === 'base' ? 'base' : 'base';
  
  try {
    const url = `${DEXSCREENER_API}/trending?chain=${targetChain}`;
    const response = await fetch(url);
    if (!response.ok) return [];

    const data = await response.json();
    if (!data?.pairs) return [];

    return data.pairs.slice(0, 20).map(pair => ({
      address: pair.baseToken?.address,
      symbol: pair.baseToken?.symbol,
      name: pair.baseToken?.name,
      priceUSD: parseFloat(pair.priceUsd || 0),
      priceChange24h: parseFloat(pair.priceChange?.h24 || 0),
      liquidityUSD: parseFloat(pair.liquidity?.usd || 0),
      volume24h: parseFloat(pair.volume?.h24 || 0),
      chainId: pair.chainId,
      dexId: pair.dexId,
      url: pair.url,
    }));
  } catch (error) {
    console.error('DexScreener trending error:', error.message);
    return [];
  }
}