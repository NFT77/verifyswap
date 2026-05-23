// lib/api/openrank.js
const OPENRANK_API = 'https://graph.cast.k3l.io';

async function fetchWithTimeout(url, options = {}, ms = 8000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return res;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') throw new Error(`OpenRank timeout after ${ms}ms`);
    throw err;
  }
}

export async function getTrustScore(fid) {
  if (!fid) return null;

  try {
    const response = await fetchWithTimeout(
      `${OPENRANK_API}/scores/global/engagement/fids`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([Number(fid)]),
      },
      8000
    );
    if (!response.ok) { console.error(`OpenRank error: ${response.status}`); return null; }

    const data = await response.json();
    const scoreData = data.find(d => d.fid === Number(fid));

    if (scoreData) {
      return {
        fid: scoreData.fid,
        score: Math.max(0, Math.min(100, Math.round((1 - scoreData.rank / 10000) * 100))),
        rank: scoreData.rank,
        percentile: scoreData.percentile,
        engagement: scoreData.engagement,
      };
    }

    return { fid: Number(fid), score: 50, rank: null, percentile: null, engagement: null };
  } catch (error) {
    console.error('OpenRank error:', error.message);
    return null;
  }
}

export async function getMultipleTrustScores(fids) {
  if (!fids || fids.length === 0) return [];

  try {
    const response = await fetchWithTimeout(
      `${OPENRANK_API}/scores/global/engagement/fids`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fids.map(Number)),
      },
      8000
    );
    if (!response.ok) { console.error(`OpenRank bulk error: ${response.status}`); return []; }

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

export async function getUserEngagement(fid) {
  if (!fid) return null;

  try {
    const response = await fetchWithTimeout(
      `${OPENRANK_API}/scores/global/engagement/fids`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([Number(fid)]),
      },
      8000
    );
    if (!response.ok) return null;

    const data = await response.json();
    const scoreData = data.find(d => d.fid === Number(fid));
    if (!scoreData) return null;

    return {
      fid: scoreData.fid,
      engagement: scoreData.engagement,
      rank: scoreData.rank,
      percentile: scoreData.percentile,
    };
  } catch (error) {
    console.error('OpenRank engagement error:', error.message);
    return null;
  }
}

export function interpretTrustScore(score) {
  if (score >= 80) return { level: 'high', label: 'Highly Trusted', color: 'green', recommendation: 'Low risk. This creator has strong engagement.' };
  if (score >= 60) return { level: 'medium-high', label: 'Trusted', color: 'green', recommendation: 'Generally trusted. Good engagement metrics.' };
  if (score >= 40) return { level: 'medium', label: 'Moderate Trust', color: 'yellow', recommendation: 'Medium trust. Do your own research.' };
  if (score >= 20) return { level: 'medium-low', label: 'Low Trust', color: 'orange', recommendation: 'Low trust. Be cautious.' };
  return { level: 'low', label: 'Untrusted', color: 'red', recommendation: 'High risk. Very low engagement.' };
}