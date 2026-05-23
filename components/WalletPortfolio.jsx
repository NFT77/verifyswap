'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAccount } from 'wagmi';
import TokenIcon from './TokenIcon';

// Popular tokens on Base network
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
    logo: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599/logo.png', // ✅ Fixed WBTC logo URL
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

// Skeleton component for loading state
const PortfolioSkeleton = () => (
  <div className="bg-gradient-to-br from-slate-800/50 to-slate-900/50 backdrop-blur-xl rounded-2xl border border-white/10 p-4">
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
      {[1, 2, 3, 4].map(i => (
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

// Individual token row component
const TokenRow = ({ token, balance, valueUSD, onTokenClick }) => (
  <div 
    onClick={() => onTokenClick?.(token)}
    className="flex items-center justify-between p-3 rounded-xl hover:bg-white/5 transition-all duration-200 cursor-pointer group"
  >
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-full overflow-hidden bg-gradient-to-br from-blue-500 to-purple-600 flex-shrink-0">
        <img 
          src={token.logo} 
          alt={token.symbol}
          className="w-full h-full object-cover"
          onError={(e) => { e.target.style.display = 'none'; }}
        />
      </div>
      <div>
        <div className="font-semibold text-white group-hover:text-blue-400 transition">
          {token.symbol}
        </div>
        <div className="text-xs text-gray-400">{token.name}</div>
      </div>
    </div>
    <div className="text-right">
      <div className="font-mono text-white font-medium">
        {balance.toFixed(4)} {token.symbol}
      </div>
      {valueUSD > 0 && (
        <div className="text-xs text-green-400">
          ≈ ${valueUSD.toLocaleString()}
        </div>
      )}
    </div>
  </div>
);

// Main component
export default function WalletPortfolio({ network = 'base', refreshTrigger = 0, onTokenSelect }) {
  const { address: baseAddress, isConnected: isBaseConnected } = useAccount();
  const [balances, setBalances] = useState({});
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

  // Fetch token balances using public RPC
  const fetchTokenBalances = useCallback(async (address) => {
    const results = {};
    
    // Fetch native ETH balance
    try {
      const ethResponse = await fetch('https://mainnet.base.org', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_getBalance',
          params: [address, 'latest'],
          id: 1,
        }),
      });
      const ethData = await ethResponse.json();
      const ethBalance = parseInt(ethData.result, 16) / 1e18;
      results.ETH = { balance: ethBalance, priceUSD: 3200, valueUSD: ethBalance * 3200 };
    } catch (err) {
      console.error('ETH balance error:', err);
      results.ETH = { balance: 0, priceUSD: 3200, valueUSD: 0 };
    }

    // Fetch popular token balances
    const tokenList = [POPULAR_TOKENS.USDC, POPULAR_TOKENS.WBTC, POPULAR_TOKENS.WETH];
    
    for (const token of tokenList) {
      try {
        // Simple ERC-20 balanceOf call via RPC
        const data = `0x70a08231000000000000000000000000${address.slice(2)}`;
        const response = await fetch('https://mainnet.base.org', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'eth_call',
            params: [{ to: token.address, data }, 'latest'],
            id: 1,
          }),
        });
        const result = await response.json();
        const balanceRaw = parseInt(result.result, 16);
        const balance = balanceRaw / Math.pow(10, token.decimals);
        
        // Use price from token object
        const priceUSD = token.priceUSD || 0;
        
        results[token.symbol] = {
          balance,
          priceUSD,
          valueUSD: balance * priceUSD,
        };
      } catch (err) {
        console.error(`${token.symbol} balance error:`, err);
        results[token.symbol] = { balance: 0, priceUSD: 0, valueUSD: 0 };
      }
    }
    
    return results;
  }, []);

  // Load portfolio data
  const loadPortfolio = useCallback(async (isManualRefresh = false) => {
    if (!baseAddress) return;
    
    setIsLoading(true);
    if (isManualRefresh) setIsRefreshing(true);
    setError(null);
    
    try {
      const tokenBalances = await fetchTokenBalances(baseAddress);
      setBalances(tokenBalances);
      
      const total = Object.values(tokenBalances).reduce((sum, t) => sum + (t.valueUSD || 0), 0);
      setTotalValue(total);
    } catch (err) {
      console.error('Portfolio load error:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [baseAddress, fetchTokenBalances]);

  // Manual refresh handler
  const handleRefresh = useCallback(() => {
    loadPortfolio(true);
  }, [loadPortfolio]);

  // Handle token click to swap
  const handleTokenClick = useCallback((tokenSymbol) => {
    const tokenData = POPULAR_TOKENS[tokenSymbol];
    if (tokenData && onTokenSelect) {
      onTokenSelect(tokenData);
    }
  }, [onTokenSelect]);

  // Load portfolio on mount and when dependencies change
  useEffect(() => {
    if (baseAddress && isBaseConnected) {
      loadPortfolio();
    }
  }, [baseAddress, isBaseConnected, refreshTrigger, loadPortfolio]);

  // Show skeleton on initial load
  if (isLoading && Object.keys(balances).length === 0) {
    return <PortfolioSkeleton />;
  }

  // Show error state
  if (error) {
    return (
      <div className="bg-gradient-to-br from-slate-800/50 to-slate-900/50 backdrop-blur-xl rounded-2xl border border-white/10 p-4 text-center">
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

  // Don't show if not connected
  if (!isBaseConnected || !baseAddress) return null;

  // Token display order
  const tokenOrder = ['ETH', 'USDC', 'WBTC', 'WETH'];
  const displayTokens = tokenOrder.filter(symbol => balances[symbol] && balances[symbol].balance > 0);

  return (
    <div className="bg-gradient-to-br from-slate-800/50 to-slate-900/50 backdrop-blur-xl rounded-2xl border border-white/10 p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
            <span className="text-white text-sm">💰</span>
          </div>
          <h3 className="text-lg font-semibold text-white">Portfolio</h3>
          {totalValue > 0 && (
            <span className="text-xs bg-green-500/20 text-green-300 px-2 py-0.5 rounded-full">
              ${totalValue.toLocaleString()}
            </span>
          )}
        </div>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="p-2 text-gray-400 hover:text-white transition disabled:opacity-50 rounded-lg hover:bg-white/10"
          title="Refresh portfolio"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>
      
      {/* Wallet Address Card */}
      <div 
        onClick={() => copyToClipboard(baseAddress)}
        className="relative overflow-hidden rounded-xl mb-4 cursor-pointer group"
      >
        <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 to-purple-600/20 rounded-xl blur-3xl group-hover:blur-2xl transition-all duration-500"></div>
        <div className="relative flex items-center justify-between p-4 rounded-xl bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-white/10 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
              <span className="text-white text-lg">Ξ</span>
            </div>
            <div>
              <div className="font-semibold text-white">Wallet</div>
              <div className="text-xs text-gray-400 font-mono flex items-center gap-1">
                {formatAddress(baseAddress)}
              </div>
            </div>
          </div>
          <div className="text-right">
            {copied ? (
              <span className="text-xs text-green-400 flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Copied!
              </span>
            ) : (
              <svg className="w-4 h-4 text-gray-400 group-hover:text-white transition" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            )}
          </div>
        </div>
      </div>

      {/* Loading State */}
      {isRefreshing ? (
        <div className="text-center py-8 text-gray-400">Refreshing...</div>
      ) : (
        <>
          {/* Total Portfolio Value */}
          {totalValue > 0 && (
            <div className="mb-4 p-3 rounded-xl bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-500/20 text-center">
              <div className="text-xs text-gray-400">Total Portfolio Value</div>
              <div className="text-2xl font-bold text-green-400">
                ${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
          )}

          {/* Token Holdings */}
          <div className="space-y-1">
            <div className="text-xs text-gray-500 px-2 pb-2">Assets</div>
            {displayTokens.map((symbol) => {
              const token = POPULAR_TOKENS[symbol];
              const balance = balances[symbol];
              if (!balance || balance.balance === 0) return null;
              
              return (
                <TokenRow
                  key={symbol}
                  token={token}
                  balance={balance.balance}
                  valueUSD={balance.valueUSD}
                  onTokenClick={() => handleTokenClick(symbol)}
                />
              );
            })}
          </div>

          {displayTokens.length === 0 && (
            <div className="text-center py-6 text-gray-500 text-sm">
              No assets found in this wallet
            </div>
          )}
        </>
      )}
    </div>
  );
}