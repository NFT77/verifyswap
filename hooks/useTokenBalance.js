// hooks/useTokenBalance.js
import { useReadContract, useAccount } from 'wagmi';
import { formatUnits, erc20Abi } from 'viem';
import { useEffect, useState, useCallback, useMemo } from 'react';

// Minimal ERC20 ABI (menggunakan viem's built-in jika tersedia, atau custom)
const ERC20_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'decimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint8' }],
  },
  {
    type: 'function',
    name: 'symbol',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'string' }],
  },
  {
    type: 'function',
    name: 'name',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'string' }],
  },
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
  },
];

/**
 * Hook untuk mendapatkan balance token ERC20
 * @param {string} tokenAddress - Alamat kontrak token
 * @param {number} decimals - Decimals token (opsional, jika tidak akan fetch dari contract)
 * @returns {Object} { balance, formattedBalance, symbol, decimals, isLoading, error, refetch }
 */
export function useTokenBalance(tokenAddress, decimals = null) {
  const { address, isConnected } = useAccount();
  const [formattedBalance, setFormattedBalance] = useState('0');
  const [tokenDecimals, setTokenDecimals] = useState(decimals || 18);
  const [tokenSymbol, setTokenSymbol] = useState('');
  const [tokenName, setTokenName] = useState('');

  // Cek apakah token address valid
  const isValidToken = useMemo(() => {
    return tokenAddress && tokenAddress.startsWith('0x') && tokenAddress.length === 42;
  }, [tokenAddress]);

  // Fetch balance
  const { data: balance, isLoading: isLoadingBalance, error: balanceError, refetch: refetchBalance } = useReadContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [address],
    query: {
      enabled: !!address && isConnected && isValidToken,
    },
  });

  // Fetch decimals jika tidak disediakan
  const { data: decimalsData, isLoading: isLoadingDecimals } = useReadContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'decimals',
    args: [],
    query: {
      enabled: isValidToken && decimals === null,
    },
  });

  // Fetch symbol
  const { data: symbolData, isLoading: isLoadingSymbol } = useReadContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'symbol',
    args: [],
    query: {
      enabled: isValidToken,
    },
  });

  // Fetch name
  const { data: nameData } = useReadContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'name',
    args: [],
    query: {
      enabled: isValidToken,
    },
  });

  // Update decimals jika dari contract
  useEffect(() => {
    if (decimalsData !== undefined && decimalsData !== null) {
      setTokenDecimals(decimalsData);
    }
  }, [decimalsData]);

  // Update symbol
  useEffect(() => {
    if (symbolData) {
      setTokenSymbol(symbolData);
    }
  }, [symbolData]);

  // Update name
  useEffect(() => {
    if (nameData) {
      setTokenName(nameData);
    }
  }, [nameData]);

  // Format balance
  useEffect(() => {
    if (balance !== undefined && balance !== null) {
      try {
        const formatted = formatUnits(balance, tokenDecimals);
        setFormattedBalance(formatted);
      } catch (err) {
        console.error('Error formatting balance:', err);
        setFormattedBalance('0');
      }
    } else {
      setFormattedBalance('0');
    }
  }, [balance, tokenDecimals]);

  const isLoading = isLoadingBalance || isLoadingDecimals || isLoadingSymbol;
  const hasBalance = balance !== undefined && balance !== null && balance > 0n;

  // Refetch function
  const refetch = useCallback(() => {
    refetchBalance();
  }, [refetchBalance]);

  return {
    balance: balance,
    formattedBalance: formattedBalance,
    symbol: tokenSymbol,
    name: tokenName,
    decimals: tokenDecimals,
    isLoading: isLoading,
    error: balanceError,
    isConnected: isConnected && !!address,
    hasBalance,
    refetch,
  };
}

/**
 * Hook untuk mendapatkan allowance token
 * @param {string} tokenAddress - Alamat kontrak token
 * @param {string} spenderAddress - Alamat spender (router)
 * @returns {Object} { allowance, formattedAllowance, isLoading, refetch }
 */
export function useTokenAllowance(tokenAddress, spenderAddress) {
  const { address, isConnected } = useAccount();
  const [tokenDecimals, setTokenDecimals] = useState(18);
  const [formattedAllowance, setFormattedAllowance] = useState('0');

  // Fetch decimals
  const { data: decimalsData } = useReadContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'decimals',
    args: [],
    query: {
      enabled: !!tokenAddress,
    },
  });

  // Fetch allowance
  const { data: allowance, isLoading, error, refetch } = useReadContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [address, spenderAddress],
    query: {
      enabled: !!address && isConnected && !!tokenAddress && !!spenderAddress,
    },
  });

  useEffect(() => {
    if (decimalsData !== undefined && decimalsData !== null) {
      setTokenDecimals(decimalsData);
    }
  }, [decimalsData]);

  useEffect(() => {
    if (allowance !== undefined && allowance !== null) {
      try {
        const formatted = formatUnits(allowance, tokenDecimals);
        setFormattedAllowance(formatted);
      } catch (err) {
        console.error('Error formatting allowance:', err);
        setFormattedAllowance('0');
      }
    }
  }, [allowance, tokenDecimals]);

  return {
    allowance,
    formattedAllowance,
    isLoading,
    error,
    refetch,
  };
}

/**
 * Hook untuk mendapatkan multiple token balances sekaligus
 * @param {Array} tokenAddresses - Array alamat kontrak token
 * @returns {Object} { balances, isLoading, refetchAll }
 */
export function useMultipleTokenBalances(tokenAddresses) {
  const { address, isConnected } = useAccount();
  const [balances, setBalances] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [errors, setErrors] = useState({});

  const fetchAllBalances = useCallback(async () => {
    if (!address || !isConnected || !tokenAddresses.length) {
      setBalances({});
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const results = {};
    const errorResults = {};

    for (const token of tokenAddresses) {
      try {
        // Use simple RPC call for multiple tokens
        const response = await fetch('/api/token/balance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address, tokenAddress: token.address }),
        });
        
        if (response.ok) {
          const data = await response.json();
          results[token.symbol || token.address] = {
            balance: data.balance,
            formattedBalance: data.formattedBalance,
            symbol: token.symbol,
          };
        } else {
          errorResults[token.symbol || token.address] = `Failed to fetch balance`;
        }
      } catch (err) {
        errorResults[token.symbol || token.address] = err.message;
      }
    }

    setBalances(results);
    setErrors(errorResults);
    setIsLoading(false);
  }, [address, isConnected, tokenAddresses]);

  useEffect(() => {
    fetchAllBalances();
  }, [fetchAllBalances]);

  return {
    balances,
    isLoading,
    errors,
    refetchAll: fetchAllBalances,
  };
}

/**
 * Hook untuk mendapatkan formated balance dengan nilai USD
 * @param {string} tokenAddress - Alamat kontrak token
 * @param {number} priceUSD - Harga token dalam USD
 * @returns {Object} { formattedBalance, valueUSD, isLoading }
 */
export function useTokenBalanceWithValue(tokenAddress, priceUSD = 0) {
  const { formattedBalance, isLoading, symbol } = useTokenBalance(tokenAddress);
  const [valueUSD, setValueUSD] = useState(0);

  useEffect(() => {
    if (formattedBalance && priceUSD) {
      setValueUSD(parseFloat(formattedBalance) * priceUSD);
    } else {
      setValueUSD(0);
    }
  }, [formattedBalance, priceUSD]);

  return {
    balance: formattedBalance,
    valueUSD,
    symbol,
    isLoading,
    formattedValue: valueUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  };
}