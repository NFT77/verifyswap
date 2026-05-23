// app/api/farcaster/route.js
import { NextResponse } from 'next/server';

const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY;

// Simple in-memory cache (TTL: 5 minutes)
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

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

function getCacheKey(fid, username) {
  if (fid) return `fid:${fid}`;
  if (username) return `username:${username.toLowerCase()}`;
  return null;
}

function getCachedData(key) {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  if (cached) cache.delete(key);
  return null;
}

function setCachedData(key, data) {
  // Hapus cache lama jika terlalu banyak (max 100)
  if (cache.size > 100) {
    const oldestKey = cache.keys().next().value;
    cache.delete(oldestKey);
  }
  cache.set(key, { data, timestamp: Date.now() });
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const username = searchParams.get('username');
  const fid = searchParams.get('fid');

  // Validasi input
  if (!username && !fid) {
    return NextResponse.json(
      { error: 'Provide username or fid query param' },
      { status: 400 }
    );
  }

  // Validasi FID (harus angka positif)
  if (fid && (isNaN(parseInt(fid)) || parseInt(fid) <= 0)) {
    return NextResponse.json(
      { error: 'Invalid fid parameter' },
      { status: 400 }
    );
  }

  // Validasi username (max 50 chars, alphanumeric + underscore)
  if (username && (username.length > 50 || !/^[a-zA-Z0-9_]+$/.test(username.replace('@', '')))) {
    return NextResponse.json(
      { error: 'Invalid username format' },
      { status: 400 }
    );
  }

  if (!NEYNAR_API_KEY) {
    console.error('NEYNAR_API_KEY not configured');
    return NextResponse.json(
      { error: 'API key not configured. Please set NEYNAR_API_KEY in environment variables.' },
      { status: 500 }
    );
  }

  // Check cache
  const cacheKey = getCacheKey(fid, username);
  if (cacheKey) {
    const cachedData = getCachedData(cacheKey);
    if (cachedData) {
      return NextResponse.json({ profile: cachedData, cached: true });
    }
  }

  try {
    let user;

    if (fid) {
      // Lookup by FID
      const res = await fetch(
        `https://api.neynar.com/v2/farcaster/user/bulk?fids=${fid}`,
        {
          headers: {
            'accept': 'application/json',
            'api_key': NEYNAR_API_KEY,
          },
        }
      );
      
      if (!res.ok) {
        console.error(`Neynar API error: ${res.status}`);
        if (res.status === 401) {
          return NextResponse.json(
            { error: 'Invalid API key. Please check your NEYNAR_API_KEY.' },
            { status: 401 }
          );
        }
        if (res.status === 429) {
          return NextResponse.json(
            { error: 'Rate limit exceeded. Please try again later.' },
            { status: 429 }
          );
        }
        throw new Error(`Neynar API error: ${res.status}`);
      }
      
      const data = await res.json();
      user = data?.users?.[0];
      
      if (!user) {
        return NextResponse.json({ error: `User with fid ${fid} not found` }, { status: 404 });
      }
    } else {
      // Lookup by username
      const cleanUsername = username.replace('@', '').toLowerCase();
      
      // Try /user/by_username first (more accurate)
      let byUsernameRes = await fetch(
        `https://api.neynar.com/v2/farcaster/user/by_username?username=${cleanUsername}`,
        {
          headers: {
            'accept': 'application/json',
            'api_key': NEYNAR_API_KEY,
          },
        }
      );
      
      if (byUsernameRes.ok) {
        const data = await byUsernameRes.json();
        user = data?.user;
      } else {
        // Fallback to /user/search
        console.log(`by_username returned ${byUsernameRes.status}, trying search fallback`);
        const searchRes = await fetch(
          `https://api.neynar.com/v2/farcaster/user/search?q=${encodeURIComponent(cleanUsername)}&limit=1`,
          {
            headers: {
              'accept': 'application/json',
              'api_key': NEYNAR_API_KEY,
            },
          }
        );
        
        if (searchRes.ok) {
          const data = await searchRes.json();
          user = data?.result?.users?.[0];
        } else {
          console.error(`Neynar search error: ${searchRes.status}`);
        }
      }
      
      if (!user) {
        return NextResponse.json({ error: `User with username ${username} not found` }, { status: 404 });
      }
    }

    const mappedUser = mapUser(user);
    
    // Cache the result
    if (cacheKey) {
      setCachedData(cacheKey, mappedUser);
    }
    
    return NextResponse.json({ profile: mappedUser, cached: false });

  } catch (error) {
    console.error('Farcaster API error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}