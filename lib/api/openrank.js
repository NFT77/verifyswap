// lib/api/openrank.js
const OPENRANK_API = 'https://graph.cast.k3l.io';

/**
 * Get trust score for a single Farcaster user
 * @param {number} fid - Farcaster ID
 * @returns {Promise<Object|null>} Trust score data
 */
export async function getTrustScore(fid) {
  if (!fid) {
    console.warn('OpenRank: No FID provided');
    return null;
  }

  try {
    const response = await fetch(`${OPENRANK_API}/scores/global/engagement/fids`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([Number(fid)]),
    });
    
    if (!response.ok) {
      console.error(`OpenRank API error: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    const scoreData = data.find(d => d.fid === Number(fid));
    
    if (scoreData) {
      // Convert rank to score 0-100 (lower rank = higher score)
      // Rank 1 = 100, Rank 10000 = 0
      const score = Math.max(0, Math.min(100, Math.round((1 - scoreData.rank / 10000) * 100)));
      return {
        fid: scoreData.fid,
        score: score,
        rank: scoreData.rank,
        percentile: scoreData.percentile,
        engagement: scoreData.engagement,
      };
    }
    
    // Default score if user not found in ranking
    return { 
      fid: Number(fid), 
      score: 50, 
      rank: null, 
      percentile: null,
      engagement: null,
    };
  } catch (error) {
    console.error('OpenRank error:', error.message);
    return null;
  }
}

/**
 * Get trust scores for multiple Farcaster users
 * @param {number[]} fids - Array of Farcaster IDs
 * @returns {Promise<Array>} Array of trust score data
 */
export async function getMultipleTrustScores(fids) {
  if (!fids || fids.length === 0) {
    console.warn('OpenRank: No FIDs provided');
    return [];
  }

  try {
    const numericFids = fids.map(f => Number(f));
    const response = await fetch(`${OPENRANK_API}/scores/global/engagement/fids`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(numericFids),
    });
    
    if (!response.ok) {
      console.error(`OpenRank API error: ${response.status}`);
      return [];
    }
    
    const data = await response.json();
    
    return data.map(item => ({
      fid: item.fid,
      score: Math.max(0, Math.min(100, Math.round((1 - item.rank / 10000) * 100))),
      rank: item.rank,
      percentile: item.percentile,
      engagement: item.engagement,
    }));
  } catch (error) {
    console.error('OpenRank multiple error:', error.message);
    return [];
  }
}

/**
 * Get engagement scores for a specific user
 * @param {number} fid - Farcaster ID
 * @returns {Promise<Object|null>} Engagement metrics
 */
export async function getUserEngagement(fid) {
  if (!fid) return null;

  try {
    const response = await fetch(`${OPENRANK_API}/scores/global/engagement/fids`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([Number(fid)]),
    });
    
    if (!response.ok) return null;
    
    const data = await response.json();
    const scoreData = data.find(d => d.fid === Number(fid));
    
    if (scoreData) {
      return {
        fid: scoreData.fid,
        engagement: scoreData.engagement,
        rank: scoreData.rank,
        percentile: scoreData.percentile,
      };
    }
    
    return null;
  } catch (error) {
    console.error('OpenRank engagement error:', error.message);
    return null;
  }
}

// Export utility function untuk interpretasi score
export function interpretTrustScore(score) {
  if (score >= 80) {
    return { level: 'high', label: 'Highly Trusted', color: 'green', recommendation: 'Low risk. This creator has strong engagement.' };
  } else if (score >= 60) {
    return { level: 'medium-high', label: 'Trusted', color: 'green', recommendation: 'Generally trusted. Good engagement metrics.' };
  } else if (score >= 40) {
    return { level: 'medium', label: 'Moderate Trust', color: 'yellow', recommendation: 'Medium trust. Do your own research.' };
  } else if (score >= 20) {
    return { level: 'medium-low', label: 'Low Trust', color: 'orange', recommendation: 'Low trust. Be cautious.' };
  } else {
    return { level: 'low', label: 'Untrusted', color: 'red', recommendation: 'High risk. Very low engagement.' };
  }
}