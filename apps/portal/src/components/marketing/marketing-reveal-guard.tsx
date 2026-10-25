'use client';

import { useEffect } from 'react';

/**
 * Makes sure nothing stays hidden — ADR-0019.
 *
 * ## The bug this exists to kill
 *
 * `MarketingBootstrap` runs an `IntersectionObserver` before React hydrates,
 * which is what lets the page reveal without waiting for a framework. But an
 * observer holds references to the specific DOM **nodes** it was given. If
 * React then replaces any of them — which is exactly what it does when
 * hydration mismatches and it falls back to a clean client render — the
 * observer is left watching detached nodes that will never intersect anything,
 * while the nodes actually on screen are watched by nobody.
 *
 * The result is a page whose headline and most of its body text are invisible,
 * permanently, with no error in the console. It is intermittent, because it
 * depends on whether a mismatch happened on that particular load. That is the
 * worst possible failure for a public landing page and it is caused entirely by
 * an optimisation.
 *
 * ## The fix
 *
 * This effect runs *after* hydration, so it sees whatever nodes React actually
 * settled on. It re-observes every reveal that has not fired yet. A fresh
 * observer reports immediately for anything already intersecting, so the
 * repair is a single frame and the visitor sees nothing unusual.
 *
 * ## And a backstop
 *
 * The timer is deliberate belt-and-braces. The observer above is the
 * mechanism; this is the guarantee. If anything at all prevents the callback
 * from running — a starved main thread on a cheap phone, an observer
 * implementation that misbehaves, some future bug of our own — everything
 * inside the viewport is simply shown. Below-fold reveals are untouched, so
 * the page still animates as designed; it just stops being able to hide text
 * forever.
 *
 * The honest reading is that `[data-word] { opacity: 0 }` makes legibility
 * depend on JavaScript succeeding at two separate moments. Until that is
 * reworked, this is the net under it.
 */

const SELECTOR = '[data-reveal],[data-rule],[data-reveal-words]';

/** Matches `MarketingBootstrap`, so a node revealed by either looks identical. */
const OPTIONS: IntersectionObserverInit = {
  threshold: 0.08,
  rootMargin: '0px 0px -8% 0px',
};

/** Long enough that the observer has had every chance; short enough nobody reads a blank page. */
const BACKSTOP_MS = 2000;

export function MarketingRevealGuard() {
  useEffect(() => {
    // Not set means motion was never enabled — no JavaScript path, reduced
    // motion, or no `IntersectionObserver`. In every one of those cases nothing
    // is hidden in the first place, so there is nothing to repair.
    if (document.documentElement.getAttribute('data-marketing-motion') !== 'on') {
      return;
    }

    const pending = [...document.querySelectorAll(SELECTOR)].filter(
      (node) => !node.classList.contains('is-visible'),
    );

    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      }
    }, OPTIONS);

    for (const node of pending) {
      observer.observe(node);
    }

    const backstop = window.setTimeout(() => {
      for (const node of document.querySelectorAll(SELECTOR)) {
        const box = node.getBoundingClientRect();
        const onScreen = box.top < window.innerHeight && box.bottom > 0;
        if (onScreen) {
          node.classList.add('is-visible');
        }
      }
    }, BACKSTOP_MS);

    return () => {
      observer.disconnect();
      window.clearTimeout(backstop);
    };
  }, []);

  return null;
}
