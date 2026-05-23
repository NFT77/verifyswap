// lib/api/etherscan.js
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY;

const CHAIN_IDS = {
  base: '8453',
  ethereum: '1',
  bsc: '56',
  polygon: '137',
  arbitrum: '42161',
  optimism: '10',
  avalanche: '43114',
};

const V2_BASE_URL = 'https://api.etherscan.io/v2/api';
const FETCH_TIMEOUT_MS = 7000;

// ✅ FIXED: accept options param like all other fetchWithTimeout helpers
async function fetchWithTimeout(url, options = {}, ms = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
    console.warn(`⏰ Etherscan timeout after ${ms}ms`);
  }, ms);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') throw new Error(`Etherscan timeout: ${url.substring(0, 60)}`);
    throw error;
  }
}

function buildV2Url(chain, module, action, params = {}) {
  const chainId = CHAIN_IDS[chain];
  if (!chainId) throw new Error(`Unsupported chain: ${chain}`);

  const urlParams = new URLSearchParams({
    chainid: chainId,
    module,
    action,
    apikey: ETHERSCAN_API_KEY || '',
    ...params,
  });

  return `${V2_BASE_URL}?${urlParams.toString()}`;
}

export async function verifyTokenContract(tokenAddress, chain = 'base') {
  if (!ETHERSCAN_API_KEY) {
    console.warn('ETHERSCAN_API_KEY not set');
    return null;
  }
  if (!tokenAddress) return null;

  try {
    const url = buildV2Url(chain, 'contract', 'getabi', { address: tokenAddress });
    const response = await fetchWithTimeout(url, {}, FETCH_TIMEOUT_MS);
    if (!response.ok) return null;

    const data = await response.json();

    if (data.status === '1' && data.result) {
      const isVerified = data.result !== 'Contract source code not verified';
      return { isVerified };
    }

    return { isVerified: false };
  } catch (error) {
    console.error('Etherscan verification error:', error.message);
    return null;
  }
}

export async function getTokenSourceCode(tokenAddress, chain = 'base') {
  if (!ETHERSCAN_API_KEY) return null;
  if (!tokenAddress) return null;

  try {
    const url = buildV2Url(chain, 'contract', 'getsourcecode', { address: tokenAddress });
    const response = await fetchWithTimeout(url, {}, FETCH_TIMEOUT_MS);
    if (!response.ok) return null;

    const data = await response.json();
    if (data.status === '1' && data.result?.[0]) {
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

export async function getTokenHolders(tokenAddress, chain = 'base', limit = 10) {
  if (!ETHERSCAN_API_KEY) return null;
  if (!tokenAddress) return null;

  try {
    const url = buildV2Url(chain, 'token', 'tokenholderlist', {
      contractaddress: tokenAddress,
    });
    const response = await fetchWithTimeout(url, {}, FETCH_TIMEOUT_MS);
    if (!response.ok) return null;

    const data = await response.json();
    if (data.status === '1' && data.result) {
      const holders = data.result.slice(0, limit);
      let totalSupply = 0;
      for (const holder of holders) {
        totalSupply += parseFloat(holder.balance || 0);
      }

      const topHolderPercent = holders.length > 0 && totalSupply > 0
        ? (parseFloat(holders[0]?.balance || 0) / totalSupply) * 100
        : 0;

      return {
        totalHolders: data.result.length,
        topHolders: holders.map(h => ({
          address: h.address,
          balance: h.balance,
          percent: totalSupply > 0 ? (parseFloat(h.balance) / totalSupply) * 100 : 0,
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
    const response = await fetchWithTimeout(url, {}, FETCH_TIMEOUT_MS);
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

    if (verification && !verification.isVerified) {
      riskFactors.push('Unverified contract');
      riskLevel = 'high';
    }
    if (holders?.concentrationRisk === 'high') {
      riskFactors.push('High holder concentration (>50% owned by top holder)');
      riskLevel = 'high';
    } else if (holders?.concentrationRisk === 'medium') {
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

export async function getAccountBalance(address, chain = 'base') {
  if (!ETHERSCAN_API_KEY) return null;
  if (!address) return null;

  try {
    const url = buildV2Url(chain, 'account', 'balance', {
      address,
      tag: 'latest',
    });
    const response = await fetchWithTimeout(url, {}, FETCH_TIMEOUT_MS);
    if (!response.ok) return null;

    const data = await response.json();

    if (data.status === '1' && data.result) {
      // ✅ FIXED: result is decimal string from Etherscan, not hex
      const raw = data.result;
      const parsed = /^0x/i.test(raw) ? parseInt(raw, 16) : parseFloat(raw);
      return parsed / 1e18;
    }
    return null;
  } catch (error) {
    console.error('Etherscan balance error:', error.message);
    return null;
  }
}

export { CHAIN_IDS };