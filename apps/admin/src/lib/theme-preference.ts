/** Same cookie as the portal, so one operator keeps one appearance across both. */
export const THEME_STORAGE_KEY = 'ilm_theme';

export type ThemeChoice = 'light' | 'dark';

export function themeChoiceFromStoredValue(stored: string | undefined): ThemeChoice {
  return stored === 'dark' ? 'dark' : 'light';
}

export function themeCookieValue(choice: ThemeChoice): string {
  const maxAge = 60 * 60 * 24 * 365;
  return `${THEME_STORAGE_KEY}=${choice}; path=/; max-age=${String(maxAge)}; SameSite=Lax`;
}
