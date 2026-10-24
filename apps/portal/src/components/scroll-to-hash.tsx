'use client';

import { useEffect } from 'react';

/**
 * Bring the `#section` named in the URL into view.
 *
 * The browser (and Next's router) scroll the *window* to an anchor, but this
 * app's shell scrolls inside its `main` panel, so a link like `/classes/…#subjects`
 * opens the page and leaves the section below the fold. `scrollIntoView` works
 * with whichever ancestor actually scrolls.
 *
 * Runs on mount and when the hash changes. A hash with no matching element is
 * ignored, which is the normal case for any page reached without one.
 */
export function ScrollToHash() {
  useEffect(() => {
    function scroll(): void {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (id === '') {
        return;
      }
      document.getElementById(id)?.scrollIntoView({ block: 'start' });
    }

    scroll();
    window.addEventListener('hashchange', scroll);
    return () => {
      window.removeEventListener('hashchange', scroll);
    };
  }, []);

  return null;
}
