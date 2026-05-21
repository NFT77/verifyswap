// components/SearchHistory.jsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// Maximum number of history items to display
const MAX_DISPLAY_ITEMS = 5;
const MAX_STORAGE_ITEMS = 20;

export default function SearchHistory({ onSelect, maxItems = MAX_DISPLAY_ITEMS }) {
  const [history, setHistory] = useState([]);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = useCallback(() => {
    const stored = localStorage.getItem('verifySwap_history');
    if (stored) {
      const parsed = JSON.parse(stored);
      setHistory(showAll ? parsed : parsed.slice(0, maxItems));
    }
  }, [maxItems, showAll]);

  const saveToHistory = useCallback((item) => {
    const stored = JSON.parse(localStorage.getItem('verifySwap_history') || '[]');
    const filtered = stored.filter(i => i.query !== item.query);
    const newHistory = [item, ...filtered].slice(0, MAX_STORAGE_ITEMS);
    localStorage.setItem('verifySwap_history', JSON.stringify(newHistory));
    loadHistory();
  }, [loadHistory]);

  const clearAllHistory = useCallback(() => {
    localStorage.removeItem('verifySwap_history');
    setHistory([]);
  }, []);

  const removeOneHistory = useCallback((queryToRemove) => {
    const stored = JSON.parse(localStorage.getItem('verifySwap_history') || '[]');
    const filtered = stored.filter(i => i.query !== queryToRemove);
    localStorage.setItem('verifySwap_history', JSON.stringify(filtered));
    loadHistory();
  }, [loadHistory]);

  const toggleShowAll = useCallback(() => {
    setShowAll(prev => !prev);
  }, []);

  // Public method to add search result
  const addToHistory = useCallback((query, result) => {
    saveToHistory({
      query,
      result: {
        name: result.name,
        symbol: result.symbol,
        type: result.type,
      },
      timestamp: Date.now(),
    });
  }, [saveToHistory]);

  // Expose method globally for SearchBar
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.addToSearchHistory = addToHistory;
    }
  }, [addToHistory]);

  // Reload history when showAll changes
  useEffect(() => {
    loadHistory();
  }, [showAll, loadHistory]);

  if (history.length === 0) {
    return null;
  }

  const displayedHistory = showAll ? history : history.slice(0, maxItems);
  const hasMore = history.length > maxItems;

  return (
    <div className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 p-4 transition-all duration-200">
      <div className="flex justify-between items-center mb-3">
        <div className="text-sm text-gray-400 flex items-center gap-2">
          <span className="text-base">📜</span> 
          <span>Search History</span>
          <span className="text-xs text-gray-500 bg-white/10 px-2 py-0.5 rounded-full">
            {history.length} items
          </span>
        </div>
        <button
          onClick={clearAllHistory}
          className="text-xs text-red-400 hover:text-red-300 transition px-2 py-1 rounded-lg hover:bg-red-500/10"
        >
          🗑️ Clear All
        </button>
      </div>

      <div className="space-y-2">
        <AnimatePresence mode="popLayout">
          {displayedHistory.map((item, idx) => (
            <motion.div
              key={item.query + item.timestamp}
              layout
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ delay: idx * 0.03, duration: 0.2 }}
              className="flex items-center justify-between p-2 rounded-lg hover:bg-white/10 transition-all duration-200 group"
            >
              <button
                onClick={() => onSelect(item.query)}
                className="flex-1 text-left flex items-center gap-3 min-w-0"
              >
                <span className="text-gray-400 text-sm flex-shrink-0">
                  {item.result?.type === 'token' ? '🪙' : item.result?.type === 'fid' ? '👤' : '🔍'}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-white text-sm font-mono truncate">
                    {item.query.length > 40 ? item.query.slice(0, 37) + '...' : item.query}
                  </div>
                  <div className="text-xs text-gray-500 truncate">
                    {item.result?.name || item.result?.symbol || 'Unknown'}
                  </div>
                </div>
                <div className="text-xs text-gray-600 flex-shrink-0">
                  {formatTime(item.timestamp)}
                </div>
              </button>
              <button
                onClick={() => removeOneHistory(item.query)}
                className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 transition-all duration-200 px-2 py-1 rounded-lg hover:bg-red-500/10"
                aria-label="Remove from history"
              >
                ✕
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Show More / Show Less Button */}
      {hasMore && (
        <div className="text-center mt-3">
          <button
            onClick={toggleShowAll}
            className="text-xs text-purple-400 hover:text-purple-300 transition px-3 py-1 rounded-lg hover:bg-purple-500/10"
          >
            {showAll ? 'Show less' : `Show ${Math.min(history.length - maxItems, 10)} more...`}
          </button>
        </div>
      )}

      <div className="text-center text-xs text-gray-600 mt-2">
        {showAll ? `Showing all ${history.length} searches` : `Showing ${Math.min(history.length, maxItems)} of ${history.length} searches`}
      </div>
    </div>
  );
}

function formatTime(timestamp) {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}