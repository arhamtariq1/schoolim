/**
 * Client draft for signup step 1, so Back from OTP can restore the form.
 *
 * sessionStorage only (tab-scoped). Cleared on Start over and after OTP
 * hands the browser onto the school host. The httpOnly cookie never carries
 * these values.
 */

export const SIGNUP_DRAFT_KEY = 'ilm_signup_draft';

export interface SignupDraft {
  readonly name: string;
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
    const parsed = JSON.parse(raw) as Partial<SignupDraft>;
    if (typeof parsed.name !== 'string' || typeof parsed.email !== 'string') {
      return undefined;
    }
    return {
      name: parsed.name,
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
