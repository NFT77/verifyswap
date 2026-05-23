// lib/api/farcaster.js
const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY;
const BASE_URL = 'https://api.neynar.com/v2/farcaster';

// ✅ FIXED: all Neynar calls now have timeout — was missing entirely before
async function fetchWithTimeout(url, options = {}, ms = 8000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return res;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') throw new Error(`Neynar timeout after ${ms}ms`);
    throw err;
  }
}

function neynarHeaders() {
  return {
    'api_key': NEYNAR_API_KEY,
    'accept': 'application/json',
  };
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
    activeStatus: user.active_status || 'inactive',
    powerBadge: user.power_badge || false,
  };
}

export async function getFarcasterProfile(fid, username) {
  if (!NEYNAR_API_KEY) {
    console.warn('NEYNAR_API_KEY not set');
    return null;
  }

  try {
    let user = null;

    if (fid) {
      const res = await fetchWithTimeout(
        `${BASE_URL}/user/bulk?fids=${fid}`,
        { headers: neynarHeaders() },
        8000
      );
      if (res.ok) {
        const data = await res.json();
        user = data.users?.[0];
      } else {
        console.error(`Neynar FID lookup error: ${res.status}`);
      }
    } else if (username) {
      const clean = username.replace('@', '');

      // Try by_username first
      let res = await fetchWithTimeout(
        `${BASE_URL}/user/by_username?username=${clean}`,
        { headers: neynarHeaders() },
        8000
      );

      if (res.ok) {
        const data = await res.json();
        user = data.user;
      } else {
        // Fallback to search
        console.log(`by_username ${res.status}, trying search for ${clean}`);
        res = await fetchWithTimeout(
          `${BASE_URL}/user/search?q=${encodeURIComponent(clean)}&limit=1`,
          { headers: neynarHeaders() },
          8000
        );
        if (res.ok) {
          const data = await res.json();
          user = data.result?.users?.[0];
        } else {
          console.error(`Neynar search error: ${res.status}`);
        }
      }
    }

    return user ? mapUser(user) : null;
  } catch (error) {
    console.error('Farcaster profile error:', error.message);
    return null;
  }
}

export async function getMultipleFarcasterProfiles(fids) {
  if (!NEYNAR_API_KEY || !fids?.length) return [];

  try {
    const res = await fetchWithTimeout(
      `${BASE_URL}/user/bulk?fids=${fids.join(',')}`,
      { headers: neynarHeaders() },
      8000
    );
    if (!res.ok) {
      console.error(`Neynar bulk error: ${res.status}`);
      return [];
    }
    const data = await res.json();
    return (data.users || []).map(mapUser);
  } catch (error) {
    console.error('Farcaster multiple profiles error:', error.message);
    return [];
  }
}

export async function getUserCasts(fid, limit = 10) {
  if (!NEYNAR_API_KEY || !fid) return [];

  try {
    const res = await fetchWithTimeout(
      `${BASE_URL}/cast/by-fid?fid=${fid}&limit=${Math.min(limit, 50)}`,
      { headers: neynarHeaders() },
      8000
    );
    if (!res.ok) {
      console.error(`Neynar casts error: ${res.status}`);
      return [];
    }
    const data = await res.json();
    return data.casts || [];
  } catch (error) {
    console.error('Farcaster casts error:', error.message);
    return [];
  }
}

export async function searchFarcasterUsers(query, limit = 10) {
  if (!NEYNAR_API_KEY || !query?.trim()) return [];

  try {
    const clean = query.replace('@', '').trim();
    const res = await fetchWithTimeout(
      `${BASE_URL}/user/search?q=${encodeURIComponent(clean)}&limit=${Math.min(limit, 100)}`,
      { headers: neynarHeaders() },
      8000
    );
    if (!res.ok) {
      console.error(`Neynar search error: ${res.status}`);
      return [];
    }
    const data = await res.json();
    return (data.result?.users || []).map(user => ({
      fid: user.fid,
      username: user.username,
      displayName: user.display_name || user.username,
      pfp_url: user.pfp_url || user.pfp?.url || '',
      followerCount: user.follower_count || 0,
    }));
  } catch (error) {
    console.error('Farcaster search error:', error.message);
    return [];
  }
}