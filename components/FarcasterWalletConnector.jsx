'use client';

import { useState, useEffect } from 'react';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { isInFarcaster } from '@/lib/wagmi';

export function FarcasterWalletConnector() {
  const { isConnected, address } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const [inFarcaster, setInFarcaster] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  useEffect(() => {
    setInFarcaster(isInFarcaster());
  }, []);

  // Cari Farcaster mini app connector - PERBAIKAN NAMA ID
  const farcasterConnector = connectors.find(
    (connector) => connector.id === 'farcaster-miniapp' || // ✅ Perbaikan: 'farcaster-miniapp'
      connector.name === 'Farcaster Mini App' ||
      connector.id === 'miniapp'
  );

  // Fungsi connect khusus untuk Farcaster menggunakan wagmi
  const connectFarcasterWallet = async () => {
    if (!farcasterConnector) {
      console.error('❌ Farcaster connector not found');
      console.log('Available connectors:', connectors.map(c => ({ id: c.id, name: c.name }))); // Debug
      alert('Farcaster connector not found. Please reload the app.');
      return;
    }
    
    setIsConnecting(true);
    try {
      await connect({ connector: farcasterConnector });
      console.log('✅ Connected to Farcaster wallet');
    } catch (error) {
      console.error('❌ Connection error:', error);
      alert('Failed to connect: ' + (error.message || 'Unknown error'));
    } finally {
      setIsConnecting(false);
    }
  };

  // Fungsi disconnect
  const handleDisconnect = async () => {
    try {
      await disconnect();
    } catch (error) {
      console.error('Disconnect error:', error);
    }
  };

  // Jika sudah connect, tampilkan address dengan tombol disconnect
  if (isConnected && address) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-green-500/20 rounded-full">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
          <span className="text-sm text-white font-mono">
            {address.slice(0, 6)}...{address.slice(-4)}
          </span>
        </div>
        <button
          onClick={handleDisconnect}
          className="px-2 py-1.5 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition"
        >
          Disconnect
        </button>
      </div>
    );
  }

  // Jika di Farcaster: tombol connect menggunakan wagmi
  if (inFarcaster) {
    return (
      <button
        onClick={connectFarcasterWallet}
        disabled={isPending || isConnecting}
        className="px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl text-white text-sm font-medium hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
      >
        {(isPending || isConnecting) ? (
          <>
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            <span>Connecting...</span>
          </>
        ) : (
          <>
            <span>📡</span>
            <span>Connect Farcaster Wallet</span>
          </>
        )}
      </button>
    );
  }

  // Jika di browser biasa: tombol RainbowKit
  return <ConnectButton />;
}