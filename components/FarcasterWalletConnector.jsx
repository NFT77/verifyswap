'use client';

import { useEffect, useState } from 'react';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';

export function FarcasterWalletConnector() {
  const { isConnected, address } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();

  const [inFarcaster, setInFarcaster]   = useState(false);
  const [sdkReady, setSdkReady]         = useState(false);
  const [autoConnectDone, setAutoConnectDone] = useState(false);

  // ✅ Deteksi Farcaster + panggil ready() via SDK — bukan isInFarcaster()
  useEffect(() => {
    const init = async () => {
      try {
        const { sdk } = await import('@farcaster/miniapp-sdk');
        const context = await sdk.context;

        if (context?.user?.fid) {
          setInFarcaster(true);
          await sdk.actions.ready();
        }
      } catch {
        // browser biasa
      } finally {
        setSdkReady(true);
      }
    };
    init();
  }, []);

  // ✅ Cari connector dengan ID yang benar: "farcasterFrame"
  const farcasterConnector = connectors.find(
    (c) => c.id === 'farcasterFrame'
  );

  // ✅ Auto-connect Warplet begitu connector tersedia dan di dalam Farcaster
  useEffect(() => {
    if (
      inFarcaster &&
      sdkReady &&
      !isConnected &&
      !isPending &&
      !autoConnectDone &&
      farcasterConnector
    ) {
      setAutoConnectDone(true);
      connect({ connector: farcasterConnector });
    }
  }, [inFarcaster, sdkReady, isConnected, isPending, autoConnectDone, farcasterConnector, connect]);

  const handleDisconnect = () => disconnect();

  // ── Sudah connect ─────────────────────────────────────────────────────────
  if (isConnected && address) {
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

  // ── Loading: SDK belum ready atau sedang auto-connect ─────────────────────
  if (!sdkReady || (inFarcaster && (isPending || !autoConnectDone))) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 bg-purple-500/20 rounded-xl">
        <div className="w-4 h-4 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-purple-300">
          {inFarcaster ? 'Connecting Warplet...' : 'Loading...'}
        </span>
      </div>
    );
  }

  // ── Farcaster tapi connector tidak ketemu (package belum install?) ─────────
  if (inFarcaster && !farcasterConnector) {
    return (
      <div className="px-4 py-2 bg-red-500/20 rounded-xl text-red-300 text-sm">
        ⚠️ Warplet connector tidak ditemukan.
        <br />
        <span className="text-xs opacity-70">
          Pastikan @farcaster/miniapp-wagmi-connector terinstall.
        </span>
      </div>
    );
  }

  // ── Browser biasa: RainbowKit ─────────────────────────────────────────────
  return <ConnectButton />;
}