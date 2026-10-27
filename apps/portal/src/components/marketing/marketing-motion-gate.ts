'use client';

import { useReducedMotion } from 'motion/react';
import { useSyncExternalStore } from 'react';

const noop = () => () => {};

/**
 * True only on the client, after hydration, when the reader has not asked for
 * reduced motion.
 *
 * Scroll-linked styles are attached only when this is true. The server cannot
 * know the reader's motion preference, so binding styles during the first
 * render would make the server's HTML and the client's first render disagree —
 * a hydration mismatch. Until this flips, every marketing set piece renders as
 * its finished, static layout, which is also exactly what a no-JS or
 * reduced-motion reader gets (ADR-0019).
 */
export function useMarketingMotion(): boolean {
  const isClient = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
  const isReduced = useReducedMotion() ?? false;
  return isClient && !isReduced;
}
