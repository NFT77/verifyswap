// lib/api/goplus.js
const GOPLUS_API = 'https://api.gopluslabs.io/api/v1';

// Chain ID mapping
const CHAIN_ID_MAP = {
  base: '8453',
  ethereum: '1',
  bsc: '56',
  polygon: '137',
  arbitrum: '42161',
  optimism: '10',
  solana: 'solana',
};

// Timeout untuk fetch request (8 detik)
const FETCH_TIMEOUT_MS = 8000;

/**
 * Fetch dengan timeout untuk mencegah request menggantung terlalu lama
 * @param {string} url - URL to fetch
 * @param {object} options - Fetch options
 * @param {number} ms - Timeout in milliseconds
 * @returns {Promise<Response>}
 */
async function fetchWithTimeout(url, options = {}, ms = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
    console.warn(`⏰ GoPlus request timeout after ${ms}ms: ${url.substring(0, 80)}`);
  }, ms);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`GoPlus request timeout: ${url.substring(0, 80)}`);
    }
    throw error;
  }
}

/**
 * Check token security (honeypot, fake volume, etc.)
 * @param {string} tokenAddress - Token contract address
 * @param {string} chain - Chain name (base, ethereum, solana, etc.)
 * @returns {Promise<Object|null>} Security data
 */
export async function checkTokenSecurity(tokenAddress, chain = 'base') {
  const chainId = CHAIN_ID_MAP[chain] || '8453';
  
  if (!tokenAddress) {
    console.error('GoPlus: No token address provided');
    return null;
  }
  
  try {
    const url = `${GOPLUS_API}/token_security/${chainId}?contract_addresses=${tokenAddress}`;
    console.log(`Checking security for ${tokenAddress} on chain ${chain} (ID: ${chainId})`);
    
    const response = await fetchWithTimeout(url, {
      headers: { 'Accept': 'application/json' },
    });
    
    if (!response.ok) {
      console.error(`GoPlus API error: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    
    if (data.code !== 1) {
      console.error(`GoPlus API error code: ${data.code}`, data.message);
      return null;
    }
    
    const result = data.result?.[tokenAddress.toLowerCase()];
    if (!result) {
      console.log(`No security data found for ${tokenAddress}`);
      return null;
    }
    
    // Parse security results
    const isHoneypot = result.is_honeypot === '1';
    const isFakeVolume = result.is_fake_volume === '1';
    const isVerified = result.is_verified === '1';
    const isOpenSource = result.is_open_source === '1';
    const isProxy = result.is_proxy === '1';
    const isMintable = result.is_mintable === '1';
    const isOwnerRenounced = result.owner_renounced === '1';
    const isBlacklisted = result.is_blacklisted === '1';
    const isWhitelisted = result.is_whitelisted === '1';
    const isAntiWhale = result.is_anti_whale === '1';
    const isTradingCooldown = result.is_trading_cooldown === '1';
    const holderCount = parseInt(result.holder_count) || 0;
    const top10HolderRate = parseFloat(result.top10_holder_rate) || 0;
    
    // Build risk factors
    const riskFactors = [];
    if (isHoneypot) riskFactors.push('Honeypot detected');
    if (isFakeVolume) riskFactors.push('Fake volume detected');
    if (!isVerified) riskFactors.push('Contract not verified');
    if (!isOpenSource && isVerified) riskFactors.push('Contract not open source');
    if (isMintable) riskFactors.push('Token is mintable - supply can increase');
    if (isProxy && isMintable) riskFactors.push('Proxy contract with mint function - high risk');
    if (!isOwnerRenounced && result.owner_address) riskFactors.push('Owner not renounced');
    if (isBlacklisted) riskFactors.push('Blacklist function detected');
    if (isWhitelisted) riskFactors.push('Whitelist function detected');
    if (isAntiWhale) riskFactors.push('Anti-whale mechanism detected');
    if (isTradingCooldown) riskFactors.push('Trading cooldown detected');
    if (top10HolderRate > 50) riskFactors.push(`High holder concentration - top 10 own ${top10HolderRate}%`);
    
    // Determine risk level
    let riskLevel = 'low';
    if (isHoneypot) {
      riskLevel = 'critical';
    } else if (isBlacklisted || (isProxy && isMintable)) {
      riskLevel = 'high';
    } else if (isFakeVolume || !isVerified || !isOwnerRenounced || holderCount < 100) {
      riskLevel = 'medium';
    }
    
    return {
      isHoneypot,
      isFakeVolume,
      isVerified,
      ownerAddress: result.owner_address || null,
      ownerBalance: result.owner_balance || null,
      ownerPercent: result.owner_percent || null,
      isOpenSource,
      isProxy,
      isMintable,
      isOwnerRenounced,
      isBlacklisted,
      isWhitelisted,
      isAntiWhale,
      isTradingCooldown,
      holderCount,
      top10HolderRate,
      riskLevel,
      riskFactors,
      raw: result,
    };
    
  } catch (error) {
    console.error('GoPlus API error:', error.message);
    return null;
  }
}

/**
 * Check multiple tokens security at once
 * @param {string[]} tokenAddresses - Array of token addresses
 * @param {string} chain - Chain name
 * @returns {Promise<Array>} Array of security data
 */
export async function checkMultipleTokensSecurity(tokenAddresses, chain = 'base') {
  if (!tokenAddresses || tokenAddresses.length === 0) return [];
  
  const chainId = CHAIN_ID_MAP[chain] || '8453';
  const addressesParam = tokenAddresses.join(',');
  
  try {
    const response = await fetchWithTimeout(
      `${GOPLUS_API}/token_security/${chainId}?contract_addresses=${addressesParam}`,
      { headers: { 'Accept': 'application/json' } }
    );
    
    if (!response.ok) return [];
    
    const data = await response.json();
    if (data.code !== 1) return [];
    
    const results = [];
    for (const address of tokenAddresses) {
      const result = data.result?.[address.toLowerCase()];
      if (result) {
        results.push({
          address,
          isHoneypot: result.is_honeypot === '1',
          isFakeVolume: result.is_fake_volume === '1',
          isVerified: result.is_verified === '1',
          riskLevel: result.is_honeypot === '1' ? 'critical' : 'unknown',
          riskFactors: [],
        });
      }
    }
    
    return results;
  } catch (error) {
    console.error('GoPlus multiple tokens error:', error.message);
    return [];
  }
}

// Export chain ID map for reference
export { CHAIN_ID_MAP };