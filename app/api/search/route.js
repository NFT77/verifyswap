// app/api/search/route.js
import { NextResponse } from 'next/server';
import { verifyTokenContract, getTokenRiskAssessment } from '@/lib/api/etherscan';
import { searchTokenOnCoinGecko } from '@/lib/api/coingecko';
import { searchTokenOnCMC, getTokenQuoteCMC } from '@/lib/api/coinmarketcap';
import { getTokenMetadataMoralis } from '@/lib/api/moralis';
import { checkTokenSecurity } from '@/lib/api/goplus';

const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY;

// Simple in-memory cache for token searches (5 seconds TTL)
const tokenCache = new Map();
const CACHE_TTL = 5 * 1000; // 5 seconds

function getCachedToken(address) {
  const cached = tokenCache.get(address);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  return null;
}

function setCachedToken(address, data) {
  tokenCache.set(address, { data, timestamp: Date.now() });
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

// ========== MULTI-SOURCE TOKEN LOOKUP ==========
async function getTokenLogoFromMultipleSources(tokenAddress, chain, symbol) {
  const sources = [
    { name: 'CoinGecko', fn: () => searchTokenOnCoinGecko(tokenAddress, chain) },
    { name: 'CoinMarketCap', fn: () => searchTokenOnCMC(tokenAddress, chain) },
    { name: 'Moralis', fn: () => getTokenMetadataMoralis(tokenAddress, chain) },
  ];
  
  for (const source of sources) {
    try {
      const result = await source.fn();
      if (result?.logo) {
        console.log(`Logo found via ${source.name}: ${result.logo}`);
        return result;
      }
      if (result?.symbol || result?.name) {
        return result;
      }
    } catch (err) {
      console.error(`${source.name} error:`, err.message);
    }
  }
  return null;
}

async function getFarcasterProfileByFid(fid) {
  if (!NEYNAR_API_KEY) return null;

  try {
    const res = await fetch(
      `https://api.neynar.com/v2/farcaster/user/bulk?fids=${fid}`,
      { headers: { 'accept': 'application/json', 'api_key': NEYNAR_API_KEY } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const user = data?.users?.[0];
    if (!user) return null;
    return mapUser(user);
  } catch (error) {
    console.error('Get by FID error:', error);
    return null;
  }
}

async function getFarcasterProfileByUsername(username) {
  if (!NEYNAR_API_KEY) return null;

  try {
    const cleanUsername = username.replace('@', '');
    const res = await fetch(
      `https://api.neynar.com/v2/farcaster/user/by_username?username=${cleanUsername}`,
      { headers: { 'accept': 'application/json', 'api_key': NEYNAR_API_KEY } }
    );
    if (!res.ok) {
      const searchRes = await fetch(
        `https://api.neynar.com/v2/farcaster/user/search?q=${encodeURIComponent(cleanUsername)}&limit=1`,
        { headers: { 'accept': 'application/json', 'api_key': NEYNAR_API_KEY } }
      );
      if (searchRes.ok) {
        const searchData = await searchRes.json();
        const user = searchData?.result?.users?.[0];
        if (user) return mapUser(user);
      }
      return null;
    }
    const data = await res.json();
    const user = data?.user;
    if (!user) return null;
    return mapUser(user);
  } catch (error) {
    console.error('Get by username error:', error);
    return null;
  }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');
  const chain = searchParams.get('chain') || 'base';

  if (!query) {
    return NextResponse.json({ error: 'Query parameter required' }, { status: 400 });
  }

  const trimmedQuery = query.trim();
  if (trimmedQuery.length === 0 || trimmedQuery.length > 500) {
    return NextResponse.json({ error: 'Invalid query length' }, { status: 400 });
  }

  try {
    // ========== CEK TOKEN ADDRESS ==========
    const isBaseAddress = /^0x[a-fA-F0-9]{40}$/i.test(trimmedQuery);
    const isSolanaAddress = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/i.test(trimmedQuery);
    
    if (isBaseAddress || isSolanaAddress) {
      const cachedResult = getCachedToken(trimmedQuery);
      if (cachedResult) {
        return NextResponse.json(cachedResult);
      }
      
      // Step 1: Dapatkan data dasar dari DexScreener (harga, liquidity)
      let dexData = null;
      try {
        const dexRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${trimmedQuery}`);
        if (dexRes.ok) {
          const dexJson = await dexRes.json();
          const pair = dexJson.pairs?.find(p => 
            (chain === 'base' && p.chainId === 'base') || 
            (chain === 'solana' && p.chainId === 'solana')
          );
          if (pair) {
            dexData = {
              symbol: pair.baseToken?.symbol,
              name: pair.baseToken?.name,
              priceUSD: parseFloat(pair.priceUsd || 0),
              liquidityUSD: parseFloat(pair.liquidity?.usd || 0),
              volume24h: parseFloat(pair.volume?.h24 || 0),
              priceChange24h: parseFloat(pair.priceChange?.h24 || 0),
            };
          }
        }
      } catch (err) {
        console.error('DexScreener error:', err);
      }
      
      // Step 2: Cari logo dari multiple sources
      const logoData = await getTokenLogoFromMultipleSources(trimmedQuery, chain, dexData?.symbol);
      
      // Step 3: SECURITY DETECTION (tanpa canBuy/canSell)
      let securityData = null;
      let verificationData = null;
      let isHoneypot = false;
      let isFakeVolume = false;
      let hasHiddenOwner = false;
      let isVerified = false;
      let isMintable = false;
      let isOwnerRenounced = false;
      let holderCount = 0;
      let top10HolderRate = 0;
      let riskFactors = [];
      let riskLevel = 'low';
      
      // Cek keamanan via GoPlus API (khusus Base)
      if (chain === 'base' && isBaseAddress) {
        try {
          const goplusSecurity = await checkTokenSecurity(trimmedQuery, chain);
          if (goplusSecurity) {
            isHoneypot = goplusSecurity.isHoneypot || false;
            isFakeVolume = goplusSecurity.isFakeVolume || false;
            hasHiddenOwner = !!goplusSecurity.ownerAddress;
            // canSell dan canBuy TIDAK DIGUNAKAN
            isMintable = goplusSecurity.isMintable || false;
            isOwnerRenounced = goplusSecurity.isOwnerRenounced || false;
            holderCount = goplusSecurity.holderCount || 0;
            top10HolderRate = goplusSecurity.top10HolderRate || 0;
            riskFactors = goplusSecurity.riskFactors || [];
            riskLevel = goplusSecurity.riskLevel || 'low';
            securityData = goplusSecurity;
          }
        } catch (err) {
          console.error('GoPlus security error:', err);
        }
        
        // Cek verifikasi kontrak via Etherscan
        try {
          const verification = await verifyTokenContract(trimmedQuery);
          if (verification) {
            isVerified = verification.isVerified || false;
            verificationData = verification;
            
            if (!isVerified) {
              riskFactors.push('Contract not verified on Etherscan');
              if (riskLevel !== 'critical' && riskLevel !== 'high') {
                riskLevel = 'medium';
              }
            }
          }
        } catch (err) {
          console.error('Etherscan verification error:', err);
        }
      }
      
      // Step 4: Gabungkan semua data (tanpa canBuy/canSell)
      const tokenData = {
        address: trimmedQuery,
        symbol: logoData?.symbol || dexData?.symbol || 'Unknown',
        name: logoData?.name || dexData?.name || 'Unknown Token',
        logo: logoData?.logo || null,
        chain: chain,
        priceUSD: dexData?.priceUSD || logoData?.priceUSD || 0,
        liquidityUSD: dexData?.liquidityUSD || 0,
        volume24h: dexData?.volume24h || logoData?.volume24h || 0,
        priceChange24h: dexData?.priceChange24h || logoData?.priceChange24h || 0,
        marketCap: logoData?.marketCap || 0,
        marketCapRank: logoData?.marketCapRank || null,
        // SECURITY FIELDS (tanpa canBuy/canSell)
        isHoneypot,
        isFakeVolume,
        hasHiddenOwner,
        isVerified,
        isMintable,
        isOwnerRenounced,
        holderCount,
        top10HolderRate,
        riskFactors,
        riskLevel,
        securityData,
        verificationData,
      };
      
      // Step 5: Trust score calculation (tanpa canBuy/canSell)
      let trustScore = 50;
      if (isHoneypot) {
        trustScore = 0;
      } else if (hasHiddenOwner) {
        trustScore = 15;
      } else if (isFakeVolume) {
        trustScore = 25;
      } else if (!isVerified) {
        trustScore = 35;
      } else if (isMintable) {
        trustScore = 45;
      } else if (holderCount > 10000) {
        trustScore = 85;
      } else if (holderCount > 1000) {
        trustScore = 75;
      } else if (holderCount > 100) {
        trustScore = 65;
      } else if (tokenData.liquidityUSD > 100000) {
        trustScore = 70;
      } else if (tokenData.liquidityUSD > 50000) {
        trustScore = 60;
      } else if (tokenData.liquidityUSD > 10000) {
        trustScore = 50;
      } else if (tokenData.liquidityUSD > 1000) {
        trustScore = 35;
      } else {
        trustScore = 25;
      }
      
      tokenData.trustScore = trustScore;
      
      const responseData = {
        type: 'token',
        token: tokenData,
        notFound: false,
      };
      
      setCachedToken(trimmedQuery, responseData);
      
      return NextResponse.json(responseData);
    }
    
    // ========== CEK FID (angka) ==========
    const isFid = /^\d+$/.test(trimmedQuery) && trimmedQuery.length <= 10;
    
    if (isFid) {
      const profile = await getFarcasterProfileByFid(parseInt(trimmedQuery));
      
      if (profile && profile.fid) {
        let trustScore = 50;
        if (profile.followerCount > 10000) trustScore = 85;
        else if (profile.followerCount > 5000) trustScore = 75;
        else if (profile.followerCount > 1000) trustScore = 65;
        else if (profile.followerCount > 100) trustScore = 50;
        else trustScore = 35;
        
        let finalPfpUrl = profile.pfp_url;
        if (!finalPfpUrl || finalPfpUrl === '') {
          finalPfpUrl = `https://client.warpcast.com/v1/user-avatar?username=${profile.username}`;
        }
        
        return NextResponse.json({
          type: 'fid',
          fid: profile.fid,
          profile: {
            username: profile.username,
            displayName: profile.displayName,
            pfp_url: finalPfpUrl,
            followerCount: profile.followerCount,
            followingCount: profile.followingCount,
          },
          trustScore: trustScore,
        });
      }
      
      return NextResponse.json({
        type: 'fid',
        notFound: true,
        query: trimmedQuery,
      });
    }
    
    // ========== CEK USERNAME ==========
    const cleanUsername = trimmedQuery.replace('@', '');
    
    if (cleanUsername.length > 0 && cleanUsername.length <= 50) {
      const profile = await getFarcasterProfileByUsername(cleanUsername);
      
      if (profile && profile.fid) {
        let trustScore = 50;
        if (profile.followerCount > 10000) trustScore = 85;
        else if (profile.followerCount > 5000) trustScore = 75;
        else if (profile.followerCount > 1000) trustScore = 65;
        else if (profile.followerCount > 100) trustScore = 50;
        else trustScore = 35;
        
        let finalPfpUrl = profile.pfp_url;
        if (!finalPfpUrl || finalPfpUrl === '') {
          finalPfpUrl = `https://client.warpcast.com/v1/user-avatar?username=${profile.username}`;
        }
        
        return NextResponse.json({
          type: 'fid',
          fid: profile.fid,
          profile: {
            username: profile.username,
            displayName: profile.displayName,
            pfp_url: finalPfpUrl,
            followerCount: profile.followerCount,
            followingCount: profile.followingCount,
          },
          trustScore: trustScore,
        });
      }
    }
    
    // ========== TIDAK DITEMUKAN ==========
    return NextResponse.json({
      notFound: true,
      query: trimmedQuery,
      message: `No results found for "${trimmedQuery}"`,
    });
    
  } catch (error) {
    console.error('Search error:', error);
    return NextResponse.json({ 
      error: 'Search failed', 
      details: error.message,
      notFound: true,
      query: query,
    }, { status: 500 });
  }
}