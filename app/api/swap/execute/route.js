// app/api/swap/execute/route.js
import { NextResponse } from 'next/server';
import { executeOkxSwap } from '@/lib/api/okx';
import { executeDirectSwap } from '@/lib/api/uniswap';

const FEE_RECIPIENT_BASE = '0x462be091Ef7Cfae820bb032a3cf2729fcAaD6e47';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

function serializeBigInt(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'bigint') return obj.toString();
  if (Array.isArray(obj)) return obj.map(serializeBigInt);
  if (typeof obj === 'object') {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = serializeBigInt(value);
    }
    return result;
  }
  return obj;
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body — must be valid JSON' },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const {
    chain,
    tokenIn,
    tokenOut,
    amount,
    slippage,
    userAddress,
    selectedRouterAddress,
    selectedDexName,
    // ✅ NEW: receive the quoted output amount from client so we can pass it
    // to executeDirectSwap for correct amountOutMinimum calculation
    quoteAmountOut,
  } = body;

  if (!chain || !tokenOut || !amount) {
    return NextResponse.json(
      { error: 'Missing parameters: chain, tokenOut, amount are required' },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  if (chain !== 'base') {
    return NextResponse.json(
      { error: `Unsupported chain: ${chain}` },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  if (!userAddress) {
    return NextResponse.json(
      { error: 'Missing userAddress parameter' },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const amountNum = parseFloat(amount);
  if (isNaN(amountNum) || amountNum <= 0) {
    return NextResponse.json(
      { error: 'Invalid amount: must be a positive number' },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  try {
    const slippagePercent = parseFloat(slippage) || 0.5;
    const feePercent = 0.3;
    const feeAmount = amountNum * (feePercent / 100);
    const amountAfterFee = amountNum - feeAmount;
    const feeRecipient = FEE_RECIPIENT_BASE;

    console.log(`💰 SWAP EXECUTION on BASE`);
    console.log(`💰 Amount: ${amountNum} | After fee: ${amountAfterFee} | Fee: ${feeAmount}`);
    console.log(`💰 User: ${userAddress} | Token out: ${tokenOut}`);
    console.log(`💰 Quote amount out: ${quoteAmountOut}`);

    // --- Priority 1: OKX DEX Aggregator ---
    let result = null;
    try {
      result = await Promise.race([
        executeOkxSwap({
          chain: 'base',
          tokenIn: tokenIn === 'ETH' ? 'ETH' : tokenIn,
          tokenOut,
          amount: amountAfterFee,
          slippage: slippagePercent,
          userAddress,
          feePercent,
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('OKX timeout (15s)')), 15000)),
      ]);

      if (result?.success) {
        console.log('✅ OKX swap execution prepared');
        return NextResponse.json(
          serializeBigInt({
            success: true,
            transaction: result.transaction,
            txHash: result.txHash,
            usedRouter: 'OKX DEX Aggregator',
            feeAmount: result.feeAmount || feeAmount,
            feeRecipient: result.feeRecipient || feeRecipient,
            quote: {
              amountIn: amountAfterFee,
              amountOut: result.toTokenAmount || 'unknown',
              feeAmount,
              feeRecipient,
            },
            message: `✅ Swap ${amountAfterFee} via OKX. Fee ${feePercent}% (${feeAmount.toFixed(6)} ETH)`,
          }),
          { headers: CORS_HEADERS }
        );
      }
    } catch (okxError) {
      console.error('OKX swap failed:', okxError.message);
      result = { success: false, error: okxError.message };
    }

    // --- Priority 2: Uniswap V3 Direct ---
    console.log('OKX failed, falling back to Uniswap V3 Direct');
    const usedRouter = selectedDexName || 'Uniswap V3 Direct';

    try {
      const deadline = Math.floor(Date.now() / 1000) + 1200;

      // ✅ FIXED: pass quoteAmountOut so executeDirectSwap can calculate
      // amountOutMinimum correctly for tokens with non-18 decimals (e.g. USDC = 6)
      const directResult = await Promise.race([
        executeDirectSwap({
          tokenIn: tokenIn === 'ETH' ? 'ETH' : tokenIn,
          tokenOut,
          amount: amountAfterFee,
          slippage: slippagePercent,
          recipient: userAddress,
          deadline,
          routerAddress: selectedRouterAddress,
          quoteAmountOut: quoteAmountOut ? parseFloat(quoteAmountOut) : undefined,
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Uniswap timeout (15s)')), 15000)),
      ]);

      if (directResult?.success && directResult?.needsOnChain) {
        return NextResponse.json(
          serializeBigInt({
            success: true,
            needsOnChain: true,
            transaction: directResult.transaction,
            usedRouter,
            feeAmount,
            feeRecipient,
            routerAddress: selectedRouterAddress || directResult.routerAddress,
            quote: {
              amountIn: amountAfterFee,
              amountOut: directResult.amountOutMin || 'estimated',
              feeAmount,
              feeRecipient,
            },
            message: `✅ Swapping via ${usedRouter}. Fee ${feePercent}% (${feeAmount.toFixed(6)} ETH)`,
          }),
          { headers: CORS_HEADERS }
        );
      }

      if (directResult?.error) throw new Error(directResult.error);

    } catch (uniswapError) {
      console.error('Uniswap swap failed:', uniswapError.message);
      return NextResponse.json(
        {
          error: `All routers failed. OKX: ${result?.error || 'unavailable'}, Uniswap: ${uniswapError.message}`,
          details: {
            okxError: result?.error,
            uniswapError: uniswapError.message,
          },
        },
        { status: 500, headers: CORS_HEADERS }
      );
    }

    return NextResponse.json(
      { error: result?.error || 'All swap routers failed. Please try again.' },
      { status: 500, headers: CORS_HEADERS }
    );

  } catch (error) {
    console.error('Swap execution unhandled error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}