'use client';

import { ROUTES } from '@ilm/contracts';
import { Button, Card } from '@ilm/ui';
import { SuccessIcon, ICON_SIZE } from '@ilm/ui/icons';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

/**
 * Shown when the profile is already complete but the access token still says
 * otherwise (refresh lag after create). Refreshes the session, then opens home.
 */
export function ProfileAlreadyComplete() {
  const router = useRouter();
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        await fetch(ROUTES.auth.refresh, { method: 'POST', credentials: 'include' });
      } catch {
        // Still send them home; the next navigation renews via the proxy.
      }
      if (!cancelled) {
        setBusy(false);
        router.replace('/');
        router.refresh();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <Card className="mx-auto max-w-md p-6 text-center">
      <span className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full bg-success/10 text-success">
        <SuccessIcon className={ICON_SIZE.nav} aria-hidden="true" />
      </span>
      <h2 className="font-semibold text-foreground">Profile ready</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {busy ? 'Opening your workspace…' : 'You can continue to the dashboard.'}
      </p>
      {busy ? null : (
        <Button
          type="button"
          className="mt-4"
          onClick={() => {
            router.replace('/');
            router.refresh();
          }}
        >
          Go to dashboard
        </Button>
      )}
    </Card>
  );
}
