// lib/api/moralis.js
const MORALIS_API_KEY = process.env.MORALIS_API_KEY;
const MORALIS_API = 'https://deep-index.moralis.io/api/v2';

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

// ✅ FIXED: all Moralis fetches now use timeout (was missing before)
async function fetchWithTimeout(url, options = {}, ms = 8000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ms);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') throw new Error(`Moralis timeout after ${ms}ms`);
    throw error;
  }
}

export async function getTokenMetadataMoralis(tokenAddress, chain = 'base') {
  if (!MORALIS_API_KEY) {
    console.warn('MORALIS_API_KEY not set');
    return null;
  }
  if (!tokenAddress) return null;

  try {
    const chainName = CHAIN_MAP[chain] || 'base';
    const response = await fetchWithTimeout(
      `${MORALIS_API}/erc20/metadata?chain=${chainName}&addresses=${tokenAddress}`,
      {
        headers: {
          'X-API-Key': MORALIS_API_KEY,
          'Accept': 'application/json',
        },
      },
      8000
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
      decimals: parseInt(token.decimals) || 18,
      logo: token.logo || null,
      totalSupply: token.total_supply || null,
      address: token.token_address || tokenAddress,
    };
  } catch (error) {
    console.error('Moralis error:', error.message);
    return null;
  }
}

export async function getWalletBalancesMoralis(walletAddress, chain = 'base') {
  if (!MORALIS_API_KEY) return null;
  if (!walletAddress) return null;

  try {
    const chainName = CHAIN_MAP[chain] || 'base';
    const response = await fetchWithTimeout(
      `${MORALIS_API}/${walletAddress}/erc20?chain=${chainName}`,
      {
        headers: {
          'X-API-Key': MORALIS_API_KEY,
          'Accept': 'application/json',
        },
      },
      10000
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
      decimals: parseInt(token.decimals) || 18,
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

export async function getWalletNativeBalance(walletAddress, chain = 'base') {
  if (!MORALIS_API_KEY) return null;
  if (!walletAddress) return null;

  try {
    const chainName = CHAIN_MAP[chain] || 'base';
    const response = await fetchWithTimeout(
      `${MORALIS_API}/${walletAddress}/balance?chain=${chainName}`,
      {
        headers: {
          'X-API-Key': MORALIS_API_KEY,
          'Accept': 'application/json',
        },
      },
      8000
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

export async function getWalletNFTs(walletAddress, chain = 'base') {
  if (!MORALIS_API_KEY) return null;
  if (!walletAddress) return null;

  try {
    const chainName = CHAIN_MAP[chain] || 'base';
    const response = await fetchWithTimeout(
      `${MORALIS_API}/${walletAddress}/nft?chain=${chainName}&limit=50`,
      {
        headers: {
          'X-API-Key': MORALIS_API_KEY,
          'Accept': 'application/json',
        },
      },
      10000
    );

    if (!response.ok) return null;

    const data = await response.json();
    if (!data?.result) return [];

    return data.result.map(nft => ({
      address: nft.token_address,
      tokenId: nft.token_id,
      name: nft.name,
      contractType: nft.contract_type,
      metadata: (() => {
        try { return nft.metadata ? JSON.parse(nft.metadata) : null; }
        catch { return null; }
      })(),
      image: null,
    }));
  } catch (error) {
    console.error('Moralis NFTs error:', error.message);
    return null;
  }
}

export { CHAIN_MAP };