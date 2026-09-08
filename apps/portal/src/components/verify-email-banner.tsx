'use client';

import { ROUTES, type ResendVerificationResult } from '@ilm/contracts';
import { Button } from '@ilm/ui';
import { ICON_SIZE, SuccessIcon, WarningIcon } from '@ilm/ui/icons';
import { useState } from 'react';

/**
 * "Confirm your email address." — ADR-0012.
 *
 * ## Why this is a banner and not a wall
 *
 * ADR-0010 shipped self-serve signup on the argument that a dead end between
 * intent and product is where trials die, and that argument did not stop being
 * true once verification arrived. So this nags; it does not block. What it is
 * actually protecting against is specific and worth saying in the copy: the
 * owner's address is the only route back into a self-serve tenant, and an
 * address nobody has proved is a school one forgotten password from being lost.
 *
 * ## Why it is not dismissible
 *
 * A dismiss button on a message this consequential is a way of losing the
 * message. It disappears when the thing it is asking for is done — which is the
 * only honest way for a banner to go away.
 */
export function VerifyEmailBanner({ email }: { email: string }) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');
  const [waitSeconds, setWaitSeconds] = useState<number | undefined>(undefined);

  async function resend() {
    setState('sending');
    setWaitSeconds(undefined);

    try {
      const response = await fetch(ROUTES.auth.resendVerification, {
        method: 'POST',
        credentials: 'include',
      });

      if (!response.ok) {
        setState('failed');
        return;
      }

      const body = (await response.json()) as { data: ResendVerificationResult };

      if (body.data.sent) {
        setState('sent');
        return;
      }

      // Not an error — the cooldown. "Wait 43 seconds" is actionable; "could
      // not send" just invites another click.
      setWaitSeconds(body.data.retryAfterSeconds);
      setState('failed');
    } catch {
      setState('failed');
    }
  }

  if (state === 'sent') {
    return (
      <div
        role="status"
        className="mb-4 flex items-start gap-3 rounded-md border border-success/30 bg-success/10 px-4 py-3 text-sm"
      >
        <SuccessIcon className={`${ICON_SIZE.inline} mt-0.5 shrink-0 text-success`} aria-hidden />
        <p>
          Sent. Check <span className="font-medium">{email}</span> — including the spam folder,
          which is where a first message from a new sender usually lands.
        </p>
      </div>
    );
  }

  return (
    <div
      role="status"
      className="mb-4 flex flex-wrap items-start gap-3 rounded-md border border-warning/30 bg-warning/10 px-4 py-3 text-sm"
    >
      <WarningIcon className={`${ICON_SIZE.inline} mt-0.5 shrink-0 text-warning`} aria-hidden />

      <div className="min-w-0 flex-1">
        <p className="font-medium text-foreground">Confirm your email address</p>
        <p className="mt-1 text-muted-foreground">
          We sent a link to <span className="font-medium text-foreground">{email}</span>. Until you
          confirm it, you cannot reset your password — and that is the only way back into your
          school if you lose it.
        </p>
        {state === 'failed' ? (
          <p className="mt-2 text-danger">
            {waitSeconds === undefined
              ? 'Could not send it just now. Try again in a moment.'
              : `Just sent one. Try again in ${String(waitSeconds)} seconds.`}
          </p>
        ) : null}
      </div>

      <Button
        type="button"
        tone="outline"
        isPending={state === 'sending'}
        onClick={() => {
          void resend();
        }}
      >
        {state === 'sending' ? 'Sending…' : 'Send again'}
      </Button>
    </div>
  );
}
