// lib/api/coinmarketcap.js
const CMC_API_KEY = process.env.COINMARKETCAP_API_KEY;
const CMC_API = 'https://pro-api.coinmarketcap.com/v1';

// Chain ID mapping untuk CoinMarketCap
const CHAIN_IDS = {
  base: 'base',
  ethereum: 'ethereum',
  bsc: 'binance-smart-chain',
  polygon: 'polygon',
  arbitrum: 'arbitrum',
  optimism: 'optimism',
  solana: 'solana',
};

/**
 * Search token on CoinMarketCap by contract address
 * @param {string} tokenAddress - Token contract address
 * @param {string} chain - Chain name
 * @returns {Promise<Object|null>} Token data with logo
 */
export async function searchTokenOnCMC(tokenAddress, chain = 'base') {
  if (!CMC_API_KEY) {
    console.warn('COINMARKETCAP_API_KEY not set');
    return null;
  }

  if (!tokenAddress) {
    console.warn('CoinMarketCap: No token address provided');
    return null;
  }

  try {
    const url = `${CMC_API}/cryptocurrency/info?address=${tokenAddress}`;
    console.log(`Fetching CoinMarketCap: ${url}`);
    
    const response = await fetch(url, {
      headers: {
        'X-CMC_PRO_API_KEY': CMC_API_KEY,
        'Accept': 'application/json',
      },
    });
    
    if (!response.ok) {
      console.error(`CoinMarketCap API error: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    const tokenData = Object.values(data.data || {})[0];
    
    if (!tokenData) return null;
    
    return {
      logo: tokenData.logo || null,
      symbol: tokenData.symbol?.toUpperCase() || null,
      name: tokenData.name || null,
      category: tokenData.category || null,
      description: tokenData.description || null,
      platform: tokenData.platform?.name || null,
      contractAddress: tokenData.contract_address?.[0] || null,
    };
  } catch (error) {
    console.error('CoinMarketCap error:', error.message);
    return null;
  }
}

/**
 * Get token quote (price, volume, market cap) by symbol
 * @param {string} tokenSymbol - Token symbol
 * @returns {Promise<Object|null>} Quote data
 */
export async function getTokenQuoteCMC(tokenSymbol) {
  if (!CMC_API_KEY) {
    console.warn('COINMARKETCAP_API_KEY not set');
    return null;
  }

  if (!tokenSymbol) {
    console.warn('CoinMarketCap: No token symbol provided');
    return null;
  }

  try {
    const url = `${CMC_API}/cryptocurrency/quotes/latest?symbol=${encodeURIComponent(tokenSymbol)}`;
    console.log(`Fetching CoinMarketCap quote: ${url}`);
    
    const response = await fetch(url, {
      headers: {
        'X-CMC_PRO_API_KEY': CMC_API_KEY,
        'Accept': 'application/json',
      },
    });
    
    if (!response.ok) {
      console.error(`CoinMarketCap quote API error: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    const quote = Object.values(data.data || {})[0];
    
    if (!quote) return null;
    
    return {
      priceUSD: quote.quote?.USD?.price || 0,
      volume24h: quote.quote?.USD?.volume_24h || 0,
      marketCap: quote.quote?.USD?.market_cap || 0,
      percentChange24h: quote.quote?.USD?.percent_change_24h || 0,
      percentChange7d: quote.quote?.USD?.percent_change_7d || 0,
      circulatingSupply: quote.circulating_supply || 0,
      totalSupply: quote.total_supply || 0,
      maxSupply: quote.max_supply || 0,
    };
  } catch (error) {
    console.error('CoinMarketCap quote error:', error.message);
    return null;
  }
}

/**
 * Search cryptocurrency by symbol (multiple results)
 * @param {string} symbol - Token symbol
 * @param {number} limit - Max number of results
 * @returns {Promise<Array>} List of matching cryptocurrencies
 */
export async function searchCryptocurrency(symbol, limit = 10) {
  if (!CMC_API_KEY) return [];
  if (!symbol) return [];

  try {
    const url = `${CMC_API}/cryptocurrency/map?symbol=${encodeURIComponent(symbol)}&limit=${limit}`;
    const response = await fetch(url, {
      headers: {
        'X-CMC_PRO_API_KEY': CMC_API_KEY,
        'Accept': 'application/json',
      },
    });
    
    if (!response.ok) return [];
    
    const data = await response.json();
    return data.data?.map(crypto => ({
      id: crypto.id,
      symbol: crypto.symbol?.toUpperCase(),
      name: crypto.name,
      rank: crypto.rank,
      slug: crypto.slug,
    })) || [];
  } catch (error) {
    console.error('CoinMarketCap search error:', error.message);
    return [];
  }
}