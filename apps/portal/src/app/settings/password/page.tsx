import { Card, StatusBadge } from '@ilm/ui';
import { LockedIcon, ICON_SIZE } from '@ilm/ui/icons';
import { BRAND } from '@ilm/utils';

/**
 * Reached when a user signs in with `mustChangePassword` set — an invited or
 * reset account. It exists as a route now so the sign-in redirect has a real
 * destination rather than a dead link.
 *
 * ## Why this one deliberately has no sidebar
 *
 * Every other screen is wrapped in `<AppShell>`; this is the exception, and on
 * purpose. It is a gate: the person is here because they may not use the
 * product until they have set a password. Handing them a full navigation menu
 * invites them to click past the thing they are required to do, and then every
 * screen behind it has to check `mustChangePassword` for itself.
 *
 * So it is laid out like the sign-in page — same centred card, same width —
 * because it belongs to the same moment.
 */
export default function ChangePasswordPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-xl font-semibold text-foreground">{BRAND.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">One step before you continue</p>
        </div>

        <Card className="p-6 text-center">
          <span className="mx-auto mb-4 flex size-10 items-center justify-center rounded-full bg-warning/10 text-warning">
            <LockedIcon className={ICON_SIZE.nav} aria-hidden="true" />
          </span>

          <h2 className="font-semibold text-foreground">Change your password</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Your account was created by someone else, so it needs a password only you know before it
            can be used.
          </p>

          <div className="mt-4">
            <StatusBadge tone="warning">The form arrives in Phase 1</StatusBadge>
          </div>

          <p className="mt-4 text-xs text-muted-foreground">
            Until then, ask whoever set the account up to sign you in.
          </p>
        </Card>
      </div>
    </main>
  );
}
