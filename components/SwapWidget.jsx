'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAccount, useSendTransaction } from 'wagmi';

const FEE_PERCENT = 0.3;

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
  WETH: {
    symbol: 'WETH',
    name: 'Wrapped Ether',
    address: '0x4200000000000000000000000000000000000006',
    logo: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/base/assets/0x4200000000000000000000000000000000000006/logo.png',
    decimals: 18,
    priceUSD: 3200,
  },
};

async function fetchWithTimeout(url, options = {}, ms = 15000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return res;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') throw new Error('Request timed out');
    throw err;
  }
}

export default function SwapWidget({ token, onSuccess }) {
  const { address, isConnected, status } = useAccount();
  const { sendTransactionAsync } = useSendTransaction();

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

  useEffect(() => {
    if (token?.address) {
      const found = Object.values(POPULAR_TOKENS).find(
        t => t.address === token.address || t.symbol === token.symbol
      );
      if (found) setReceiveToken(found);
    }
  }, [token]);

  useEffect(() => {
    if (swapSuccess) {
      const timer = setTimeout(() => setSwapSuccess(''), 5000);
      return () => clearTimeout(timer);
    }
  }, [swapSuccess]);

  const slippageOptions = useMemo(() => [0.1, 0.5, 1, 2, 3], []);

  // Fetch quote
  useEffect(() => {
    let cancelled = false;

    async function fetchQuote() {
      if (!amount || parseFloat(amount) <= 0 || !payToken || !receiveToken) {
        setQuote(null);
        return;
      }

      setIsLoadingQuote(true);
      setSwapError('');

      try {
        const tokenIn = payToken.address === 'ETH' ? 'ETH' : payToken.address;
        const tokenOut = receiveToken.address;

        let url = `/api/swap/quote?chain=base&tokenIn=${tokenIn}&tokenOut=${tokenOut}&amount=${amount}&slippage=${slippage}`;
        if (address) url += `&taker=${address}`;

        const res = await fetchWithTimeout(url, {}, 15000);

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `HTTP ${res.status}`);
        }

        const data = await res.json();
        if (cancelled) return;

        if (data.error) {
          setSwapError(data.error);
          setQuote(null);
        } else {
          setQuote(data);
        }
      } catch (err) {
        if (cancelled) return;
        setSwapError(err.message || 'Failed to get quote');
        setQuote(null);
      } finally {
        if (!cancelled) setIsLoadingQuote(false);
      }
    }

    const timeout = setTimeout(fetchQuote, 500);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [amount, payToken, receiveToken, slippage, address]);

  const handleSwitchTokens = useCallback(() => {
    setPayToken(receiveToken);
    setReceiveToken(payToken);
    setAmount('');
    setQuote(null);
    setTxHash(null);
    setSwapError('');
    setSwapSuccess('');
  }, [payToken, receiveToken]);

  const handleSelectToken = useCallback((selectedToken, mode) => {
    if (mode === 'pay') {
      if (selectedToken.address === receiveToken.address) setReceiveToken(payToken);
      setPayToken(selectedToken);
    } else {
      if (selectedToken.address === payToken.address) setPayToken(receiveToken);
      setReceiveToken(selectedToken);
    }
    setIsTokenSelectorOpen(false);
    setAmount('');
    setQuote(null);
    setSwapError('');
  }, [payToken, receiveToken]);

  const handleSwap = useCallback(async () => {
    if (!quote || !address || !isConnected) {
      setSwapError('Please connect your wallet');
      return;
    }

    setIsExecuting(true);
    setSwapError('');
    setSwapSuccess('');

    try {
      const amountIn = parseFloat(amount);

      // Get transaction data from execute API
      const res = await fetchWithTimeout('/api/swap/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chain: 'base',
          tokenIn: payToken.address,
          tokenOut: receiveToken.address,
          amount: amountIn,
          slippage: slippage,
          userAddress: address,
        }),
      }, 20000);

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      const result = await res.json();

      if (!result.success || !result.transaction) {
        throw new Error(result.error || 'No transaction data');
      }

      // Send transaction via wallet
      const tx = {
        to: result.transaction.to,
        data: result.transaction.data,
        value: result.transaction.value ? BigInt(result.transaction.value) : undefined,
        gas: result.transaction.gas ? BigInt(result.transaction.gas) : undefined,
      };

      const hash = await sendTransactionAsync(tx);
      setTxHash(hash);
      setSwapSuccess(`✅ Swap successful! ${amountIn} ${payToken.symbol} → ${receiveToken.symbol}`);
      onSuccess?.();

    } catch (err) {
      console.error('Swap error:', err);
      const msg = err.message?.toLowerCase() || '';
      if (msg.includes('user rejected')) {
        setSwapError('Transaction rejected by user');
      } else if (msg.includes('insufficient')) {
        setSwapError('Insufficient balance');
      } else if (msg.includes('slippage')) {
        setSwapError('Price moved. Try increasing slippage tolerance');
      } else {
        setSwapError(err.message || 'Swap failed');
      }
    } finally {
      setIsExecuting(false);
    }
  }, [quote, address, isConnected, amount, payToken, receiveToken, slippage, sendTransactionAsync, onSuccess]);

  if (!payToken || !receiveToken) return null;

  const amountNum = parseFloat(amount) || 0;
  const estimatedOutput = quote?.amountOut || 0;
  const hasQuote = !!quote && !quote.error;
  const isGettingQuote = isLoadingQuote;
  const payValueUSD = amountNum * (payToken.priceUSD || 0);
  const receiveValueUSD = estimatedOutput * (receiveToken.priceUSD || 0);
  const minimumReceived = estimatedOutput * (1 - slippage / 100);
  const isButtonDisabled = !amountNum || !hasQuote || isExecuting || !isConnected;

  const TokenSelector = () => (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[9999] flex items-center justify-center p-4">
      <div className="bg-slate-800 rounded-2xl w-full max-w-md max-h-[80vh] overflow-hidden">
        <div className="p-4 border-b border-white/10 flex justify-between items-center sticky top-0 bg-slate-800">
          <h3 className="text-lg font-semibold text-white">Select Token</h3>
          <button onClick={() => setIsTokenSelectorOpen(false)} className="text-gray-400 hover:text-white text-xl">✕</button>
        </div>
        <div className="p-2 max-h-[60vh] overflow-y-auto">
          {Object.values(POPULAR_TOKENS).map((t) => (
            <button
              key={t.symbol}
              onClick={() => handleSelectToken(t, selectorMode)}
              disabled={isExecuting}
              className="w-full flex items-center gap-3 p-3 hover:bg-white/10 rounded-xl transition"
            >
              <div className="w-10 h-10 rounded-full overflow-hidden bg-gradient-to-br from-blue-500 to-purple-600">
                <img src={t.logo} alt={t.symbol} className="w-full h-full object-cover" onError={(e) => { e.target.style.display = 'none'; }} />
              </div>
              <div className="flex-1 text-left">
                <div className="font-medium text-white">{t.symbol}</div>
                <div className="text-xs text-gray-400">{t.name}</div>
              </div>
              <div className="text-sm text-white">${t.priceUSD?.toLocaleString()}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 p-4">
      {isTokenSelectorOpen && <TokenSelector />}

      {swapError && (
        <div className="mb-3 p-3 bg-red-500/20 border border-red-500/30 rounded-xl">
          <p className="text-red-400 text-sm">{swapError}</p>
          <button onClick={() => setSwapError('')} className="text-xs text-red-300 mt-1 underline">Dismiss</button>
        </div>
      )}

      {swapSuccess && (
        <div className="mb-3 p-3 bg-green-500/20 border border-green-500/30 rounded-xl">
          <p className="text-green-400 text-sm">{swapSuccess}</p>
        </div>
      )}

      {txHash && (
        <div className="mb-3 p-2 bg-green-500/20 rounded-lg text-center">
          <p className="text-green-400 text-xs">Transaction sent!</p>
          <a href={`https://basescan.org/tx/${txHash}`} target="_blank" rel="noopener noreferrer" className="text-green-300 text-xs hover:underline">
            {txHash.slice(0, 10)}...{txHash.slice(-8)}
          </a>
        </div>
      )}

      <div className="flex justify-between mb-4">
        <span className="text-sm text-white font-medium">Swap</span>
        <span className="text-xs bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full">⚡ 0x Aggregator</span>
      </div>

      {/* Pay Section */}
      <div className="p-3 rounded-xl bg-black/30 mb-2">
        <div className="flex justify-between mb-2">
          <span className="text-sm text-gray-400">You pay</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { setSelectorMode('pay'); setIsTokenSelectorOpen(true); }} className="flex items-center gap-2 px-3 py-2 bg-white/10 rounded-xl">
            <div className="w-6 h-6 rounded-full overflow-hidden">
              {payToken.logo && <img src={payToken.logo} alt={payToken.symbol} className="w-full h-full object-cover" onError={(e) => { e.target.style.display = 'none'; }} />}
            </div>
            <span className="text-white font-medium">{payToken.symbol}</span>
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </button>
          <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.0" className="flex-1 bg-transparent text-xl text-white text-right outline-none" />
        </div>
        <div className="text-right text-xs text-gray-500 mt-1">≈ ${payValueUSD.toFixed(2)}</div>
      </div>

      {/* Switch */}
      <div className="flex justify-center -my-2">
        <button onClick={handleSwitchTokens} className="w-7 h-7 bg-purple-600 rounded-full flex items-center justify-center text-white text-xs hover:bg-purple-500">↓↑</button>
      </div>

      {/* Receive Section */}
      <div className="p-3 rounded-xl bg-black/30 mt-2">
        <div className="flex justify-between mb-2">
          <span className="text-sm text-gray-400">You receive</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { setSelectorMode('receive'); setIsTokenSelectorOpen(true); }} className="flex items-center gap-2 px-3 py-2 bg-white/10 rounded-xl">
            <div className="w-6 h-6 rounded-full overflow-hidden">
              {receiveToken.logo && <img src={receiveToken.logo} alt={receiveToken.symbol} className="w-full h-full object-cover" onError={(e) => { e.target.style.display = 'none'; }} />}
            </div>
            <span className="text-white font-medium">{receiveToken.symbol}</span>
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </button>
          <div className="flex-1 text-right">
            <div className="text-xl text-white font-mono">
              {isGettingQuote ? <span className="text-gray-400 text-sm animate-pulse">...</span> : estimatedOutput.toFixed(6)}
            </div>
            <div className="text-xs text-green-400 mt-1">≈ ${receiveValueUSD.toFixed(2)}</div>
          </div>
        </div>
      </div>

      {/* Details */}
      {hasQuote && amountNum > 0 && (
        <div className="mt-3 p-3 rounded-xl bg-black/30 border border-white/10">
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Rate</span>
            <span className="text-white">1 {payToken.symbol} = {(estimatedOutput / amountNum).toFixed(6)} {receiveToken.symbol}</span>
          </div>
          <div className="flex justify-between text-sm mt-1">
            <span className="text-gray-400">Min. received</span>
            <span className="text-white">{minimumReceived.toFixed(6)} {receiveToken.symbol}</span>
          </div>
          <div className="flex justify-between text-sm mt-1 pt-1 border-t border-white/10">
            <span className="text-gray-400">Fee ({FEE_PERCENT}%)</span>
            <span className="text-white">{(amountNum * 0.003).toFixed(6)} {payToken.symbol}</span>
          </div>
        </div>
      )}

      {/* Slippage */}
      <div className="mt-3">
        <div className="flex justify-between mb-2">
          <span className="text-sm text-white">Slippage</span>
          <span className="text-xs text-gray-400">{slippage}%</span>
        </div>
        <div className="flex gap-2 flex-wrap">
          {slippageOptions.map(s => (
            <button key={s} onClick={() => { setSlippage(s); setIsCustomSlippage(false); }} className={`px-3 py-1 rounded-lg text-sm ${slippage === s && !isCustomSlippage ? 'bg-purple-600 text-white' : 'bg-white/10 text-gray-300'}`}>{s}%</button>
          ))}
          <input type="number" step="0.1" min="0" max="50" placeholder="Custom" value={isCustomSlippage ? slippage : ''} onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v) && v >= 0 && v <= 50) { setSlippage(v); setIsCustomSlippage(true); } }} className="w-20 px-2 py-1 rounded-lg bg-white/10 border border-white/20 text-white text-sm text-center" />
        </div>
      </div>

      <div className="mt-3 p-2 rounded-lg bg-yellow-500/10 text-center">
        <p className="text-yellow-400 text-xs">⚠️ Double-check details. Transactions are irreversible.</p>
      </div>

      {!isConnected && amountNum > 0 && (
        <div className="mt-2 p-2 rounded-lg bg-blue-500/20 text-center">
          <p className="text-blue-400 text-xs">🔌 Connect wallet to swap</p>
        </div>
      )}

      {(isGettingQuote || isExecuting) && (
        <div className="mt-3 p-2 bg-blue-500/20 rounded-lg text-center">
          <div className="flex items-center justify-center gap-2">
            <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-blue-400 text-xs">{isGettingQuote ? 'Getting best price...' : 'Swapping...'}</p>
          </div>
        </div>
      )}

      <button onClick={handleSwap} disabled={isButtonDisabled} className={`w-full mt-3 py-4 rounded-xl font-semibold transition ${isButtonDisabled ? 'bg-white/10 text-gray-400 cursor-not-allowed' : 'bg-gradient-to-r from-blue-500 to-purple-600 text-white hover:opacity-90'}`}>
        {!isConnected ? 'Connect Wallet' : !amountNum ? 'Enter amount' : !hasQuote ? 'Get quote' : isExecuting ? 'Swapping...' : `Swap ${payToken.symbol} → ${receiveToken.symbol}`}
      </button>

      <div className="text-center text-xs text-gray-500 mt-3">
        🔒 Non-custodial | 🛡️ 0.3% fee | ⚡ Powered by 0x on Base
      </div>
    </div>
  );
}