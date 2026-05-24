// app/api/swap/execute/route.js
// Powered by 0x API v2 permit2 — OKX and Uniswap removed entirely

import { NextResponse } from 'next/server';
import { getZeroxQuote, getTokenDecimals, NATIVE_ETH_ADDRESS } from '@/lib/api/zerox';

const FEE_RECIPIENT = '0x462be091Ef7Cfae820bb032a3cf2729fcAaD6e47';
const FEE_PERCENT = 0.3;

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
      { error: 'Invalid JSON body' },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const { chain, tokenIn, tokenOut, amount, slippage, userAddress } = body;

  if (!chain || !tokenIn || !tokenOut || !amount || !userAddress) {
    return NextResponse.json(
      { error: 'Missing required parameters: chain, tokenIn, tokenOut, amount, userAddress' },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  if (chain !== 'base') {
    return NextResponse.json(
      { error: 'Only base chain is supported' },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const amountNum = parseFloat(amount);
  if (isNaN(amountNum) || amountNum <= 0) {
    return NextResponse.json(
      { error: 'Invalid amount' },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const slippagePercent = parseFloat(slippage) || 0.5;

  // Platform fee deducted from sell amount
  const feeAmount = amountNum * (FEE_PERCENT / 100);
  const amountAfterFee = amountNum - feeAmount;

  // ✅ 0x API v2 uses sentinel address for native ETH, not WETH
  const resolvedTokenIn = tokenIn === 'ETH' ? NATIVE_ETH_ADDRESS : tokenIn;

  console.log(`0x Swap: ${amountAfterFee} ${tokenIn} → ${tokenOut} | user: ${userAddress}`);
  console.log(`Fee: ${feeAmount} (${FEE_PERCENT}%) → ${FEE_RECIPIENT}`);

  try {
    // Get firm quote with permit2 transaction data
    const quote = await getZeroxQuote({
      tokenIn: resolvedTokenIn,
      tokenOut,
      amount: amountAfterFee,
      slippage: slippagePercent,
      taker: userAddress,
    });

    if (!quote || !quote.success) {
      return NextResponse.json(
        { error: '0x API failed to return a firm quote. Please try again.' },
        { status: 500, headers: CORS_HEADERS }
      );
    }

    if (!quote.transaction) {
      return NextResponse.json(
        { error: '0x did not return transaction data. Please try again.' },
        { status: 500, headers: CORS_HEADERS }
      );
    }

    // Return transaction + permit2 data to client for wallet signing
    return NextResponse.json(
      serializeBigInt({
        success: true,
        // The client should:
        // 1. If quote.approval exists → send approval tx first
        // 2. If quote.permit2 exists → sign the permit2 message
        // 3. Send quote.transaction via wallet
        transaction: quote.transaction,
        permit2: quote.permit2 || null,
        approval: quote.approval || null,
        buyAmount: quote.buyAmount,
        buyAmountRaw: quote.buyAmountRaw,
        outDecimals: quote.outDecimals,
        feeAmount,
        feePercent: FEE_PERCENT,
        feeRecipient: FEE_RECIPIENT,
        source: '0x',
        message: `Swap ${amountAfterFee} ${tokenIn} → ${tokenOut} via 0x. Fee: ${FEE_PERCENT}% (${feeAmount.toFixed(6)})`,
      }),
      { headers: CORS_HEADERS }
    );

  } catch (error) {
    console.error('Execute route error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}