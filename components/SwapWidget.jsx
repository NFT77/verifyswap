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

// ============ TOKEN LIST ON BASE NETWORK ============
const POPULAR_TOKENS = {
  ETH: {
    symbol: 'ETH',
    name: 'Ethereum',
    address: 'ETH',
    logo: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/base/info/logo.png',
    decimals: 18,
    priceUSD: 3200,
  },
  USDC: {
    symbol: 'USDC',
    name: 'USD Coin',
    address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    logo: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/base/assets/0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913/logo.png',
    decimals: 6,
    priceUSD: 1,
  },
  WBTC: {
    symbol: 'WBTC',
    name: 'Wrapped Bitcoin',
    address: '0x0555E30da8f98308EdB960aa94C0Db5B0C2B318C',
    logo: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/base/assets/0x0555E30da8f98308EdB960aa94C0Db5B0C2B318C/logo.png',
    decimals: 8,
    priceUSD: 65000,
  },
  WETH: {
    symbol: 'WETH',
    name: 'Wrapped Ether',
    address: '0x4200000000000000000000000000000000000006',
    logo: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/base/assets/0x4200000000000000000000000000000000000006/logo.png',
    decimals: 18,
    priceUSD: 3200,
  },
};

export default function SwapWidget({ token, onSuccess }) {
  const { address, isConnected, status } = useAccount();
  const { writeContractAsync } = useWriteContract();
  
  // State untuk token yang dipilih
  const [payToken, setPayToken] = useState(POPULAR_TOKENS.ETH);
  const [receiveToken, setReceiveToken] = useState(POPULAR_TOKENS.USDC);
  const [isTokenSelectorOpen, setIsTokenSelectorOpen] = useState(false);
  const [selectorMode, setSelectorMode] = useState('pay');
  
  const [amount, setAmount] = useState('');
  const [isLoadingQuote, setIsLoadingQuote] = useState(false);
  const [quote, setQuote] = useState(null);
  const [slippage, setSlippage] = useState(0.5);
  const [isCustomSlippage, setIsCustomSlippage] = useState(false);
  const [txHash, setTxHash] = useState(null);
  const [isExecuting, setIsExecuting] = useState(false);
  
  const [swapError, setSwapError] = useState('');
  const [swapSuccess, setSwapSuccess] = useState('');
  const [showRetry, setShowRetry] = useState(false);
  const [retrySlippage, setRetrySlippage] = useState(0);
  const [pendingExecuteSwap, setPendingExecuteSwap] = useState(null);
  
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [selectedRouterAddress, setSelectedRouterAddress] = useState(null);

  // Update receive token when token prop changes
  useEffect(() => {
    if (token && token.address) {
      const foundToken = Object.values(POPULAR_TOKENS).find(
        t => t.address === token.address || t.symbol === token.symbol
      );
      if (foundToken) {
        setReceiveToken(foundToken);
      }
    }
  }, [token]);

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

  useEffect(() => {
    if (swapSuccess) {
      const timer = setTimeout(() => setSwapSuccess(''), 5000);
      return () => clearTimeout(timer);
    }
  }, [swapSuccess]);

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
      if (!amount || parseFloat(amount) <= 0 || !payToken || !receiveToken) {
        setQuote(null);
        return;
      }
      
      setIsLoadingQuote(true);
      setSwapError('');
      
      try {
        const tokenIn = payToken.address === 'ETH' ? 'ETH' : payToken.address;
        const tokenOut = receiveToken.address === 'ETH' ? 'ETH' : receiveToken.address;
        
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
  }, [amount, payToken, receiveToken, slippage, fetchWithTimeout]);

  const handleSwitchTokens = useCallback(() => {
    const temp = payToken;
    setPayToken(receiveToken);
    setReceiveToken(temp);
    setAmount('');
    setQuote(null);
    setTxHash(null);
    setSelectedRoute(null);
    setSelectedRouterAddress(null);
    setSwapError('');
    setSwapSuccess('');
  }, [payToken, receiveToken]);

  const handleSelectToken = (selectedToken, mode) => {
    if (mode === 'pay') {
      if (selectedToken.address === receiveToken.address) {
        setReceiveToken(payToken);
      }
      setPayToken(selectedToken);
    } else {
      if (selectedToken.address === payToken.address) {
        setPayToken(receiveToken);
      }
      setReceiveToken(selectedToken);
    }
    setIsTokenSelectorOpen(false);
    setAmount('');
    setQuote(null);
    setSwapError('');
  };

  const handleCustomSlippage = useCallback((value) => {
    const parsed = parseFloat(value);
    if (!isNaN(parsed) && parsed >= 0 && parsed <= 50) {
      setSlippage(parsed);
      setIsCustomSlippage(true);
    }
  }, []);

  const handlePresetSlippage = useCallback((value) => {
    setSlippage(value);
    setIsCustomSlippage(false);
  }, []);

  const handleAutoSelectBestRoute = useCallback(() => {
    if (quote?.routeComparisons && quote.routeComparisons.length > 0) {
      const best = quote.routeComparisons[0];
      setSelectedRoute(best);
      setSelectedRouterAddress(best.routerAddress);
    }
  }, [quote]);

  const getUserFriendlyErrorMessage = useCallback((err) => {
    const errorMessage = err.message?.toLowerCase() || '';
    const shortMessage = err.shortMessage?.toLowerCase() || '';
    
    if (errorMessage.includes('execution reverted') || shortMessage.includes('execution reverted')) {
      return (
        '❌ Transaction Failed\n\n' +
        'Possible reasons:\n' +
        '• Token has insufficient liquidity\n' +
        '• Try adding USDC to your Warplet wallet\n' +
        '• Increase slippage tolerance to 2-3%\n' +
        '• Try a smaller amount\n\n' +
        '🔧 Solutions:\n' +
        '• Desktop: Switch wallet → back to Warplet → refresh\n' +
        '• Android: Minimize app, find Warplet modal behind'
      );
    }
    
    if (errorMessage.includes('slippage') || shortMessage.includes('slippage')) {
      return '❌ Price moved too fast. Try increasing slippage tolerance to 2-3%';
    }
    
    if (errorMessage.includes('insufficient') || shortMessage.includes('insufficient')) {
      return '❌ Insufficient balance. Make sure you have enough tokens for the swap.';
    }
    
    if (errorMessage.includes('user rejected') || shortMessage.includes('user rejected')) {
      return '❌ Transaction rejected. You can try again.';
    }
    
    if (errorMessage.includes('timed out') || errorMessage.includes('timeout')) {
      return 'Request timed out. Please check your connection and try again.';
    }
    
    return `❌ Transaction failed: ${err.shortMessage || err.message || 'Unknown error'}`;
  }, []);

  const handleBaseSwap = useCallback(async () => {
    if (!quote || !payToken || !receiveToken) return;
    
    if (!address) {
      setSwapError('Please connect your wallet first to swap');
      return;
    }

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
        
        const effectiveSlippage = retry ? retrySlippageValue || Math.min(slippage + 1, 5) : slippage;
        const activeRoute = selectedRoute;
        const amountOutValue = activeRoute?.receiveAmount || quote.amountOut;
        const amountOutMin = BigInt(Math.floor(amountOutValue * (1 - effectiveSlippage / 100) * 1e18));
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);
        
        const tokenInAddress = payToken.address === 'ETH' ? WETH_ADDRESS : payToken.address;
        const tokenOutAddress = receiveToken.address === 'ETH' ? WETH_ADDRESS : receiveToken.address;
        const fee = 3000;
        
        const routerAddress = selectedRouterAddress || UNISWAP_V3_ROUTER;
        const dexName = activeRoute?.dexName || 'Uniswap V3';
        
        console.log(`🔄 Executing swap: ${payToken.symbol} → ${receiveToken.symbol} on ${dexName}`);
        
        const executeResponse = await fetchWithTimeout('/api/swap/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chain: 'base',
            tokenIn: payToken.address === 'ETH' ? 'ETH' : payToken.address,
            tokenOut: receiveToken.address === 'ETH' ? 'ETH' : receiveToken.address,
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
            value: payToken.address === 'ETH' ? amountInWei : BigInt(0),
          });
          
          setTxHash(hash);
          setSwapSuccess(`✅ Swap successful: ${amountIn} ${payToken.symbol} → ${receiveToken.symbol}! Tx: ${hash.slice(0, 10)}...`);
          onSuccess?.();
        } else {
          setSwapSuccess(result.message || 'Swap successful!');
          onSuccess?.();
        }
        
      } catch (err) {
        console.error('Swap error:', err);
        
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
  }, [quote, payToken, receiveToken, address, amount, slippage, selectedRoute, selectedRouterAddress, onSuccess, writeContractAsync, status, showRetry, getUserFriendlyErrorMessage, fetchWithTimeout]);

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

  if (!payToken || !receiveToken) return null;

  const amountNum = parseFloat(amount) || 0;
  const estimatedOutput = quote?.amountOut || 0;
  const isGettingQuote = isLoadingQuote;
  const hasQuote = !!quote && !quote.error;
  
  const rate = amountNum > 0 && estimatedOutput > 0 ? estimatedOutput / amountNum : 0;
  const minimumReceived = estimatedOutput * (1 - slippage / 100);
  const priceImpact = quote?.priceImpact || 0;
  const swapFee = amountNum * 0.003;
  
  const payValueUSD = amountNum * payToken.priceUSD;
  const receiveValueUSD = estimatedOutput * receiveToken.priceUSD;

  const isButtonDisabled = !amountNum || amountNum <= 0 || !hasQuote || isExecuting || !isConnected;

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

  const TokenSelector = () => (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-slate-800 rounded-2xl w-full max-w-md max-h-[80vh] overflow-hidden">
        <div className="p-4 border-b border-white/10 flex justify-between items-center">
          <h3 className="text-lg font-semibold text-white">Select a token</h3>
          <button onClick={() => setIsTokenSelectorOpen(false)} className="text-gray-400 hover:text-white text-xl">✕</button>
        </div>
        <div className="p-2 max-h-[60vh] overflow-y-auto">
          {Object.values(POPULAR_TOKENS).map((t) => (
            <button
              key={t.symbol}
              onClick={() => handleSelectToken(t, selectorMode)}
              disabled={isExecuting}
              className="w-full flex items-center gap-3 p-3 hover:bg-white/10 rounded-xl transition disabled:opacity-50"
            >
              <div className="w-10 h-10 rounded-full overflow-hidden bg-gradient-to-br from-blue-500 to-purple-600 flex-shrink-0">
                <img src={t.logo} alt={t.symbol} className="w-full h-full object-cover" onError={(e) => { e.target.style.display = 'none'; }} />
              </div>
              <div className="flex-1 text-left">
                <div className="font-medium text-white">{t.symbol}</div>
                <div className="text-xs text-gray-400">{t.name}</div>
              </div>
              <div className="text-right">
                <div className="text-sm text-white">${t.priceUSD.toLocaleString()}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 p-5">
      {isTokenSelectorOpen && <TokenSelector />}

      {swapError && (
        <div className="mb-4 p-3 bg-red-500/20 border border-red-500/30 rounded-xl">
          <p className="text-red-400 text-sm whitespace-pre-line">{swapError}</p>
          <button onClick={() => setSwapError('')} className="text-xs text-red-300 mt-1 underline">Dismiss</button>
        </div>
      )}

      {swapSuccess && (
        <div className="mb-4 p-3 bg-green-500/20 border border-green-500/30 rounded-xl">
          <p className="text-green-400 text-sm">✅ {swapSuccess}</p>
        </div>
      )}

      {showRetry && (
        <div className="mb-4 p-3 bg-yellow-500/20 border border-yellow-500/30 rounded-xl">
          <p className="text-yellow-400 text-sm mb-2">⚠️ Price moved. Retry with {retrySlippage}% slippage?</p>
          <div className="flex gap-2">
            <button onClick={handleRetry} className="px-3 py-1 bg-yellow-500 text-black rounded-lg text-sm font-medium">Retry</button>
            <button onClick={handleCancelRetry} className="px-3 py-1 bg-white/10 text-white rounded-lg text-sm">Cancel</button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm font-medium text-white">Swap</div>
        {selectedRoute && <span className="text-xs bg-green-500/20 text-green-300 px-2 py-0.5 rounded-full">⚡ Route: {selectedRoute.dexName}</span>}
        {status === 'reconnecting' && <span className="text-xs bg-yellow-500/20 text-yellow-300 px-2 py-0.5 rounded-full animate-pulse">🔄 Reconnecting wallet...</span>}
      </div>

      {/* You Pay */}
      <div className="p-4 rounded-xl bg-black/30 mb-2">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm text-gray-400">You pay</span>
          <span className="text-xs text-gray-500">Balance: --</span>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => { setSelectorMode('pay'); setIsTokenSelectorOpen(true); }} disabled={isExecuting} className="flex items-center gap-2 px-3 py-2 bg-white/10 rounded-xl hover:bg-white/20 transition disabled:opacity-50">
            <div className="w-6 h-6 rounded-full overflow-hidden"><img src={payToken.logo} alt={payToken.symbol} className="w-full h-full object-cover" onError={(e) => { e.target.style.display = 'none'; }} /></div>
            <span className="font-medium text-white">{payToken.symbol}</span>
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </button>
          <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.0" disabled={isExecuting} className="flex-1 bg-transparent text-2xl text-white text-right outline-none disabled:opacity-50" />
        </div>
        <div className="text-right text-xs text-gray-500 mt-1">≈ ${payValueUSD.toFixed(2)}</div>
      </div>

      {/* Switch Button */}
      <div className="flex justify-center -my-2 relative z-10">
        <button onClick={handleSwitchTokens} disabled={isExecuting} className="w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center text-white text-sm hover:bg-purple-500 transition disabled:opacity-50">↓↑</button>
      </div>

      {/* You Receive */}
      <div className="p-4 rounded-xl bg-black/30 mb-4">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm text-gray-400">You receive (estimated)</span>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => { setSelectorMode('receive'); setIsTokenSelectorOpen(true); }} disabled={isExecuting} className="flex items-center gap-2 px-3 py-2 bg-white/10 rounded-xl hover:bg-white/20 transition disabled:opacity-50">
            <div className="w-6 h-6 rounded-full overflow-hidden"><img src={receiveToken.logo} alt={receiveToken.symbol} className="w-full h-full object-cover" onError={(e) => { e.target.style.display = 'none'; }} /></div>
            <span className="font-medium text-white">{receiveToken.symbol}</span>
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </button>
          <div className="flex-1 text-right">
            <div className="text-2xl text-white font-mono">
              {isGettingQuote ? <span className="text-gray-400 text-base animate-pulse">...</span> : estimatedOutput.toFixed(6)}
            </div>
            <div className="text-xs text-green-400 mt-1">≈ ${receiveValueUSD.toFixed(2)}</div>
          </div>
        </div>
      </div>

      {/* DETAIL SWAP INFO */}
      {hasQuote && amountNum > 0 && !isGettingQuote && (
        <div className="mb-4 p-3 rounded-xl bg-black/30 border border-white/10">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Rate</span>
              <span className="text-white">1 {payToken.symbol} = {rate.toFixed(6)} {receiveToken.symbol}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Minimum Received</span>
              <span className="text-white">{minimumReceived.toFixed(6)} {receiveToken.symbol} <span className="text-gray-500 text-xs ml-1">(slippage {slippage}%)</span></span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Price Impact</span>
              <span className={priceImpact > 5 ? 'text-red-400' : priceImpact > 2 ? 'text-yellow-400' : 'text-green-400'}>{priceImpact.toFixed(2)}%</span>
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-white/10">
              <span className="text-gray-400">Est. Swap Fee</span>
              <span className="text-white">{swapFee.toFixed(6)} {payToken.symbol} <span className="text-gray-500 text-xs ml-1">(0.3% fee)</span></span>
            </div>
          </div>
        </div>
      )}

      {/* SLIPPAGE SECTION */}
      <div className="mb-4">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-medium text-white">Slippage Tolerance</span>
          <span className={`text-xs ${slippage > 3 ? 'text-red-400' : slippage > 1 ? 'text-yellow-400' : 'text-green-400'}`}>{slippage}%</span>
        </div>
        <div className="flex gap-2 flex-wrap mb-2">
          {slippageOptions.map((s) => (
            <button key={s} onClick={() => handlePresetSlippage(s)} disabled={isExecuting} className={`px-3 py-1.5 rounded-lg text-sm transition ${slippage === s && !isCustomSlippage ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white' : 'bg-white/10 text-gray-300 hover:bg-white/20'} disabled:opacity-50`}>{s}%</button>
          ))}
          <input type="number" step="0.1" min="0" max="50" value={isCustomSlippage ? slippage : ''} onChange={(e) => handleCustomSlippage(e.target.value)} placeholder="Custom" disabled={isExecuting} className="w-20 px-2 py-1.5 rounded-lg bg-white/10 border border-white/20 text-white text-sm text-center outline-none focus:border-purple-500 disabled:opacity-50" />
        </div>
        {slippageWarning && <div className={`p-2 rounded-lg text-xs ${slippageWarning.color}`}>{slippageWarning.text}</div>}
      </div>

      {/* WARNING */}
      <div className="mb-4 p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-center">
        <p className="text-yellow-400 text-xs">⚠️ Double-check all details before confirming. Crypto transactions are irreversible.</p>
      </div>

      {!isConnected && amountNum > 0 && hasQuote && (
        <div className="mb-4 p-2 rounded-lg bg-blue-500/20 border border-blue-500/20 text-center">
          <p className="text-blue-400 text-xs">🔌 Connect wallet above to execute this swap</p>
        </div>
      )}

      {txHash && (
        <div className="mb-4 p-2 bg-green-500/20 rounded-lg text-center">
          <p className="text-green-400 text-xs">Transaction sent!</p>
          <a href={`https://basescan.org/tx/${txHash}`} target="_blank" rel="noopener noreferrer" className="text-green-300 text-xs font-mono break-all hover:underline">{txHash.slice(0, 10)}...{txHash.slice(-8)}</a>
        </div>
      )}

      {(isGettingQuote || isExecuting) && (
        <div className="mb-4 p-2 bg-blue-500/20 rounded-lg text-center">
          <div className="flex items-center justify-center gap-2">
            <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-blue-400 text-xs">{isGettingQuote ? 'Getting best price...' : 'Executing swap...'}</p>
          </div>
        </div>
      )}

      <button onClick={handleBaseSwap} disabled={isButtonDisabled || status === 'reconnecting'} className={`w-full py-4 rounded-xl font-semibold transition ${!isButtonDisabled && status !== 'reconnecting' ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white hover:opacity-90 active:scale-[0.98]' : 'bg-white/10 text-gray-400 cursor-not-allowed'}`}>
        {status === 'reconnecting' ? '🔄 Reconnecting wallet...' :
         !isConnected && amountNum > 0 && hasQuote ? 'Connect Wallet to Swap' :
         !amountNum || amountNum <= 0 ? 'Enter an amount' :
         !hasQuote && !isGettingQuote ? 'Failed to get quote' :
         isGettingQuote ? 'Getting quote...' :
         isExecuting ? 'Swapping...' :
         `Swap ${amountNum} ${payToken.symbol} → ${receiveToken.symbol}`}
      </button>

      <div className="text-center text-xs text-gray-500 mt-3">🔒 Non-custodial | 🛡️ 0.3% fee | ⚡ Uniswap V3 on Base</div>
    </div>
  );
}