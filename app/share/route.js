// app/share/route.js
import { NextResponse } from 'next/server';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const txHash = searchParams.get('tx');
  const tokenSymbol = searchParams.get('token'); // Rename parameter for clarity
  
  // 1. Tentukan pesan berdasarkan parameter yang tersedia
  let shareText = '';
  
  if (txHash) {
    // Jika ada hash transaksi (setelah swap sukses)
    if (tokenSymbol) {
      shareText = `I just swapped into $${tokenSymbol} on VerifySwap! 🚀 Tx: ${txHash.slice(0, 10)}...`;
    } else {
      shareText = `I just swapped on VerifySwap! 🚀 Tx: ${txHash.slice(0, 10)}...`;
    }
  } else {
    // Jika tidak ada hash (share aplikasi secara umum)
    shareText = `Check out VerifySwap - The safest way to swap on Base! 🛡️ Only 0.3% fee.`;
  }
  
  // 2. Construct the Warpcast compose URL
  // Using 'url' parameter is more standard for sharing links
  const appUrl = 'https://verifyswap.vercel.app';
  const warpcastUrl = `https://warpcast.com/~/compose?text=${encodeURIComponent(shareText)}&embeds[]=${encodeURIComponent(appUrl)}`;
  
  // 3. Redirect to Warpcast
  return NextResponse.redirect(warpcastUrl);
}