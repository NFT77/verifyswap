'use client';

import { useEffect, useState } from 'react';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';

export function FarcasterWalletConnector() {
  const { isConnected, address, status } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();

  const [inFarcaster, setInFarcaster] = useState(false);
  const [sdkReady, setSdkReady] = useState(false);
  const [autoConnectDone, setAutoConnectDone] = useState(false);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);

  // ✅ Deteksi Farcaster + panggil ready() via SDK
  useEffect(() => {
    const init = async () => {
      try {
        const { sdk } = await import('@farcaster/miniapp-sdk');
        const context = await sdk.context;

        if (context?.user?.fid) {
          setInFarcaster(true);
          await sdk.actions.ready();
          console.log('✅ Farcaster Mini App ready');
        }
      } catch (error) {
        console.log('Not in Farcaster environment:', error);
      } finally {
        setSdkReady(true);
      }
    };
    init();
  }, []);

  // ✅ Cari connector dengan beberapa kemungkinan ID
  const farcasterConnector = connectors.find(
    (c) => c.id === 'farcasterFrame' || c.id === 'farcaster-miniapp' || c.id === 'miniapp'
  );

  // ✅ Auto-connect Warplet dengan retry logic untuk desktop
  useEffect(() => {
    if (
      inFarcaster &&
      sdkReady &&
      !isConnected &&
      status !== 'connecting' &&
      !isPending &&
      !autoConnectDone &&
      farcasterConnector &&
      reconnectAttempts < 3
    ) {
      const timer = setTimeout(() => {
        console.log(`🔄 Auto-connect attempt ${reconnectAttempts + 1}`);
        connect({ connector: farcasterConnector }).catch((err) => {
          console.error('Auto-connect error:', err);
        });
        setAutoConnectDone(true);
        setReconnectAttempts(prev => prev + 1);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [inFarcaster, sdkReady, isConnected, status, isPending, autoConnectDone, farcasterConnector, connect, reconnectAttempts]);

  // ✅ Reset autoConnectDone jika koneksi gagal dan masih dalam Farcaster
  useEffect(() => {
    if (inFarcaster && !isConnected && autoConnectDone && status !== 'connecting') {
      const timer = setTimeout(() => {
        if (!isConnected && reconnectAttempts < 3) {
          console.log('🔄 Resetting auto-connect for retry');
          setAutoConnectDone(false);
        }
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [inFarcaster, isConnected, autoConnectDone, status, reconnectAttempts]);

  // ✅ Cek apakah wallet terhubung dengan benar (fix untuk desktop bug)
  const isWalletProperlyConnected = () => {
    if (!isConnected) return false;
    if (farcasterConnector && typeof farcasterConnector.getChainId !== 'function') {
      console.warn('⚠️ Wallet connector missing getChainId, attempting reconnect...');
      return false;
    }
    return true;
  };

  // ✅ Force reconnect jika wallet tidak terhubung dengan benar (desktop bug fix)
  useEffect(() => {
    if (inFarcaster && isConnected && !isWalletProperlyConnected() && reconnectAttempts < 3) {
      console.log('🔄 Wallet connected but incomplete, reconnecting...');
      const timer = setTimeout(() => {
        disconnect();
        setAutoConnectDone(false);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [inFarcaster, isConnected, farcasterConnector, disconnect, reconnectAttempts]);

  const handleManualConnect = async () => {
    if (!farcasterConnector) {
      console.error('❌ Farcaster connector not found');
      alert('Farcaster connector not found. Please reload the app.');
      return;
    }
    
    try {
      await connect({ connector: farcasterConnector });
      console.log('✅ Connected to Farcaster wallet');
    } catch (error) {
      console.error('❌ Connection error:', error);
      alert('Failed to connect: ' + (error.message || 'Unknown error'));
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnect();
      setAutoConnectDone(false);
      setReconnectAttempts(0);
      // ✅ Hanya reload di browser biasa, tidak di Farcaster
      if (!inFarcaster) {
        setTimeout(() => window.location.reload(), 100);
      }
    } catch (error) {
      console.error('Disconnect error:', error);
    }
  };

  // ── Status reconnecting ──
  if (status === 'reconnecting') {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-yellow-500/20 rounded-full">
        <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse" />
        <span className="text-sm text-white">Reconnecting...</span>
      </div>
    );
  }

  // ── Sudah connect dan proper ──
  if (isConnected && address && isWalletProperlyConnected()) {
    // ✅ Di Farcaster: hanya tampilkan address, tanpa tombol disconnect
    if (inFarcaster) {
      return (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-green-500/20 rounded-full">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          <span className="text-sm text-white font-mono">
            {address.slice(0, 6)}...{address.slice(-4)}
          </span>
        </div>
      );
    }
    
    // ✅ Di browser biasa: tampilkan address + tombol disconnect
    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-green-500/20 rounded-full">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
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

  // ── Loading: SDK belum ready atau sedang auto-connect ──
  if (!sdkReady || (inFarcaster && (isPending || status === 'connecting'))) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 bg-purple-500/20 rounded-xl">
        <div className="w-4 h-4 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-purple-300">
          {inFarcaster ? 'Connecting Warplet...' : 'Loading...'}
        </span>
      </div>
    );
  }

  // ── Farcaster tapi belum connect (manual fallback) ──
  if (inFarcaster && farcasterConnector && !isConnected) {
    return (
      <button
        onClick={handleManualConnect}
        disabled={isPending}
        className="px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl text-white text-sm font-medium hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
      >
        {isPending ? (
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

  // ── Farcaster tapi connector tidak ketemu ──
  if (inFarcaster && !farcasterConnector) {
    return (
      <div className="px-4 py-2 bg-red-500/20 rounded-xl text-red-300 text-sm">
        ⚠️ Warplet connector not found.
        <br />
        <span className="text-xs opacity-70">
          Make sure @farcaster/miniapp-wagmi-connector is installed.
        </span>
      </div>
    );
  }

  // ── Browser biasa: RainbowKit ──
  return <ConnectButton />;
}