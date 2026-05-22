// components/FarcasterWalletConnector.jsx
'use client';

import { useState, useEffect } from 'react';
import { useAccount, useConnect } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { isInFarcaster } from '@/lib/wagmi';

export function FarcasterWalletConnector() {
  const { isConnected, address } = useAccount();
  const { connectors } = useConnect();
  const [inFarcaster, setInFarcaster] = useState(false);

  useEffect(() => {
    setInFarcaster(isInFarcaster());
  }, []);

  // Fungsi connect khusus untuk Farcaster
  const connectFarcasterWallet = async () => {
    try {
      const sdk = await import('@farcaster/miniapp-sdk');
      const provider = sdk.wallet?.ethProvider;
      if (provider) {
        const accounts = await provider.request({ method: 'eth_requestAccounts' });
        console.log('✅ Connected Farcaster wallet:', accounts);
      }
    } catch (error) {
      console.error('❌ Farcaster wallet error:', error);
    }
  };

  // Jika sudah connect, tampilkan address
  if (isConnected && address) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-green-500/20 rounded-full">
        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
        <span className="text-sm text-white font-mono">
          {address.slice(0, 6)}...{address.slice(-4)}
        </span>
      </div>
    );
  }

  // Jika di Farcaster: tombol connect khusus
  if (inFarcaster) {
    return (
      <button
        onClick={connectFarcasterWallet}
        className="px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl text-white text-sm font-medium hover:opacity-90 transition"
      >
        📡 Connect Farcaster Wallet
      </button>
    );
  }

  // Jika di browser biasa: tombol RainbowKit
  return <ConnectButton />;
}