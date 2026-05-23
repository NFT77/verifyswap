// lib/api/portfolio.js

// ✅ FIXED: all fetch calls now have timeout — was missing entirely before
async function fetchWithTimeout(url, options = {}, ms = 12000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return res;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') throw new Error(`Portfolio fetch timeout`);
    throw err;
  }
}

export async function getWalletPortfolio(address, chain = 'base') {
  if (!address) {
    console.warn('Portfolio: No address provided');
    return null;
  }

  try {
    const response = await fetchWithTimeout(
      `/api/portfolio?address=${encodeURIComponent(address)}&chain=${chain}`,
      {},
      12000
    );

    if (!response.ok) {
      console.error(`Portfolio API error: ${response.status}`);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('Portfolio API error:', error.message);
    return null;
  }
}

export async function getWalletPortfolioDirect(address, chain = 'base') {
  if (!address) return null;

  try {
    let balance = null;

    if (chain === 'base') {
      const ethResponse = await fetchWithTimeout(
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
      );

      if (ethResponse.ok) {
        const ethData = await ethResponse.json();
        const ethBalance = parseInt(ethData.result, 16) / 1e18;
        balance = {
          formatted: ethBalance.toFixed(4),
          symbol: 'ETH',
          value: ethBalance * 3200,
        };
      }
    } else if (chain === 'solana') {
      const solResponse = await fetchWithTimeout(
        'https://api.mainnet-beta.solana.com',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'getBalance',
            params: [address],
            id: 1,
          }),
        },
        8000
      );

      if (solResponse.ok) {
        const solData = await solResponse.json();
        const solBalance = (solData.result?.value || 0) / 1e9;
        balance = {
          formatted: solBalance.toFixed(4),
          symbol: 'SOL',
          value: solBalance * 200,
        };
      }
    }

    return { balance, tokens: [] };
  } catch (error) {
    console.error('Portfolio direct error:', error.message);
    return null;
  }
}

export async function getTotalPortfolioValue(address, chain = 'base') {
  if (!address) return 0;

  try {
    const portfolio = await getWalletPortfolio(address, chain);
    if (!portfolio) return 0;

    let total = portfolio.balance?.value || 0;
    for (const token of portfolio.tokens || []) {
      if (token.priceUSD) {
        total += parseFloat(token.balance) * parseFloat(token.priceUSD);
      }
    }
    return total;
  } catch (error) {
    console.error('Portfolio total value error:', error.message);
    return 0;
  }
}

export async function getPortfolioSummary(address, chain = 'base') {
  if (!address) return { totalValue: 0, tokenCount: 0, change24h: 0 };

  try {
    const portfolio = await getWalletPortfolio(address, chain);
    if (!portfolio) return { totalValue: 0, tokenCount: 0, change24h: 0 };

    let totalValue = portfolio.balance?.value || 0;
    const tokenCount = portfolio.tokens?.length || 0;

    for (const token of portfolio.tokens || []) {
      if (token.priceUSD) {
        totalValue += parseFloat(token.balance) * parseFloat(token.priceUSD);
      }
    }

    return {
      totalValue,
      tokenCount,
      formattedValue: totalValue.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    };
  } catch (error) {
    console.error('Portfolio summary error:', error.message);
    return { totalValue: 0, tokenCount: 0, change24h: 0 };
  }
}