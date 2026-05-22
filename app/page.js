'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useAccount } from 'wagmi';
import { motion, AnimatePresence } from 'framer-motion';
import SearchBar from '@/components/SearchBar';
import SearchHistory from '@/components/SearchHistory';
import WalletPortfolio from '@/components/WalletPortfolio';
import SwapWidget from '@/components/SwapWidget';
import TrustScore from '@/components/TrustScore';
import TokenIcon from '@/components/TokenIcon';
import TrendingTokens from '@/components/TrendingTokens';
import { FarcasterWalletConnector } from '@/components/FarcasterWalletConnector';

export default function Home() {
  // ============ WALLET HOOKS ============
  const { isConnected: isBaseConnected } = useAccount();
  
  // ============ STATE ============
  const [searchResult, setSearchResult] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedToken, setSelectedToken] = useState(null);
  const [imageErrors, setImageErrors] = useState({});
  const [refreshPortfolio, setRefreshPortfolio] = useState(0);
  
  const swapSectionRef = useRef(null);

  // ============ HANDLERS ============
  const handleImageError = useCallback((fid) => {
    setImageErrors(prev => ({ ...prev, [fid]: true }));
  }, []);

  const handleSearch = useCallback(async (query) => {
    if (!query || query.trim() === '') return;
    
    setIsLoading(true);
    setSearchResult(null);
    setSelectedToken(null);
    setImageErrors({});
    
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&chain=base`);
      const data = await res.json();
      setSearchResult(data);
      
      if (data.type === 'token' && data.token && !data.notFound) {
        setSelectedToken(data.token);
      }
      
      if (typeof window !== 'undefined' && window.addToSearchHistory && !data.notFound && !data.error) {
        window.addToSearchHistory(query, {
          name: data.token?.name || data.profile?.displayName || query,
          symbol: data.token?.symbol || data.profile?.username || query,
          type: data.type || 'search',
        });
      }
    } catch (error) {
      console.error('Search error:', error);
      setSearchResult({ error: 'Search failed. Please try again.' });
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleSwapButtonClick = useCallback((token) => {
    setSelectedToken(token);
    setTimeout(() => {
      swapSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  }, []);

  const handleSwapSuccess = useCallback(() => {
    setRefreshPortfolio(prev => prev + 1);
  }, []);

  const handleTrendingTokenSelect = useCallback((token) => {
    // Search the trending token
    handleSearch(token.address);
  }, [handleSearch]);

  // ============ RENDER ============
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900/20 to-slate-900">
      {/* NAVBAR */}
      <nav className="fixed top-0 w-full bg-black/30 backdrop-blur-xl border-b border-white/10 z-50">
        <div className="container mx-auto px-4 py-3 flex justify-between items-center">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
              <span className="text-white font-bold text-sm">🛡️</span>
            </div>
            <span className="font-bold text-xl bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
              VerifySwap
            </span>
          </div>
          
          {/* Network Badge - Hanya Base */}
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-blue-500/20 rounded-full">
            <img 
              src="https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/base/info/logo.png" 
              alt="Base" 
              className="w-4 h-4 rounded-full"
            />
            <span className="text-sm text-blue-300">Base Network</span>
          </div>
          
          {/* Connect Button - Menggunakan FarcasterWalletConnector */}
          <div className="flex items-center gap-3">
            <FarcasterWalletConnector />
          </div>
        </div>
      </nav>

      {/* MAIN CONTENT */}
      <main className="pt-24 pb-16 px-4">
        <div className="container mx-auto max-w-4xl">
          {/* Hero Section */}
          <div className="text-center mb-8">
            <h1 className="text-4xl md:text-5xl font-bold mb-4">
              <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                Verify & Swap
              </span>
              <br />
              <span className="text-white">with Confidence</span>
            </h1>
            <p className="text-gray-400 max-w-lg mx-auto">
              Search creator trust scores, verify tokens, and swap securely on Base
            </p>
          </div>

          {/* Badges */}
          <div className="flex justify-center gap-3 mb-8 flex-wrap">
            <div className="px-3 py-1 bg-blue-500/20 border border-blue-500/50 rounded-full text-blue-300 text-xs flex items-center gap-1.5">
              <img 
                src="https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/base/info/logo.png" 
                alt="Base" 
                className="w-3.5 h-3.5 rounded-full"
              />
              <span>Powered by Uniswap V3</span>
            </div>
            <span className="px-3 py-1 bg-green-500/20 border border-green-500/50 rounded-full text-green-300 text-xs flex items-center gap-1">
              <span>💎</span> 0.3% Fee Only
            </span>
            <span className="px-3 py-1 bg-purple-500/20 border border-purple-500/50 rounded-full text-purple-300 text-xs flex items-center gap-1">
              <span>🛡️</span> Scam Detection
            </span>
          </div>

          {/* Search Section */}
          <div className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 p-6 mb-6">
            <SearchBar onSearch={handleSearch} isLoading={isLoading} placeholder="Search by Token Address, FID, or Username..." />
            
            <AnimatePresence>
              {searchResult && !isLoading && (
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="mt-6">
                  {searchResult.error ? (
                    <div className="text-center py-8 text-red-400">{searchResult.error}</div>
                  ) : searchResult.type === 'token' && !searchResult.notFound ? (
                    <div className="space-y-4">
                      <div className="flex items-center gap-4 p-4 bg-gradient-to-r from-purple-500/10 to-blue-500/10 rounded-xl border border-purple-500/20">
                        <TokenIcon tokenAddress={searchResult.token?.address} symbol={searchResult.token?.symbol} logoUrl={searchResult.token?.logo} size={56} />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="text-xl font-bold text-white">{searchResult.token?.symbol}</h3>
                            {searchResult.token?.priceUSD > 0 && <span className="text-sm text-green-400">${searchResult.token.priceUSD.toFixed(6)}</span>}
                          </div>
                          <p className="text-gray-400 text-sm">{searchResult.token?.name}</p>
                          <p className="text-xs text-gray-500 mt-1 font-mono">{searchResult.token?.address?.slice(0, 10)}...{searchResult.token?.address?.slice(-8)}</p>
                        </div>
                        <div className="text-right">
                          <TrustScore score={searchResult.token?.trustScore || 50} />
                          <button onClick={() => handleSwapButtonClick(searchResult.token)} className="mt-2 px-4 py-1.5 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg text-white text-sm font-medium hover:opacity-90 transition">Swap →</button>
                        </div>
                      </div>
                      
                      {/* Security Scan Results */}
                      <div className="bg-gradient-to-r from-red-500/10 via-yellow-500/10 to-green-500/10 border border-white/20 rounded-xl p-4">
                        <h3 className="text-md font-semibold text-white mb-3 flex items-center gap-2">
                          <span>🛡️</span> Security Scan Results for {searchResult.token?.symbol}
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm mb-4">
                          <div className={`flex items-center justify-between p-2 rounded-lg ${searchResult.token?.isHoneypot ? 'bg-red-500/30 text-red-400' : 'bg-green-500/30 text-green-400'}`}>
                            <div className="flex items-center gap-2"><span>{searchResult.token?.isHoneypot ? '🔴' : '🟢'}</span><span>Honeypot</span></div>
                            <span className="text-xs font-mono">{searchResult.token?.isHoneypot ? 'DETECTED' : 'CLEAR'}</span>
                          </div>
                          <div className={`flex items-center justify-between p-2 rounded-lg ${searchResult.token?.isFakeVolume ? 'bg-red-500/30 text-red-400' : 'bg-green-500/30 text-green-400'}`}>
                            <div className="flex items-center gap-2"><span>{searchResult.token?.isFakeVolume ? '🔴' : '🟢'}</span><span>Fake Volume</span></div>
                            <span className="text-xs font-mono">{searchResult.token?.isFakeVolume ? 'SUSPICIOUS' : 'CLEAR'}</span>
                          </div>
                          <div className={`flex items-center justify-between p-2 rounded-lg ${!searchResult.token?.isVerified ? 'bg-yellow-500/30 text-yellow-400' : 'bg-green-500/30 text-green-400'}`}>
                            <div className="flex items-center gap-2"><span>{searchResult.token?.isVerified ? '🟢' : '🟡'}</span><span>Contract Verified</span></div>
                            <span className="text-xs font-mono">{searchResult.token?.isVerified ? 'VERIFIED' : 'UNVERIFIED'}</span>
                          </div>
                          <div className={`flex items-center justify-between p-2 rounded-lg ${searchResult.token?.isMintable ? 'bg-yellow-500/30 text-yellow-400' : 'bg-green-500/30 text-green-400'}`}>
                            <div className="flex items-center gap-2"><span>{searchResult.token?.isMintable ? '⚠️' : '✅'}</span><span>Mintable</span></div>
                            <span className="text-xs font-mono">{searchResult.token?.isMintable ? 'YES' : 'NO'}</span>
                          </div>
                          <div className={`flex items-center justify-between p-2 rounded-lg ${!searchResult.token?.isOwnerRenounced ? 'bg-yellow-500/30 text-yellow-400' : 'bg-green-500/30 text-green-400'}`}>
                            <div className="flex items-center gap-2"><span>{searchResult.token?.isOwnerRenounced ? '✅' : '⚠️'}</span><span>Owner Renounced</span></div>
                            <span className="text-xs font-mono">{searchResult.token?.isOwnerRenounced ? 'YES' : 'NO'}</span>
                          </div>
                          <div className={`flex items-center justify-between p-2 rounded-lg ${(searchResult.token?.holderCount || 0) < 100 ? 'bg-yellow-500/30 text-yellow-400' : 'bg-green-500/30 text-green-400'}`}>
                            <div className="flex items-center gap-2"><span>👥</span><span>Holders</span></div>
                            <span className="text-xs font-mono">{searchResult.token?.holderCount?.toLocaleString() || 'N/A'}</span>
                          </div>
                          <div className={`flex items-center justify-between p-2 rounded-lg ${(searchResult.token?.top10HolderRate || 0) > 50 ? 'bg-red-500/30 text-red-400' : (searchResult.token?.top10HolderRate || 0) > 30 ? 'bg-yellow-500/30 text-yellow-400' : 'bg-green-500/30 text-green-400'}`}>
                            <div className="flex items-center gap-2"><span>📊</span><span>Top 10 Holders</span></div>
                            <span className="text-xs font-mono">{searchResult.token?.top10HolderRate ? `${searchResult.token.top10HolderRate}%` : 'N/A'}</span>
                          </div>
                          <div className={`col-span-2 flex items-center justify-between p-2 rounded-lg ${
                            searchResult.token?.riskLevel === 'critical' ? 'bg-red-500/30 text-red-400' :
                            searchResult.token?.riskLevel === 'high' ? 'bg-red-500/30 text-red-400' :
                            searchResult.token?.riskLevel === 'medium' ? 'bg-yellow-500/30 text-yellow-400' :
                            'bg-green-500/30 text-green-400'
                          }`}>
                            <div className="flex items-center gap-2"><span>⚠️</span><span>Risk Level</span></div>
                            <span className="text-xs font-mono uppercase">{searchResult.token?.riskLevel || 'UNKNOWN'}</span>
                          </div>
                        </div>
                        
                        {searchResult.token?.riskFactors && searchResult.token.riskFactors.length > 0 && (
                          <div className="mt-3 p-2 bg-red-500/10 rounded-lg">
                            <p className="text-xs text-red-300 mb-1">⚠️ Risk Factors:</p>
                            <ul className="text-xs text-gray-300 list-disc list-inside">
                              {searchResult.token.riskFactors.slice(0, 5).map((factor, idx) => <li key={idx}>{factor}</li>)}
                              {searchResult.token.riskFactors.length > 5 && <li className="text-gray-500">+{searchResult.token.riskFactors.length - 5} more risks</li>}
                            </ul>
                          </div>
                        )}
                        
                        <div className={`mt-3 p-2 rounded-lg text-center text-xs ${
                          searchResult.token?.riskLevel === 'critical' || searchResult.token?.isHoneypot
                            ? 'bg-red-500/30 text-red-200' 
                            : searchResult.token?.riskLevel === 'high'
                              ? 'bg-red-500/30 text-red-200'
                              : searchResult.token?.riskLevel === 'medium' || searchResult.token?.isFakeVolume || !searchResult.token?.isVerified
                                ? 'bg-yellow-500/30 text-yellow-200'
                                : 'bg-green-500/30 text-green-200'
                        }`}>
                          {searchResult.token?.isHoneypot ? (
                            <span>🔴 CRITICAL: Honeypot detected! DO NOT BUY! You cannot sell this token.</span>
                          ) : searchResult.token?.riskLevel === 'critical' || searchResult.token?.riskLevel === 'high' ? (
                            <span>⚠️ HIGH RISK: This token has multiple red flags. Avoid swapping!</span>
                          ) : searchResult.token?.riskLevel === 'medium' ? (
                            <span>⚠️ MEDIUM RISK: Proceed with caution. Do your own research.</span>
                          ) : (
                            <span>✅ LOW RISK: No critical issues detected. Still DYOR.</span>
                          )}
                        </div>
                        
                        <p className="text-gray-500 text-xs mt-2 text-center">
                          📊 Price & Liquidity: DexScreener | 🖼️ Logo: CoinGecko / Moralis | 🔒 Security: GoPlus Labs + Etherscan
                        </p>                      
                      </div>
                    </div>
                  ) : searchResult.type === 'fid' && !searchResult.notFound ? (
                    <div className="flex items-center gap-4 p-4 bg-gradient-to-r from-purple-500/10 to-blue-500/10 rounded-xl border border-purple-500/20">
                      <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center overflow-hidden flex-shrink-0">
                        {searchResult.profile?.pfp_url && !imageErrors[searchResult.fid] ? (
                          <img src={searchResult.profile.pfp_url} alt="Profile" className="w-full h-full object-cover" onError={() => handleImageError(searchResult.fid)} />
                        ) : (<span className="text-3xl">👤</span>)}
                      </div>
                      <div className="flex-1">
                        <h3 className="text-xl font-bold text-white">@{searchResult.profile?.username}</h3>
                        <p className="text-gray-400 text-sm">{searchResult.profile?.displayName}</p>
                        {searchResult.profile?.followerCount > 0 && <p className="text-xs text-gray-500">👥 {searchResult.profile.followerCount.toLocaleString()} followers</p>}
                      </div>
                      <div className="text-right"><TrustScore score={searchResult.trustScore || 50} /></div>
                    </div>
                  ) : searchResult.notFound ? (
                    <div className="text-center py-8 bg-yellow-500/10 rounded-xl border border-yellow-500/20">
                      <div className="text-4xl mb-2">🔍❌</div>
                      <div className="text-gray-300">No results found</div>
                    </div>
                  ) : null}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Trending Tokens Section */}
          <div className="mb-6">
            <TrendingTokens onSelectToken={handleTrendingTokenSelect} limit={8} />
          </div>

          {/* Search History */}
          <div className="mb-6">
            <SearchHistory onSelect={handleSearch} />
          </div>

          {/* Wallet Portfolio */}
          {isBaseConnected && (
            <div className="mb-6">
              <WalletPortfolio network="base" refreshTrigger={refreshPortfolio} />
            </div>
          )}

          {/* Swap Widget */}
          {selectedToken && (
            <div id="swap" ref={swapSectionRef} className="mb-6 scroll-mt-24">
              <SwapWidget token={selectedToken} network="base" onSuccess={handleSwapSuccess} />
            </div>
          )}

          {/* Fee Info */}
          <div id="fees" className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-5 mb-4">
            <h3 className="text-lg font-semibold text-amber-300 mb-3 flex items-center gap-2">
              <span>💰</span> Fee Structure
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-300">VerifySwap Platform Fee</span><span className="text-amber-400 font-mono">0.3%</span></div>
              <div className="flex justify-between"><span className="text-gray-300">Uniswap V3 LP Fee</span><span className="text-gray-400 font-mono">~0.05% - 1%</span></div>
              <div className="border-t border-white/10 my-2 pt-2">
                <div className="flex justify-between"><span className="text-gray-300">Total Estimated Fee</span><span className="text-white font-mono">~0.35% - 1.3%</span></div>
              </div>
            </div>
            <p className="text-gray-500 text-xs mt-3">
              Platform fee goes to development, security audits, and API costs.
            </p>
          </div>

          {/* Footer */}
          <footer className="mt-6 pt-6 border-t border-white/10 text-center text-gray-500 text-xs">
            <p>© 2026 VerifySwap — supports development & security</p>
            <div className="flex justify-center gap-6 mt-3">
              <div className="flex items-center gap-1.5">
                <img src="https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/base/info/logo.png" alt="Base" className="w-4 h-4 rounded-full" />
                <span>Base</span>
              </div>
              <div className="flex items-center gap-1"><span>🛡️</span><span>Audited</span></div>
            </div>
          </footer>
        </div>
      </main>
    </div>
  );
}