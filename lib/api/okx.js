// lib/api/okx.js
const OKX_API = 'https://www.okx.com/api/v5/dex/aggregator';

// ✅ Fetch dengan timeout — tidak reuse AbortController
async function fetchWithTimeout(url, options = {}, ms = 10000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ms);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`OKX request timeout after ${ms}ms`);
    }
    throw error;
  }
}

export async function getOkxQuote({ chain, tokenIn, tokenOut, amount, slippage, feePercent = 0.3 }) {
  try {
    // ✅ Konversi amount ke wei dengan BigInt (lebih aman)
    const amountInWei = BigInt(Math.floor(amount * 1e18)).toString();
    
    // ✅ Slippage untuk OKX dalam format desimal (0.5% = 0.005)
    const slippageDecimal = (slippage / 100).toString();
    
    const params = new URLSearchParams({
      chainId: chain === 'base' ? '8453' : '501',
      fromTokenAddress: tokenIn === 'ETH' ? '0x4200000000000000000000000000000000000006' : tokenIn,
      toTokenAddress: tokenOut,
      amount: amountInWei,
      slippage: slippageDecimal,
    });
    
    const url = `${OKX_API}/quote?${params}`;
    console.log('OKX Quote URL:', url.substring(0, 200));
    
    const response = await fetchWithTimeout(url, {
      headers: { 'Accept': 'application/json' },
    }, 10000);
    
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
    
    // ✅ Dapatkan desimal token output (default 18 jika tidak ada)
    const toTokenDecimals = parseInt(bestRoute.toToken?.decimal || '18');
    const amountOut = parseFloat(bestRoute.toTokenAmount) / Math.pow(10, toTokenDecimals);
    
    // Build route comparisons for UI
    const routeComparisons = [];
    if (data.data && data.data.length > 0) {
      for (let i = 0; i < Math.min(data.data.length, 3); i++) {
        const route = data.data[i];
        const routeDecimals = parseInt(route.toToken?.decimal || '18');
        routeComparisons.push({
          dexName: route.router || route.dexRouterList?.[0]?.router || `OKX Route ${i + 1}`,
          dexLogo: null,
          receiveAmount: parseFloat(route.toTokenAmount) / Math.pow(10, routeDecimals),
          tradeFee: (amount * feePercent) / 100,
          routerAddress: route.router || '0x2626664c2603336E57B271c5C0b26F421741e481',
          percent: i === 0 ? 100 : 0,
        });
      }
    }
    
    return {
      success: true,
      amountOut: amountOut,
      priceImpact: parseFloat(bestRoute.priceImpactPercentage || bestRoute.priceImpact || 0),
      bestRoute: {
        router: bestRoute.router || bestRoute.dexRouterList?.[0]?.router || 'OKX',
        dexName: 'OKX Aggregator',
        percent: 100,
      },
      routeComparisons: routeComparisons,
      estimatedGasFee: parseFloat(bestRoute.estimateGasFee || bestRoute.gasFee || 0) / 1e18,
      raw: bestRoute,
    };
    
  } catch (error) {
    console.error('OKX quote error:', error.message);
    return null;
  }
}

export async function executeOkxSwap({ chain, tokenIn, tokenOut, amount, slippage, userAddress, feePercent = 0.3 }) {
  try {
    // ✅ Konversi amount ke wei dengan BigInt
    const amountInWei = BigInt(Math.floor(amount * 1e18)).toString();
    
    // ✅ Slippage untuk OKX dalam format desimal
    const slippageDecimal = (slippage / 100).toString();
    
    const params = {
      chainId: chain === 'base' ? '8453' : '501',
      fromTokenAddress: tokenIn === 'ETH' ? '0x4200000000000000000000000000000000000006' : tokenIn,
      toTokenAddress: tokenOut,
      amount: amountInWei,
      slippage: slippageDecimal,
      userWalletAddress: userAddress,
    };
    
    const url = `${OKX_API}/swap`;
    console.log('OKX Execute URL:', url);
    console.log('OKX Execute params:', { 
      ...params, 
      amount: params.amount.substring(0, 10) + '...', 
      slippage: params.slippage 
    });
    
    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(params),
    }, 15000);
    
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
    
    // ✅ Extract transaction data dengan aman
    const tx = swapData.tx || swapData.transaction || {};
    
    return {
      success: true,
      transaction: {
        data: tx.data,
        to: tx.to,
        value: tx.value,
        gas: tx.gas,
        chainId: 8453,
      },
      txHash: swapData.txHash || swapData.hash,
      feeAmount: (amount * feePercent) / 100,
      feeRecipient: '0x462be091Ef7Cfae820bb032a3cf2729fcAaD6e47',
    };
    
  } catch (error) {
    console.error('OKX execute error:', error.message);
    return { success: false, error: error.message };
  }
}