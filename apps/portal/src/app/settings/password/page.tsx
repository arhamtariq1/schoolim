import { ChangePasswordGate } from '@/components/change-password-gate';

/**
 * Reached when a user signs in with `mustChangePassword` set. No sidebar — same
 * moment as sign-in (see comment on prior version in git history).
 */
export default function ChangePasswordPage() {
  return <ChangePasswordGate />;
}
