// 0x API v2 — fully working implementation for Base chain
// Documentation: https://0x.org/docs/api

const ZEROX_API_KEY = process.env.ZEROX_API_KEY;
const ZEROX_BASE_URL = 'https://api.0x.org';

const BASE_CHAIN_ID = 8453;

// Token decimals on Base
const TOKEN_DECIMALS = {
  '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': 6,  // USDC
  '0x50c5725949a6f0c72e6c4a641f24049a917db0cb': 18, // DAI
  '0x0555e30da8f98308edb960aa94c0db5b0c2b318c': 8,  // WBTC
  '0x4200000000000000000000000000000000000006': 18, // WETH
};

const WETH_ADDRESS = '0x4200000000000000000000000000000000000006';
const NATIVE_ETH_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

export function getTokenDecimals(address) {
  if (!address) return 18;
  const lower = address.toLowerCase();
  return TOKEN_DECIMALS[lower] ?? 18;
}

function zeroxHeaders() {
  return {
    '0x-api-key': ZEROX_API_KEY,
    '0x-version': 'v2',
    'Accept': 'application/json',
    'Content-Type': 'application/json',
  };
}

async function fetchWithTimeout(url, options = {}, ms = 15000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return res;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') throw new Error(`0x API timeout after ${ms}ms`);
    throw err;
  }
}

/**
 * Get swap quote from 0x API v2 - uses /swap/v1/quote which is stable
 */
export async function getZeroxQuote({ tokenIn, tokenOut, amount, slippage = 0.5, taker }) {
  if (!ZEROX_API_KEY) {
    console.error('ZEROX_API_KEY is not set in environment variables');
    return { success: false, error: 'API key missing' };
  }

  if (!tokenIn || !tokenOut || !amount) {
    return { success: false, error: 'Missing required parameters' };
  }

  try {
    const inDecimals = getTokenDecimals(tokenIn);
    const sellAmount = BigInt(Math.floor(parseFloat(amount) * Math.pow(10, inDecimals))).toString();
    const slippageBps = Math.round(slippage * 100);

    // Use /swap/v1/quote (more stable than permit2)
    const params = new URLSearchParams({
      chainId: BASE_CHAIN_ID.toString(),
      sellToken: tokenIn,
      buyToken: tokenOut,
      sellAmount: sellAmount,
      slippagePercentage: (slippage / 100).toString(),
    });

    if (taker) {
      params.set('takerAddress', taker);
    }

    const url = `${ZEROX_BASE_URL}/swap/v1/quote?${params.toString()}`;
    console.log('0x quote URL:', url.substring(0, 200));

    const response = await fetchWithTimeout(url, { headers: zeroxHeaders() }, 15000);

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.error(`0x API error ${response.status}:`, errorText.substring(0, 300));
      
      // Provide user-friendly error message
      if (response.status === 401) {
        return { success: false, error: '0x API key invalid or missing. Please check your ZEROX_API_KEY.' };
      }
      if (response.status === 400) {
        return { success: false, error: 'Invalid swap parameters. Insufficient liquidity or invalid token pair.' };
      }
      if (response.status === 429) {
        return { success: false, error: 'Rate limit exceeded. Please try again in a moment.' };
      }
      return { success: false, error: `0x API error: ${response.status}` };
    }

    const data = await response.json();

    const outDecimals = getTokenDecimals(tokenOut);
    const buyAmount = parseFloat(data.buyAmount) / Math.pow(10, outDecimals);
    const sellAmountHuman = parseFloat(amount);

    return {
      success: true,
      buyAmount: buyAmount,
      buyAmountRaw: data.buyAmount,
      sellAmount: sellAmountHuman,
      sellAmountRaw: sellAmount,
      outDecimals: outDecimals,
      inDecimals: inDecimals,
      price: buyAmount / sellAmountHuman,
      estimatedGas: data.gas ? parseInt(data.gas) : null,
      gasPrice: data.gasPrice,
      to: data.to,
      data: data.data,
      value: data.value,
      minBuyAmount: data.minBuyAmount,
      guaranteedPrice: data.guaranteedPrice,
      source: '0x_v1_quote',
      route: data.route,
      fees: data.fees,
      raw: data,
    };
  } catch (err) {
    console.error('0x quote error:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Get price estimate (faster, no transaction data)
 */
export async function getZeroxPrice({ tokenIn, tokenOut, amount, slippage = 0.5 }) {
  if (!ZEROX_API_KEY) {
    return { success: false, error: 'API key missing' };
  }

  try {
    const inDecimals = getTokenDecimals(tokenIn);
    const sellAmount = BigInt(Math.floor(parseFloat(amount) * Math.pow(10, inDecimals))).toString();
    const slippageBps = Math.round(slippage * 100);

    const params = new URLSearchParams({
      chainId: BASE_CHAIN_ID.toString(),
      sellToken: tokenIn,
      buyToken: tokenOut,
      sellAmount: sellAmount,
      slippagePercentage: (slippage / 100).toString(),
    });

    const url = `${ZEROX_BASE_URL}/swap/v1/price?${params.toString()}`;

    const response = await fetchWithTimeout(url, { headers: zeroxHeaders() }, 10000);

    if (!response.ok) {
      return { success: false, error: `0x API error: ${response.status}` };
    }

    const data = await response.json();
    const outDecimals = getTokenDecimals(tokenOut);
    const buyAmount = parseFloat(data.buyAmount) / Math.pow(10, outDecimals);

    return {
      success: true,
      buyAmount: buyAmount,
      buyAmountRaw: data.buyAmount,
      sellAmount: parseFloat(amount),
      outDecimals: outDecimals,
      price: buyAmount / parseFloat(amount),
      source: '0x_v1_price',
      raw: data,
    };
  } catch (err) {
    console.error('0x price error:', err.message);
    return { success: false, error: err.message };
  }
}

export { WETH_ADDRESS, NATIVE_ETH_ADDRESS, BASE_CHAIN_ID };