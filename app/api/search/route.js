// app/api/search/route.js

import { NextResponse } from 'next/server';
import { verifyTokenContract } from '@/lib/api/etherscan';
import { searchTokenOnCoinGecko } from '@/lib/api/coingecko';
import { searchTokenOnCMC } from '@/lib/api/coinmarketcap';
import { getTokenMetadataMoralis } from '@/lib/api/moralis';
import { checkTokenSecurity } from '@/lib/api/goplus';

const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY;

const tokenCache = new Map();
const CACHE_TTL = 30 * 1000;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
  'Cache-Control': 'no-store',
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') throw new Error(`Timeout after ${timeoutMs}ms`);
    throw err;
  }
}

function getCachedToken(address) {
  const cached = tokenCache.get(address.toLowerCase());
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) return cached.data;
  tokenCache.delete(address.toLowerCase());
  return null;
}

function setCachedToken(address, data) {
  if (tokenCache.size > 200) {
    const oldestKey = tokenCache.keys().next().value;
    tokenCache.delete(oldestKey);
  }
  tokenCache.set(address.toLowerCase(), { data, timestamp: Date.now() });
}

function mapUser(user) {
  return {
    fid: user.fid,
    username: user.username,
    displayName: user.display_name || user.username,
    pfp_url: user.pfp_url || user.pfp?.url || '',
    bio: user.profile?.bio?.text || '',
    followerCount: user.follower_count || 0,
    followingCount: user.following_count || 0,
    verifiedAddresses: user.verified_addresses?.eth_addresses || [],
  };
}

async function getDexScreenerData(address, chain) {
  try {
    const res = await fetchWithTimeout(
      `https://api.dexscreener.com/latest/dex/tokens/${address}`,
      {},
      8000
    );
    if (!res.ok) return null;
    const json = await res.json();
    const pair = json.pairs?.find(p =>
      chain === 'base' ? p.chainId === 'base' : p.chainId === 'solana'
    );
    if (!pair) return null;
    return {
      symbol: pair.baseToken?.symbol,
      name: pair.baseToken?.name,
      priceUSD: parseFloat(pair.priceUsd || 0),
      liquidityUSD: parseFloat(pair.liquidity?.usd || 0),
      volume24h: parseFloat(pair.volume?.h24 || 0),
      priceChange24h: parseFloat(pair.priceChange?.h24 || 0),
    };
  } catch (err) {
    console.error('DexScreener error:', err.message);
    return null;
  }
}

async function getTokenLogoFromMultipleSources(tokenAddress, chain) {
  const withTimeout = (fn, name) =>
    Promise.race([
      fn(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`${name} timeout`)), 6000)
      ),
    ]).catch(err => {
      console.error(`${name} error:`, err.message);
      return null;
    });

  const [geckoResult, cmcResult, moralisResult] = await Promise.all([
    withTimeout(() => searchTokenOnCoinGecko(tokenAddress, chain), 'CoinGecko'),
    withTimeout(() => searchTokenOnCMC(tokenAddress, chain), 'CoinMarketCap'),
    withTimeout(() => getTokenMetadataMoralis(tokenAddress, chain), 'Moralis'),
  ]);

  const best = geckoResult || cmcResult || moralisResult;
  if (!best) return null;

  return {
    logo: geckoResult?.logo || cmcResult?.logo || moralisResult?.logo || null,
    symbol: geckoResult?.symbol || cmcResult?.symbol || moralisResult?.symbol || null,
    name: geckoResult?.name || cmcResult?.name || moralisResult?.name || null,
    decimals: moralisResult?.decimals || geckoResult?.decimals || 18,
    priceUSD: geckoResult?.priceUSD || 0,
    volume24h: geckoResult?.volume24h || 0,
    priceChange24h: geckoResult?.priceChange24h || 0,
    marketCap: geckoResult?.marketCap || 0,
  };
}

async function getSecurityData(address, chain) {
  const result = {
    isHoneypot: false,
    isFakeVolume: false,
    hasHiddenOwner: false,
    isVerified: false,
    isMintable: false,
    isOwnerRenounced: false,
    holderCount: 0,
    top10HolderRate: 0,
    riskFactors: [],
    riskLevel: 'unknown',
  };

  if (chain !== 'base') return result;

  const [goplusResult, etherscanResult] = await Promise.allSettled([
    Promise.race([
      checkTokenSecurity(address, chain),
      new Promise((_, reject) => setTimeout(() => reject(new Error('GoPlus timeout')), 7000)),
    ]),
    Promise.race([
      verifyTokenContract(address),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Etherscan timeout')), 7000)),
    ]),
  ]);

  if (goplusResult.status === 'fulfilled' && goplusResult.value) {
    const g = goplusResult.value;
    result.isHoneypot = g.isHoneypot || false;
    result.isFakeVolume = g.isFakeVolume || false;
    result.hasHiddenOwner = !!g.ownerAddress;
    result.isMintable = g.isMintable || false;
    result.isOwnerRenounced = g.isOwnerRenounced || false;
    result.holderCount = g.holderCount || 0;
    result.top10HolderRate = g.top10HolderRate || 0;
    result.riskFactors = g.riskFactors || [];
    result.riskLevel = g.riskLevel || 'unknown';
  } else {
    console.error('GoPlus failed:', goplusResult.reason?.message || 'Unknown error');
    result.riskFactors.push('Security check temporarily unavailable');
  }

  if (etherscanResult.status === 'fulfilled' && etherscanResult.value) {
    result.isVerified = etherscanResult.value.isVerified || false;
    if (!result.isVerified) {
      result.riskFactors.push('Contract not verified on Etherscan');
      if (!['critical', 'high'].includes(result.riskLevel)) {
        result.riskLevel = 'medium';
      }
    }
  } else {
    console.error('Etherscan failed:', etherscanResult.reason?.message);
  }

  return result;
}

function calculateTrustScore(security, token) {
  if (security.isHoneypot) return 0;
  if (security.hasHiddenOwner) return 15;
  if (security.isFakeVolume) return 25;
  if (!security.isVerified) return 35;
  if (security.isMintable) return 45;
  if (security.holderCount > 10000) return 85;
  if (security.holderCount > 1000) return 75;
  if (security.holderCount > 100) return 65;
  if (token.liquidityUSD > 100000) return 70;
  if (token.liquidityUSD > 50000) return 60;
  if (token.liquidityUSD > 10000) return 50;
  if (token.liquidityUSD > 1000) return 35;
  return 25;
}

async function getFarcasterProfileRobust(username, viewerFid = null) {
  if (!NEYNAR_API_KEY) return null;
  
  const cleanUsername = username.replace('@', '').toLowerCase();
  
  // Strategy 1: Exact match via /user/by_username
  try {
    const url = `https://api.neynar.com/v2/farcaster/user/by_username?username=${cleanUsername}`;
    const res = await fetchWithTimeout(
      url,
      { headers: { accept: 'application/json', api_key: NEYNAR_API_KEY } },
      8000
    );
    if (res.ok) {
      const data = await res.json();
      if (data.user) return mapUser(data.user);
    }
  } catch (err) {
    console.log('by_username error:', err.message);
  }
  
  // Strategy 2: Search dengan viewer_fid
  try {
    let searchUrl = `https://api.neynar.com/v2/farcaster/user/search?q=${encodeURIComponent(cleanUsername)}&limit=10`;
    if (viewerFid) {
      searchUrl += `&viewer_fid=${viewerFid}`;
    }
    
    const searchRes = await fetchWithTimeout(
      searchUrl,
      { headers: { accept: 'application/json', api_key: NEYNAR_API_KEY } },
      8000
    );
    
    if (searchRes.ok) {
      const data = await searchRes.json();
      const users = data.result?.users || [];
      
      let user = users.find(u => u.username?.toLowerCase() === cleanUsername);
      
      if (!user && users.length > 0) {
        user = users.sort((a, b) => (b.follower_count || 0) - (a.follower_count || 0))[0];
      }
      
      if (user) return mapUser(user);
    }
  } catch (err) {
    console.log('search error:', err.message);
  }
  
  // Strategy 3: Bulk lookup
  try {
    const bulkUrl = `https://api.neynar.com/v2/farcaster/user/bulk?usernames=${cleanUsername}`;
    const bulkRes = await fetchWithTimeout(
      bulkUrl,
      { headers: { accept: 'application/json', api_key: NEYNAR_API_KEY } },
      8000
    );
    if (bulkRes.ok) {
      const bulkData = await bulkRes.json();
      const users = bulkData.users || [];
      if (users.length > 0) return mapUser(users[0]);
    }
  } catch (err) {
    console.log('bulk lookup error:', err.message);
  }
  
  return null;
}

async function getFarcasterProfile(query, byFid = false) {
  if (byFid) {
    if (!NEYNAR_API_KEY) return null;
    try {
      const url = `https://api.neynar.com/v2/farcaster/user/bulk?fids=${query}`;
      const res = await fetchWithTimeout(
        url,
        { headers: { accept: 'application/json', api_key: NEYNAR_API_KEY } },
        8000
      );
      if (!res.ok) return null;
      const data = await res.json();
      const user = data?.users?.[0];
      return user ? mapUser(user) : null;
    } catch (err) {
      console.error('Farcaster profile error (FID):', err.message);
      return null;
    }
  }
  
  return getFarcasterProfileRobust(query);
}

function buildTrustResponse(profile) {
  let trustScore = 50;
  const fc = profile.followerCount;
  if (fc > 10000) trustScore = 85;
  else if (fc > 5000) trustScore = 75;
  else if (fc > 1000) trustScore = 65;
  else if (fc > 100) trustScore = 50;
  else trustScore = 35;

  return {
    type: 'fid',
    fid: profile.fid,
    profile: {
      username: profile.username,
      displayName: profile.displayName,
      pfp_url: profile.pfp_url ||
        `https://client.warpcast.com/v1/user-avatar?username=${profile.username}`,
      followerCount: profile.followerCount,
      followingCount: profile.followingCount,
    },
    trustScore,
  };
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');
  const chain = searchParams.get('chain') || 'base';

  if (!query?.trim() || query.trim().length > 500) {
    return NextResponse.json(
      { error: 'Invalid query' },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const trimmed = query.trim();

  try {
    const isEVMAddress = /^0x[a-fA-F0-9]{40}$/i.test(trimmed);
    const isSolanaAddress = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/i.test(trimmed);

    if (isEVMAddress || isSolanaAddress) {
      const cached = getCachedToken(trimmed);
      if (cached) {
        return NextResponse.json(cached, { headers: CORS_HEADERS });
      }

      const [dexData, logoData, security] = await Promise.all([
        getDexScreenerData(trimmed, chain),
        getTokenLogoFromMultipleSources(trimmed, chain),
        getSecurityData(trimmed, chain),
      ]);

      const tokenData = {
        address: trimmed,
        symbol: logoData?.symbol || dexData?.symbol || 'Unknown',
        name: logoData?.name || dexData?.name || 'Unknown Token',
        logo: logoData?.logo || null,
        decimals: logoData?.decimals || 18,
        chain,
        priceUSD: dexData?.priceUSD || logoData?.priceUSD || 0,
        liquidityUSD: dexData?.liquidityUSD || 0,
        volume24h: dexData?.volume24h || logoData?.volume24h || 0,
        priceChange24h: dexData?.priceChange24h || logoData?.priceChange24h || 0,
        marketCap: logoData?.marketCap || 0,
        ...security,
        trustScore: 0,
      };

      tokenData.trustScore = calculateTrustScore(security, tokenData);

      const response = { type: 'token', token: tokenData, notFound: false };
      setCachedToken(trimmed, response);

      return NextResponse.json(response, { headers: CORS_HEADERS });
    }

    // Cek FID (angka)
    if (/^\d+$/.test(trimmed) && trimmed.length <= 10) {
      const profile = await getFarcasterProfile(trimmed, true);
      if (profile?.fid) {
        return NextResponse.json(buildTrustResponse(profile), { headers: CORS_HEADERS });
      }
      return NextResponse.json(
        { type: 'fid', notFound: true, query: trimmed },
        { headers: CORS_HEADERS }
      );
    }

    // CEK USERNAME
    const cleanUsername = trimmed.replace('@', '');
    if (cleanUsername.length > 0 && cleanUsername.length <= 50) {
      let profile = await getFarcasterProfileRobust(cleanUsername);
      
      if (!profile) {
        profile = await getFarcasterProfileRobust(cleanUsername, 3);
      }
      
      if (!profile) {
        profile = await getFarcasterProfileRobust(cleanUsername, 2);
      }
      
      if (profile && profile.fid) {
        return NextResponse.json(buildTrustResponse(profile), { headers: CORS_HEADERS });
      }
    }

    return NextResponse.json(
      { notFound: true, query: trimmed, message: `No results for "${trimmed}"` },
      { headers: CORS_HEADERS }
    );

  } catch (error) {
    console.error('Search route error:', error);
    return NextResponse.json(
      { error: 'Search failed', details: error.message, notFound: true },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}