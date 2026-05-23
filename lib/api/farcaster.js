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
        headers: { 
          'api_key': NEYNAR_API_KEY,  // ✅ Perbaiki: pake 'api_key' bukan 'x-api-key'
          'accept': 'application/json' 
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        user = data.users?.[0];
      } else {
        console.error(`Neynar API error (FID ${fid}): ${response.status}`);
      }
    } else if (username) {
      // Clean username (remove @ if present)
      const cleanUsername = username.replace('@', '');
      
      // Try /user/by_username first
      let url = `${BASE_URL}/user/by_username?username=${cleanUsername}`;
      let response = await fetch(url, {
        headers: { 
          'api_key': NEYNAR_API_KEY,  // ✅ Perbaiki header
          'accept': 'application/json' 
        },
      });
      
      if (!response.ok) {
        // Fallback to /user/search
        console.log(`by_username returned ${response.status}, trying search fallback for ${cleanUsername}`);
        url = `${BASE_URL}/user/search?q=${encodeURIComponent(cleanUsername)}&limit=1`;
        response = await fetch(url, {
          headers: { 
            'api_key': NEYNAR_API_KEY,  // ✅ Perbaiki header
            'accept': 'application/json' 
          },
        });
        
        if (response.ok) {
          const data = await response.json();
          user = data.result?.users?.[0];
        } else {
          console.error(`Neynar search error: ${response.status}`);
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
      headers: { 
        'api_key': NEYNAR_API_KEY,  // ✅ Perbaiki header
        'accept': 'application/json' 
      },
    });
    
    if (!response.ok) {
      console.error(`Neynar bulk API error: ${response.status}`);
      return [];
    }
    
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
    const url = `${BASE_URL}/cast/by-fid?fid=${fid}&limit=${Math.min(limit, 50)}`;
    const response = await fetch(url, {
      headers: { 
        'api_key': NEYNAR_API_KEY,  // ✅ Perbaiki header
        'accept': 'application/json' 
      },
    });
    
    if (!response.ok) {
      console.error(`Neynar casts API error: ${response.status}`);
      return [];
    }
    
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
  if (!query || query.trim() === '') return [];

  try {
    const cleanQuery = query.replace('@', '').trim();
    const url = `${BASE_URL}/user/search?q=${encodeURIComponent(cleanQuery)}&limit=${Math.min(limit, 100)}`;
    const response = await fetch(url, {
      headers: { 
        'api_key': NEYNAR_API_KEY,  // ✅ Perbaiki header
        'accept': 'application/json' 
      },
    });
    
    if (!response.ok) {
      console.error(`Neynar search API error: ${response.status}`);
      return [];
    }
    
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