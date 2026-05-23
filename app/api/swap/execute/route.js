// app/api/swap/execute/route.js
import { NextResponse } from 'next/server';
import { executeOkxSwap } from '@/lib/api/okx';
import { executeDirectSwap } from '@/lib/api/uniswap';

// FEE RECIPIENT ADDRESS
const FEE_RECIPIENT_BASE = '0x462be091Ef7Cfae820bb032a3cf2729fcAaD6e47';

// Helper function to convert BigInt to string in objects
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
  const body = await request.json();
  const { 
    chain, 
    tokenIn, 
    tokenOut, 
    amount, 
    slippage, 
    userAddress,
    selectedRouterAddress,
    selectedDexName,
  } = body;

  // Validasi parameter wajib
  if (!chain || !tokenOut || !amount) {
    return NextResponse.json(
      { error: 'Missing parameters: chain, tokenOut, amount are required' },
      { status: 400 }
    );
  }

  // Hanya support Base
  if (chain !== 'base') {
    return NextResponse.json(
      { error: `Unsupported chain: ${chain}. Only base is supported` },
      { status: 400 }
    );
  }

  if (!userAddress) {
    return NextResponse.json(
      { error: 'Missing userAddress parameter' },
      { status: 400 }
    );
  }

  try {
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      return NextResponse.json(
        { error: 'Invalid amount: must be a positive number' },
        { status: 400 }
      );
    }

    const slippagePercent = parseFloat(slippage) || 0.5;
    const feePercent = 0.3;
    const feeAmount = amountNum * (feePercent / 100);
    const amountAfterFee = amountNum - feeAmount;
    const feeRecipient = FEE_RECIPIENT_BASE;

    console.log(`💰 ========================================`);
    console.log(`💰 SWAP EXECUTION on BASE`);
    console.log(`💰 Amount: ${amountNum} ${tokenIn === 'ETH' ? 'ETH' : 'token'}`);
    console.log(`💰 After fee: ${amountAfterFee} ${tokenIn === 'ETH' ? 'ETH' : 'token'}`);
    console.log(`💰 Fee: ${feeAmount} ETH (${feePercent}%)`);
    console.log(`💰 Fee Recipient: ${feeRecipient}`);
    console.log(`💰 User Address: ${userAddress}`);
    console.log(`💰 Token Out: ${tokenOut}`);
    console.log(`💰 ========================================`);

    // PRIORITAS 1: OKX DEX Aggregator (dengan timeout)
    let result = null;
    let usedRouter = 'OKX Aggregator';
    
    try {
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('OKX API timeout after 15 seconds')), 15000);
      });
      
      const okxPromise = executeOkxSwap({
        chain: 'base',
        tokenIn: tokenIn === 'ETH' ? 'ETH' : tokenIn,
        tokenOut: tokenOut,
        amount: amountAfterFee,
        slippage: slippagePercent,
        userAddress,
        feePercent: feePercent,
      });
      
      result = await Promise.race([okxPromise, timeoutPromise]);
      
      if (result && result.success) {
        console.log(`✅ OKX swap successful!`);
        return NextResponse.json(serializeBigInt({
          success: true,
          transaction: result.transaction,
          txHash: result.txHash,
          usedRouter: 'OKX DEX Aggregator',
          feeAmount: result.feeAmount || feeAmount,
          feeRecipient: result.feeRecipient || feeRecipient,
          quote: {
            amountIn: amountAfterFee,
            amountOut: result.transaction?.toTokenAmount || 'unknown',
            feeAmount: feeAmount,
            feeRecipient: feeRecipient,
          },
          message: `✅ Swap ${amountAfterFee} ${tokenIn === 'ETH' ? 'ETH' : 'tokens'} → ${tokenOut} via OKX. Fee ${feePercent}% (${feeAmount.toFixed(6)} ETH)`,
        }));
      }
    } catch (okxError) {
      console.error('⚠️ OKX swap failed:', okxError.message);
      result = { success: false, error: okxError.message };
    }
    
    // PRIORITAS 2: Fallback ke Uniswap V3 Direct (dengan timeout)
    if (!result || !result.success) {
      console.log('⚠️ OKX failed, falling back to Uniswap V3 Direct');
      usedRouter = selectedDexName || 'Uniswap V3 Direct';
      
      try {
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Uniswap API timeout after 15 seconds')), 15000);
        });
        
        const deadline = Math.floor(Date.now() / 1000) + 1200;
        const uniswapPromise = executeDirectSwap({
          tokenIn: tokenIn === 'ETH' ? 'ETH' : tokenIn,
          tokenOut: tokenOut,
          amount: amountAfterFee,
          slippage: slippagePercent,
          recipient: userAddress,
          deadline: deadline,
          routerAddress: selectedRouterAddress,
        });
        
        const directResult = await Promise.race([uniswapPromise, timeoutPromise]);
        
        if (directResult.success && directResult.needsOnChain) {
          const serializedTransaction = serializeBigInt(directResult.transaction);
          
          return NextResponse.json(serializeBigInt({
            success: true,
            needsOnChain: true,
            transaction: serializedTransaction,
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
          }));
        } else if (directResult.error) {
          throw new Error(directResult.error);
        }
      } catch (uniswapError) {
        console.error('⚠️ Uniswap swap failed:', uniswapError.message);
        
        return NextResponse.json(
          { 
            error: `All routers failed. OKX: ${result?.error || 'Unknown error'}, Uniswap: ${uniswapError.message}`,
            details: {
              okxError: result?.error,
              uniswapError: uniswapError.message,
            }
          },
          { status: 500 }
        );
      }
    }
    
    return NextResponse.json(
      { error: result?.error || 'All swap routers failed' },
      { status: 500 }
    );

  } catch (error) {
    console.error('Swap execution error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}