// lib/api/uniswap.js - Base only
const UNISWAP_API = 'https://api.uniswap.org/v1';
const BASE_CHAIN_ID = '8453';

// Uniswap V3 Router address (fallback)
const UNISWAP_V3_ROUTER = '0x2626664c2603336E57B271c5C0b26F421741e481';
const WETH_ADDRESS = '0x4200000000000000000000000000000000000006';

// Common token addresses on Base
const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const DAI_ADDRESS = '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb';

// ✅ Fetch dengan timeout
async function fetchWithTimeout(url, options = {}, ms = 8000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ms);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`Uniswap API timeout after ${ms}ms`);
    }
    throw error;
  }
}

/**
 * Get quote from Uniswap API (Base chain only)
 * @param {Object} params - Quote parameters
 * @param {string} params.tokenIn - Input token address
 * @param {string} params.tokenOut - Output token address
 * @param {string|number} params.amountIn - Amount in wei
 * @param {number} params.slippage - Slippage tolerance (0.5 = 0.5%)
 * @returns {Promise<Object|null>} Quote data
 */
export async function getQuote({ tokenIn, tokenOut, amountIn, slippage = 0.5 }) {
  if (!tokenIn || !tokenOut || !amountIn) {
    console.error('Uniswap quote error: Missing required parameters');
    return null;
  }

  const amountNum = parseFloat(amountIn);
  if (isNaN(amountNum) || amountNum <= 0) {
    console.error('Uniswap quote error: Invalid amount');
    return null;
  }

  const slippageBps = Math.floor(slippage * 100);
  const params = new URLSearchParams({
    tokenIn,
    tokenOut,
    amountIn: amountIn.toString(),
    slippage: slippageBps.toString(),
    chainId: BASE_CHAIN_ID,
  });

  try {
    const url = `${UNISWAP_API}/quote?${params.toString()}`;
    console.log(`Fetching Uniswap quote: ${url.substring(0, 150)}...`);
    
    const response = await fetchWithTimeout(url, {
      headers: { 'Accept': 'application/json' },
    }, 8000);

    if (!response.ok) {
      console.error(`Uniswap API error: ${response.status}`);
      return null;
    }

    const data = await response.json();

    if (!data || !data.amountOut) {
      console.error('Uniswap quote: Invalid response data');
      return null;
    }

    // ✅ Deteksi desimal token output
    const isUsdcOut = tokenOut.toLowerCase() === USDC_ADDRESS.toLowerCase();
    const outDecimals = isUsdcOut ? 6 : 18;
    const amountOut = parseFloat(data.amountOut) / Math.pow(10, outDecimals);

    return {
      success: true,
      amountIn: parseFloat(amountIn) / 1e18,
      amountOut: amountOut,
      amountOutRaw: data.amountOut,
      priceImpact: parseFloat(data.priceImpact || 0),
      estimatedGasUsed: data.estimatedGasUsed,
      route: data.route,
      source: 'uniswap',
      raw: data,
    };
  } catch (error) {
    console.error('Uniswap quote error:', error.message);
    return null;
  }
}

/**
 * Get swap transaction from Uniswap API (Base chain only)
 * @param {Object} params - Swap parameters
 * @param {string} params.tokenIn - Input token address
 * @param {string} params.tokenOut - Output token address
 * @param {string|number} params.amountIn - Amount in wei
 * @param {number} params.slippage - Slippage tolerance
 * @param {string} params.recipient - Recipient address
 * @param {number} params.deadline - Transaction deadline (timestamp)
 * @returns {Promise<Object|null>} Transaction data
 */
export async function getSwapTransaction({
  tokenIn,
  tokenOut,
  amountIn,
  slippage = 0.5,
  recipient,
  deadline,
}) {
  if (!tokenIn || !tokenOut || !amountIn || !recipient) {
    console.error('Uniswap swap error: Missing required parameters');
    return null;
  }

  const amountNum = parseFloat(amountIn);
  if (isNaN(amountNum) || amountNum <= 0) {
    console.error('Uniswap swap error: Invalid amount');
    return null;
  }

  const slippageBps = Math.floor(slippage * 100);
  const params = new URLSearchParams({
    tokenIn,
    tokenOut,
    amountIn: amountIn.toString(),
    slippage: slippageBps.toString(),
    recipient,
    deadline: deadline.toString(),
    chainId: BASE_CHAIN_ID,
  });

  try {
    const url = `${UNISWAP_API}/swap?${params.toString()}`;
    console.log(`Fetching Uniswap swap transaction: ${url.substring(0, 150)}...`);
    
    const response = await fetchWithTimeout(url, {
      headers: { 'Accept': 'application/json' },
    }, 10000);

    if (!response.ok) {
      console.error(`Uniswap swap API error: ${response.status}`);
      return null;
    }

    const data = await response.json();

    if (!data || !data.transaction) {
      console.error('Uniswap swap: Invalid response data');
      return null;
    }

    return {
      success: true,
      transaction: data.transaction,
      txHash: data.transaction?.hash,
      to: data.transaction?.to,
      data: data.transaction?.data,
      value: data.transaction?.value,
    };
  } catch (error) {
    console.error('Uniswap swap error:', error.message);
    return null;
  }
}

/**
 * Execute swap directly via Uniswap V3 Router (fallback when OKX fails)
 * @param {Object} params - Swap parameters
 * @param {string} params.tokenIn - Input token (use 'ETH' for native ETH)
 * @param {string} params.tokenOut - Output token address
 * @param {number} params.amount - Amount in human readable format
 * @param {number} params.slippage - Slippage tolerance
 * @param {string} params.recipient - Recipient address
 * @param {number} params.deadline - Transaction deadline (timestamp)
 * @returns {Promise<Object>} Transaction data for wallet signing
 */
export async function executeDirectSwap({
  tokenIn,
  tokenOut,
  amount,
  slippage = 0.5,
  recipient,
  deadline,
  routerAddress,
}) {
  if (!tokenIn || !tokenOut || !amount || !recipient) {
    console.error('Uniswap direct swap error: Missing required parameters');
    return { success: false, error: 'Missing required parameters' };
  }

  try {
    const amountIn = parseFloat(amount);
    if (isNaN(amountIn) || amountIn <= 0) {
      return { success: false, error: 'Invalid amount' };
    }

    const amountInWei = BigInt(Math.floor(amountIn * 1e18));
    
    // ✅ Hitung amountOutMin dengan slippage protection yang lebih akurat
    // Gunakan slippage multiplier (0.5% = 0.995)
    const slippageMultiplier = (100 - slippage) / 100;
    const amountOutMin = BigInt(Math.floor(Number(amountInWei) * slippageMultiplier));
    const finalDeadline = deadline || BigInt(Math.floor(Date.now() / 1000) + 1200);
    
    const tokenInAddress = tokenIn === 'ETH' ? WETH_ADDRESS : tokenIn;
    const tokenOutAddress = tokenOut;
    const fee = 3000; // 0.3% pool fee
    
    const swapParams = {
      tokenIn: tokenInAddress,
      tokenOut: tokenOutAddress,
      fee: fee,
      recipient: recipient,
      deadline: finalDeadline,
      amountIn: amountInWei,
      amountOutMinimum: amountOutMin,
      sqrtPriceLimitX96: 0,
    };
    
    // Uniswap V3 Router ABI
    const uniswapRouterABI = [{
      type: 'function',
      name: 'exactInputSingle',
      stateMutability: 'payable',
      inputs: [
        { name: 'params', type: 'tuple', components: [
          { name: 'tokenIn', type: 'address' },
          { name: 'tokenOut', type: 'address' },
          { name: 'fee', type: 'uint24' },
          { name: 'recipient', type: 'address' },
          { name: 'deadline', type: 'uint256' },
          { name: 'amountIn', type: 'uint256' },
          { name: 'amountOutMinimum', type: 'uint256' },
          { name: 'sqrtPriceLimitX96', type: 'uint160' },
        ] },
      ],
      outputs: [{ name: 'amountOut', type: 'uint256' }],
    }];
    
    const finalRouterAddress = routerAddress || UNISWAP_V3_ROUTER;
    
    return {
      success: true,
      needsOnChain: true,
      transaction: {
        to: finalRouterAddress,
        abi: uniswapRouterABI,
        functionName: 'exactInputSingle',
        args: [swapParams],
        value: tokenIn === 'ETH' ? amountInWei.toString() : '0',
      },
      swapParams: {
        tokenIn: tokenInAddress,
        tokenOut: tokenOutAddress,
        fee: fee,
        recipient: recipient,
        deadline: finalDeadline.toString(),
        amountIn: amountInWei.toString(),
        amountOutMinimum: amountOutMin.toString(),
      },
      routerAddress: finalRouterAddress,
      amountIn: amountIn,
      amountOutMin: amountOutMin.toString(),
      estimatedOut: Number(amountOutMin) / 1e18,
    };
  } catch (error) {
    console.error('Uniswap direct swap error:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Get token price from Uniswap (simple price estimate)
 * @param {string} tokenAddress - Token address
 * @param {string} quoteToken - Quote token address (default: USDC)
 * @returns {Promise<number|null>} Price in USD
 */
export async function getTokenPrice(tokenAddress, quoteToken = USDC_ADDRESS) {
  if (!tokenAddress) return null;

  try {
    // Get quote for 1 token (in wei)
    const amountIn = BigInt(1e18).toString();
    const quote = await getQuote({
      tokenIn: tokenAddress,
      tokenOut: quoteToken,
      amountIn: amountIn,
      slippage: 0.5,
    });
    
    if (quote && quote.amountOut) {
      return quote.amountOut;
    }
    return null;
  } catch (error) {
    console.error('Uniswap price error:', error.message);
    return null;
  }
}

// Export addresses for convenience
export { UNISWAP_V3_ROUTER, WETH_ADDRESS, USDC_ADDRESS, DAI_ADDRESS };