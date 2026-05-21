// app/api/trust-score/route.js
import { NextResponse } from 'next/server';
import { getTrustScore as getOpenRankScore } from '@/lib/api/openrank';
import { checkTokenSecurity } from '@/lib/api/goplus';
import { getTokenRiskAssessment, verifyTokenContract } from '@/lib/api/etherscan';

// Simple in-memory cache (TTL: 30 seconds)
const cache = new Map();
const CACHE_TTL = 30 * 1000; // 30 seconds

function getCacheKey(fid, tokenAddress, chain) {
  if (fid) return `fid:${fid}`;
  if (tokenAddress) return `token:${chain}:${tokenAddress.toLowerCase()}`;
  return null;
}

function getCachedData(key) {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  return null;
}

function setCachedData(key, data) {
  cache.set(key, { data, timestamp: Date.now() });
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const fid = searchParams.get('fid');
  const tokenAddress = searchParams.get('tokenAddress');
  const chain = searchParams.get('chain') || 'base';

  // Validasi input
  if (!fid && !tokenAddress) {
    return NextResponse.json(
      { error: 'Missing required parameter: fid or tokenAddress' },
      { status: 400 }
    );
  }

  // Hanya support Base untuk token
  if (tokenAddress && chain !== 'base') {
    return NextResponse.json(
      { error: 'Only Base chain is supported for token trust score' },
      { status: 400 }
    );
  }

  // Validasi FID
  if (fid && (isNaN(parseInt(fid)) || parseInt(fid) <= 0)) {
    return NextResponse.json(
      { error: 'Invalid fid parameter' },
      { status: 400 }
    );
  }

  // Validasi token address
  if (tokenAddress && !/^0x[a-fA-F0-9]{40}$/i.test(tokenAddress)) {
    return NextResponse.json(
      { error: 'Invalid token address format' },
      { status: 400 }
    );
  }

  // Check cache
  const cacheKey = getCacheKey(fid, tokenAddress, chain);
  const cachedResult = getCachedData(cacheKey);
  if (cachedResult) {
    return NextResponse.json({ ...cachedResult, cached: true });
  }

  try {
    let score = 50; // default neutral
    let security = null;
    let etherscanData = null;
    let factors = [];

    // ========== 1. TRUST SCORE BERDASARKAN FID (Farcaster) ==========
    if (fid) {
      try {
        const trustData = await getOpenRankScore(parseInt(fid));
        if (trustData && trustData.score) {
          score = trustData.score;
          factors.push({
            name: 'OpenRank Engagement',
            impact: 'positive',
            description: `Rank #${trustData.rank} globally`,
          });
        } else {
          factors.push({
            name: 'Farcaster Activity',
            impact: 'neutral',
            description: 'Limited engagement data',
          });
        }
      } catch (error) {
        console.error('OpenRank error:', error);
        factors.push({
          name: 'OpenRank API',
          impact: 'neutral',
          description: 'Unable to fetch engagement data',
        });
      }
    }

    // ========== 2. TRUST SCORE BERDASARKAN TOKEN ADDRESS ==========
    if (tokenAddress) {
      // 2a. Cek keamanan dari GoPlus (scam detection) - tanpa canSell/canBuy
      try {
        const goplusSecurity = await checkTokenSecurity(tokenAddress, chain);
        if (goplusSecurity) {
          security = goplusSecurity;
          
          if (goplusSecurity.isHoneypot) {
            score = 0;
            factors.push({
              name: 'Honeypot Detection',
              impact: 'critical',
              description: 'Token cannot be sold - HONEYPOT!',
            });
          } else if (goplusSecurity.isFakeVolume) {
            score = Math.min(score, 20);
            factors.push({
              name: 'Fake Volume',
              impact: 'negative',
              description: 'Trading volume appears to be manipulated',
            });
          } else {
            factors.push({
              name: 'Basic Security Check',
              impact: 'positive',
              description: 'No immediate red flags detected',
            });
          }
          
          // Tambahan risk factors dari GoPlus
          if (goplusSecurity.isBlacklisted) {
            score = Math.min(score, 15);
            factors.push({
              name: 'Blacklist Function',
              impact: 'critical',
              description: 'Contract has blacklist functionality',
            });
          }
          
          if (goplusSecurity.isMintable) {
            score = Math.min(score, 30);
            factors.push({
              name: 'Mintable Token',
              impact: 'negative',
              description: 'Supply can be increased by owner',
            });
          }
          
          if (!goplusSecurity.isOwnerRenounced && goplusSecurity.ownerAddress) {
            score = Math.min(score, 40);
            factors.push({
              name: 'Owner Not Renounced',
              impact: 'negative',
              description: 'Owner still has control over contract',
            });
          }
          
          if (goplusSecurity.top10HolderRate > 50) {
            score = Math.min(score, 25);
            factors.push({
              name: 'High Holder Concentration',
              impact: 'critical',
              description: `Top 10 holders own ${goplusSecurity.top10HolderRate}%`,
            });
          } else if (goplusSecurity.top10HolderRate > 30) {
            score = Math.min(score, 40);
            factors.push({
              name: 'Moderate Holder Concentration',
              impact: 'negative',
              description: `Top 10 holders own ${goplusSecurity.top10HolderRate}%`,
            });
          }
        }
      } catch (error) {
        console.error('GoPlus error:', error);
      }
      
      // 2b. Verifikasi Etherscan
      if (tokenAddress.startsWith('0x')) {
        try {
          const verification = await verifyTokenContract(tokenAddress);
          const riskAssessment = await getTokenRiskAssessment(tokenAddress);
          etherscanData = riskAssessment;
          
          if (verification) {
            if (verification.isVerified) {
              score = Math.min(95, score + 20);
              factors.push({
                name: 'Contract Verification',
                impact: 'positive',
                description: `Verified contract`,
              });
            } else {
              score = Math.max(10, score - 25);
              factors.push({
                name: 'Contract Verification',
                impact: 'negative',
                description: 'Contract not verified on Etherscan',
              });
            }
          }
        } catch (error) {
          console.error('Etherscan verification error:', error);
          factors.push({
            name: 'Etherscan Verification',
            impact: 'neutral',
            description: 'Unable to verify contract (API limit?)',
          });
        }
      }
    }

    // ========== 3. FINAL SCORE (0-100) ==========
    let finalScore = Math.max(0, Math.min(100, Math.round(score)));
    
    // Tentukan level berdasarkan score
    let level = 'low';
    if (finalScore >= 80) level = 'excellent';
    else if (finalScore >= 70) level = 'high';
    else if (finalScore >= 55) level = 'good';
    else if (finalScore >= 40) level = 'medium';
    else if (finalScore >= 25) level = 'low';
    else level = 'critical';
    
    // Tambahkan rekomendasi
    let recommendation = '';
    let color = '';
    if (finalScore >= 70) {
      recommendation = 'Low risk. You can proceed with caution.';
      color = 'green';
    } else if (finalScore >= 40) {
      recommendation = 'Medium risk. Do your own research before swapping.';
      color = 'yellow';
    } else if (finalScore >= 20) {
      recommendation = 'High risk. Strongly consider avoiding this token.';
      color = 'orange';
    } else {
      recommendation = 'Critical risk! This token has scam indicators. DO NOT SWAP!';
      color = 'red';
    }

    const response = {
      score: finalScore,
      level,
      recommendation,
      color,
      factors: factors,
      security: security,
      etherscan: etherscanData,
      timestamp: new Date().toISOString(),
    };

    // Cache the result
    if (cacheKey) {
      setCachedData(cacheKey, response);
    }

    return NextResponse.json(response);

  } catch (error) {
    console.error('Trust score error:', error);
    return NextResponse.json({ 
      score: 50, 
      level: 'medium',
      recommendation: 'Unable to calculate trust score. Please verify manually.',
      error: error.message,
    }, { status: 500 });
  }
}