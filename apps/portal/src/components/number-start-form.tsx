'use client';

import { updateGrNumberSettingsSchema, updateVoucherNumberSettingsSchema } from '@ilm/contracts';
import {
  Button,
  cardSurfaceClassName,
  cn,
  Field,
  FieldIconWrap,
  Input,
  StatusBadge,
  useToast,
} from '@ilm/ui';
import { DesignationIcon, ICON_SIZE, SaveIcon } from '@ilm/ui/icons';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { mutate } from '@/lib/mutate';

/**
 * Where a numbering sequence starts — GR numbers and voucher numbers share it.
 *
 * Validation is the shared schema; the rule that matters — the number has to be
 * higher than everything already issued — needs the database, so the server
 * answers it and its message is shown on the field.
 */
export function NumberStartForm({
  title,
  noun,
  route,
  kind,
  settings,
  error,
  example,
  className,
}: {
  /** Card heading, e.g. "Starting GR number". */
  title: string;
  /** What is being numbered, in a sentence: "GR numbers", "voucher numbers". */
  noun: string;
  route: string;
  /**
   * Which counter this is, and so which shared schema checks it. A name rather
   * than a function: this form is rendered by server pages, and a function
   * cannot cross into a client component.
   */
  kind: 'gr' | 'voucher';
  settings:
    | {
        configured: boolean;
        /** The next number as it will be printed. */
        next: string | null;
        highestIssued: number | null;
      }
    | undefined;
  error?: string | undefined;
  example: string;
  className?: string;
}) {
  const router = useRouter();
  const toast = useToast();

  const [value, setValue] = useState(settings?.next ?? '');
  const [fieldError, setFieldError] = useState<string | undefined>(undefined);
  const [isPending, setIsPending] = useState(false);

  const configured = settings?.configured === true;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldError(undefined);

    const schema = kind === 'gr' ? updateGrNumberSettingsSchema : updateVoucherNumberSettingsSchema;
    const problem = schema.safeParse({ startingNumber: value }).error?.issues[0]?.message;
    if (problem !== undefined) {
      setFieldError(problem);
      toast.error(problem);
      return;
    }

    setIsPending(true);
    const result = await mutate(route, 'PUT', { startingNumber: value.trim() });
    setIsPending(false);

    if (!result.ok) {
      setFieldError(result.fieldErrors['startingNumber'] ?? result.message);
      toast.error(result.message);
      return;
    }

    toast.success(`Next number will be ${value.trim()}.`);
    router.refresh();
  }

  return (
    <section className={cn('w-full', cardSurfaceClassName, className)}>
      <header className="flex flex-col gap-3 border-b border-border/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <DesignationIcon className={ICON_SIZE.nav} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-foreground">{title}</h2>
            <p className="text-sm text-muted-foreground">
              Each new record receives the next number in this sequence.
            </p>
          </div>
        </div>
        <StatusBadge tone={configured ? 'success' : 'warning'} className="self-start sm:self-center">
          {configured ? 'Configured' : 'Not set'}
        </StatusBadge>
      </header>

      <form
        noValidate
        onSubmit={(event) => {
          void submit(event);
        }}
      >
        <div className="space-y-4 px-5 py-5 sm:px-6">
          {error === undefined ? null : (
            <div
              role="alert"
              className="rounded-md border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger"
            >
              {error}
            </div>
          )}

          {configured ? null : (
            <p className="rounded-md border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-foreground">
              No {noun} are issued until this is set. Enter the number your records are up to — for
              a new school, 1. Any pattern works as long as it ends in the number, for example{' '}
              {example}.
            </p>
          )}

          <Field
            label={configured ? 'Next number' : 'Starting number'}
            error={fieldError}
            hint={
              settings === undefined || settings.highestIssued === null
                ? undefined
                : `Highest number issued so far: ${String(settings.highestIssued)}. The new number must be higher than this.`
            }
            required
          >
            <FieldIconWrap icon={DesignationIcon}>
              <Input
                autoComplete="off"
                placeholder={`e.g. ${example}`}
                maxLength={40}
                value={value}
                onChange={(event) => {
                  setValue(event.target.value);
                  setFieldError(undefined);
                }}
              />
            </FieldIconWrap>
          </Field>
        </div>

        <footer className="flex justify-end border-t border-border/70 px-5 py-4 sm:px-6">
          <Button type="submit" isPending={isPending} className="w-full sm:w-auto">
            <SaveIcon className={ICON_SIZE.inline} aria-hidden />
            Save
          </Button>
        </footer>
      </form>
    </section>
  );
}
