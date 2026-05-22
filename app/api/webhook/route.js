// app/api/webhook/route.js
import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    // Baca data dari Farcaster
    const body = await request.json();
    
    // Log untuk debugging di Vercel
    console.log('📡 Webhook received at:', new Date().toISOString());
    console.log('📦 Body:', JSON.stringify(body, null, 2));
    
    // Decode payload jika ada (untuk lihat event type)
    if (body.payload) {
      try {
        const payload = JSON.parse(Buffer.from(body.payload, 'base64url').toString());
        console.log('📋 Event type:', payload.type);
        console.log('👤 User FID:', payload.fid);
        
        // Simpan ke database atau log saja untuk sekarang
        // TODO: Tambahkan database jika perlu
        
      } catch (decodeError) {
        console.log('Payload not base64url encoded, using as is');
      }
    }
    
    // Response sukses
    return NextResponse.json({ 
      success: true, 
      message: 'Webhook received successfully' 
    });
    
  } catch (error) {
    console.error('❌ Webhook error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// Untuk testing GET (bisa diakses via browser)
export async function GET() {
  return NextResponse.json({ 
    status: 'Webhook endpoint active',
    timestamp: new Date().toISOString(),
    message: 'VerifySwap Mini App webhook is ready'
  });
}