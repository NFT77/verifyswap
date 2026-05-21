// hooks/useDebounce.js
import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Hook untuk debounce value (menunda eksekusi sampai user berhenti mengetik)
 * @param {any} value - Nilai yang akan di-debounce
 * @param {number} delay - Delay dalam milidetik (default: 500ms)
 * @returns {any} - Nilai yang sudah di-debounce
 * 
 * @example
 * const [searchTerm, setSearchTerm] = useState('');
 * const debouncedSearchTerm = useDebounce(searchTerm, 500);
 * 
 * useEffect(() => {
 *   if (debouncedSearchTerm) {
 *     fetchSearchResults(debouncedSearchTerm);
 *   }
 * }, [debouncedSearchTerm]);
 */
export function useDebounce(value, delay = 500) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    // Set timer untuk update debounced value setelah delay
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    // Cleanup timer jika value berubah sebelum delay selesai
    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Hook untuk debounce fungsi (menunda eksekusi fungsi)
 * @param {Function} fn - Fungsi yang akan di-debounce
 * @param {number} delay - Delay dalam milidetik
 * @returns {Function} - Fungsi yang sudah di-debounce
 * 
 * @example
 * const debouncedSearch = useDebounceFn((query) => {
 *   fetchSearchResults(query);
 * }, 500);
 * 
 * // Panggil debouncedSearch(query) di onChange
 */
export function useDebounceFn(fn, delay = 500) {
  const timerRef = useRef(null);

  const debouncedFn = useCallback((...args) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      fn(...args);
      timerRef.current = null;
    }, delay);
  }, [fn, delay]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return debouncedFn;
}

/**
 * Hook untuk throttle (membatasi eksekusi)
 * @param {Function} fn - Fungsi yang akan di-throttle
 * @param {number} limit - Batas waktu dalam milidetik
 * @param {Object} options - Opsi tambahan
 * @param {boolean} options.trailing - Jalankan fungsi setelah throttle period (default: true)
 * @returns {Function} - Fungsi yang sudah di-throttle
 * 
 * @example
 * const throttledScroll = useThrottle(() => {
 *   handleScroll();
 * }, 1000);
 */
export function useThrottle(fn, limit = 1000, options = { trailing: true }) {
  const lastRunRef = useRef(0);
  const timerRef = useRef(null);
  const lastArgsRef = useRef(null);

  const throttledFn = useCallback((...args) => {
    const now = Date.now();
    
    if (now - lastRunRef.current >= limit) {
      // Jalankan sekarang
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      fn(...args);
      lastRunRef.current = now;
      lastArgsRef.current = null;
    } else if (options.trailing && !timerRef.current) {
      // Jadwalkan untuk dijalankan nanti
      lastArgsRef.current = args;
      const remaining = limit - (now - lastRunRef.current);
      timerRef.current = setTimeout(() => {
        if (lastArgsRef.current) {
          fn(...lastArgsRef.current);
          lastRunRef.current = Date.now();
          lastArgsRef.current = null;
        }
        timerRef.current = null;
      }, remaining);
    }
  }, [fn, limit, options.trailing]);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return throttledFn;
}

/**
 * Hook untuk debounce dengan leading option (eksekusi di awal)
 * @param {Function} fn - Fungsi yang akan di-debounce
 * @param {number} delay - Delay dalam milidetik
 * @param {Object} options - Opsi tambahan
 * @param {boolean} options.leading - Jalankan di awal (default: false)
 * @param {boolean} options.trailing - Jalankan di akhir (default: true)
 * @returns {Function} - Fungsi yang sudah di-debounce
 */
export function useDebounceAdvanced(fn, delay = 500, options = { leading: false, trailing: true }) {
  const timerRef = useRef(null);
  const lastArgsRef = useRef(null);
  const leadingCalledRef = useRef(false);

  const debouncedFn = useCallback((...args) => {
    // Leading edge execution
    if (options.leading && !timerRef.current && !leadingCalledRef.current) {
      fn(...args);
      leadingCalledRef.current = true;
    } else {
      lastArgsRef.current = args;
    }

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(() => {
      if (options.trailing && lastArgsRef.current) {
        fn(...lastArgsRef.current);
      }
      timerRef.current = null;
      leadingCalledRef.current = false;
      lastArgsRef.current = null;
    }, delay);
  }, [fn, delay, options.leading, options.trailing]);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return debouncedFn;
}