// lib/api/clanker.js
const CLANKER_API_URL = 'https://clanker.world/api';

/**
 * Search token by address or symbol (Base only)
 * @param {string} query - Token address or symbol
 * @param {string} chain - Chain name (only 'base' supported)
 * @returns {Promise<Object|null>} Token data
 */
export async function searchToken(query, chain = 'base') {
  if (chain !== 'base') return null;
  
  if (!query) return null;
  
  try {
    const response = await fetch(`${CLANKER_API_URL}/search-creator?q=${encodeURIComponent(query)}&trustedOnly=false`);
    if (!response.ok) return null;
    
    const data = await response.json();
    const token = data.tokens?.find(t => 
      t.address?.toLowerCase() === query.toLowerCase() ||
      t.symbol?.toLowerCase() === query.toLowerCase()
    );
    
    if (token) {
      return {
        address: token.address,
        symbol: token.symbol,
        name: token.name,
        creatorFid: token.social_context?.id,
        creatorUsername: token.social_context?.username,
        logo: token.image || null,
        chain: 'base',
        createdAt: token.createdAt,
        twitter: token.twitter,
        website: token.website,
      };
    }
    
    return null;
  } catch (error) {
    console.error('Clanker search error:', error.message);
    return null;
  }
}

/**
 * Get detailed token info by address
 * @param {string} tokenAddress - Token contract address
 * @returns {Promise<Object|null>} Token details
 */
export async function getTokenInfo(tokenAddress) {
  if (!tokenAddress) return null;
  
  try {
    const response = await fetch(`${CLANKER_API_URL}/token/${tokenAddress}`);
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error('Clanker token info error:', error.message);
    return null;
  }
}

/**
 * Get tokens by creator FID or username
 * @param {string} creatorQuery - Creator FID or username
 * @returns {Promise<Array>} List of tokens
 */
export async function getTokensByCreator(creatorQuery) {
  if (!creatorQuery) return [];
  
  try {
    const response = await fetch(`${CLANKER_API_URL}/search-creator?q=${encodeURIComponent(creatorQuery)}&trustedOnly=false`);
    if (!response.ok) return [];
    
    const data = await response.json();
    return data.tokens || [];
  } catch (error) {
    console.error('Clanker tokens by creator error:', error.message);
    return [];
  }
}

/**
 * Get trending tokens on Clanker
 * @param {number} limit - Number of tokens to return
 * @returns {Promise<Array>} List of trending tokens
 */
export async function getTrendingTokens(limit = 10) {
  try {
    const response = await fetch(`${CLANKER_API_URL}/trending?limit=${limit}`);
    if (!response.ok) return [];
    
    const data = await response.json();
    return data.tokens || [];
  } catch (error) {
    console.error('Clanker trending error:', error.message);
    return [];
  }
}