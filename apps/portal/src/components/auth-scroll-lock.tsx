'use client';

import { useEffect } from 'react';

/**
 * Freezes document scroll for the lifetime of an auth screen.
 *
 * Auth scrolls only inside the form column. Without locking `html`/`body`,
 * Windows still shows a second (document) scrollbar beside that column.
 */
export function AuthScrollLock() {
  useEffect(() => {
    const html = document.documentElement;
    const { body } = document;

    const previous = {
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
      bodyPosition: body.style.position,
      bodyTop: body.style.top,
      bodyWidth: body.style.width,
      scrollY: window.scrollY,
    };

    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    // `position: fixed` is what actually stops the window scrollbar on Windows
    // when a nested column also scrolls — overflow:hidden alone is not enough
    // once the layout has already painted a document scrollport.
    body.style.position = 'fixed';
    body.style.top = `-${String(previous.scrollY)}px`;
    body.style.width = '100%';

    return () => {
      html.style.overflow = previous.htmlOverflow;
      body.style.overflow = previous.bodyOverflow;
      body.style.position = previous.bodyPosition;
      body.style.top = previous.bodyTop;
      body.style.width = previous.bodyWidth;
      window.scrollTo(0, previous.scrollY);
    };
  }, []);

  return null;
}
