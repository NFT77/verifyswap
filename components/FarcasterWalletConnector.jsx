'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';

export function FarcasterWalletConnector() {
  const { isConnected, address, status } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();

  const [inFarcaster, setInFarcaster] = useState(false);
  const [sdkReady, setSdkReady] = useState(false);
  const [autoConnectDone, setAutoConnectDone] = useState(false);
  const reconnectAttempts = useRef(0);

  // Detect Farcaster environment
  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      try {
        const { sdk } = await import('@farcaster/miniapp-sdk');
        const context = await Promise.race([
          sdk.context,
          new Promise((_, reject) => setTimeout(() => reject(new Error('SDK timeout')), 3000)),
        ]);
        if (!cancelled && context?.user?.fid) {
          setInFarcaster(true);
          await sdk.actions.ready({ disableNativeGestures: false });
          console.log('✅ Farcaster Mini App ready, FID:', context.user.fid);
        }
      } catch (error) {
        console.log('Browser mode:', error?.message);
      } finally {
        if (!cancelled) setSdkReady(true);
      }
    };
    init();
    return () => { cancelled = true; };
  }, []);

  // Find farcaster connector — memo-stable reference
  const farcasterConnector = connectors.find(
    (c) => c.id === 'farcasterFrame' || c.id === 'farcaster-miniapp' || c.id === 'miniapp'
  );

  // ✅ FIXED: wrap connect call in useCallback so dependency arrays are stable
  const attemptConnect = useCallback(async () => {
    if (!farcasterConnector) return;
    try {
      await connect({ connector: farcasterConnector });
      console.log('✅ Farcaster wallet connected');
    } catch (err) {
      console.error('Connect error:', err.message);
    }
  }, [connect, farcasterConnector]);

  // Auto-connect on mount in Farcaster
  useEffect(() => {
    if (
      !inFarcaster ||
      !sdkReady ||
      isConnected ||
      status === 'connecting' ||
      isPending ||
      autoConnectDone ||
      !farcasterConnector ||
      reconnectAttempts.current >= 3
    ) return;

    const timer = setTimeout(() => {
      console.log(`🔄 Auto-connect attempt ${reconnectAttempts.current + 1}`);
      reconnectAttempts.current += 1;
      setAutoConnectDone(true);
      attemptConnect();
    }, 500);

    return () => clearTimeout(timer);
  }, [inFarcaster, sdkReady, isConnected, status, isPending, autoConnectDone, farcasterConnector, attemptConnect]);

  // Retry if auto-connect failed
  useEffect(() => {
    if (
      !inFarcaster ||
      !autoConnectDone ||
      isConnected ||
      status === 'connecting' ||
      reconnectAttempts.current >= 3
    ) return;

    const timer = setTimeout(() => {
      console.log('🔄 Retrying auto-connect...');
      setAutoConnectDone(false);
    }, 2500);

    return () => clearTimeout(timer);
  }, [inFarcaster, autoConnectDone, isConnected, status]);

  // ✅ FIXED: isWalletProperlyConnected as a regular variable (not called inside useEffect)
  const isWalletProperlyConnected =
    isConnected &&
    !!address &&
    !(inFarcaster && farcasterConnector && typeof farcasterConnector.getChainId !== 'function');

  // Force reconnect if connected but incomplete (desktop Farcaster bug)
  useEffect(() => {
    if (
      !inFarcaster ||
      !isConnected ||
      isWalletProperlyConnected ||
      reconnectAttempts.current >= 3
    ) return;

    console.warn('⚠️ Wallet connected but incomplete, forcing reconnect...');
    const timer = setTimeout(() => {
      disconnect();
      setAutoConnectDone(false);
    }, 500);

    return () => clearTimeout(timer);
  }, [inFarcaster, isConnected, isWalletProperlyConnected, disconnect]);

  const handleManualConnect = async () => {
    if (!farcasterConnector) {
      console.error('❌ Farcaster connector not found');
      return;
    }
    reconnectAttempts.current = 0;
    await attemptConnect();
  };

  const handleDisconnect = async () => {
    try {
      await disconnect();
      setAutoConnectDone(false);
      reconnectAttempts.current = 0;
      if (!inFarcaster) {
        setTimeout(() => window.location.reload(), 100);
      }
    } catch (error) {
      console.error('Disconnect error:', error);
    }
  };

  // ── Reconnecting ──
  if (status === 'reconnecting') {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-yellow-500/20 rounded-full">
        <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse" />
        <span className="text-sm text-white">Reconnecting...</span>
      </div>
    );
  }

  // ── Connected and healthy ──
  if (isWalletProperlyConnected) {
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

  // ── Loading / connecting ──
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

  // ── Farcaster but not connected — manual fallback ──
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

  // ── Farcaster but connector missing ──
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

  // ── Browser: RainbowKit ──
  return <ConnectButton />;
}