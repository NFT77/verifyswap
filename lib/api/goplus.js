// lib/api/goplus.js
const GOPLUS_API = 'https://api.gopluslabs.io/api/v1';

const CHAIN_ID_MAP = {
  base: '8453',
  ethereum: '1',
  bsc: '56',
  polygon: '137',
  arbitrum: '42161',
  optimism: '10',
  solana: 'solana',
};

const FETCH_TIMEOUT_MS = 8000;

async function fetchWithTimeout(url, options = {}, ms = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
    console.warn(`⏰ GoPlus timeout after ${ms}ms`);
  }, ms);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') throw new Error(`GoPlus timeout: ${url.substring(0, 60)}`);
    throw error;
  }
}

export async function checkTokenSecurity(tokenAddress, chain = 'base') {
  const chainId = CHAIN_ID_MAP[chain] || '8453';

  if (!tokenAddress) {
    console.error('GoPlus: No token address provided');
    return null;
  }

  try {
    const url = `${GOPLUS_API}/token_security/${chainId}?contract_addresses=${tokenAddress}`;
    console.log(`GoPlus: checking ${tokenAddress} on chain ${chainId}`);

    const response = await fetchWithTimeout(url, {
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      console.error(`GoPlus API error: ${response.status}`);
      return null;
    }

    const data = await response.json();

    // ✅ GoPlus returns code 1 for success (not '0' like OKX)
    if (data.code !== 1) {
      console.error(`GoPlus API error code: ${data.code}`, data.message);
      return null;
    }

    // GoPlus keys the result by lowercase address
    const result = data.result?.[tokenAddress.toLowerCase()];
    if (!result) {
      console.log(`No GoPlus security data for ${tokenAddress}`);
      return null;
    }

    const isHoneypot = result.is_honeypot === '1';
    const isFakeVolume = result.is_fake_volume === '1';
    const isVerified = result.is_open_source === '1'; // GoPlus uses is_open_source for verification
    const isOpenSource = result.is_open_source === '1';
    const isProxy = result.is_proxy === '1';
    const isMintable = result.is_mintable === '1';
    const isOwnerRenounced = result.owner_renounced === '1';
    const isBlacklisted = result.is_blacklisted === '1';
    const isWhitelisted = result.is_whitelisted === '1';
    const isAntiWhale = result.is_anti_whale === '1';
    const isTradingCooldown = result.is_trading_cooldown === '1';
    const holderCount = parseInt(result.holder_count) || 0;
    const top10HolderRate = parseFloat(result.top10_holder_rate) * 100 || 0; // GoPlus returns 0-1 ratio

    const riskFactors = [];
    if (isHoneypot) riskFactors.push('Honeypot detected');
    if (isFakeVolume) riskFactors.push('Fake volume detected');
    if (!isOpenSource) riskFactors.push('Contract not open source / unverified');
    if (isMintable) riskFactors.push('Token is mintable — supply can increase');
    if (isProxy && isMintable) riskFactors.push('Proxy contract with mint function — high risk');
    if (!isOwnerRenounced && result.owner_address) riskFactors.push('Owner not renounced');
    if (isBlacklisted) riskFactors.push('Blacklist function detected');
    if (isWhitelisted) riskFactors.push('Whitelist function detected');
    if (isAntiWhale) riskFactors.push('Anti-whale mechanism detected');
    if (isTradingCooldown) riskFactors.push('Trading cooldown detected');
    if (top10HolderRate > 50) riskFactors.push(`High holder concentration — top 10 own ${top10HolderRate.toFixed(1)}%`);

    let riskLevel = 'low';
    if (isHoneypot) {
      riskLevel = 'critical';
    } else if (isBlacklisted || (isProxy && isMintable)) {
      riskLevel = 'high';
    } else if (isFakeVolume || !isOpenSource || !isOwnerRenounced || holderCount < 100) {
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

    return tokenAddresses
      .map(address => {
        const result = data.result?.[address.toLowerCase()];
        if (!result) return null;
        return {
          address,
          isHoneypot: result.is_honeypot === '1',
          isFakeVolume: result.is_fake_volume === '1',
          isVerified: result.is_open_source === '1',
          riskLevel: result.is_honeypot === '1' ? 'critical' : 'unknown',
          riskFactors: [],
        };
      })
      .filter(Boolean);
  } catch (error) {
    console.error('GoPlus multiple tokens error:', error.message);
    return [];
  }
}

export { CHAIN_ID_MAP };