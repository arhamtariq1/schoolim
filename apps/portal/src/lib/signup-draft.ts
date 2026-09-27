/**
 * Client draft for signup step 1, so Back from OTP can restore the form.
 *
 * sessionStorage only (tab-scoped). Cleared on Start over and after OTP
 * hands the browser onto the school host. The httpOnly cookie never carries
 * these values.
 */

export const SIGNUP_DRAFT_KEY = 'ilm_signup_draft';

export interface SignupDraft {
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly password: string;
  readonly confirmPassword: string;
  readonly accepted: boolean;
}

export function saveSignupDraft(draft: SignupDraft): void {
  try {
    window.sessionStorage.setItem(SIGNUP_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Private mode / quota — Back will still work; fields just will not restore.
  }
}

export function readSignupDraft(): SignupDraft | undefined {
  try {
    const raw = window.sessionStorage.getItem(SIGNUP_DRAFT_KEY);
    if (raw === null || raw === '') {
      return undefined;
    }
    const parsed = JSON.parse(raw) as Partial<SignupDraft> & { name?: string };
    // Older drafts stored a single `name`. Split once so Back still restores.
    const legacyName = typeof parsed.name === 'string' ? parsed.name.trim() : '';
    const firstName =
      typeof parsed.firstName === 'string'
        ? parsed.firstName
        : legacyName === ''
          ? ''
          : (legacyName.split(/\s+/)[0] ?? '');
    const lastName =
      typeof parsed.lastName === 'string'
        ? parsed.lastName
        : legacyName === ''
          ? ''
          : legacyName.split(/\s+/).slice(1).join(' ');
    if (
      (firstName === '' && lastName === '' && legacyName === '') ||
      typeof parsed.email !== 'string'
    ) {
      return undefined;
    }
    return {
      firstName,
      lastName,
      email: parsed.email,
      password: typeof parsed.password === 'string' ? parsed.password : '',
      confirmPassword: typeof parsed.confirmPassword === 'string' ? parsed.confirmPassword : '',
      accepted: parsed.accepted === true,
    };
  } catch {
    return undefined;
  }
}

export function clearSignupDraft(): void {
  try {
    window.sessionStorage.removeItem(SIGNUP_DRAFT_KEY);
  } catch {
    // Ignore.
  }
}
