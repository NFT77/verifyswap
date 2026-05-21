'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAccount } from 'wagmi';
import TokenIcon from './TokenIcon';

// Skeleton component for loading state
const PortfolioSkeleton = () => (
  <div className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 p-4">
    <div className="flex items-center justify-between mb-3">
      <div className="h-6 w-24 bg-white/10 rounded animate-pulse"></div>
      <div className="h-5 w-16 bg-white/10 rounded animate-pulse"></div>
    </div>
    <div className="flex items-center justify-between p-3 rounded-xl bg-gradient-to-r from-purple-500/10 to-blue-500/10 mb-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-white/10 rounded-full animate-pulse"></div>
        <div>
          <div className="h-4 w-24 bg-white/10 rounded animate-pulse mb-1"></div>
          <div className="h-3 w-32 bg-white/10 rounded animate-pulse"></div>
        </div>
      </div>
      <div className="h-5 w-20 bg-white/10 rounded animate-pulse"></div>
    </div>
    <div className="space-y-2">
      {[1, 2, 3].map(i => (
        <div key={i} className="flex items-center justify-between p-2">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-white/10 rounded-full animate-pulse"></div>
            <div>
              <div className="h-4 w-16 bg-white/10 rounded animate-pulse mb-1"></div>
              <div className="h-3 w-24 bg-white/10 rounded animate-pulse"></div>
            </div>
          </div>
          <div className="h-4 w-16 bg-white/10 rounded animate-pulse"></div>
        </div>
      ))}
    </div>
  </div>
);

export default function WalletPortfolio({ network = 'base', refreshTrigger = 0 }) {
  const { address: baseAddress, isConnected: isBaseConnected } = useAccount();
  const [balance, setBalance] = useState(null);
  const [tokens, setTokens] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [totalValue, setTotalValue] = useState(0);

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const formatAddress = (address) => {
    if (!address) return '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  // Fetch token holdings untuk Base network via Blockscout API
  const fetchBaseTokens = useCallback(async (address) => {
    try {
      const response = await fetch(
        `https://api.blockscout.com/base/api/v2/addresses/${address}/tokens?type=ERC-20`
      );
      
      if (response.ok) {
        const data = await response.json();
        const tokenItems = data.items || [];
        
        return tokenItems.filter(t => {
          const balanceNum = parseFloat(t.balance) / Math.pow(10, t.token.decimals);
          return balanceNum > 0;
        }).map(t => ({
          address: t.token.contract_address,
          symbol: t.token.symbol || 'Unknown',
          name: t.token.name || t.token.symbol || 'Token',
          balance: (parseFloat(t.balance) / Math.pow(10, t.token.decimals)).toFixed(6),
          decimals: t.token.decimals,
          priceUSD: t.token.exchange_rate || 0,
          valueUSD: ((parseFloat(t.balance) / Math.pow(10, t.token.decimals)) * (t.token.exchange_rate || 0)).toFixed(2),
        }));
      }
    } catch (err) {
      console.error('Blockscout API error:', err);
    }
    return [];
  }, []);

  // Fetch native balance untuk Base via Blockscout
  const fetchBaseBalance = useCallback(async (address) => {
    try {
      const response = await fetch(
        `https://api.blockscout.com/base/api/v2/addresses/${address}`
      );
      if (response.ok) {
        const data = await response.json();
        const balanceEth = (parseFloat(data.coin_balance) / 1e18).toFixed(4);
        // Get ETH price (approx, bisa dari API lain)
        const ethPrice = 3200; // Sementara, bisa diganti dengan fetch dari CoinGecko
        return {
          formatted: balanceEth,
          symbol: 'ETH',
          value: parseFloat(balanceEth) * ethPrice,
        };
      }
    } catch (err) {
      console.error('Balance fetch error:', err);
    }
    return { formatted: '0', symbol: 'ETH', value: 0 };
  }, []);

  // Load portfolio data
  const loadPortfolio = useCallback(async (isManualRefresh = false) => {
    if (!baseAddress) return;
    
    setIsLoading(true);
    if (isManualRefresh) setIsRefreshing(true);
    setError(null);
    
    try {
      const [tokensList, nativeBalance] = await Promise.all([
        fetchBaseTokens(baseAddress),
        fetchBaseBalance(baseAddress),
      ]);
      
      setTokens(tokensList);
      setBalance(nativeBalance);
      
      const total = tokensList.reduce((sum, t) => sum + parseFloat(t.valueUSD || 0), 0) + nativeBalance.value;
      setTotalValue(total);
    } catch (err) {
      console.error('Portfolio load error:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [baseAddress, fetchBaseTokens, fetchBaseBalance]);

  // Manual refresh handler
  const handleRefresh = useCallback(() => {
    loadPortfolio(true);
  }, [loadPortfolio]);

  // Load portfolio on mount and when dependencies change
  useEffect(() => {
    if (baseAddress && isBaseConnected) {
      loadPortfolio();
    }
  }, [baseAddress, isBaseConnected, refreshTrigger, loadPortfolio]);

  // Show skeleton on initial load
  if (isLoading && !balance && tokens.length === 0) {
    return <PortfolioSkeleton />;
  }

  // Show error state
  if (error) {
    return (
      <div className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 p-4 text-center">
        <div className="text-red-400 text-sm mb-2">⚠️ Failed to load portfolio</div>
        <button 
          onClick={handleRefresh}
          className="text-xs text-purple-400 hover:text-purple-300 transition"
        >
          Try again
        </button>
      </div>
    );
  }

  // Tidak tampilkan jika tidak connect
  if (!isBaseConnected || !baseAddress) return null;

  return (
    <div className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <span>💰</span> Portfolio
          </h3>
          {totalValue > 0 && (
            <span className="text-xs bg-green-500/20 text-green-300 px-2 py-0.5 rounded-full">
              ≈ ${totalValue.toLocaleString()}
            </span>
          )}
        </div>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="text-xs text-gray-400 hover:text-white transition disabled:opacity-50"
          title="Refresh portfolio"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>
      
      {/* Wallet Address */}
      <div 
        onClick={() => copyToClipboard(baseAddress)}
        className="flex items-center justify-between p-3 rounded-xl bg-gradient-to-r from-blue-500/10 to-purple-500/10 mb-3 cursor-pointer hover:from-blue-500/20 hover:to-purple-500/20 transition group"
        title="Click to copy address"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
            <span>Ξ</span>
          </div>
          <div>
            <div className="font-semibold text-white">Wallet</div>
            <div className="text-xs text-gray-400 font-mono">{formatAddress(baseAddress)}</div>
          </div>
        </div>
        <div className="text-right">
          {copied ? (
            <span className="text-xs text-green-400">✓ Copied!</span>
          ) : (
            <svg className="w-4 h-4 text-gray-400 group-hover:text-white transition" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          )}
        </div>
      </div>

      {isRefreshing ? (
        <div className="text-center py-8 text-gray-400">Refreshing...</div>
      ) : (
        <>
          {/* Native Balance */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-gradient-to-r from-blue-500/10 to-purple-500/10 mb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                <span>Ξ</span>
              </div>
              <div>
                <div className="font-semibold text-white">ETH</div>
                <div className="text-xs text-gray-400">Native</div>
              </div>
            </div>
            <div className="text-right">
              <div className="font-mono text-white font-semibold">
                {balance?.formatted || '0'} ETH
              </div>
              {balance?.value > 0 && (
                <div className="text-xs text-gray-500">
                  ≈ ${balance.value.toFixed(2)}
                </div>
              )}
            </div>
          </div>

          {/* Token Holdings */}
          {tokens.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs text-gray-500 px-2">Token Holdings</div>
              {tokens.slice(0, 10).map((token, idx) => (
                <div key={idx} className="flex items-center justify-between p-2 rounded-lg hover:bg-white/5 transition">
                  <div className="flex items-center gap-3">
                    <TokenIcon tokenAddress={token.address} symbol={token.symbol} size={32} />
                    <div>
                      <div className="font-medium text-white text-sm">{token.symbol}</div>
                      <div className="text-xs text-gray-500">{token.name?.slice(0, 20)}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-white text-sm font-mono">
                      {parseFloat(token.balance).toFixed(4)}
                    </div>
                    {token.priceUSD > 0 && (
                      <div className="text-xs text-gray-500">
                        ≈ ${(parseFloat(token.balance) * token.priceUSD).toFixed(2)}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {tokens.length === 0 && (
            <div className="text-center py-6 text-gray-500 text-sm">
              No tokens found in this wallet
            </div>
          )}
        </>
      )}
    </div>
  );
}