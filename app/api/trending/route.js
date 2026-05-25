// app/api/trending/route.js
import { NextResponse } from 'next/server';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

// Cache configuration
let cache = null;
let cacheTime = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 menit

// Flag untuk mencegah multiple refresh bersamaan
let isRefreshing = false;
let refreshPromise = null;

// ==================== DAFTAR TOKEN VALID (LENGKAP) ====================
const VALID_TOKENS = [
  { symbol: 'AERO', address: '0x940181a94A35A4569E4529A3CDfB74e38FD98631', name: 'Aerodrome Finance' },
  { symbol: 'VIRTUAL', address: '0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b', name: 'Virtual Protocol' },
  { symbol: 'BRETT', address: '0x532f27101965dd16442E59d40670FaF5eBB142E4', name: 'Brett' },
  { symbol: 'DEGEN', address: '0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed', name: 'Degen' },
  { symbol: 'TOSHI', address: '0xac1bd2486aaf3b5c0fc3fd868558b082a531b2b4', name: 'Toshi' },
  { symbol: 'HIGHER', address: '0x0578d8A44db98B23BF096A382e016e29a5Ce0ffe', name: 'Higher' },
  { symbol: 'CLANKER', address: '0x1bc0c42215582d5a085795f4badbac3ff36d1bcb', name: 'Clanker' },
  { symbol: 'TIG', address: '0x0c03ce270b4826ec62e7dd007f0b716068639f7b', name: 'The Innovation Game' },
  { symbol: 'KEYCAT', address: '0x9a26f5433671751c3276a065f57e5a02d2817973', name: 'Keyboard Cat' },
  { symbol: 'ZRO', address: '0x6985884c4392d348587b19cb9eaaf157f13271cd', name: 'LayerZero' },
  { symbol: 'MEY', address: '0x8bfac1b375bf2894d6f12fb2eb48b1c1a7916789', name: 'Mey Network' },
  { symbol: 'LUNA', address: '0x55cd6469f597452b5a7536e2cd98fde4c1247ee4', name: 'Luna by Virtuals' },
  { symbol: 'AIXBT', address: '0x4f9fd6be4a90f2620860d680c0d4d5fb53d1a825', name: 'aixbt by Virtuals' },
  { symbol: 'MORPHO', address: '0xbaa5cc21fd487b8fcc2f632f3f4e8d37262a0842', name: 'Morpho Token' },
  { symbol: 'BNKR', address: '0x22af33fe49fd1fa80c7149773dde5890d3c76f3b', name: 'BankrCoin' },
  { symbol: 'VVV', address: '0xacfe6019ed1a7dc6f7b508c02d1b04ec88cc21bf', name: 'Venice Token' },
  { symbol: 'AVNT', address: '0x696f9436b67233384889472cd7cd58a6fb5df4f1', name: 'Avantis' },
  { symbol: 'PENDLE', address: '0xa99f6e6785da0f5d6fb42495fe424bce029eeb3e', name: 'Pendle' },
  { symbol: 'SOSO', address: '0x624e2e7fdc8903165f64891672267ab0fcb98831', name: 'SoSoValue' },
  { symbol: 'ZEN', address: '0xf43eb8de897fbc7f2502483b2bef7bb9ea179229', name: 'Horizen' },
  { symbol: 'TRUST', address: '0x6cd905df2ed214b22e0d48ff17cd4200c1c6d8a3', name: 'Intuition' },
  { symbol: 'DOGINME', address: '0x6921b130d297cc43754afba22e5eac0fbf8db75b', name: 'doginme' },
  { symbol: 'CARV', address: '0xc08cd26474722ce93f4d0c34d16201461c10aa8c', name: 'CARV' },
  { symbol: 'WELL', address: '0xa88594d404727625a9437c3f886c7643872296ae', name: 'WELL' },
  { symbol: 'COOKIE', address: '0xc0041ef357b183448b235a8ea73ce4e4ec8c265f', name: 'Cookie' },
  { symbol: 'TOWNS', address: '0x00000000a22c618fd6b4d7e9a335c4b96b189a38', name: 'Towns' },
  { symbol: 'ICP', address: '0x00f3c42833c3170159af4e92dbb451fb3f708917', name: 'ICP' },
  { symbol: 'REKT', address: '0xb3e3c89b8d9c88b1fe96856e382959ee6291ebba', name: 'Rekt' },
  { symbol: 'LINK', address: '0x88fb150bdc53a65fe94dea0c9ba0a6daf8c6e196', name: 'ChainLink Token' },
  { symbol: 'NPC', address: '0xb166e8b140d35d9d8226e40c09f757bac5a4d87d', name: 'Non-Playable Coin' },
  { symbol: 'SYRUP', address: '0x688aee022aa544f150678b8e5720b6b96a9e9a2f', name: 'Syrup Token' },
  { symbol: 'MOEW', address: '0x15ac90165f8b45a80534228bdcb124a011f62fee', name: 'donotfomoew' },
  { symbol: 'DINO', address: '0x85e90a5430af45776548adb82ee4cd9e33b08077', name: 'DINO' },
  { symbol: 'FLUX', address: '0xb008bdcf9cdff9da684a190941dc3dca8c2cdd44', name: 'Flux' },
  { symbol: 'CLAWD', address: '0x9f86db9fc6f7c9408e8fda3ff8ce4e78ac7a6b07', name: 'clawd.atg.eth' },
  { symbol: 'DRB', address: '0x3ec2156d4c0a9cbdab4a016633b7bcf6a8d68ea2', name: 'DebtReliefBot' },
  { symbol: 'MIGGLES', address: '0xb1a03eda10342529bbf8eb700a06c60441fef25d', name: 'Mister Miggles' },
  { symbol: 'BIO', address: '0x226a2fa2556c48245e57cd1cba4c6c9e67077dd2', name: 'BIO' },
  { symbol: 'TIBBIR', address: '0xa4a2e2ca3fbfe21aed83471d28b6f65a233c6e00', name: 'Ribbita by Virtuals' },
  { symbol: 'PLAY', address: '0x853a7c99227499dba9db8c3a02aa691afdebf841', name: 'Play' },
];

async function fetchWithTimeout(url, ms = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

// ========== AMBIL HARGA REAL DARI DEXSCREENER UNTUK SEMUA TOKEN ==========
async function fetchAllTokenPrices(limit = 10) {
  const results = [];
  
  for (const token of VALID_TOKENS) {
    try {
      const url = `https://api.dexscreener.com/latest/dex/tokens/${token.address}`;
      const res = await fetchWithTimeout(url, 5000);
      
      let priceUSD = 0;
      let priceChange24h = 0;
      let volume24h = 0;
      let liquidityUSD = 0;
      let dexId = 'Unknown';
      
      if (res.ok) {
        const data = await res.json();
        const basePairs = data.pairs?.filter(p => p.chainId === 'base') || [];
        const bestPair = basePairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
        
        if (bestPair && bestPair.priceUsd) {
          priceUSD = parseFloat(bestPair.priceUsd || 0);
          priceChange24h = parseFloat(bestPair.priceChange?.h24 || 0);
          volume24h = parseFloat(bestPair.volume?.h24 || 0);
          liquidityUSD = parseFloat(bestPair.liquidity?.usd || 0);
          dexId = bestPair.dexId || 'DexScreener';
        }
      }
      
      results.push({
        ...token,
        priceUSD,
        priceChange24h,
        volume24h,
        liquidityUSD,
        dexId,
        source: 'dexscreener',
      });
      
      // Jeda 200ms untuk menghindari rate limit
      await new Promise(r => setTimeout(r, 200));
      
    } catch (err) {
      console.error(`Failed to fetch ${token.symbol}:`, err.message);
      results.push({
        ...token,
        priceUSD: 0,
        priceChange24h: 0,
        volume24h: 0,
        liquidityUSD: 0,
        dexId: 'Error',
        source: 'error',
      });
    }
  }
  
  // Urutkan berdasarkan volume + likuiditas
  const sorted = results.sort((a, b) => {
    const scoreA = (a.volume24h || 0) + (a.liquidityUSD || 0);
    const scoreB = (b.volume24h || 0) + (b.liquidityUSD || 0);
    return scoreB - scoreA;
  });
  
  return sorted.slice(0, limit);
}

// ========== FUNGSI REFRESH CACHE DI BACKGROUND ==========
async function refreshCache(limit) {
  if (isRefreshing) {
    console.log('Refresh already in progress, waiting...');
    return refreshPromise;
  }
  
  isRefreshing = true;
  refreshPromise = (async () => {
    try {
      console.log('🔄 Refreshing cache in background...');
      
      // Coba GeckoTerminal dulu
      let tokens = await fetchFromGeckoTerminal(limit);
      let source = 'geckoterminal';
      
      // Jika gagal, ambil dari token list
      if (!tokens || tokens.length === 0) {
        console.log('Fetching prices from DexScreener...');
        tokens = await fetchAllTokenPrices(limit);
        source = 'tokenlist';
      }
      
      if (tokens && tokens.length > 0) {
        cache = tokens;
        cacheTime = Date.now();
        console.log(`✅ Cache updated with ${tokens.length} tokens from ${source}`);
      } else {
        console.log('⚠️ Failed to refresh cache, keeping old data');
      }
    } catch (err) {
      console.error('Background refresh failed:', err);
    } finally {
      isRefreshing = false;
    }
  })();
  
  return refreshPromise;
}

// ========== AMBIL DARI GECKOTERMINAL ==========
async function fetchFromGeckoTerminal(limit) {
  try {
    const res = await fetchWithTimeout(
      'https://api.geckoterminal.com/api/v1/networks/base/trending_pools',
      { headers: { 'Accept': 'application/json' } },
      8000
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.data?.length) return null;

    const tokens = [];
    for (const pool of data.data.slice(0, limit)) {
      const attrs = pool.attributes;
      const addressId = pool.relationships?.base_token?.data?.id || '';
      const address = addressId.includes('_') ? addressId.split('_')[1] : null;
      
      if (address) {
        tokens.push({
          address,
          symbol: attrs?.base_token_symbol?.toUpperCase() || '?',
          name: attrs?.base_token_name || attrs?.base_token_symbol,
          priceUSD: parseFloat(attrs?.base_token_price_usd || 0),
          priceChange24h: parseFloat(attrs?.price_change_percentage?.h24 || 0),
          volume24h: parseFloat(attrs?.volume_usd?.h24 || 0),
          liquidityUSD: parseFloat(attrs?.reserve_in_usd || 0),
          dexId: attrs?.dex_name,
          source: 'geckoterminal',
        });
      }
    }
    
    return tokens.filter(t => t.symbol !== '?' && t.address);
  } catch (err) {
    console.error('GeckoTerminal error:', err.message);
    return null;
  }
}

// ========== MAIN HANDLER DENGAN STALE-WHILE-REVALIDATE ==========
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get('limit') || '7'), 20);
  const forceRefresh = searchParams.get('refresh') === 'true';

  // KASUS 1: Force refresh (panggilan manual dari tombol)
  if (forceRefresh) {
    console.log('Force refresh requested');
    await refreshCache(limit);
    if (cache) {
      return NextResponse.json({
        success: true,
        trending: cache.slice(0, limit),
        timestamp: cacheTime,
        source: 'cache-refreshed',
      }, { headers: CORS_HEADERS });
    }
  }

  // KASUS 2: Cache masih fresh → kirim data instan
  if (cache && cacheTime && (Date.now() - cacheTime) < CACHE_TTL) {
    // Trigger background refresh jika cache akan kadaluarsa dalam 60 detik
    const timeLeft = CACHE_TTL - (Date.now() - cacheTime);
    if (timeLeft < 60000 && !isRefreshing) {
      console.log('Cache expiring soon, triggering background refresh');
      refreshCache(limit).catch(console.error);
    }
    
    return NextResponse.json({
      success: true,
      trending: cache.slice(0, limit),
      timestamp: cacheTime,
      source: 'cache',
    }, { 
      headers: {
        ...CORS_HEADERS,
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60',
      }
    });
  }

  // KASUS 3: Cache tidak ada atau sudah kadaluarsa
  // Kirim data stale dulu (kalau ada) sambil refresh di background
  const staleData = cache && cache.length > 0 ? cache : null;
  
  if (staleData) {
    // Trigger background refresh tanpa await
    refreshCache(limit).catch(console.error);
    
    // Langsung kirim data stale
    return NextResponse.json({
      success: true,
      trending: staleData.slice(0, limit),
      timestamp: cacheTime || Date.now(),
      source: 'stale-cache',
    }, { 
      headers: {
        ...CORS_HEADERS,
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
      }
    });
  }

  // KASUS 4: Tidak ada cache sama sekali (first load)
  try {
    console.log('No cache available, fetching fresh data...');
    
    let tokens = null;
    let source = '';

    tokens = await fetchFromGeckoTerminal(limit);
    if (tokens && tokens.length >= 3) {
      source = 'geckoterminal';
    }

    if (!tokens || tokens.length === 0) {
      console.log('Fetching prices from DexScreener...');
      tokens = await fetchAllTokenPrices(limit);
      source = 'tokenlist';
    }

    if (tokens && tokens.length > 0) {
      cache = tokens;
      cacheTime = Date.now();
    }

    return NextResponse.json({
      success: true,
      trending: tokens || VALID_TOKENS.slice(0, limit),
      timestamp: cacheTime || Date.now(),
      source: source || 'initial',
    }, { headers: CORS_HEADERS });

  } catch (error) {
    console.error('Trending API error:', error);
    
    const emergencyTokens = VALID_TOKENS.slice(0, limit).map(t => ({
      ...t,
      priceUSD: 0,
      priceChange24h: 0,
      volume24h: 0,
      liquidityUSD: 0,
      source: 'emergency',
    }));
    
    return NextResponse.json({
      success: true,
      trending: emergencyTokens,
      timestamp: Date.now(),
      source: 'emergency',
    }, { headers: CORS_HEADERS });
  }
}