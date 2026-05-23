'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function SearchBar({ onSearch, isLoading, placeholder, recentSearches = [] }) {
  const [query, setQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef(null);

  // ✅ PERBAIKAN: Handle submit yang lebih robust untuk HP
  const handleSubmit = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    
    const trimmedQuery = query.trim();
    if (trimmedQuery && !isLoading) {
      onSearch(trimmedQuery);
      // ✅ Jangan clear query di HP agar user bisa lihat apa yang dicari
      // setQuery(''); // <- HAPUS baris ini
      inputRef.current?.blur();
    }
  }, [query, isLoading, onSearch]);

  const handleClear = useCallback(() => {
    setQuery('');
    inputRef.current?.focus();
  }, []);

  const handleRecentSearchClick = useCallback((searchTerm) => {
    setQuery(searchTerm);
    onSearch(searchTerm);
    setIsFocused(false);
  }, [onSearch]);

  // ✅ PERBAIKAN: Handle change dengan debounce opsional untuk HP
  const handleChange = useCallback((e) => {
    const value = e.target.value;
    setQuery(value);
  }, []);

  // ✅ PERBAIKAN: Handle key press (enter) untuk HP
  const handleKeyPress = useCallback((e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit(e);
    }
  }, [handleSubmit]);

  return (
    <div className="w-full">
      <form onSubmit={handleSubmit} className="w-full">
        <div className="relative">
          {/* Search Icon */}
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none z-10">
            <span className="text-gray-400 text-xl">🔍</span>
          </div>
          
          {/* Input Field - PERBAIKAN: Touch-friendly untuk HP */}
          <input
            ref={inputRef}
            type="text"
            inputMode="text"
            autoComplete="off"
            autoCorrect="off"
            spellCheck="false"
            value={query}
            onChange={handleChange}
            onKeyPress={handleKeyPress}
            onFocus={() => setIsFocused(true)}
            onBlur={() => {
              // ✅ Delay lebih lama untuk HP agar click event sempat terdeteksi
              setTimeout(() => setIsFocused(false), 300);
            }}
            placeholder={placeholder || "Search by Token Address, FID, or Username..."}
            className="w-full pl-12 pr-24 py-4 bg-black/40 backdrop-blur-sm border border-white/20 rounded-2xl text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all duration-200 text-base md:text-lg"
            disabled={isLoading}
            enterKeyHint="search"
          />
          
          {/* Clear Button (X) - appears when there's text */}
          {query && !isLoading && (
            <button
              type="button"
              onClick={handleClear}
              className="absolute inset-y-0 right-20 flex items-center text-gray-400 hover:text-white transition px-2"
              aria-label="Clear search"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
          
          {/* Search/Submit Button - PERBAIKAN: Touch target lebih besar untuk HP */}
          <button
            type="submit"
            disabled={!query.trim() || isLoading}
            className={`absolute inset-y-0 right-2 my-1.5 px-4 md:px-5 rounded-xl font-medium transition-all duration-200 min-w-[70px] ${
              query.trim() && !isLoading
                ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white hover:opacity-90 active:scale-[0.98]'
                : 'bg-gray-600/50 text-gray-400 cursor-not-allowed'
            }`}
            aria-label="Search"
          >
            {isLoading ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto" />
            ) : (
              'Search'
            )}
          </button>
        </div>
      </form>
      
      {/* Recent Searches Dropdown - PERBAIKAN: Touch-friendly untuk HP */}
      <AnimatePresence>
        {isFocused && recentSearches.length > 0 && !isLoading && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute z-50 mt-2 w-full max-w-2xl bg-black/90 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden shadow-xl"
            style={{ maxWidth: 'calc(100% - 2rem)' }}
          >
            <div className="p-2">
              <div className="px-3 py-2 text-xs text-gray-500 border-b border-white/10">
                Recent Searches
              </div>
              {recentSearches.slice(0, 5).map((item, idx) => (
                <button
                  key={idx}
                  onClick={() => handleRecentSearchClick(item.query)}
                  className="w-full text-left px-3 py-3 hover:bg-white/10 active:bg-white/20 transition-colors rounded-lg flex items-center gap-3 group touch-manipulation"
                >
                  <span className="text-gray-500 text-sm">🕐</span>
                  <span className="text-sm text-gray-300 flex-1 font-mono break-all">
                    {item.query.length > 50 ? item.query.slice(0, 47) + '...' : item.query}
                  </span>
                  {item.result?.name && (
                    <span className="text-xs text-gray-500 hidden sm:inline">
                      {item.result.name.length > 20 ? item.result.name.slice(0, 17) + '...' : item.result.name}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Loading Overlay */}
      {isLoading && (
        <div className="mt-2 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-black/50 rounded-full text-xs text-gray-400">
            <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse"></div>
            Searching...
          </div>
        </div>
      )}
    </div>
  );
}