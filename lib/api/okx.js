// lib/api/okx.js
const OKX_API = 'https://www.okx.com/api/v5/dex/aggregator';

// Helper untuk generate signature (jika diperlukan)
function generateSignature(secretKey, timestamp, method, requestPath, body) {
  const message = timestamp + method + requestPath + (body || '');
  const crypto = require('crypto');
  return crypto.createHmac('sha256', secretKey).update(message).digest('base64');
}

export async function getOkxQuote({ chain, tokenIn, tokenOut, amount, slippage, feePercent = 0.3 }) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 detik timeout
    
    const params = new URLSearchParams({
      chainId: chain === 'base' ? '8453' : '501',
      fromTokenAddress: tokenIn === 'ETH' ? '0x4200000000000000000000000000000000000006' : tokenIn,
      toTokenAddress: tokenOut,
      amount: (amount * 1e18).toString(),
      slippage: slippage.toString(),
      userWalletAddress: '0x0000000000000000000000000000000000000000', // quote only
    });
    
    const url = `${OKX_API}/quote?${params}`;
    console.log('OKX Quote URL:', url);
    
    const response = await fetch(url, { 
      signal: controller.signal,
      headers: { 'Accept': 'application/json' }
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      console.error(`OKX API error: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    
    if (data.code !== '0') {
      console.error(`OKX API error code: ${data.code}`, data.msg);
      return null;
    }
    
    const bestRoute = data.data?.[0];
    if (!bestRoute) return null;
    
    const amountOut = parseFloat(bestRoute.toTokenAmount) / 1e18;
    
    // Build route comparisons for UI
    const routeComparisons = [];
    if (data.data && data.data.length > 0) {
      for (let i = 0; i < Math.min(data.data.length, 3); i++) {
        const route = data.data[i];
        routeComparisons.push({
          dexName: route.router || `OKX Route ${i + 1}`,
          dexLogo: null,
          receiveAmount: parseFloat(route.toTokenAmount) / 1e18,
          tradeFee: (amount * feePercent) / 100,
          routerAddress: route.router,
          percent: i === 0 ? 100 : 0,
        });
      }
    }
    
    return {
      success: true,
      amountOut: amountOut,
      priceImpact: parseFloat(bestRoute.priceImpact) || 0,
      bestRoute: {
        router: bestRoute.router,
        dexName: 'OKX Aggregator',
        percent: 100,
      },
      routeComparisons: routeComparisons,
      estimatedGasFee: parseFloat(bestRoute.gasFee) / 1e18,
      raw: bestRoute,
    };
    
  } catch (error) {
    if (error.name === 'AbortError') {
      console.error('OKX API timeout after 10s');
    } else {
      console.error('OKX quote error:', error.message);
    }
    return null;
  }
}

export async function executeOkxSwap({ chain, tokenIn, tokenOut, amount, slippage, userAddress, feePercent = 0.3 }) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 detik timeout
    
    const params = {
      chainId: chain === 'base' ? '8453' : '501',
      fromTokenAddress: tokenIn === 'ETH' ? '0x4200000000000000000000000000000000000006' : tokenIn,
      toTokenAddress: tokenOut,
      amount: (amount * 1e18).toString(),
      slippage: slippage.toString(),
      userWalletAddress: userAddress,
      feePercent: feePercent.toString(),
      feeRecipient: chain === 'base' ? '0x462be091Ef7Cfae820bb032a3cf2729fcAaD6e47' : '63yDDihmcgHYg1bk3a8dEcNrjQqggqwMqw4H1Gnmmdrf',
    };
    
    const url = `${OKX_API}/swap`;
    console.log('OKX Execute URL:', url);
    console.log('OKX Execute params:', { ...params, amount: params.amount, slippage: params.slippage });
    
    const response = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(params),
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      console.error(`OKX API error: ${response.status}`);
      return { success: false, error: `HTTP ${response.status}` };
    }
    
    const data = await response.json();
    
    if (data.code !== '0') {
      console.error(`OKX API error code: ${data.code}`, data.msg);
      return { success: false, error: data.msg || `OKX error: ${data.code}` };
    }
    
    const swapData = data.data?.[0];
    if (!swapData) {
      return { success: false, error: 'No swap data returned' };
    }
    
    return {
      success: true,
      transaction: {
        data: swapData.tx?.data,
        to: swapData.tx?.to,
        value: swapData.tx?.value,
        gas: swapData.tx?.gas,
        chainId: 8453,
      },
      txHash: swapData.txHash,
      feeAmount: (amount * feePercent) / 100,
      feeRecipient: params.feeRecipient,
    };
    
  } catch (error) {
    if (error.name === 'AbortError') {
      console.error('OKX API timeout after 15s');
    } else {
      console.error('OKX execute error:', error.message);
    }
    return { success: false, error: error.message };
  }
}