// lib/api/uniswap.js - Base only
// ✅ FIXED: Uniswap API v1 returns 409 (requires paid API key).
// Replaced with direct on-chain QuoterV2 contract call — no API key needed.

const UNISWAP_V3_ROUTER = '0x2626664c2603336E57B271c5C0b26F421741e481';
const WETH_ADDRESS = '0x4200000000000000000000000000000000000006';
const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const DAI_ADDRESS = '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb';

// Uniswap V3 QuoterV2 on Base
const QUOTER_V2_ADDRESS = '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a';
const BASE_RPC = 'https://mainnet.base.org';

// Known token decimals on Base — used for correct output amount parsing
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

async function fetchWithTimeout(url, options = {}, ms = 10000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ms);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') throw new Error(`Timeout after ${ms}ms`);
    throw error;
  }
}

// Encode quoteExactInputSingle calldata for QuoterV2
function encodeQuoteExactInputSingle(tokenIn, tokenOut, fee, amountIn) {
  // quoteExactInputSingle((address,address,uint256,uint24,uint160))
  // selector: 0xc6a5026a
  const selector = 'c6a5026a';

  const pad = (hex, len = 64) => hex.replace('0x', '').padStart(len, '0');

  // Struct offset (always 0x20 for single struct param)
  const offset = pad('20');
  const tIn = pad(tokenIn);
  const tOut = pad(tokenOut);
  const amtIn = pad(BigInt(amountIn).toString(16));
  const feeHex = pad(fee.toString(16));
  const sqrtLimit = pad('0');

  return `0x${selector}${offset}${tIn}${tOut}${amtIn}${feeHex}${sqrtLimit}`;
}

// Try multiple fee tiers (500=0.05%, 3000=0.3%, 10000=1%)
async function quoteOnChain(tokenIn, tokenOut, amountIn) {
  const feeTiers = [3000, 500, 10000];

  for (const fee of feeTiers) {
    try {
      const data = encodeQuoteExactInputSingle(tokenIn, tokenOut, fee, amountIn);

      const res = await fetchWithTimeout(BASE_RPC, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_call',
          params: [{ to: QUOTER_V2_ADDRESS, data }, 'latest'],
          id: 1,
        }),
      }, 8000);

      const json = await res.json();

      if (json.error || !json.result || json.result === '0x') continue;

      // QuoterV2 returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)
      // First 32 bytes = amountOut
      const amountOutHex = '0x' + json.result.slice(2, 66);
      const amountOutRaw = BigInt(amountOutHex);

      if (amountOutRaw === 0n) continue;

      const outDecimals = getTokenDecimals(tokenOut);
      const amountOut = Number(amountOutRaw) / Math.pow(10, outDecimals);

      console.log(`✅ QuoterV2: fee=${fee}, amountOut=${amountOut} (${outDecimals} decimals)`);

      return {
        success: true,
        amountOut,
        amountOutRaw: amountOutRaw.toString(),
        outDecimals,
        fee,
        priceImpact: 0.3,
        source: 'quoter_v2_onchain',
      };
    } catch (e) {
      console.error(`QuoterV2 fee=${fee} error:`, e.message);
    }
  }

  return null;
}

export async function getQuote({ tokenIn, tokenOut, amountIn, slippage = 0.5 }) {
  if (!tokenIn || !tokenOut || !amountIn) {
    console.error('Uniswap quote: Missing params');
    return null;
  }

  const amountNum = parseFloat(amountIn);
  if (isNaN(amountNum) || amountNum <= 0) return null;

  try {
    const result = await quoteOnChain(tokenIn, tokenOut, amountIn);
    if (!result) return null;

    return {
      success: true,
      amountIn: amountNum / 1e18,
      amountOut: result.amountOut,
      amountOutRaw: result.amountOutRaw,
      outDecimals: result.outDecimals,
      priceImpact: result.priceImpact,
      fee: result.fee,
      source: result.source,
      raw: result,
    };
  } catch (error) {
    console.error('Uniswap quote error:', error.message);
    return null;
  }
}

export async function executeDirectSwap({
  tokenIn,
  tokenOut,
  amount,
  slippage = 0.5,
  recipient,
  deadline,
  routerAddress,
  quoteAmountOut,
}) {
  if (!tokenIn || !tokenOut || !amount || !recipient) {
    return { success: false, error: 'Missing required parameters' };
  }

  try {
    const amountIn = parseFloat(amount);
    if (isNaN(amountIn) || amountIn <= 0) return { success: false, error: 'Invalid amount' };

    const payDecimals = tokenIn === 'ETH' ? 18 : getTokenDecimals(tokenIn);
    const receiveDecimals = tokenOut === 'ETH' ? 18 : getTokenDecimals(tokenOut);

    const amountInWei = BigInt(Math.floor(amountIn * Math.pow(10, payDecimals)));

    // ✅ Use quoted output for correct amountOutMinimum
    let amountOutMin = BigInt(0);
    if (quoteAmountOut && parseFloat(quoteAmountOut) > 0) {
      const minOut = parseFloat(quoteAmountOut) * (1 - slippage / 100);
      amountOutMin = BigInt(Math.floor(minOut * Math.pow(10, receiveDecimals)));
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
      inputs: [{
        name: 'params', type: 'tuple', components: [
          { name: 'tokenIn', type: 'address' },
          { name: 'tokenOut', type: 'address' },
          { name: 'fee', type: 'uint24' },
          { name: 'recipient', type: 'address' },
          { name: 'deadline', type: 'uint256' },
          { name: 'amountIn', type: 'uint256' },
          { name: 'amountOutMinimum', type: 'uint256' },
          { name: 'sqrtPriceLimitX96', type: 'uint160' },
        ],
      }],
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