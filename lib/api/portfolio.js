// lib/api/portfolio.js

/**
 * Get wallet portfolio by calling the internal API route
 * @param {string} address - Wallet address
 * @param {string} chain - Chain name ('base' or 'solana')
 * @returns {Promise<Object|null>} Portfolio data
 */
export async function getWalletPortfolio(address, chain = 'base') {
  if (!address) {
    console.warn('Portfolio: No address provided');
    return null;
  }

  try {
    const response = await fetch(`/api/portfolio?address=${encodeURIComponent(address)}&chain=${chain}`);
    
    if (!response.ok) {
      console.error(`Portfolio API error: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Portfolio API error:', error.message);
    return null;
  }
}

/**
 * Get wallet portfolio directly from blockchain (fallback if API fails)
 * @param {string} address - Wallet address
 * @param {string} chain - Chain name ('base' or 'solana')
 * @returns {Promise<Object|null>} Portfolio data
 */
export async function getWalletPortfolioDirect(address, chain = 'base') {
  if (!address) return null;

  try {
    let balance = null;
    let tokens = [];

    if (chain === 'base') {
      // Fetch ETH balance via public RPC
      const ethResponse = await fetch('https://mainnet.base.org', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_getBalance',
          params: [address, 'latest'],
          id: 1,
        }),
      });

      if (ethResponse.ok) {
        const ethData = await ethResponse.json();
        const ethBalance = parseInt(ethData.result, 16) / 1e18;
        balance = {
          formatted: ethBalance.toFixed(4),
          symbol: 'ETH',
          value: ethBalance * 3200, // approximate ETH price
        };
      }

      // For tokens, would need additional API calls
      // This is a simplified version

    } else if (chain === 'solana') {
      // Fetch SOL balance via public RPC
      const solResponse = await fetch('https://api.mainnet-beta.solana.com', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'getBalance',
          params: [address],
          id: 1,
        }),
      });

      if (solResponse.ok) {
        const solData = await solResponse.json();
        const solBalance = (solData.result?.value || 0) / 1e9;
        balance = {
          formatted: solBalance.toFixed(4),
          symbol: 'SOL',
          value: solBalance * 200, // approximate SOL price
        };
      }
    }

    return { balance, tokens };
  } catch (error) {
    console.error('Portfolio direct error:', error.message);
    return null;
  }
}

/**
 * Get total portfolio value in USD
 * @param {string} address - Wallet address
 * @param {string} chain - Chain name
 * @returns {Promise<number>} Total value in USD
 */
export async function getTotalPortfolioValue(address, chain = 'base') {
  if (!address) return 0;

  try {
    const portfolio = await getWalletPortfolio(address, chain);
    if (!portfolio) return 0;
    
    let total = portfolio.balance?.value || 0;
    
    if (portfolio.tokens && Array.isArray(portfolio.tokens)) {
      for (const token of portfolio.tokens) {
        if (token.priceUSD) {
          total += parseFloat(token.balance) * token.priceUSD;
        }
      }
    }
    
    return total;
  } catch (error) {
    console.error('Portfolio total value error:', error.message);
    return 0;
  }
}

/**
 * Get portfolio summary (total value and change)
 * @param {string} address - Wallet address
 * @param {string} chain - Chain name
 * @returns {Promise<Object>} Summary data
 */
export async function getPortfolioSummary(address, chain = 'base') {
  if (!address) {
    return { totalValue: 0, tokenCount: 0, change24h: 0 };
  }

  try {
    const portfolio = await getWalletPortfolio(address, chain);
    if (!portfolio) {
      return { totalValue: 0, tokenCount: 0, change24h: 0 };
    }
    
    let totalValue = portfolio.balance?.value || 0;
    const tokenCount = portfolio.tokens?.length || 0;
    
    for (const token of portfolio.tokens || []) {
      if (token.priceUSD) {
        totalValue += parseFloat(token.balance) * token.priceUSD;
      }
    }
    
    return {
      totalValue: totalValue,
      tokenCount: tokenCount,
      formattedValue: totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    };
  } catch (error) {
    console.error('Portfolio summary error:', error.message);
    return { totalValue: 0, tokenCount: 0, change24h: 0 };
  }
}