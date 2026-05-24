'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

export default function SearchBar({ onSearch, isLoading, placeholder, recentSearches = [] }) {
  const [query, setQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [cooldown, setCooldown] = useState(false);
  const inputRef = useRef(null);
  const debounceTimerRef = useRef(null);
  const abortControllerRef = useRef(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, []);

  const handleSearch = useCallback((searchQuery) => {
    if (!searchQuery?.trim() || isLoading || cooldown) return;

    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    // Create new abort controller
    abortControllerRef.current = new AbortController();
    
    // Execute search
    onSearch(searchQuery.trim(), abortControllerRef.current.signal);
    
    // Set cooldown to prevent spam (2 seconds)
    setCooldown(true);
    setTimeout(() => setCooldown(false), 2000);
  }, [onSearch, isLoading, cooldown]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    if (query.trim() && !isLoading && !cooldown) {
      handleSearch(query.trim());
      setQuery('');
      inputRef.current?.blur();
    }
  };

  const handleClear = () => {
    setQuery('');
    inputRef.current?.focus();
  };

  const handleRecentSearchClick = (searchTerm) => {
    if (cooldown) return;
    setQuery(searchTerm);
    handleSearch(searchTerm);
    setIsFocused(false);
  };

  // Debounced input change (optional: auto-search on type)
  const handleInputChange = (e) => {
    const newValue = e.target.value;
    setQuery(newValue);
    
    // Clear previous debounce timer
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    
    // Optional: auto-search after user stops typing (500ms)
    // Comment out if you want manual search only
    if (newValue.trim().length > 2) {
      debounceTimerRef.current = setTimeout(() => {
        if (newValue.trim() && !isLoading && !cooldown) {
          handleSearch(newValue.trim());
        }
      }, 500);
    }
  };

  return (
    <div className="w-full relative">
      <form onSubmit={handleSubmit} className="w-full">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <span className="text-gray-400 text-xl">🔍</span>
          </div>

          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={handleInputChange}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setTimeout(() => setIsFocused(false), 200)}
            placeholder={placeholder || "Search by Token Address, FID, or Username..."}
            className="w-full pl-12 pr-24 py-4 bg-black/40 backdrop-blur-sm border border-white/20 rounded-2xl text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all duration-200 text-lg"
            disabled={isLoading || cooldown}
          />

          {query && !isLoading && (
            <button
              type="button"
              onClick={handleClear}
              className="absolute inset-y-0 right-20 flex items-center text-gray-400 hover:text-white transition"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}

          <button
            type="submit"
            disabled={!query.trim() || isLoading || cooldown}
            className={`absolute inset-y-0 right-2 my-1.5 px-5 rounded-xl font-medium transition-all duration-200 ${
              query.trim() && !isLoading && !cooldown
                ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white hover:opacity-90 active:scale-[0.98]'
                : 'bg-gray-600/50 text-gray-400 cursor-not-allowed'
            }`}
          >
            {isLoading ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : cooldown ? (
              '⏳ Wait'
            ) : (
              'Search'
            )}
          </button>
        </div>
      </form>

      {/* Recent Searches Dropdown */}
      {isFocused && recentSearches.length > 0 && !isLoading && (
        <div className="absolute z-50 mt-2 w-full bg-black/90 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden shadow-xl">
          <div className="p-2">
            <div className="px-3 py-2 text-xs text-gray-500 border-b border-white/10">
              Recent Searches
            </div>
            {recentSearches.slice(0, 5).map((item, idx) => (
              <button
                key={idx}
                onClick={() => handleRecentSearchClick(item.query)}
                className="w-full text-left px-3 py-2 hover:bg-white/10 transition-colors rounded-lg flex items-center gap-3"
              >
                <span className="text-gray-500 text-sm">🕐</span>
                <span className="text-sm text-gray-300 flex-1 font-mono">
                  {item.query.length > 50 ? item.query.slice(0, 47) + '...' : item.query}
                </span>
                {item.result?.name && (
                  <span className="text-xs text-gray-500">
                    {item.result.name.length > 20 ? item.result.name.slice(0, 17) + '...' : item.result.name}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {isLoading && (
        <div className="mt-2 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-black/50 rounded-full text-xs text-gray-400">
            <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse"></div>
            Searching...
          </div>
        </div>
      )}
      
      {cooldown && !isLoading && (
        <div className="mt-2 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-black/50 rounded-full text-xs text-gray-500">
            ⏳ Please wait 2 seconds before searching again
          </div>
        </div>
      )}
    </div>
  );
}