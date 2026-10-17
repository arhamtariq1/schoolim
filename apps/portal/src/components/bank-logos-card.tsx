'use client';

import {
  BANK_LOGO_SLOTS,
  MAX_LOGO_BYTES,
  LOGO_MIME_TYPES,
  ROUTES,
  type BankLogo,
  type SchoolLogoInfo,
} from '@ilm/contracts';
import { Button, useToast } from '@ilm/ui';
import { CreateIcon, DeleteIcon, ICON_SIZE, RetryIcon } from '@ilm/ui/icons';
import { useRouter } from 'next/navigation';
import { useRef, useState, type ChangeEvent } from 'react';

import { readLogoFile } from './logo-picker';

import { mutate } from '@/lib/mutate';

/**
 * Settings › Voucher Settings › the banks a challan is paid at.
 *
 * One tile per uploaded mark, in print order, and an "Add Logo" tile while a
 * slot is free. Each tile saves the moment a file is picked — there is nothing
 * else on a tile to fill in, so a separate Save button would only be a second
 * click that means the same thing.
 */
export interface BankLogosCardProps {
  readonly logos: readonly BankLogo[];
  readonly canConfigure: boolean;
  readonly error?: string | undefined;
}

const ACCEPT = LOGO_MIME_TYPES.join(',');

export function BankLogosCard({ logos, canConfigure, error }: BankLogosCardProps) {
  const router = useRouter();
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  // Which slot the open file dialog is for: a replacement or the next free one.
  const [target, setTarget] = useState<number | undefined>(undefined);
  const [busySlot, setBusySlot] = useState<number | undefined>(undefined);
  const [formError, setFormError] = useState<string | undefined>(undefined);

  const nextSlot = Array.from({ length: BANK_LOGO_SLOTS }, (_, slot) => slot).find(
    (slot) => !logos.some((logo) => logo.slot === slot),
  );

  function pick(slot: number): void {
    setTarget(slot);
    setFormError(undefined);
    fileInput.current?.click();
  }

  async function upload(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    // Reset so picking the same file again after an error still fires.
    event.target.value = '';
    if (file === undefined || target === undefined) {
      return;
    }

    const read = await readLogoFile(file);
    if (!read.ok) {
      setFormError(read.error);
      return;
    }

    const replacing = logos.some((logo) => logo.slot === target);
    setBusySlot(target);
    const result = await mutate<SchoolLogoInfo>(ROUTES.bankLogo.slot(target), 'PUT', read.upload);
    setBusySlot(undefined);

    if (!result.ok) {
      setFormError(result.message);
      return;
    }
    toast.success(replacing ? 'Bank logo replaced.' : 'Bank logo added.');
    router.refresh();
  }

  async function remove(slot: number): Promise<void> {
    setFormError(undefined);
    setBusySlot(slot);
    const result = await mutate<{ removed: true }>(ROUTES.bankLogo.slot(slot), 'DELETE');
    setBusySlot(undefined);

    if (!result.ok) {
      setFormError(result.message);
      return;
    }
    toast.success('Bank logo removed.');
    router.refresh();
  }

  const busy = busySlot !== undefined;
  const message = formError ?? error;

  return (
    <div className="space-y-3">
      {message === undefined ? null : (
        <p
          role="alert"
          className="rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-danger"
        >
          {message}
        </p>
      )}

      {logos.length === 0 && !canConfigure ? (
        <p className="text-sm text-muted-foreground">No bank logos uploaded.</p>
      ) : null}

      <div className="flex flex-wrap items-stretch gap-3">
        {logos.map((logo, index) => (
          <div
            key={logo.slot}
            className="flex items-center gap-2 rounded-xl border border-border bg-background p-2"
          >
            <span className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-white p-1">
              <img
                src={`${ROUTES.bankLogo.slot(logo.slot)}?v=${logo.version}`}
                alt={`Bank logo ${String(index + 1)}`}
                className="max-h-full max-w-full object-contain"
              />
            </span>
            {canConfigure ? (
              <span className="flex flex-col gap-1">
                <Button
                  type="button"
                  tone="outline"
                  size="sm"
                  disabled={busy}
                  isPending={busySlot === logo.slot}
                  onClick={() => {
                    pick(logo.slot);
                  }}
                >
                  <RetryIcon className={ICON_SIZE.inline} aria-hidden />
                  Replace
                </Button>
                <Button
                  type="button"
                  tone="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => void remove(logo.slot)}
                >
                  <DeleteIcon className={ICON_SIZE.inline} aria-hidden />
                  Remove
                </Button>
              </span>
            ) : null}
          </div>
        ))}

        {canConfigure && nextSlot !== undefined ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              pick(nextSlot);
            }}
            className="flex min-h-20 items-center gap-3 rounded-xl border border-dashed border-input bg-muted/30 p-2 pe-4 text-start transition-colors hover:border-primary/50 hover:bg-primary/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="flex size-16 shrink-0 items-center justify-center rounded-md border border-border bg-background text-foreground">
              <CreateIcon className={ICON_SIZE.heading} aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-foreground">Add Logo</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Up to {BANK_LOGO_SLOTS} banks. PNG, JPEG or WebP, max{' '}
                {String(Math.trunc(MAX_LOGO_BYTES / 1024))} KB.
              </span>
            </span>
          </button>
        ) : null}
      </div>

      <input
        ref={fileInput}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => void upload(event)}
      />
    </div>
  );
}
