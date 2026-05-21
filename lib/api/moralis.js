// lib/api/moralis.js
const MORALIS_API_KEY = process.env.MORALIS_API_KEY;
const MORALIS_API = 'https://deep-index.moralis.io/api/v2';

// Chain mapping untuk Moralis
const CHAIN_MAP = {
  base: 'base',
  ethereum: 'eth',
  bsc: 'bsc',
  polygon: 'polygon',
  arbitrum: 'arbitrum',
  optimism: 'optimism',
  avalanche: 'avalanche',
  solana: 'solana',
};

/**
 * Get token metadata from Moralis
 * @param {string} tokenAddress - Token contract address
 * @param {string} chain - Chain name (base, solana, etc.)
 * @returns {Promise<Object|null>} Token metadata
 */
export async function getTokenMetadataMoralis(tokenAddress, chain = 'base') {
  if (!MORALIS_API_KEY) {
    console.warn('MORALIS_API_KEY not set');
    return null;
  }

  if (!tokenAddress) {
    console.warn('Moralis: No token address provided');
    return null;
  }

  try {
    const chainName = CHAIN_MAP[chain] || 'base';
    
    const response = await fetch(
      `${MORALIS_API}/erc20/metadata?chain=${chainName}&addresses=${tokenAddress}`,
      {
        headers: {
          'X-API-Key': MORALIS_API_KEY,
          'Accept': 'application/json',
        },
      }
    );
    
    if (!response.ok) {
      console.error(`Moralis API error: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    const token = data?.[0];
    
    if (!token) return null;
    
    return {
      symbol: token.symbol?.toUpperCase() || null,
      name: token.name || null,
      decimals: token.decimals || 18,
      logo: token.logo || null,
      totalSupply: token.total_supply || null,
      address: token.token_address || tokenAddress,
    };
  } catch (error) {
    console.error('Moralis error:', error.message);
    return null;
  }
}

/**
 * Get wallet token balances from Moralis
 * @param {string} walletAddress - Wallet address
 * @param {string} chain - Chain name
 * @returns {Promise<Array|null>} List of token balances
 */
export async function getWalletBalancesMoralis(walletAddress, chain = 'base') {
  if (!MORALIS_API_KEY) {
    console.warn('MORALIS_API_KEY not set');
    return null;
  }

  if (!walletAddress) {
    console.warn('Moralis: No wallet address provided');
    return null;
  }

  try {
    const chainName = CHAIN_MAP[chain] || 'base';
    
    const response = await fetch(
      `${MORALIS_API}/${walletAddress}/erc20?chain=${chainName}`,
      {
        headers: {
          'X-API-Key': MORALIS_API_KEY,
          'Accept': 'application/json',
        },
      }
    );
    
    if (!response.ok) {
      console.error(`Moralis wallet API error: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    
    if (!data || !Array.isArray(data)) return [];
    
    return data.map(token => ({
      address: token.token_address,
      symbol: token.symbol,
      name: token.name,
      balance: token.balance,
      decimals: token.decimals,
      logo: token.logo || null,
      priceUSD: token.usd_price || 0,
      valueUSD: token.usd_value || 0,
      thumbnail: token.thumbnail || null,
    }));
  } catch (error) {
    console.error('Moralis wallet error:', error.message);
    return null;
  }
}

/**
 * Get wallet native balance (ETH, SOL, etc.)
 * @param {string} walletAddress - Wallet address
 * @param {string} chain - Chain name
 * @returns {Promise<Object|null>} Native balance
 */
export async function getWalletNativeBalance(walletAddress, chain = 'base') {
  if (!MORALIS_API_KEY) return null;
  if (!walletAddress) return null;

  try {
    const chainName = CHAIN_MAP[chain] || 'base';
    
    const response = await fetch(
      `${MORALIS_API}/${walletAddress}/balance?chain=${chainName}`,
      {
        headers: {
          'X-API-Key': MORALIS_API_KEY,
          'Accept': 'application/json',
        },
      }
    );
    
    if (!response.ok) return null;
    
    const data = await response.json();
    
    return {
      balance: data.balance,
      formattedBalance: (parseFloat(data.balance) / 1e18).toFixed(4),
      symbol: chain === 'base' ? 'ETH' : chain === 'solana' ? 'SOL' : 'ETH',
    };
  } catch (error) {
    console.error('Moralis native balance error:', error.message);
    return null;
  }
}

/**
 * Get wallet NFTs from Moralis
 * @param {string} walletAddress - Wallet address
 * @param {string} chain - Chain name
 * @returns {Promise<Array|null>} List of NFTs
 */
export async function getWalletNFTs(walletAddress, chain = 'base') {
  if (!MORALIS_API_KEY) return null;
  if (!walletAddress) return null;

  try {
    const chainName = CHAIN_MAP[chain] || 'base';
    
    const response = await fetch(
      `${MORALIS_API}/${walletAddress}/nft?chain=${chainName}&limit=50`,
      {
        headers: {
          'X-API-Key': MORALIS_API_KEY,
          'Accept': 'application/json',
        },
      }
    );
    
    if (!response.ok) return null;
    
    const data = await response.json();
    
    if (!data?.result) return [];
    
    return data.result.map(nft => ({
      address: nft.token_address,
      tokenId: nft.token_id,
      name: nft.name,
      contractType: nft.contract_type,
      metadata: nft.metadata ? JSON.parse(nft.metadata) : null,
      image: nft.metadata?.image || null,
    }));
  } catch (error) {
    console.error('Moralis NFTs error:', error.message);
    return null;
  }
}

// Export chain map for reference
export { CHAIN_MAP };