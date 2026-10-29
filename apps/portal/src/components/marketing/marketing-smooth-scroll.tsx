'use client';

import Lenis from 'lenis';
import { useEffect, useRef } from 'react';

/**
 * Smooth scrolling, and the three things driven by scroll position — ADR-0019.
 *
 * ## One engine, one route
 *
 * Lenis is the product's only smooth-scroll engine and this is the only file
 * that imports it, so no application screen carries the cost. Locomotive
 * Scroll is deliberately not installed: two engines racing for the same scroll
 * position is the usual way a page like this ends up feeling broken on a
 * trackpad.
 *
 * ## What rides on it
 *
 * Three readouts, all written straight to the DOM in the scroll handler and
 * none of them through React state — a `setState` per animation frame would
 * re-render the page sixty times a second to change one number:
 *
 *   · the numeric percentage in the corner — the only position read-out on
 *     this page, since the scrollbar is hidden (ADR-0022),
 *   · `--read` on each manifesto, which is the number its words' opacities
 *     are computed from. See `marketing-manifesto.tsx` for that arithmetic,
 *   · and `--parallax` on each `[data-parallax]` wrapper (ADR-0020), from which
 *     CSS derives the mockups' drift and the hero's tilt.
 *
 * The manifesto measurement is a `getBoundingClientRect` per frame, which is
 * a forced layout — acceptable here only because there are one or two such
 * elements on the page. Per word it would be a hundred, and this would be the
 * slowest thing in the product.
 *
 * ## It is not initialised under reduced motion
 *
 * Not shortened, not damped — not started. Taking over the scroll of somebody
 * who asked their operating system for less motion is the one failure on this
 * page that makes it unusable rather than merely unfashionable, and the
 * preference is re-checked while the page is open, because somebody debugging
 * motion sickness changes that setting and expects the page to agree.
 *
 * Everything else about the page works without this component: the reveals are
 * driven by `MarketingBootstrap`, which runs before React, and `--read`
 * defaults to 1, so an unlit manifesto is never a possible resting state. If
 * hydration never happens, the page loses smooth scrolling and keeps every
 * word of its legibility.
 */

/** Where in the viewport a manifesto starts and finishes lighting, as fractions of its height. */
const READ_START = 0.85;
const READ_END = 0.3;

export function MarketingSmoothScroll() {
  const percentRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');

    let lenis: Lenis | undefined;
    let frame = 0;
    let onClick: ((event: MouseEvent) => void) | undefined;
    let lastPercent = '';

    /** Lit fraction for one manifesto, from where it currently sits in the viewport. */
    function readProgress(element: Element): number {
      const rect = element.getBoundingClientRect();
      const start = window.innerHeight * READ_START;
      const end = window.innerHeight * READ_END;
      const total = rect.height + (start - end);
      if (total <= 0) {
        return 1;
      }
      const travelled = start - rect.top;
      return Math.min(1, Math.max(0, travelled / total));
    }

    /**
     * How far a parallax wrapper has travelled through the viewport: 0 as its
     * top edge enters from below, 1 as its bottom edge leaves at the top.
     *
     * The wrapper is measured and its `[data-parallax-layer]` children are what
     * move. Measuring the element being transformed would feed its own offset
     * back into the next frame's measurement, and the picture would shudder.
     */
    function travelProgress(element: Element): number {
      const rect = element.getBoundingClientRect();
      const total = window.innerHeight + rect.height;
      if (total <= 0) {
        return 0.5;
      }
      return Math.min(1, Math.max(0, (window.innerHeight - rect.top) / total));
    }

    function paint(progress: number): void {
      // Only touched when the displayed value actually changes: this is text
      // in the document, so writing it every frame is a layout per frame for a
      // number that changes a hundred times in a whole page.
      //
      // `toFixed` rather than `Math.round` — which the house rules restrict,
      // correctly, because rounding is how paisa go missing (ADR-0007). This
      // needs a string for `textContent` regardless, so the rule costs nothing
      // here.
      const percent = (progress * 100).toFixed(0);
      if (percent !== lastPercent && percentRef.current !== null) {
        percentRef.current.textContent = percent;
        lastPercent = percent;
      }

      for (const element of document.querySelectorAll('[data-illuminate]')) {
        if (element instanceof HTMLElement) {
          element.style.setProperty('--read', readProgress(element).toFixed(3));
        }
      }

      for (const element of document.querySelectorAll('[data-parallax]')) {
        if (element instanceof HTMLElement) {
          element.style.setProperty('--parallax', travelProgress(element).toFixed(3));
        }
      }
    }

    function stop(): void {
      if (lenis === undefined) {
        return;
      }
      cancelAnimationFrame(frame);
      if (onClick !== undefined) {
        document.removeEventListener('click', onClick);
        onClick = undefined;
      }
      lenis.destroy();
      lenis = undefined;

      // Back to the resting state, which is fully lit — not to wherever the
      // last frame happened to leave it.
      for (const element of document.querySelectorAll('[data-illuminate]')) {
        if (element instanceof HTMLElement) {
          element.style.removeProperty('--read');
        }
      }
      // And parallax back to its centre, where the CSS computes no offset at all.
      for (const element of document.querySelectorAll('[data-parallax]')) {
        if (element instanceof HTMLElement) {
          element.style.removeProperty('--parallax');
        }
      }
    }

    function start(): void {
      if (lenis !== undefined || query.matches) {
        return;
      }

      const engine = new Lenis({
        // Lerp rather than a duration: a fixed duration makes a long flick and
        // a short one take the same time, which is what reads as "laggy"
        // rather than "smooth". 0.09 settles in about a third of a second.
        lerp: 0.09,
        smoothWheel: true,
        // The default (1.0) feels heavy on a trackpad against a page this
        // long; much above 1.2 overshoots on a mouse wheel.
        wheelMultiplier: 1.15,
        autoRaf: false,
      });

      engine.on('scroll', ({ progress }: { progress: number }) => {
        paint(progress);
      });

      /**
       * In-page anchors, scrolled rather than jumped.
       *
       * Lenis drives the real window scroll, so `href="#packages"` still works
       * untouched — it just arrives instantly, which next to a page that eases
       * everywhere else reads as a bug. Delegated from the document so links
       * added later need no registration.
       */
      const handler = (event: MouseEvent): void => {
        if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.button !== 0) {
          return;
        }
        const anchor =
          event.target instanceof Element ? event.target.closest('a[href^="#"]') : null;
        if (!(anchor instanceof HTMLAnchorElement)) {
          return;
        }
        const id = anchor.getAttribute('href')?.slice(1) ?? '';
        const target = id === '' ? null : document.getElementById(id);
        if (target === null) {
          return;
        }

        event.preventDefault();
        // No `offset` here. The sticky header is cleared by `scroll-mt-*` on
        // each section, which Lenis reads as well — passing an offset too
        // landed every anchor 192px down instead of 96. One source of truth,
        // and it is the one that also works when this file never runs.
        engine.scrollTo(target);
        window.history.replaceState(null, '', `#${id}`);

        // Preventing the default also prevents the browser moving focus, which
        // would leave a keyboard user still in the navigation while the page
        // scrolled away beneath them. This is the skip-link pattern.
        target.setAttribute('tabindex', '-1');
        target.focus({ preventScroll: true });
      };

      const tick = (time: number): void => {
        lenis?.raf(time);
        frame = requestAnimationFrame(tick);
      };

      document.addEventListener('click', handler);
      onClick = handler;
      lenis = engine;
      frame = requestAnimationFrame(tick);

      // One paint before the first scroll event, so a manifesto already on
      // screen at load is lit correctly rather than sitting at its floor.
      paint(0);
    }

    function onPreferenceChange(): void {
      if (!query.matches) {
        start();
        return;
      }

      stop();
      // The reveals are gated on this attribute. Dropping it alone would leave
      // anything not yet scrolled past hidden for good, so each one is put
      // into its final state on the way out.
      root.removeAttribute('data-marketing-motion');
      for (const node of document.querySelectorAll(
        '[data-reveal],[data-rule],[data-reveal-words]',
      )) {
        node.classList.add('is-visible');
      }
    }

    start();
    query.addEventListener('change', onPreferenceChange);

    return () => {
      query.removeEventListener('change', onPreferenceChange);
      stop();
    };
  }, []);

  return (
    <>
      {/* The read-out. `aria-hidden` because a percentage that changes as you
          scroll is noise to a screen reader, and the page has no other
          position indicator for it to duplicate. Hidden on small screens, where it
          would sit on top of the content rather than beside it. */}
      <div
        aria-hidden
        className="pointer-events-none fixed end-6 bottom-6 z-40 hidden items-center gap-2 lg:flex"
      >
        <span className="tabular text-xs font-medium text-muted-foreground">
          <span ref={percentRef}>0</span>%
        </span>
      </div>
    </>
  );
}
