'use client';

import { Hint } from '@ilm/ui';
import { DarkModeIcon, LightModeIcon } from '@ilm/ui/icons';
import { useEffect, useState } from 'react';

import {
  THEME_STORAGE_KEY,
  themeChoiceFromStoredValue,
  themeCookieValue,
  type ThemeChoice,
} from '@/lib/theme-preference';

function apply(choice: ThemeChoice): void {
  document.documentElement.classList.toggle('dark', choice === 'dark');
  document.documentElement.style.colorScheme = choice;
}

function persist(choice: ThemeChoice): void {
  document.cookie = themeCookieValue(choice);
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // Storage blocked: the theme still applies, it just is not remembered offline.
  }
}

/** Light by default; dark is a choice. The first paint comes from the cookie in the layout. */
export function ThemeToggle() {
  // Undefined until mounted, so the server never renders a guess that mismatches.
  const [choice, setChoice] = useState<ThemeChoice | undefined>(undefined);

  useEffect(() => {
    const match = document.cookie
      .split('; ')
      .find((entry) => entry.startsWith(`${THEME_STORAGE_KEY}=`));
    setChoice(themeChoiceFromStoredValue(match?.split('=')[1]));
  }, []);

  function toggle() {
    const next: ThemeChoice = choice === 'dark' ? 'light' : 'dark';
    setChoice(next);
    apply(next);
    persist(next);
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
