'use client';

import { Card } from '@ilm/ui';
import { LockedIcon, ICON_SIZE } from '@ilm/ui/icons';
import { BRAND } from '@ilm/utils';
import { useRouter } from 'next/navigation';

import { ChangePasswordForm } from '@/components/change-password-form';

/** Full-screen gate when the session requires a new password. */
export function ChangePasswordGate() {
  const router = useRouter();

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-xl font-semibold text-foreground">{BRAND.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">One step before you continue</p>
        </div>

        <Card className="p-6">
          <span className="mx-auto mb-4 flex size-10 items-center justify-center rounded-full bg-warning/10 text-warning">
            <LockedIcon className={ICON_SIZE.nav} aria-hidden="true" />
          </span>

          <h2 className="text-center font-semibold text-foreground">Change your password</h2>
          <p className="mt-2 text-center text-sm leading-relaxed text-muted-foreground">
            Your account needs a password only you know before you can use the portal.
          </p>

          <div className="mt-6">
            <ChangePasswordForm
              submitLabel="Continue"
              onSuccess={() => {
                router.replace('/');
                router.refresh();
              }}
            />
          </div>
        </Card>
      </div>
    </main>
  );
}
