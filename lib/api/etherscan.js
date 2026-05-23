// lib/api/etherscan.js - Etherscan API V2 with multi-chain support
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY;

// Chain ID mapping untuk Etherscan V2
const CHAIN_IDS = {
  base: '8453',
  ethereum: '1',
  bsc: '56',
  polygon: '137',
  arbitrum: '42161',
  optimism: '10',
  avalanche: '43114',
};

// Base URL untuk Etherscan V2
const V2_BASE_URL = 'https://api.etherscan.io/v2/api';

// Timeout untuk fetch request (7 detik)
const FETCH_TIMEOUT_MS = 7000;

/**
 * Fetch dengan timeout untuk mencegah request menggantung terlalu lama
 * @param {string} url - URL to fetch
 * @param {number} ms - Timeout in milliseconds
 * @returns {Promise<Response>}
 */
async function fetchWithTimeout(url, ms = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
    console.warn(`⏰ Etherscan request timeout after ${ms}ms: ${url.substring(0, 80)}`);
  }, ms);

  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`Etherscan request timeout: ${url.substring(0, 80)}`);
    }
    throw error;
  }
}

/**
 * Helper untuk membangun URL Etherscan V2
 */
function buildV2Url(chain, module, action, params = {}) {
  const chainId = CHAIN_IDS[chain];
  if (!chainId) {
    throw new Error(`Unsupported chain for Etherscan V2: ${chain}`);
  }
  
  const urlParams = new URLSearchParams({
    chainid: chainId,
    module: module,
    action: action,
    apikey: ETHERSCAN_API_KEY || '',
    ...params,
  });
  
  return `${V2_BASE_URL}?${urlParams.toString()}`;
}

/**
 * Verifikasi kontrak token
 * @param {string} tokenAddress - Token contract address
 * @param {string} chain - Chain name (default: 'base')
 * @returns {Promise<Object|null>} Verification result
 */
export async function verifyTokenContract(tokenAddress, chain = 'base') {
  if (!ETHERSCAN_API_KEY) {
    console.warn('ETHERSCAN_API_KEY not set, skipping contract verification');
    return null;
  }

  if (!tokenAddress) {
    console.warn('Etherscan: No token address provided');
    return null;
  }

  try {
    const url = buildV2Url(chain, 'contract', 'getabi', {
      address: tokenAddress,
    });
    
    console.log(`Verifying contract on ${chain}: ${url.substring(0, 100)}...`);
    const response = await fetchWithTimeout(url);
    
    if (!response.ok) return null;
    
    const data = await response.json();
    
    if (data.status === '1' && data.result) {
      // Cek apakah result adalah ABI yang valid (bukan pesan error)
      const isVerified = data.result !== 'Contract source code not verified';
      return {
        isVerified: isVerified,
        contractName: null,
        compilerVersion: null,
        optimizationUsed: null,
        runs: null,
      };
    }
    
    return { isVerified: false };
  } catch (error) {
    console.error('Etherscan verification error:', error.message);
    return null;
  }
}

/**
 * Dapatkan source code token
 * @param {string} tokenAddress - Token contract address
 * @param {string} chain - Chain name
 * @returns {Promise<Object|null>} Source code data
 */
export async function getTokenSourceCode(tokenAddress, chain = 'base') {
  if (!ETHERSCAN_API_KEY) return null;
  if (!tokenAddress) return null;

  try {
    const url = buildV2Url(chain, 'contract', 'getsourcecode', {
      address: tokenAddress,
    });
    
    const response = await fetchWithTimeout(url);
    if (!response.ok) return null;
    
    const data = await response.json();
    
    if (data.status === '1' && data.result && data.result[0]) {
      const source = data.result[0];
      return {
        sourceCode: source.SourceCode,
        abi: source.ABI,
        contractName: source.ContractName,
        compilerVersion: source.CompilerVersion,
        optimizationUsed: source.OptimizationUsed === '1',
        runs: source.Runs,
        licenseType: source.LicenseType,
      };
    }
    
    return null;
  } catch (error) {
    console.error('Etherscan source code error:', error.message);
    return null;
  }
}

/**
 * Dapatkan daftar holder token
 * @param {string} tokenAddress - Token contract address
 * @param {string} chain - Chain name
 * @param {number} limit - Max number of holders
 * @returns {Promise<Object|null>} Holder data
 */
export async function getTokenHolders(tokenAddress, chain = 'base', limit = 10) {
  if (!ETHERSCAN_API_KEY) return null;
  if (!tokenAddress) return null;

  try {
    const url = buildV2Url(chain, 'token', 'tokenholderlist', {
      contractaddress: tokenAddress,
    });
    
    const response = await fetchWithTimeout(url);
    if (!response.ok) return null;
    
    const data = await response.json();
    
    if (data.status === '1' && data.result) {
      const holders = data.result.slice(0, limit);
      
      // Hitung total supply dari holder list
      let totalSupply = 0;
      for (const holder of holders) {
        totalSupply += parseFloat(holder.balance || 0);
      }
      
      const topHolderPercent = holders.length > 0 
        ? (parseFloat(holders[0]?.balance || 0) / totalSupply) * 100 
        : 0;
      
      return {
        totalHolders: data.result.length,
        topHolders: holders.map(h => ({
          address: h.address,
          balance: h.balance,
          percent: (parseFloat(h.balance) / totalSupply) * 100,
        })),
        concentrationRisk: topHolderPercent > 50 ? 'high' : topHolderPercent > 20 ? 'medium' : 'low',
      };
    }
    
    return null;
  } catch (error) {
    console.error('Etherscan holders error:', error.message);
    return null;
  }
}

/**
 * Dapatkan transaksi token
 * @param {string} tokenAddress - Token contract address
 * @param {string} chain - Chain name
 * @param {number} limit - Max number of transactions
 * @returns {Promise<Array|null>} Transaction list
 */
export async function getTokenTransactions(tokenAddress, chain = 'base', limit = 10) {
  if (!ETHERSCAN_API_KEY) return null;
  if (!tokenAddress) return null;

  try {
    const url = buildV2Url(chain, 'account', 'tokentx', {
      contractaddress: tokenAddress,
      page: 1,
      offset: limit,
      sort: 'desc',
    });
    
    const response = await fetchWithTimeout(url);
    if (!response.ok) return null;
    
    const data = await response.json();
    
    if (data.status === '1' && data.result) {
      return data.result.map(tx => ({
        from: tx.from,
        to: tx.to,
        value: tx.value,
        timestamp: tx.timeStamp,
        hash: tx.hash,
        blockNumber: tx.blockNumber,
        confirmations: tx.confirmations,
      }));
    }
    
    return null;
  } catch (error) {
    console.error('Etherscan transactions error:', error.message);
    return null;
  }
}

/**
 * Risk assessment token (gabungan verifikasi dan holder)
 * @param {string} tokenAddress - Token contract address
 * @param {string} chain - Chain name
 * @returns {Promise<Object|null>} Risk assessment
 */
export async function getTokenRiskAssessment(tokenAddress, chain = 'base') {
  if (!ETHERSCAN_API_KEY) return null;
  if (!tokenAddress) return null;
  
  try {
    const [verification, holders] = await Promise.all([
      verifyTokenContract(tokenAddress, chain),
      getTokenHolders(tokenAddress, chain, 10),
    ]);
    
    let riskLevel = 'low';
    const riskFactors = [];
    
    // Cek verifikasi kontrak
    if (verification && !verification.isVerified) {
      riskFactors.push('Unverified contract');
      riskLevel = 'high';
    }
    
    // Cek konsentrasi holder
    if (holders && holders.concentrationRisk === 'high') {
      riskFactors.push('High holder concentration (>50% owned by top holder)');
      riskLevel = 'high';
    } else if (holders && holders.concentrationRisk === 'medium') {
      riskFactors.push('Medium holder concentration');
      if (riskLevel !== 'high') riskLevel = 'medium';
    }
    
    return {
      riskLevel,
      riskFactors,
      isVerified: verification?.isVerified || false,
      totalHolders: holders?.totalHolders || 0,
      concentrationRisk: holders?.concentrationRisk || 'unknown',
    };
  } catch (error) {
    console.error('Risk assessment error:', error.message);
    return null;
  }
}

/**
 * Get account balance for an address
 * @param {string} address - Wallet address
 * @param {string} chain - Chain name
 * @returns {Promise<number|null>} Balance in ETH
 */
export async function getAccountBalance(address, chain = 'base') {
  if (!ETHERSCAN_API_KEY) return null;
  if (!address) return null;

  try {
    const url = buildV2Url(chain, 'account', 'balance', {
      address: address,
      tag: 'latest',
    });
    
    const response = await fetchWithTimeout(url);
    if (!response.ok) return null;
    
    const data = await response.json();
    
    if (data.status === '1' && data.result) {
      return parseInt(data.result, 16) / 1e18;
    }
    
    return null;
  } catch (error) {
    console.error('Etherscan balance error:', error.message);
    return null;
  }
}

// Export chain IDs untuk referensi
export { CHAIN_IDS };