import { EmptyState } from '@ilm/ui';

/**
 * Reached when a user signs in with `mustChangePassword` set — an invited or
 * reset account. It exists as a route now so the sign-in redirect has a real
 * destination rather than a dead link.
 */
export default function ChangePasswordPage() {
  return (
    <EmptyState
      title="Change your password"
      description="Your account requires a new password before you can continue. This form arrives with Phase 1."
    />
  );
}
