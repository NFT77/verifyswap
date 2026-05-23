'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAccount, useWalletClient, useSendTransaction, useWriteContract } from 'wagmi';
import TokenIcon from './TokenIcon';

const FEE_RECIPIENT = '0x462be091Ef7Cfae820bb032a3cf2729fcAaD6e47';

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
    logo: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599/logo.png',
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

async function fetchWithTimeout(url, options = {}, ms = 15000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return res;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') throw new Error('Request timed out. Please try again.');
    throw err;
  }
}

export default function SwapWidget({ token, onSuccess }) {
  const { address, isConnected, status } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { sendTransactionAsync } = useSendTransaction();
  const { writeContractAsync } = useWriteContract();

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

  // Update receive token when token prop changes
  useEffect(() => {
    if (!token?.address) return;
    const found = Object.values(POPULAR_TOKENS).find(
      t => t.address === token.address || t.symbol === token.symbol
    );
    setReceiveToken(found || {
      symbol: token.symbol,
      name: token.name || token.symbol,
      address: token.address,
      logo: token.logo || null,
      decimals: token.decimals || 18,
      priceUSD: token.priceUSD || 0,
    });
  }, [token]);

  useEffect(() => {
    if (swapSuccess) {
      const t = setTimeout(() => setSwapSuccess(''), 6000);
      return () => clearTimeout(t);
    }
  }, [swapSuccess]);

  const slippageOptions = useMemo(() => [0.5, 1, 2, 3], []);

  // Fetch quote from 0x
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

        // Pass taker address if connected for better quote accuracy
        const takerParam = address ? `&taker=${address}` : '';

        const res = await fetchWithTimeout(
          `/api/swap/quote?chain=base&tokenIn=${tokenIn}&tokenOut=${tokenOut}&amount=${amount}&slippage=${slippage}${takerParam}`,
          {},
          15000
        );

        if (!res.ok) throw new Error(`Quote API error: ${res.status}`);

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
        setSwapError(err.message?.includes('timed out') ? 'Quote timed out. Please try again.' : (err.message || 'Failed to get quote'));
        setQuote(null);
      } finally {
        if (!cancelled) setIsLoadingQuote(false);
      }
    }

    const timeout = setTimeout(fetchQuote, 600);
    return () => { cancelled = true; clearTimeout(timeout); };
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

  const getUserFriendlyError = useCallback((err) => {
    const msg = (err.message || '').toLowerCase();
    if (msg.includes('user rejected') || msg.includes('denied')) return '❌ Transaction rejected by user.';
    if (msg.includes('insufficient')) return '❌ Insufficient balance for this swap.';
    if (msg.includes('slippage') || msg.includes('price')) return '❌ Price moved. Try increasing slippage.';
    if (msg.includes('timed out')) return '❌ Request timed out. Please try again.';
    return `❌ Swap failed: ${err.shortMessage || err.message || 'Unknown error'}`;
  }, []);

  const handleSwap = useCallback(async () => {
    if (!quote || !address || !isConnected) return;

    setIsExecuting(true);
    setSwapError('');
    setSwapSuccess('');

    try {
      const amountIn = parseFloat(amount);

      // Get firm quote with permit2 tx data from execute API
      const res = await fetchWithTimeout('/api/swap/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chain: 'base',
          tokenIn: payToken.address,
          tokenOut: receiveToken.address,
          amount: amountIn,
          slippage,
          userAddress: address,
        }),
      }, 20000);

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Execute API error: ${res.status}`);
      }

      const result = await res.json();

      if (!result.success || !result.transaction) {
        throw new Error(result.error || 'No transaction data returned');
      }

      // Step 1: ERC20 approval if needed (non-ETH input tokens)
      if (result.approval) {
        console.log('Sending ERC20 approval...');
        const approvalHash = await sendTransactionAsync({
          to: result.approval.to,
          data: result.approval.data,
          value: BigInt(result.approval.value || '0'),
        });
        console.log('Approval tx:', approvalHash);
        // Wait briefly for approval to propagate
        await new Promise(r => setTimeout(r, 1500));
      }

      // Step 2: Sign permit2 if required
      if (result.permit2?.eip712) {
        console.log('Signing permit2...');
        const signature = await walletClient.signTypedData(result.permit2.eip712);
        // Append signature to transaction data
        // 0x handles this by appending the signature to calldata
        const sigBytes = signature.slice(2); // remove 0x
        result.transaction.data = result.transaction.data + sigBytes;
        console.log('Permit2 signed');
      }

      // Step 3: Send swap transaction
      console.log('Sending swap transaction...');
      const hash = await sendTransactionAsync({
        to: result.transaction.to,
        data: result.transaction.data,
        value: BigInt(result.transaction.value || '0'),
        gas: result.transaction.gas ? BigInt(result.transaction.gas) : undefined,
      });

      setTxHash(hash);
      setSwapSuccess(`✅ Swap sent! ${amountIn} ${payToken.symbol} → ${receiveToken.symbol}`);
      onSuccess?.();

    } catch (err) {
      console.error('Swap error:', err);
      setSwapError(getUserFriendlyError(err));
    } finally {
      setIsExecuting(false);
    }
  }, [quote, address, isConnected, amount, payToken, receiveToken, slippage, walletClient, sendTransactionAsync, onSuccess, getUserFriendlyError]);

  if (!payToken || !receiveToken) return null;

  const amountNum = parseFloat(amount) || 0;
  const estimatedOutput = quote?.amountOut || 0;
  const hasQuote = !!quote && !quote.error;
  const isGettingQuote = isLoadingQuote;
  const payValueUSD = amountNum * (payToken.priceUSD || 0);
  const receiveValueUSD = estimatedOutput * (receiveToken.priceUSD || 0);
  const minimumReceived = estimatedOutput * (1 - slippage / 100);
  const isButtonDisabled = !amountNum || !hasQuote || isExecuting || !isConnected;

  const getSlippageWarning = () => {
    if (slippage >= 3) return { text: '⚠️ High slippage. Consider a lower value.', color: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20' };
    if (slippage <= 0.3) return { text: '✅ Low slippage — may fail in volatile markets.', color: 'text-green-400 bg-green-500/10 border-green-500/20' };
    return null;
  };
  const slippageWarning = getSlippageWarning();

  const TokenSelector = () => (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[9999] flex items-center justify-center p-4">
      <div className="bg-slate-800 rounded-2xl w-full max-w-md max-h-[80vh] overflow-hidden">
        <div className="p-4 border-b border-white/10 flex justify-between items-center bg-slate-800 sticky top-0">
          <h3 className="text-lg font-semibold text-white">Select a token</h3>
          <button onClick={() => setIsTokenSelectorOpen(false)} className="text-gray-400 hover:text-white text-xl w-8 h-8 flex items-center justify-center">✕</button>
        </div>
        <div className="p-2 max-h-[60vh] overflow-y-auto">
          <div className="text-xs text-gray-500 px-3 py-2">Popular</div>
          {Object.values(POPULAR_TOKENS).map((t) => (
            <button
              key={t.symbol}
              onClick={() => handleSelectToken(t, selectorMode)}
              disabled={isExecuting}
              className="w-full flex items-center gap-3 p-3 hover:bg-white/10 rounded-xl transition disabled:opacity-50"
            >
              <div className="w-10 h-10 rounded-full overflow-hidden bg-gradient-to-br from-blue-500 to-purple-600 flex-shrink-0">
                {t.logo && <img src={t.logo} alt={t.symbol} className="w-full h-full object-cover" onError={(e) => { e.target.style.display = 'none'; }} />}
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
    <div className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 p-4 overflow-x-hidden">
      {isTokenSelectorOpen && <TokenSelector />}

      {swapError && (
        <div className="mb-3 p-3 bg-red-500/20 border border-red-500/30 rounded-xl">
          <p className="text-red-400 text-sm whitespace-pre-line">{swapError}</p>
          <button onClick={() => setSwapError('')} className="text-xs text-red-300 mt-1 underline">Dismiss</button>
        </div>
      )}

      {swapSuccess && (
        <div className="mb-3 p-3 bg-green-500/20 border border-green-500/30 rounded-xl">
          <p className="text-green-400 text-sm">{swapSuccess}</p>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm font-medium text-white">Swap</div>
        <div className="flex items-center gap-2">
          <span className="text-xs bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full">⚡ 0x Aggregator</span>
          {status === 'reconnecting' && <span className="text-xs bg-yellow-500/20 text-yellow-300 px-2 py-0.5 rounded-full animate-pulse">🔄 Reconnecting...</span>}
        </div>
      </div>

      {/* You Pay */}
      <div className="p-3 rounded-xl bg-black/30 mb-2">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm text-gray-400">You pay</span>
          <span className="text-xs text-gray-500">Balance: --</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => { setSelectorMode('pay'); setIsTokenSelectorOpen(true); }} disabled={isExecuting} className="flex items-center gap-2 px-3 py-2 bg-white/10 rounded-xl hover:bg-white/20 transition disabled:opacity-50 flex-shrink-0">
            <div className="w-6 h-6 rounded-full overflow-hidden flex-shrink-0">
              {payToken.logo && <img src={payToken.logo} alt={payToken.symbol} className="w-full h-full object-cover" onError={(e) => { e.target.style.display = 'none'; }} />}
            </div>
            <span className="font-medium text-white">{payToken.symbol}</span>
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </button>
          <div className="flex-1 min-w-[100px]">
            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.0" disabled={isExecuting} className="w-full bg-transparent text-xl text-white text-right outline-none disabled:opacity-50" />
          </div>
        </div>
        <div className="text-right text-xs text-gray-500 mt-1">≈ ${payValueUSD.toFixed(2)}</div>
      </div>

      {/* Switch */}
      <div className="flex justify-center -my-2 relative z-10">
        <button onClick={handleSwitchTokens} disabled={isExecuting} className="w-7 h-7 bg-purple-600 rounded-full flex items-center justify-center text-white text-xs hover:bg-purple-500 transition disabled:opacity-50">↓↑</button>
      </div>

      {/* You Receive */}
      <div className="p-3 rounded-xl bg-black/30 mb-3">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm text-gray-400">You receive (estimated)</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => { setSelectorMode('receive'); setIsTokenSelectorOpen(true); }} disabled={isExecuting} className="flex items-center gap-2 px-3 py-2 bg-white/10 rounded-xl hover:bg-white/20 transition disabled:opacity-50 flex-shrink-0">
            <div className="w-6 h-6 rounded-full overflow-hidden flex-shrink-0">
              {receiveToken.logo && <img src={receiveToken.logo} alt={receiveToken.symbol} className="w-full h-full object-cover" onError={(e) => { e.target.style.display = 'none'; }} />}
            </div>
            <span className="font-medium text-white">{receiveToken.symbol}</span>
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </button>
          <div className="flex-1 text-right">
            <div className="text-xl text-white font-mono">
              {isGettingQuote ? <span className="text-gray-400 text-sm animate-pulse">...</span> : estimatedOutput > 0 ? estimatedOutput.toFixed(6) : '0.000000'}
            </div>
            <div className="text-xs text-green-400 mt-1">≈ ${receiveValueUSD.toFixed(2)}</div>
          </div>
        </div>
      </div>

      {/* Quote details */}
      {hasQuote && amountNum > 0 && !isGettingQuote && (
        <div className="mb-3 p-3 rounded-xl bg-black/30 border border-white/10 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">Rate</span>
            <span className="text-white">1 {payToken.symbol} = {(estimatedOutput / amountNum).toFixed(6)} {receiveToken.symbol}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Min. Received</span>
            <span className="text-white">{minimumReceived.toFixed(6)} {receiveToken.symbol}</span>
          </div>
          <div className="flex justify-between pt-2 border-t border-white/10">
            <span className="text-gray-400">Platform Fee (0.3%)</span>
            <span className="text-white">{(amountNum * 0.003).toFixed(6)} {payToken.symbol}</span>
          </div>
        </div>
      )}

      {/* Slippage */}
      <div className="mb-3">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-medium text-white">Slippage Tolerance</span>
          <span className={`text-xs ${slippage >= 3 ? 'text-yellow-400' : 'text-green-400'}`}>{slippage}%</span>
        </div>
        <div className="flex gap-2 flex-wrap">
          {slippageOptions.map((s) => (
            <button key={s} onClick={() => { setSlippage(s); setIsCustomSlippage(false); }} disabled={isExecuting}
              className={`px-3 py-1.5 rounded-lg text-sm transition ${slippage === s && !isCustomSlippage ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white' : 'bg-white/10 text-gray-300 hover:bg-white/20'} disabled:opacity-50`}>
              {s}%
            </button>
          ))}
          <input type="number" step="0.1" min="0" max="50" value={isCustomSlippage ? slippage : ''} onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v) && v >= 0 && v <= 50) { setSlippage(v); setIsCustomSlippage(true); } }} placeholder="Custom" disabled={isExecuting}
            className="w-20 px-2 py-1.5 rounded-lg bg-white/10 border border-white/20 text-white text-sm text-center outline-none focus:border-purple-500 disabled:opacity-50" />
        </div>
        {slippageWarning && (
          <div className={`mt-2 p-2 rounded-lg text-xs border ${slippageWarning.color}`}>{slippageWarning.text}</div>
        )}
      </div>

      {/* Warning */}
      <div className="mb-3 p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-center">
        <p className="text-yellow-400 text-xs">⚠️ Double-check details. Transactions are irreversible.</p>
      </div>

      {!isConnected && amountNum > 0 && (
        <div className="mb-3 p-2 rounded-lg bg-blue-500/20 border border-blue-500/20 text-center">
          <p className="text-blue-400 text-xs">🔌 Connect wallet to swap</p>
        </div>
      )}

      {txHash && (
        <div className="mb-3 p-2 bg-green-500/20 rounded-lg text-center">
          <p className="text-green-400 text-xs">Transaction sent!</p>
          <a href={`https://basescan.org/tx/${txHash}`} target="_blank" rel="noopener noreferrer" className="text-green-300 text-xs font-mono hover:underline">
            {txHash.slice(0, 10)}...{txHash.slice(-8)}
          </a>
        </div>
      )}

      {(isGettingQuote || isExecuting) && (
        <div className="mb-3 p-2 bg-blue-500/20 rounded-lg text-center">
          <div className="flex items-center justify-center gap-2">
            <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-blue-400 text-xs">{isGettingQuote ? 'Getting best price from 0x...' : 'Executing swap...'}</p>
          </div>
        </div>
      )}

      {/* Swap Button */}
      <button onClick={handleSwap} disabled={isButtonDisabled || status === 'reconnecting'}
        className={`w-full py-4 rounded-xl font-semibold transition ${!isButtonDisabled && status !== 'reconnecting' ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white hover:opacity-90 active:scale-[0.98]' : 'bg-white/10 text-gray-400 cursor-not-allowed'}`}>
        {status === 'reconnecting' ? '🔄 Reconnecting...' :
         !isConnected ? 'Connect Wallet to Swap' :
         !amountNum ? 'Enter an amount' :
         !hasQuote && !isGettingQuote ? 'Failed to get quote' :
         isGettingQuote ? 'Getting quote...' :
         isExecuting ? 'Swapping...' :
         `Swap ${amountNum} ${payToken.symbol} → ${receiveToken.symbol}`}
      </button>

      <div className="text-center text-xs text-gray-500 mt-3">
        🔒 Non-custodial | 🛡️ 0.3% fee | ⚡ Powered by 0x on Base
      </div>
    </div>
  );
}