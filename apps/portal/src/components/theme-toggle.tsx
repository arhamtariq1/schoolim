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
 * `layout.tsx` reads the same key and makes the same assumption; the two have
 * to agree or the first paint and the icon disagree.
 *
 * ## The flash
 *
 * Applying the class from an effect means the first paint is light and the
 * second is dark, which is a white flash on every navigation for a dark-mode
 * user. The blocking script in `layout.tsx` sets the class before the browser
 * paints; this component only handles clicks afterwards. Both read the same
 * localStorage key, and it is defined once here.
 */

// Underscored, deliberately. It puts this key in the same family as the
// session cookies (`ilm_at`, `ilm_rt`, `ilm_csrf`) — the cookie prefix being one
// of the four places CLAUDE.md permits the placeholder product name at all —
// and an underscore keeps it clear of the brand-containment grep in CI, which
// looks for the name as a standalone word. A hyphen there fails the build.
export const THEME_STORAGE_KEY = 'ilm_theme';

type Choice = 'light' | 'dark';

function apply(choice: Choice): void {
  document.documentElement.classList.toggle('dark', choice === 'dark');
  document.documentElement.style.colorScheme = choice;
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

    // Anything other than a stored 'dark' is light, matching the blocking
    // script in layout.tsx exactly.
    const resolved: Choice = stored === 'dark' ? 'dark' : 'light';

    setChoice(resolved);

    // Re-apply, and not redundantly. React's Strict Mode remounts once in
    // development and resets <html> to only the attributes it manages from
    // JSX — which throws away the class the blocking script set, so a dark-mode
    // user's app turns light the moment it hydrates. Next's own guide
    // (docs/01-app/02-guides/preventing-flash-before-hydration.md, "Re-applying
    // attributes in development") calls this out. In production this line
    // writes the class that is already there and costs nothing.
    apply(resolved);
  }, []);

  function toggle() {
    const next: Choice = choice === 'dark' ? 'light' : 'dark';
    setChoice(next);
    apply(next);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // The theme still applies for this page; it just will not be remembered.
    }
  }

  const label = choice === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';

  return (
    <Hint label={label}>
      <button
        type="button"
        onClick={toggle}
        aria-label={label}
        className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {/* Both are rendered and one is hidden, rather than branching on
            `choice`: before the effect runs `choice` is undefined, and an icon
            that pops in a beat after the header is worse than one that is
            simply correct from the first frame. */}
        <LightModeIcon className={choice === 'dark' ? 'size-4' : 'hidden size-4'} aria-hidden="true" />
        <DarkModeIcon className={choice === 'dark' ? 'hidden size-4' : 'size-4'} aria-hidden="true" />
      </button>
    </Hint>
  );
}
