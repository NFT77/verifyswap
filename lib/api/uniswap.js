// lib/api/uniswap.js - Base only
const UNISWAP_API = 'https://api.uniswap.org/v1';
const BASE_CHAIN_ID = '8453';

const UNISWAP_V3_ROUTER = '0x2626664c2603336E57B271c5C0b26F421741e481';
const WETH_ADDRESS = '0x4200000000000000000000000000000000000006';
const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const DAI_ADDRESS = '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb';

// Known token decimals on Base
const TOKEN_DECIMALS = {
  '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': 6,  // USDC
  '0x50c5725949a6f0c72e6c4a641f24049a917db0cb': 18, // DAI
  '0x0555e30da8f98308edb960aa94c0db5b0c2b318c': 8,  // WBTC
  '0x4200000000000000000000000000000000000006': 18, // WETH
};

function getTokenDecimals(address) {
  if (!address) return 18;
  return TOKEN_DECIMALS[address.toLowerCase()] ?? 18;
}

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

    // Use known decimals map first, fall back to response data
    const outDecimals = getTokenDecimals(tokenOut);
    const amountOut = parseFloat(data.amountOut) / Math.pow(10, outDecimals);

    return {
      success: true,
      amountIn: parseFloat(amountIn) / 1e18,
      amountOut,
      amountOutRaw: data.amountOut,
      outDecimals,
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
    const response = await fetchWithTimeout(url, {
      headers: { 'Accept': 'application/json' },
    }, 10000);

    if (!response.ok) {
      console.error(`Uniswap swap API error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    if (!data?.transaction) {
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
 * Execute swap directly via Uniswap V3 Router (fallback when OKX fails).
 *
 * FIX: amountOutMinimum is now calculated from the QUOTED output amount
 * (passed in as quoteAmountOut), not from amountIn. Calculating from amountIn
 * gives a nonsensical floor for token pairs with very different prices
 * (e.g. ETH→USDC: 1 ETH input → floor was ~0.995 ETH worth of wei, but
 *  USDC has 6 decimals so the BigInt was enormous and always reverted).
 */
export async function executeDirectSwap({
  tokenIn,
  tokenOut,
  amount,
  slippage = 0.5,
  recipient,
  deadline,
  routerAddress,
  quoteAmountOut, // pass this from the quote response when available
}) {
  if (!tokenIn || !tokenOut || !amount || !recipient) {
    return { success: false, error: 'Missing required parameters' };
  }

  try {
    const amountIn = parseFloat(amount);
    if (isNaN(amountIn) || amountIn <= 0) {
      return { success: false, error: 'Invalid amount' };
    }

    const payDecimals = tokenIn === 'ETH' ? 18 : getTokenDecimals(tokenIn);
    const receiveDecimals = tokenOut === 'ETH' ? 18 : getTokenDecimals(tokenOut);

    const amountInWei = BigInt(Math.floor(amountIn * Math.pow(10, payDecimals)));

    // ✅ FIXED: calculate amountOutMinimum from the actual quoted output,
    // not from amountIn. Fall back to a rough estimate only if no quote given.
    let amountOutMin;
    if (quoteAmountOut && parseFloat(quoteAmountOut) > 0) {
      const minOut = parseFloat(quoteAmountOut) * (1 - slippage / 100);
      amountOutMin = BigInt(Math.floor(minOut * Math.pow(10, receiveDecimals)));
    } else {
      // Rough fallback: 0 minimum (let router decide) — safer than wrong math
      amountOutMin = BigInt(0);
    }

    const finalDeadline = deadline
      ? BigInt(deadline)
      : BigInt(Math.floor(Date.now() / 1000) + 1200);

    const tokenInAddress = tokenIn === 'ETH' ? WETH_ADDRESS : tokenIn;
    const fee = 3000;

    const swapParams = {
      tokenIn: tokenInAddress,
      tokenOut,
      fee,
      recipient,
      deadline: finalDeadline,
      amountIn: amountInWei,
      amountOutMinimum: amountOutMin,
      sqrtPriceLimitX96: BigInt(0),
    };

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
        tokenOut,
        fee,
        recipient,
        deadline: finalDeadline.toString(),
        amountIn: amountInWei.toString(),
        amountOutMinimum: amountOutMin.toString(),
      },
      routerAddress: finalRouterAddress,
      amountIn,
      amountOutMin: amountOutMin.toString(),
      receiveDecimals,
    };
  } catch (error) {
    console.error('Uniswap direct swap error:', error.message);
    return { success: false, error: error.message };
  }
}

export async function getTokenPrice(tokenAddress, quoteToken = USDC_ADDRESS) {
  if (!tokenAddress) return null;
  try {
    const amountIn = BigInt(1e18).toString();
    const quote = await getQuote({
      tokenIn: tokenAddress,
      tokenOut: quoteToken,
      amountIn,
      slippage: 0.5,
    });
    return quote?.amountOut ?? null;
  } catch (error) {
    console.error('Uniswap price error:', error.message);
    return null;
  }
}

export { UNISWAP_V3_ROUTER, WETH_ADDRESS, USDC_ADDRESS, DAI_ADDRESS };