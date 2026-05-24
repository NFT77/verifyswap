// 0x API Swap Execute Route - Returns transaction for wallet signing

import { NextResponse } from 'next/server';
import { getZeroxQuote, WETH_ADDRESS } from '@/lib/api/zerox';

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
      { error: 'Only Base chain is supported' },
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

  // Calculate platform fee
  const feeAmount = amountNum * (FEE_PERCENT / 100);
  const amountAfterFee = amountNum - feeAmount;

  // Resolve ETH to WETH for 0x API
  const resolvedTokenIn = tokenIn === 'ETH' ? WETH_ADDRESS : tokenIn;
  const resolvedTokenOut = tokenOut === 'ETH' ? WETH_ADDRESS : tokenOut;

  console.log(`[0x Execute] ${amountAfterFee} ${tokenIn} → ${tokenOut} | User: ${userAddress}`);
  console.log(`[0x Execute] Fee: ${feeAmount} (${FEE_PERCENT}%) → ${FEE_RECIPIENT}`);

  try {
    // Get firm quote with transaction data
    const quote = await getZeroxQuote({
      tokenIn: resolvedTokenIn,
      tokenOut: resolvedTokenOut,
      amount: amountAfterFee,
      slippage: slippagePercent,
      taker: userAddress,
    });

    if (!quote.success) {
      console.error('0x quote failed:', quote.error);
      return NextResponse.json(
        { error: quote.error || 'Failed to get quote from 0x' },
        { status: 500, headers: CORS_HEADERS }
      );
    }

    if (!quote.to || !quote.data) {
      console.error('0x missing transaction data');
      return NextResponse.json(
        { error: '0x API did not return transaction data' },
        { status: 500, headers: CORS_HEADERS }
      );
    }

    // Return transaction data for wallet signing
    return NextResponse.json(
      serializeBigInt({
        success: true,
        transaction: {
          to: quote.to,
          data: quote.data,
          value: quote.value || '0',
          gas: quote.estimatedGas ? parseInt(quote.estimatedGas) : undefined,
        },
        buyAmount: quote.buyAmount,
        buyAmountRaw: quote.buyAmountRaw,
        feeAmount: feeAmount,
        feePercent: FEE_PERCENT,
        feeRecipient: FEE_RECIPIENT,
        source: '0x',
        message: `Swap ${amountAfterFee} ${tokenIn} → ${tokenOut} via 0x. Fee: ${FEE_PERCENT}%`,
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