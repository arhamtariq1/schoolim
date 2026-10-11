/** Shared with `theme-toggle.tsx` and the root layout — not in a client file so the layout stays a Server Component. */
export const THEME_STORAGE_KEY = 'ilm_theme';

export const THEME_COOKIE_NAME = THEME_STORAGE_KEY;

export type ThemeChoice = 'light' | 'dark';

export function themeChoiceFromStoredValue(stored: string | undefined): ThemeChoice {
  return stored === 'dark' ? 'dark' : 'light';
}

export function readThemeChoiceFromCookie(
  jar: { get: (name: string) => { value: string } | undefined },
): ThemeChoice {
  return themeChoiceFromStoredValue(jar.get(THEME_COOKIE_NAME)?.value);
}

/** One year; path-wide so every tenant host on the portal remembers the choice. */
export function themeCookieValue(choice: ThemeChoice): string {
  const maxAge = 60 * 60 * 24 * 365;
  return `${THEME_COOKIE_NAME}=${choice}; path=/; max-age=${String(maxAge)}; SameSite=Lax`;
}
