// lib/api/zerox.js
// 0x API v2 — replaces OKX and Uniswap entirely
// Docs: https://0x.org/docs/api

const ZEROX_API_KEY = process.env.ZEROX_API_KEY;
const ZEROX_BASE_URL = 'https://api.0x.org';

// Base chain ID
const BASE_CHAIN_ID = 8453;

// Known token decimals on Base
const TOKEN_DECIMALS = {
  '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': 6,  // USDC
  '0x50c5725949a6f0c72e6c4a641f24049a917db0cb': 18, // DAI
  '0x0555e30da8f98308edb960aa94c0db5b0c2b318c': 8,  // WBTC
  '0x4200000000000000000000000000000000000006': 18, // WETH
};

const WETH_ADDRESS = '0x4200000000000000000000000000000000000006';

export function getTokenDecimals(address) {
  if (!address) return 18;
  return TOKEN_DECIMALS[address.toLowerCase()] ?? 18;
}

function zeroxHeaders() {
  return {
    '0x-api-key': ZEROX_API_KEY,
    '0x-chain-id': String(BASE_CHAIN_ID),
    'Accept': 'application/json',
    'Content-Type': 'application/json',
  };
}

async function fetchWithTimeout(url, options = {}, ms = 12000) {
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
 * Get swap price/quote from 0x API v2
 * Uses /swap/permit2/price for indicative quote (no wallet needed)
 * 
 * @param {Object} params
 * @param {string} params.tokenIn  - Input token address (use WETH address for ETH)
 * @param {string} params.tokenOut - Output token address
 * @param {number} params.amount   - Amount in human-readable (e.g. 0.1 for 0.1 ETH)
 * @param {number} params.slippage - Slippage tolerance in percent (e.g. 0.5 for 0.5%)
 * @param {string} params.taker    - User wallet address (optional for price, required for quote)
 * @returns {Promise<Object|null>}
 */
export async function getZeroxPrice({ tokenIn, tokenOut, amount, slippage = 0.5, taker }) {
  if (!ZEROX_API_KEY) {
    console.error('ZEROX_API_KEY not set');
    return null;
  }
  if (!tokenIn || !tokenOut || !amount) return null;

  try {
    const inDecimals = getTokenDecimals(tokenIn);
    const sellAmount = BigInt(Math.floor(parseFloat(amount) * Math.pow(10, inDecimals))).toString();
    const slippageBps = Math.round(slippage * 100); // 0.5% → 50 bps

    const params = new URLSearchParams({
      chainId: String(BASE_CHAIN_ID),
      sellToken: tokenIn,
      buyToken: tokenOut,
      sellAmount,
      slippageBps: String(slippageBps),
    });

    if (taker) params.set('taker', taker);

    // Use /price for indicative quote (faster, no wallet signature needed)
    const url = `${ZEROX_BASE_URL}/swap/permit2/price?${params}`;
    console.log('0x price URL:', url.substring(0, 200));

    const res = await fetchWithTimeout(url, { headers: zeroxHeaders() }, 12000);

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error(`0x price API error ${res.status}:`, errText.substring(0, 200));
      return null;
    }

    const data = await res.json();

    const outDecimals = getTokenDecimals(tokenOut);
    const buyAmount = parseFloat(data.buyAmount || '0') / Math.pow(10, outDecimals);
    const sellAmountHuman = parseFloat(amount);

    return {
      success: true,
      buyAmount,
      buyAmountRaw: data.buyAmount,
      sellAmount: sellAmountHuman,
      sellAmountRaw: sellAmount,
      outDecimals,
      inDecimals,
      price: data.price ? parseFloat(data.price) : buyAmount / sellAmountHuman,
      grossBuyAmount: data.grossBuyAmount,
      estimatedGas: data.estimatedGas,
      estimatedGasPrice: data.gasPrice,
      source: '0x_permit2',
      route: data.route,
      fees: data.fees,
      raw: data,
    };
  } catch (err) {
    console.error('0x price error:', err.message);
    return null;
  }
}

/**
 * Get firm quote from 0x API v2 — includes permit2 signature data for wallet
 * Required before executing swap on-chain
 *
 * @param {Object} params
 * @param {string} params.tokenIn
 * @param {string} params.tokenOut
 * @param {number} params.amount
 * @param {number} params.slippage
 * @param {string} params.taker - User wallet address (REQUIRED)
 * @returns {Promise<Object|null>}
 */
export async function getZeroxQuote({ tokenIn, tokenOut, amount, slippage = 0.5, taker }) {
  if (!ZEROX_API_KEY) {
    console.error('ZEROX_API_KEY not set');
    return null;
  }
  if (!tokenIn || !tokenOut || !amount || !taker) {
    console.error('0x quote: missing params (taker required for firm quote)');
    return null;
  }

  try {
    const inDecimals = getTokenDecimals(tokenIn);
    const sellAmount = BigInt(Math.floor(parseFloat(amount) * Math.pow(10, inDecimals))).toString();
    const slippageBps = Math.round(slippage * 100);

    const params = new URLSearchParams({
      chainId: String(BASE_CHAIN_ID),
      sellToken: tokenIn,
      buyToken: tokenOut,
      sellAmount,
      taker,
      slippageBps: String(slippageBps),
    });

    const url = `${ZEROX_BASE_URL}/swap/permit2/quote?${params}`;
    console.log('0x quote URL:', url.substring(0, 200));

    const res = await fetchWithTimeout(url, { headers: zeroxHeaders() }, 15000);

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error(`0x quote API error ${res.status}:`, errText.substring(0, 200));
      return null;
    }

    const data = await res.json();

    const outDecimals = getTokenDecimals(tokenOut);
    const buyAmount = parseFloat(data.buyAmount || '0') / Math.pow(10, outDecimals);

    return {
      success: true,
      buyAmount,
      buyAmountRaw: data.buyAmount,
      sellAmount: parseFloat(amount),
      sellAmountRaw: sellAmount,
      outDecimals,
      inDecimals,
      price: data.price ? parseFloat(data.price) : null,
      // Permit2 transaction data — pass directly to wallet
      transaction: data.transaction,
      permit2: data.permit2,
      approval: data.approval, // ERC20 approval if needed
      estimatedGas: data.estimatedGas,
      source: '0x_permit2_quote',
      fees: data.fees,
      route: data.route,
      raw: data,
    };
  } catch (err) {
    console.error('0x quote error:', err.message);
    return null;
  }
}

export { WETH_ADDRESS, BASE_CHAIN_ID };