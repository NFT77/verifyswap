'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAccount, useWriteContract } from 'wagmi';
import TokenIcon from './TokenIcon';

// FEE RECIPIENT ADDRESS
const FEE_RECIPIENT_BASE = '0x462be091Ef7Cfae820bb032a3cf2729fcAaD6e47';

// Uniswap V3 Router ABI
const UNISWAP_ROUTER_ABI = [{
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

const UNISWAP_V3_ROUTER = '0x2626664c2603336E57B271c5C0b26F421741e481';
const WETH_ADDRESS = '0x4200000000000000000000000000000000000006';

export default function SwapWidget({ token, onSuccess }) {
  const { address, isConnected, status } = useAccount();
  const { writeContractAsync } = useWriteContract();
  
  const [amount, setAmount] = useState('');
  const [isLoadingQuote, setIsLoadingQuote] = useState(false);
  const [quote, setQuote] = useState(null);
  const [slippage, setSlippage] = useState(0.5);
  const [isCustomSlippage, setIsCustomSlippage] = useState(false);
  const [txHash, setTxHash] = useState(null);
  const [swapDirection, setSwapDirection] = useState('buy');
  const [isExecuting, setIsExecuting] = useState(false);
  
  // ✅ UI State untuk notifikasi (ganti alert)
  const [swapError, setSwapError] = useState('');
  const [swapSuccess, setSwapSuccess] = useState('');
  const [showRetry, setShowRetry] = useState(false);
  const [retrySlippage, setRetrySlippage] = useState(0);
  const [pendingExecuteSwap, setPendingExecuteSwap] = useState(null);
  
  // State untuk route selection
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [selectedRouterAddress, setSelectedRouterAddress] = useState(null);

  // ✅ Fetch dengan timeout (didefinisikan di dalam komponen)
  const fetchWithTimeout = useCallback(async (url, options = {}, ms = 10000) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), ms);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('Request timed out. Please check your connection.');
      }
      throw error;
    }
  }, []);

  // Auto-hide success message setelah 5 detik
  useEffect(() => {
    if (swapSuccess) {
      const timer = setTimeout(() => setSwapSuccess(''), 5000);
      return () => clearTimeout(timer);
    }
  }, [swapSuccess]);

  // Reset selected route when quote changes
  useEffect(() => {
    if (quote?.routeComparisons && quote.routeComparisons.length > 0) {
      const bestRoute = quote.routeComparisons[0];
      setSelectedRoute(bestRoute);
      setSelectedRouterAddress(bestRoute.routerAddress);
    } else {
      setSelectedRoute(null);
      setSelectedRouterAddress(null);
    }
  }, [quote]);

  const slippageOptions = useMemo(() => [0.1, 0.5, 1, 3, 5], []);

  // GET QUOTE
  useEffect(() => {
    async function fetchQuote() {
      if (!amount || parseFloat(amount) <= 0 || !token) {
        setQuote(null);
        return;
      }
      
      setIsLoadingQuote(true);
      setSwapError('');
      
      try {
        const tokenIn = swapDirection === 'buy' ? 'ETH' : token.address;
        const tokenOut = swapDirection === 'buy' ? token.address : 'ETH';
        
        const res = await fetchWithTimeout(
          `/api/swap/quote?chain=base&tokenIn=${tokenIn}&tokenOut=${tokenOut}&amount=${amount}&slippage=${slippage}`,
          {},
          8000
        );
        const data = await res.json();
        
        if (data.error) {
          console.error('Quote API error:', data.error);
          setQuote(null);
        } else {
          setQuote(data);
        }
      } catch (err) {
        console.error('Quote error:', err);
        if (err.message?.includes('timed out')) {
          setSwapError('Quote request timed out. Please try again.');
        } else {
          setSwapError(err.message || 'Failed to get quote');
        }
        setQuote(null);
      } finally {
        setIsLoadingQuote(false);
      }
    }
    
    const timeout = setTimeout(fetchQuote, 500);
    return () => clearTimeout(timeout);
  }, [amount, token, slippage, swapDirection, fetchWithTimeout]);

  const toggleDirection = useCallback(() => {
    setSwapDirection(prev => prev === 'buy' ? 'sell' : 'buy');
    setAmount('');
    setQuote(null);
    setTxHash(null);
    setSelectedRoute(null);
    setSelectedRouterAddress(null);
    setSwapError('');
    setSwapSuccess('');
  }, []);

  // Handle custom slippage input
  const handleCustomSlippage = useCallback((value) => {
    const parsed = parseFloat(value);
    if (!isNaN(parsed) && parsed >= 0 && parsed <= 50) {
      setSlippage(parsed);
      setIsCustomSlippage(true);
    }
  }, []);

  // Handle preset slippage button
  const handlePresetSlippage = useCallback((value) => {
    setSlippage(value);
    setIsCustomSlippage(false);
  }, []);

  // Auto-select best route
  const handleAutoSelectBestRoute = useCallback(() => {
    if (quote?.routeComparisons && quote.routeComparisons.length > 0) {
      const best = quote.routeComparisons[0];
      setSelectedRoute(best);
      setSelectedRouterAddress(best.routerAddress);
    }
  }, [quote]);

  // Fungsi untuk mendapatkan pesan error yang user-friendly
  const getUserFriendlyErrorMessage = useCallback((err) => {
    const errorMessage = err.message?.toLowerCase() || '';
    const shortMessage = err.shortMessage?.toLowerCase() || '';
    
    if (errorMessage.includes('slippage') || shortMessage.includes('slippage')) {
      return 'Transaction failed due to price slippage. Try increasing slippage tolerance (1-3%) or wait for less volatility.';
    }
    if (errorMessage.includes('insufficient') || shortMessage.includes('insufficient')) {
      return 'Insufficient balance. You don\'t have enough tokens to complete this swap.';
    }
    if (errorMessage.includes('user rejected') || shortMessage.includes('user rejected')) {
      return 'Transaction was rejected. You can try again.';
    }
    if (errorMessage.includes('network') || errorMessage.includes('connection')) {
      return 'Network connection issue. Please check your internet and try again.';
    }
    if (errorMessage.includes('execution reverted') || shortMessage.includes('execution reverted')) {
      return 'Transaction failed. Common causes:\n• Slippage too low (try 1-3%)\n• Token liquidity issues\n• Try a smaller amount';
    }
    if (errorMessage.includes('timed out') || errorMessage.includes('timeout')) {
      return 'Request timed out. Please check your connection and try again.';
    }
    return `Swap failed: ${err.shortMessage || err.message || 'Unknown error'}`;
  }, []);

  // Handle swap on Base dengan retry logic
  const handleBaseSwap = useCallback(async () => {
    if (!quote || !token) return;
    
    if (!address) {
      setSwapError('Please connect your wallet first to swap');
      return;
    }

    // Cek status koneksi wallet
    if (status === 'disconnected') {
      setSwapError('Wallet disconnected. Please refresh the page and reconnect.');
      return;
    }
    
    setIsExecuting(true);
    setSwapError('');
    setSwapSuccess('');
    
    const executeSwap = async (retry = false, retrySlippageValue = null) => {
      try {
        const amountIn = parseFloat(amount);
        const amountInWei = BigInt(Math.floor(amountIn * 1e18));
        
        // Gunakan slippage lebih tinggi untuk retry
        const effectiveSlippage = retry ? retrySlippageValue || Math.min(slippage + 1, 5) : slippage;
        const activeRoute = selectedRoute;
        const amountOutValue = activeRoute?.receiveAmount || quote.amountOut;
        const amountOutMin = BigInt(Math.floor(amountOutValue * (1 - effectiveSlippage / 100) * 1e18));
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);
        
        const tokenInAddress = swapDirection === 'buy' ? WETH_ADDRESS : token.address;
        const tokenOutAddress = swapDirection === 'buy' ? token.address : WETH_ADDRESS;
        const fee = 3000;
        
        const routerAddress = selectedRouterAddress || UNISWAP_V3_ROUTER;
        const dexName = activeRoute?.dexName || 'Uniswap V3';
        
        console.log(`🔄 Executing swap on: ${dexName} (${routerAddress})`);
        if (retry) console.log(`⚠️ Retry attempt with ${effectiveSlippage}% slippage`);
        
        const executeResponse = await fetchWithTimeout('/api/swap/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chain: 'base',
            tokenIn: swapDirection === 'buy' ? 'ETH' : token.address,
            tokenOut: swapDirection === 'buy' ? token.address : 'ETH',
            amount: amountIn,
            slippage: effectiveSlippage,
            userAddress: address,
            rawQuote: quote.rawQuote,
            quoteSource: quote.source,
            selectedRouterAddress: routerAddress,
            selectedDexName: dexName,
          }),
        }, 15000);
        
        const result = await executeResponse.json();
        
        if (!result.success) {
          throw new Error(result.error || 'Swap failed');
        }
        
        if (result.transaction) {
          const swapParams = {
            tokenIn: tokenInAddress,
            tokenOut: tokenOutAddress,
            fee: fee,
            recipient: address,
            deadline: deadline,
            amountIn: amountInWei,
            amountOutMinimum: amountOutMin,
            sqrtPriceLimitX96: 0,
          };
          
          const hash = await writeContractAsync({
            address: routerAddress,
            abi: UNISWAP_ROUTER_ABI,
            functionName: 'exactInputSingle',
            args: [swapParams],
            value: swapDirection === 'buy' ? amountInWei : BigInt(0),
          });
          
          setTxHash(hash);
          setSwapSuccess(`Swap successful on ${dexName}! Tx: ${hash.slice(0, 10)}...`);
          onSuccess?.();
        } else {
          setSwapSuccess(result.message || 'Swap successful!');
          onSuccess?.();
        }
        
      } catch (err) {
        console.error('Swap error:', err);
        
        // Retry logic untuk execution reverted
        const errorMessage = err.message?.toLowerCase() || '';
        const needsRetry = errorMessage.includes('execution reverted') || 
                          errorMessage.includes('slippage') ||
                          errorMessage.includes('price');
        
        if (needsRetry && !showRetry) {
          const newSlippage = Math.min(slippage + 1, 5);
          setRetrySlippage(newSlippage);
          setShowRetry(true);
          setPendingExecuteSwap(() => async () => {
            await executeSwap(true, newSlippage);
          });
          return;
        }
        
        const userMessage = getUserFriendlyErrorMessage(err);
        setSwapError(userMessage);
      }
    };
    
    await executeSwap(false);
    setIsExecuting(false);
  }, [quote, token, address, amount, slippage, swapDirection, selectedRoute, selectedRouterAddress, onSuccess, writeContractAsync, status, showRetry, getUserFriendlyErrorMessage, fetchWithTimeout]);

  // Handle retry from UI
  const handleRetry = useCallback(async () => {
    setShowRetry(false);
    if (pendingExecuteSwap) {
      setIsExecuting(true);
      await pendingExecuteSwap();
      setIsExecuting(false);
      setPendingExecuteSwap(null);
    }
  }, [pendingExecuteSwap]);

  const handleCancelRetry = useCallback(() => {
    setShowRetry(false);
    setPendingExecuteSwap(null);
    setIsExecuting(false);
  }, []);

  if (!token) return null;

  const feeAmount = amount ? parseFloat(amount) * 0.003 : 0;
  const estimatedOutput = quote?.amountOut || 0;
  const isGettingQuote = isLoadingQuote;
  const hasQuote = !!quote && !quote.error;

  const payToken = swapDirection === 'buy' 
    ? { symbol: 'ETH', logo: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/base/info/logo.png' }
    : { symbol: token.symbol, logo: token.logo };
    
  const receiveToken = swapDirection === 'buy'
    ? { symbol: token.symbol, logo: token.logo }
    : { symbol: 'ETH', logo: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/base/info/logo.png' };

  const isButtonDisabled = !amount || parseFloat(amount) <= 0 || !hasQuote || isExecuting || !isConnected;

  // Slippage warning messages
  const getSlippageWarning = useCallback(() => {
    if (slippage >= 5) {
      return { text: '⚠️ VERY HIGH SLIPPAGE! Only use for extremely volatile tokens. You may lose significant value.', color: 'text-red-400 bg-red-500/10 border-red-500/20' };
    }
    if (slippage >= 3) {
      return { text: '⚠️ High slippage. Protect yourself by setting a lower value.', color: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20' };
    }
    if (slippage <= 0.3) {
      return { text: '✅ Low slippage is safe, but may fail in volatile markets.', color: 'text-green-400 bg-green-500/10 border-green-500/20' };
    }
    return null;
  }, [slippage]);

  const slippageWarning = getSlippageWarning();

  return (
    <div className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 p-5">
      {/* ✅ Error Message UI */}
      {swapError && (
        <div className="mb-4 p-3 bg-red-500/20 border border-red-500/30 rounded-xl">
          <p className="text-red-400 text-sm whitespace-pre-line">{swapError}</p>
          <button 
            onClick={() => setSwapError('')}
            className="text-xs text-red-300 mt-1 underline hover:text-red-200 transition"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ✅ Success Message UI */}
      {swapSuccess && (
        <div className="mb-4 p-3 bg-green-500/20 border border-green-500/30 rounded-xl">
          <p className="text-green-400 text-sm">✅ {swapSuccess}</p>
        </div>
      )}

      {/* ✅ Retry Prompt UI (ganti confirm) */}
      {showRetry && (
        <div className="mb-4 p-3 bg-yellow-500/20 border border-yellow-500/30 rounded-xl">
          <p className="text-yellow-400 text-sm mb-2">
            ⚠️ Price moved. Retry with {retrySlippage}% slippage?
          </p>
          <div className="flex gap-2">
            <button 
              onClick={handleRetry}
              className="px-3 py-1 bg-yellow-500 text-black rounded-lg text-sm font-medium hover:bg-yellow-400 transition"
            >
              Retry
            </button>
            <button 
              onClick={handleCancelRetry}
              className="px-3 py-1 bg-white/10 text-white rounded-lg text-sm hover:bg-white/20 transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button
            onClick={toggleDirection}
            disabled={isExecuting}
            className="flex items-center gap-2 px-3 py-1.5 bg-white/10 rounded-lg hover:bg-white/20 transition disabled:opacity-50"
          >
            <span className="text-sm font-medium text-white">
              {swapDirection === 'buy' ? 'Buy' : 'Sell'}
            </span>
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
            </svg>
            <span className="text-sm font-medium text-gray-400">
              {swapDirection === 'buy' ? 'Buy' : 'Sell'} Mode
            </span>
          </button>
          {selectedRoute && (
            <span className="text-xs bg-green-500/20 text-green-300 px-2 py-0.5 rounded-full">
              ⚡ Route: {selectedRoute.dexName}
            </span>
          )}
          {status === 'reconnecting' && (
            <span className="text-xs bg-yellow-500/20 text-yellow-300 px-2 py-0.5 rounded-full animate-pulse">
              🔄 Reconnecting wallet...
            </span>
          )}
        </div>
        <div className="text-xs text-gray-400">Powered by Uniswap V3</div>
      </div>

      {/* You Pay */}
      <div className="p-4 rounded-xl bg-black/30 mb-3">
        <div className="text-sm text-gray-400 mb-2">You pay</div>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full overflow-hidden bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
            <img 
              src={payToken.logo} 
              alt={payToken.symbol}
              className="w-full h-full object-cover"
              onError={(e) => { e.target.style.display = 'none'; }}
            />
          </div>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.0"
            disabled={isExecuting}
            className="flex-1 bg-transparent text-2xl text-white outline-none disabled:opacity-50"
          />
          <span className="text-gray-400 text-sm">{payToken.symbol}</span>
        </div>
      </div>

      {/* Arrow */}
      <div className="flex justify-center -my-2">
        <div className="w-7 h-7 bg-purple-600 rounded-full flex items-center justify-center text-white text-xs">↓</div>
      </div>

      {/* You Receive */}
      <div className="p-4 rounded-xl bg-black/30 mb-4">
        <div className="text-sm text-gray-400 mb-2">You receive (estimated)</div>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full overflow-hidden bg-gradient-to-br from-green-500 to-teal-600 flex items-center justify-center">
            <img 
              src={receiveToken.logo} 
              alt={receiveToken.symbol}
              className="w-full h-full object-cover"
              onError={(e) => { e.target.style.display = 'none'; }}
            />
          </div>
          <div className="flex-1">
            <div className="text-2xl text-white font-mono">
              {isGettingQuote ? '...' : (selectedRoute?.receiveAmount?.toFixed(6) || estimatedOutput.toFixed(6))}
            </div>
            <div className="text-sm text-gray-400">{receiveToken.symbol}</div>
          </div>
        </div>
      </div>

      {/* FEE SECTION */}
      <div className="p-3 rounded-xl bg-gradient-to-r from-purple-500/10 to-blue-500/10 border border-purple-500/20 mb-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <img 
              src="/favicon.svg" 
              alt="VerifySwap" 
              className="w-5 h-5"
              onError={(e) => { e.target.style.display = 'none'; }}
            />
            <span className="text-sm font-medium text-white">VerifySwap</span>
          </div>
          <div className="text-sm text-white font-mono">
            {feeAmount.toFixed(6)} ETH
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          Supports platform development, security audits & API infrastructure
        </p>
      </div>

      {/* ROUTE COMPARISON SECTION */}
      {quote?.routeComparisons && quote.routeComparisons.length > 0 && (
        <div className="mb-4 p-3 rounded-xl bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/20">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-white">🔄 Best Price Routes</span>
              <span className="text-xs text-gray-400">Compare & choose DEX</span>
            </div>
            <button 
              onClick={handleAutoSelectBestRoute}
              className="text-xs text-blue-400 hover:text-blue-300 transition"
            >
              ⚡ Auto-select best
            </button>
          </div>
          
          <div className="space-y-2">
            {quote.routeComparisons.map((route, idx) => (
              <div 
                key={idx}
                onClick={() => {
                  setSelectedRoute(route);
                  setSelectedRouterAddress(route.routerAddress);
                }}
                className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition ${
                  selectedRoute?.dexName === route.dexName
                    ? 'bg-gradient-to-r from-blue-500/30 to-purple-500/30 border border-blue-500/50'
                    : 'bg-black/30 hover:bg-black/50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-4 h-4 rounded-full border-2 ${
                    selectedRoute?.dexName === route.dexName
                      ? 'border-blue-500 bg-blue-500'
                      : 'border-gray-500'
                  }`}>
                    {selectedRoute?.dexName === route.dexName && (
                      <div className="w-2 h-2 bg-white rounded-full m-0.5"></div>
                    )}
                  </div>
                  {route.dexLogo && (
                    <img src={route.dexLogo} alt={route.dexName} className="w-6 h-6 rounded-full" />
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white">{route.dexName}</span>
                      {idx === 0 && (
                        <span className="text-xs bg-green-500/30 text-green-300 px-1.5 py-0.5 rounded-full">
                          Best
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500">
                      Fee: ${route.tradeFee?.toFixed(4) || '0'}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-white font-mono">
                    {route.receiveAmount.toFixed(6)} {receiveToken.symbol}
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          {selectedRoute && (
            <div className="mt-3 p-2 rounded-lg bg-green-500/10 border border-green-500/20">
              <p className="text-xs text-green-400 text-center">
                ✅ Selected: {selectedRoute.dexName} • You will receive ~{selectedRoute.receiveAmount.toFixed(6)} {receiveToken.symbol}
              </p>
            </div>
          )}
        </div>
      )}

      {/* SLIPPAGE SECTION */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-lg">⚡</span>
            <span className="text-sm font-medium text-white">Set Your Slippage Tolerance</span>
          </div>
          <span className="text-xs text-gray-400">Higher = Faster • Lower = Safer</span>
        </div>
        
        <div className="flex gap-2 flex-wrap mb-2">
          {slippageOptions.map((s) => (
            <button
              key={s}
              onClick={() => handlePresetSlippage(s)}
              disabled={isExecuting}
              className={`px-4 py-2 rounded-xl text-sm transition ${
                slippage === s && !isCustomSlippage
                  ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg'
                  : 'bg-white/10 text-gray-300 hover:bg-white/20'
              } disabled:opacity-50`}
            >
              {s}%
            </button>
          ))}
        </div>
        
        <div className="flex items-center gap-2 mt-2">
          <span className="text-xs text-gray-500">Custom:</span>
          <input
            type="number"
            step="0.1"
            min="0"
            max="50"
            value={isCustomSlippage ? slippage : ''}
            onChange={(e) => handleCustomSlippage(e.target.value)}
            placeholder="0.5"
            disabled={isExecuting}
            className="w-24 px-3 py-2 rounded-xl bg-white/10 border border-white/20 text-white text-sm text-center focus:outline-none focus:border-purple-500 disabled:opacity-50"
          />
          <span className="text-sm text-gray-400">%</span>
        </div>
        
        {slippageWarning && (
          <div className={`mt-2 p-2 rounded-lg text-xs ${slippageWarning.color}`}>
            {slippageWarning.text}
          </div>
        )}
        
        <div className="flex items-start gap-2 mt-2 text-xs text-gray-400 bg-black/30 rounded-lg p-2">
          <span>💡</span>
          <span>
            {slippage <= 0.5 
              ? 'Lower slippage protects your trade but may fail in volatile markets.'
              : 'Higher slippage increases success rate, especially for meme tokens.'}
          </span>
        </div>
      </div>

      {/* WARNING */}
      <div className="mb-4 p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-center">
        <p className="text-yellow-400 text-xs flex items-center justify-center gap-2">
          <span>⚠️</span>
          Double-check all details before confirming. Crypto transactions are irreversible.
          <span>⚠️</span>
        </p>
      </div>

      {/* Connect Wallet Warning */}
      {!isConnected && amount && parseFloat(amount) > 0 && hasQuote && (
        <div className="mb-4 p-2 rounded-lg bg-blue-500/20 border border-blue-500/20 text-center">
          <p className="text-blue-400 text-xs">
            🔌 Connect wallet above to execute this swap
          </p>
        </div>
      )}

      {/* Tx Hash */}
      {txHash && (
        <div className="mb-4 p-2 bg-green-500/20 rounded-lg text-center">
          <p className="text-green-400 text-xs">Transaction sent!</p>
          <a 
            href={`https://basescan.org/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-green-300 text-xs font-mono break-all hover:underline"
          >
            {txHash.slice(0, 10)}...{txHash.slice(-8)}
          </a>
        </div>
      )}

      {/* Loading State */}
      {(isGettingQuote || isExecuting) && (
        <div className="mb-4 p-2 bg-blue-500/20 rounded-lg text-center">
          <p className="text-blue-400 text-xs">
            {isGettingQuote ? 'Getting best price...' : 'Executing swap...'}
          </p>
        </div>
      )}

      {/* Swap Button */}
      <button
        onClick={handleBaseSwap}
        disabled={isButtonDisabled || status === 'reconnecting'}
        className={`w-full py-4 rounded-xl font-semibold transition ${
          !isButtonDisabled && status !== 'reconnecting'
            ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white hover:opacity-90'
            : 'bg-white/10 text-gray-400 cursor-not-allowed'
        }`}
      >
        {status === 'reconnecting' ? (
          '🔄 Reconnecting wallet...'
        ) : !isConnected && amount && parseFloat(amount) > 0 && hasQuote ? (
          `Connect Wallet to ${swapDirection === 'buy' ? 'Buy' : 'Sell'}`
        ) : !amount || parseFloat(amount) <= 0 ? (
          'Enter an amount'
        ) : !hasQuote && !isGettingQuote ? (
          'Failed to get quote'
        ) : isGettingQuote ? (
          'Getting quote...'
        ) : isExecuting ? (
          'Swapping...'
        ) : (
          `${swapDirection === 'buy' ? 'Buy' : 'Sell'} ${amount || '0'} ${payToken.symbol} → ${receiveToken.symbol}`
        )}
      </button>

      {/* Footer */}
      <div className="text-center text-xs text-gray-500 mt-3">
        🔒 Non-custodial | 🛡️ 0.3% fee | ⚡ Uniswap V3
      </div>
    </div>
  );
}