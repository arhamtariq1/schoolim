'use client';

import { useEffect, useRef } from 'react';

/**
 * Calls `callback` after `delayMs` of quiet time. Used by list search fields so
 * typing does not hit the API on every keystroke.
 */
export function useDebouncedCallback<TArgs extends readonly unknown[]>(
  callback: (...args: TArgs) => void,
  delayMs: number,
): (...args: TArgs) => void {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    return () => {
      if (timer.current !== undefined) {
        clearTimeout(timer.current);
      }
    };
  }, []);

  return (...args: TArgs) => {
    if (timer.current !== undefined) {
      clearTimeout(timer.current);
    }
    timer.current = setTimeout(() => {
      callbackRef.current(...args);
    }, delayMs);
  };
}
