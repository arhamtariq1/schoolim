'use client';

import { Hint } from '@ilm/ui';
import { DarkModeIcon, LightModeIcon } from '@ilm/ui/icons';
import { useEffect, useState } from 'react';

/**
 * Light and dark.
 *
 * The tokens for both have existed since the theme was written (docs/16 §6:
 * "dark mode from day one"), but nothing ever put `.dark` on the document — so
 * every dark value in the palette was dead code and the product had one theme.
 * This is the switch that makes the other half real.
 *
 * ## Two states, and light is the default
 *
 * The device's `prefers-color-scheme` is deliberately not consulted. This is a
 * school's accounts — printed, projected, read over somebody's shoulder — and
 * it has one default appearance on every machine that opens it, rather than
 * one appearance in the office and another on a teacher's laptop that flips
 * dark at sunset. Dark is a choice a person makes here.
 *
 * So the stored value is `'light' | 'dark' | null`, where null means light.
 * `layout.tsx` reads the same choice from a cookie on the server; this
 * component keeps the cookie and localStorage in sync when the user toggles.
 *
 * ## The flash
 *
 * React 19 no longer allows inline scripts in the root layout on client
 * navigations, so the first paint comes from the server reading the theme
 * cookie. localStorage is still updated here for parity and for one release of
 * migration from script-only storage.
 */

import {
  THEME_STORAGE_KEY,
  themeChoiceFromStoredValue,
  themeCookieValue,
  type ThemeChoice,
} from '@/lib/theme-preference';

type Choice = ThemeChoice;

function apply(choice: Choice): void {
  document.documentElement.classList.toggle('dark', choice === 'dark');
  document.documentElement.style.colorScheme = choice;
}

function persistTheme(choice: Choice): void {
  document.cookie = themeCookieValue(choice);
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // The theme still applies for this page; it just will not be remembered offline.
  }
}

export function ThemeToggle() {
  // `undefined` until mounted: the server has no idea what the browser prefers,
  // and rendering a guess produces a hydration mismatch on the icon.
  const [choice, setChoice] = useState<Choice | undefined>(undefined);

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    } catch {
      // Private mode, or storage blocked. The app still opens light, which is
      // the default anyway — only the memory of a choice is lost.
    }

    const resolved = themeChoiceFromStoredValue(stored ?? undefined);

    setChoice(resolved);
    persistTheme(resolved);

    // Re-apply after hydration. Strict Mode remounts once in development and
    // can reset `<html>` classes the server set from the cookie.
    apply(resolved);
  }, []);

  function toggle() {
    const next: Choice = choice === 'dark' ? 'light' : 'dark';
    setChoice(next);
    apply(next);
    persistTheme(next);
  }

  const label = choice === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';

  return (
    <Hint label={label}>
      <button
        type="button"
        onClick={toggle}
        aria-label={label}
        className="inline-flex size-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {/* Both are rendered and one is hidden, rather than branching on
            `choice`: before the effect runs `choice` is undefined, and an icon
            that pops in a beat after the header is worse than one that is
            simply correct from the first frame. */}
        <LightModeIcon
          className={choice === 'dark' ? 'size-5 shrink-0' : 'hidden size-5 shrink-0'}
          aria-hidden="true"
        />
        <DarkModeIcon
          className={choice === 'dark' ? 'hidden size-5 shrink-0' : 'size-5 shrink-0'}
          aria-hidden="true"
        />
      </button>
    </Hint>
  );
}
