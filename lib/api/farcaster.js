// lib/api/farcaster.js
const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY;
const BASE_URL = 'https://api.neynar.com/v2/farcaster';

/**
 * Get Farcaster profile by FID or username
 * @param {number} fid - Farcaster ID
 * @param {string} username - Username (without @)
 * @returns {Promise<Object|null>} User profile
 */
export async function getFarcasterProfile(fid, username) {
  if (!NEYNAR_API_KEY) {
    console.warn('NEYNAR_API_KEY not set');
    return null;
  }

  try {
    let user = null;
    
    if (fid) {
      // Lookup by FID
      const url = `${BASE_URL}/user/bulk?fids=${fid}`;
      const response = await fetch(url, {
        headers: { 'x-api-key': NEYNAR_API_KEY, 'accept': 'application/json' },
      });
      
      if (response.ok) {
        const data = await response.json();
        user = data.users?.[0];
      }
    } else if (username) {
      // Clean username (remove @ if present)
      const cleanUsername = username.replace('@', '');
      
      // Try /user/by_username first
      let url = `${BASE_URL}/user/by_username?username=${cleanUsername}`;
      let response = await fetch(url, {
        headers: { 'x-api-key': NEYNAR_API_KEY, 'accept': 'application/json' },
      });
      
      if (!response.ok) {
        // Fallback to /user/search
        url = `${BASE_URL}/user/search?q=${encodeURIComponent(cleanUsername)}&limit=1`;
        response = await fetch(url, {
          headers: { 'x-api-key': NEYNAR_API_KEY, 'accept': 'application/json' },
        });
        
        if (response.ok) {
          const data = await response.json();
          user = data.result?.users?.[0];
        }
      } else {
        const data = await response.json();
        user = data.user;
      }
    }
    
    if (!user) return null;
    
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
  } catch (error) {
    console.error('Farcaster error:', error.message);
    return null;
  }
}

/**
 * Get multiple Farcaster profiles by FIDs
 * @param {number[]} fids - Array of Farcaster IDs
 * @returns {Promise<Array>} List of user profiles
 */
export async function getMultipleFarcasterProfiles(fids) {
  if (!NEYNAR_API_KEY) return [];
  if (!fids || fids.length === 0) return [];

  try {
    const url = `${BASE_URL}/user/bulk?fids=${fids.join(',')}`;
    const response = await fetch(url, {
      headers: { 'x-api-key': NEYNAR_API_KEY, 'accept': 'application/json' },
    });
    
    if (!response.ok) return [];
    
    const data = await response.json();
    return (data.users || []).map(user => ({
      fid: user.fid,
      username: user.username,
      displayName: user.display_name || user.username,
      pfp_url: user.pfp_url || user.pfp?.url || '',
      followerCount: user.follower_count || 0,
      followingCount: user.following_count || 0,
    }));
  } catch (error) {
    console.error('Farcaster multiple profiles error:', error.message);
    return [];
  }
}

/**
 * Get user's recent casts
 * @param {number} fid - Farcaster ID
 * @param {number} limit - Number of casts to return
 * @returns {Promise<Array>} List of casts
 */
export async function getUserCasts(fid, limit = 10) {
  if (!NEYNAR_API_KEY) return [];
  if (!fid) return [];

  try {
    const url = `${BASE_URL}/cast/by-fid?fid=${fid}&limit=${limit}`;
    const response = await fetch(url, {
      headers: { 'x-api-key': NEYNAR_API_KEY, 'accept': 'application/json' },
    });
    
    if (!response.ok) return [];
    
    const data = await response.json();
    return data.casts || [];
  } catch (error) {
    console.error('Farcaster casts error:', error.message);
    return [];
  }
}

/**
 * Search for users by query
 * @param {string} query - Search query (username or display name)
 * @param {number} limit - Max number of results
 * @returns {Promise<Array>} List of matching users
 */
export async function searchFarcasterUsers(query, limit = 10) {
  if (!NEYNAR_API_KEY) return [];
  if (!query) return [];

  try {
    const cleanQuery = query.replace('@', '');
    const url = `${BASE_URL}/user/search?q=${encodeURIComponent(cleanQuery)}&limit=${limit}`;
    const response = await fetch(url, {
      headers: { 'x-api-key': NEYNAR_API_KEY, 'accept': 'application/json' },
    });
    
    if (!response.ok) return [];
    
    const data = await response.json();
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