// lib/api/coingecko.js - Base only
const COINGECKO_API = 'https://api.coingecko.com/api/v3';

/**
 * Search token on CoinGecko by contract address
 * @param {string} tokenAddress - Token contract address
 * @param {string} chain - Chain name (base)
 * @returns {Promise<Object|null>} Token data with logo
 */
export async function searchTokenOnCoinGecko(tokenAddress, chain = 'base') {
  if (!tokenAddress) {
    console.warn('CoinGecko: No token address provided');
    return null;
  }

  // Hanya support Base
  if (chain !== 'base') {
    console.warn(`CoinGecko: Chain ${chain} not supported. Only base is supported.`);
    return null;
  }

  const platformMap = { base: 'base' };
  const platform = platformMap[chain];
  
  try {
    const url = `${COINGECKO_API}/coins/${platform}/contract/${tokenAddress}`;
    console.log(`Fetching CoinGecko: ${url}`);
    
    const response = await fetch(url);
    
    if (!response.ok) {
      // Fallback: cari berdasarkan symbol
      return await searchBySymbol(tokenAddress);
    }
    
    const data = await response.json();
    
    return {
      logo: data.image?.large || data.image?.small || null,
      symbol: data.symbol?.toUpperCase() || null,
      name: data.name || null,
      marketCap: data.market_data?.market_cap?.usd || 0,
      volume24h: data.market_data?.total_volume?.usd || 0,
      priceUSD: data.market_data?.current_price?.usd || 0,
      priceChange24h: data.market_data?.price_change_percentage_24h || 0,
      marketCapRank: data.market_cap_rank || null,
      totalSupply: data.market_data?.total_supply || null,
      circulatingSupply: data.market_data?.circulating_supply || null,
    };
  } catch (error) {
    console.error('CoinGecko error:', error.message);
    return null;
  }
}

/**
 * Search token by symbol (fallback)
 * @param {string} symbol - Token symbol
 * @returns {Promise<Object|null>} Basic token data
 */
async function searchBySymbol(symbol) {
  if (!symbol) return null;
  
  try {
    const response = await fetch(`${COINGECKO_API}/search?query=${encodeURIComponent(symbol)}`);
    if (!response.ok) return null;
    
    const data = await response.json();
    const coin = data.coins?.[0];
    
    if (!coin) return null;
    
    return {
      logo: coin.thumb || coin.large || null,
      symbol: coin.symbol?.toUpperCase() || symbol.toUpperCase(),
      name: coin.name || null,
      marketCapRank: coin.market_cap_rank || null,
    };
  } catch (error) {
    console.error('CoinGecko search by symbol error:', error.message);
    return null;
  }
}

/**
 * Get trending tokens from CoinGecko
 * @returns {Promise<Array>} List of trending tokens
 */
export async function getTrendingTokens() {
  try {
    const response = await fetch(`${COINGECKO_API}/search/trending`);
    if (!response.ok) return [];
    
    const data = await response.json();
    return data.coins?.map(coin => ({
      symbol: coin.item.symbol?.toUpperCase(),
      name: coin.item.name,
      logo: coin.item.thumb || coin.item.small,
      priceBTC: coin.item.price_btc,
      rank: coin.item.market_cap_rank,
      id: coin.item.id,
    })) || [];
  } catch (error) {
    console.error('CoinGecko trending error:', error.message);
    return [];
  }
}

/**
 * Search token by symbol (returns multiple results)
 * @param {string} symbol - Token symbol
 * @param {number} limit - Max number of results
 * @returns {Promise<Array>} List of matching tokens
 */
export async function searchTokenBySymbol(symbol, limit = 10) {
  if (!symbol) return [];
  
  try {
    const response = await fetch(`${COINGECKO_API}/search?query=${encodeURIComponent(symbol)}`);
    if (!response.ok) return [];
    
    const data = await response.json();
    return data.coins?.slice(0, limit).map(coin => ({
      id: coin.id,
      symbol: coin.symbol?.toUpperCase(),
      name: coin.name,
      logo: coin.thumb || coin.large,
      marketCapRank: coin.market_cap_rank,
    })) || [];
  } catch (error) {
    console.error('CoinGecko search token error:', error.message);
    return [];
  }
}