// hooks/useNativeBalance.js
import { useBalance, useAccount } from 'wagmi';
import { base } from 'wagmi/chains';
import { useEffect, useState, useCallback } from 'react';

// Chain ID ke nama mapping
const CHAIN_NAMES = {
  8453: 'Base',
};

/**
 * Hook untuk mendapatkan balance native (ETH di Base)
 * @param {Object} options - Opsi tambahan
 * @param {number} options.chainId - Chain ID (default: base.id)
 * @returns {Object} { balance, formattedBalance, symbol, isLoading, isConnected, refetch, chainName }
 */
export function useNativeBalance({ chainId = base.id } = {}) {
  const { address, isConnected } = useAccount();
  const [formattedBalance, setFormattedBalance] = useState('0');
  const [chainName, setChainName] = useState(CHAIN_NAMES[chainId] || 'Base');

  const { data: balance, isLoading, error, refetch } = useBalance({
    address: address,
    chainId: chainId,
    query: {
      enabled: !!address && isConnected,
    },
  });

  // Update formatted balance when balance changes
  useEffect(() => {
    if (balance && balance.formatted) {
      setFormattedBalance(balance.formatted);
    } else {
      setFormattedBalance('0');
    }
  }, [balance]);

  // Update chain name when chainId changes
  useEffect(() => {
    setChainName(CHAIN_NAMES[chainId] || 'Base');
  }, [chainId]);

  return {
    balance: balance?.value,
    formattedBalance: formattedBalance,
    symbol: balance?.symbol || 'ETH',
    decimals: balance?.decimals || 18,
    isLoading: isLoading,
    error: error,
    isConnected: isConnected && !!address,
    refetch: refetch,
    chainId: chainId,
    chainName: chainName,
  };
}

/**
 * Hook untuk mendapatkan balance native Base (ETH)
 * @returns {Object} Balance data untuk Base network
 */
export function useBaseBalance() {
  return useNativeBalance({ chainId: base.id });
}