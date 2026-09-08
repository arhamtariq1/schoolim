'use client';

import {
  createFeeHeadSchema,
  FEE_HEAD_TYPE_LABELS,
  FEE_HEAD_TYPES,
  ROUTES,
  type FeeHead,
  type FeeHeadType,
} from '@ilm/contracts';
import {
  Button,
  ConfirmDialog,
  DataTable,
  Field,
  Input,
  Money,
  SimpleSelect,
  StatusBadge,
  useToast,
  type Column,
} from '@ilm/ui';
import { CreateIcon, DeleteIcon, EditIcon, ICON_SIZE } from '@ilm/ui/icons';
import { minorUnits } from '@ilm/utils';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { mutate } from '@/lib/mutate';

/**
 * Settings › Fees — the catalogue.
 *
 * ## Two things this screen says out loud
 *
 * **"Changing an amount only affects new admissions."** It is the module's
 * founding rule (docs/modules/fees-and-finance.md §1) and the single most
 * common thing a school gets wrong about fee software. A principal who thinks
 * this button restates every child's history will never press it, so the screen
 * answers the question before it is asked.
 *
 * **A fee in use is turned off, not deleted.** The Delete action is simply
 * absent once anyone is billed against a head, replaced by the toggle — an
 * action that exists but always fails is worse than one that is not offered
 * (docs/16 §7: the control is hidden, not disabled-with-a-shrug).
 *
 * Amounts are entered in **rupees** and held as paisa the moment they leave the
 * input. A form that carries rupees any further is a form that eventually sends
 * them to an endpoint expecting paisa.
 */

const TYPE_OPTIONS = FEE_HEAD_TYPES.map((type) => ({
  value: type,
  label: FEE_HEAD_TYPE_LABELS[type],
}));

export interface FeeHeadsManagerProps {
  initialHeads: FeeHead[];
  error?: string | undefined;
  canConfigure: boolean;
}

export function FeeHeadsManager({ initialHeads, error, canConfigure }: FeeHeadsManagerProps) {
  const router = useRouter();
  const toast = useToast();

  const [editing, setEditing] = useState<FeeHead | undefined>(undefined);
  const [pendingDelete, setPendingDelete] = useState<FeeHead | undefined>(undefined);
  const [isBusy, setIsBusy] = useState(false);

  const heads = initialHeads;
  const activeTotalMinor = heads
    .filter((head) => head.isActive)
    .reduce((sum, head) => sum + head.defaultAmountMinor, 0);

  async function toggleActive(head: FeeHead) {
    setIsBusy(true);
    const result = await mutate(ROUTES.fees.head(head.id), 'PATCH', { isActive: !head.isActive });
    setIsBusy(false);

    if (!result.ok) {
      toast.error(result.message);
      return;
    }

    toast.success(head.isActive ? `${head.name} turned off` : `${head.name} turned on`);
    router.refresh();
  }

  async function confirmDelete() {
    if (pendingDelete === undefined) {
      return;
    }

    setIsBusy(true);
    const result = await mutate(ROUTES.fees.head(pendingDelete.id), 'DELETE');
    setIsBusy(false);
    setPendingDelete(undefined);

    if (!result.ok) {
      toast.error(result.message);
      return;
    }

    const removed = (result.data as { data?: { removedStudentCharges?: number } })?.data
      ?.removedStudentCharges;
    toast.success(
      `${pendingDelete.name} deleted`,
      removed !== undefined && removed > 0
        ? `Removed from ${String(removed)} ${removed === 1 ? 'student' : 'students'}.`
        : undefined,
    );
    router.refresh();
  }

  const columns: Column<FeeHead>[] = [
    {
      key: 'name',
      header: 'Fee',
      render: (head) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{head.name}</p>
          <p className="text-xs text-muted-foreground">{FEE_HEAD_TYPE_LABELS[head.type]}</p>
        </div>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'end',
      render: (head) => <Money valueMinor={minorUnits(head.defaultAmountMinor)} />,
    },
    {
      key: 'students',
      header: 'Students',
      align: 'end',
      hideOnMobile: true,
      render: (head) => (
        <span className="font-mono text-sm text-muted-foreground tabular-nums">
          {head.studentCount === 0 ? '—' : head.studentCount}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (head) => (
        <StatusBadge tone={head.isActive ? 'success' : 'neutral'}>
          {head.isActive ? 'On' : 'Off'}
        </StatusBadge>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'end',
      render: (head) =>
        !canConfigure ? null : (
          <div className="flex items-center justify-end gap-1">
            <Button
              tone="ghost"
              size="sm"
              disabled={isBusy}
              onClick={() => {
                setEditing(head);
              }}
            >
              <EditIcon className={ICON_SIZE.inline} aria-hidden />
              Edit
            </Button>
            <Button
              tone="ghost"
              size="sm"
              disabled={isBusy}
              onClick={() => {
                void toggleActive(head);
              }}
            >
              {head.isActive ? 'Turn off' : 'Turn on'}
            </Button>
            {/* Always offered. A fee in use used to hide this and force "turn
                off" instead, which left a mistyped fee on every existing
                student's structure forever. The confirmation carries the
                consequence rather than the button withholding the action. */}
            <Button
              tone="ghost"
              size="sm"
              disabled={isBusy}
              aria-label={`Delete ${head.name}`}
              onClick={() => {
                setPendingDelete(head);
              }}
            >
              <DeleteIcon className={`${ICON_SIZE.inline} text-danger`} aria-hidden />
            </Button>
          </div>
        ),
    },
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Fees</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            What your school charges. New admissions start from these amounts —{' '}
            <strong className="font-medium text-foreground">
              changing one here never changes what an existing student was already charged.
            </strong>
          </p>
        </div>

        {heads.length > 0 ? (
          <div className="rounded-xl border border-border bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">A new admission starts at</p>
            <p className="mt-1">
              <Money valueMinor={minorUnits(activeTotalMinor)} withSymbol className="text-lg" />
            </p>
          </div>
        ) : null}
      </header>

      {canConfigure ? (
        <FeeHeadForm
          key={editing?.id ?? 'create'}
          editing={editing}
          onDone={() => {
            setEditing(undefined);
            router.refresh();
          }}
          onCancelEdit={() => {
            setEditing(undefined);
          }}
        />
      ) : null}

      <DataTable
        rows={heads}
        columns={columns}
        rowKey={(head) => head.id}
        error={error}
        caption="Fees this school charges"
        empty={{
          title: 'No fees set up yet',
          description:
            'Add what you charge — admission, tuition, annual charges. Every admission form then fills itself in from this list.',
        }}
      />

      <ConfirmDialog
        open={pendingDelete !== undefined}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDelete(undefined);
          }
        }}
        title={`Delete ${pendingDelete?.name ?? ''}?`}
        description={
          pendingDelete === undefined || pendingDelete.studentCount === 0 ? (
            'Nobody is billed for this fee, so nothing is lost. It stops appearing on new admissions.'
          ) : (
            <>
              <strong className="font-medium text-foreground">
                {pendingDelete.studentCount}{' '}
                {pendingDelete.studentCount === 1 ? 'student is' : 'students are'} billed for this.
              </strong>{' '}
              Deleting it removes the charge from their fee structures and lowers what they owe.
              This cannot be undone — if you only want it off new admissions, use <em>Turn off</em>{' '}
              instead.
            </>
          )
        }
        confirmLabel="Delete"
        tone="danger"
        onConfirm={() => {
          void confirmDelete();
        }}
      />
    </div>
  );
}

/**
 * Add or edit one fee.
 *
 * The same form does both, keyed on the row being edited so React remounts it
 * with fresh defaults rather than leaving the previous fee's amount in the box.
 */
function FeeHeadForm({
  editing,
  onDone,
  onCancelEdit,
}: {
  editing: FeeHead | undefined;
  onDone: () => void;
  onCancelEdit: () => void;
}) {
  const toast = useToast();

  const [type, setType] = useState<FeeHeadType>(editing?.type ?? 'CUSTOM');
  const [name, setName] = useState(editing?.name ?? '');
  // Rupees, as a string, because that is what a person types. It becomes paisa
  // exactly once, on submit.
  const [amount, setAmount] = useState(
    editing === undefined ? '' : (editing.defaultAmountMinor / 100).toFixed(2),
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | undefined>(undefined);
  const [isPending, setIsPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldErrors({});
    setFormError(undefined);

    const rupees = Number(amount);
    if (!Number.isFinite(rupees) || rupees < 0) {
      setFieldErrors({ defaultAmountMinor: 'Enter an amount, for example 6000.' });
      return;
    }

    // Rounded here rather than trusted: 6000.005 typed into the box would
    // otherwise reach the server as a fraction of a paisa and be rejected by a
    // schema that says integer, with a message about a field nobody typed.
    const parsed = createFeeHeadSchema.safeParse({
      type,
      name,
      defaultAmountMinor: Math.trunc(rupees * 100 + (rupees < 0 ? -0.5 : 0.5)),
    });

    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        next[issue.path.join('.')] = issue.message;
      }
      setFieldErrors(next);
      return;
    }

    setIsPending(true);
    const result =
      editing === undefined
        ? await mutate(ROUTES.fees.heads, 'POST', parsed.data)
        : await mutate(ROUTES.fees.head(editing.id), 'PATCH', parsed.data);
    setIsPending(false);

    if (!result.ok) {
      setFormError(result.message);
      setFieldErrors(result.fieldErrors);
      return;
    }

    toast.success(
      editing === undefined ? `${parsed.data.name} added` : `${parsed.data.name} saved`,
    );
    setName('');
    setAmount('');
    setType('CUSTOM');
    onDone();
  }

  return (
    <form
      onSubmit={(event) => {
        void submit(event);
      }}
      noValidate
      className="rounded-xl border border-border bg-card p-4 sm:p-6"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-medium text-foreground">
          {editing === undefined ? 'Add a fee' : `Edit ${editing.name}`}
        </h2>
        {editing === undefined ? null : (
          <Button type="button" tone="ghost" size="sm" onClick={onCancelEdit}>
            Cancel
          </Button>
        )}
      </div>

      {formError === undefined ? null : (
        <div
          role="alert"
          className="mt-4 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          {formError}
        </div>
      )}

      {/* Fields on one row, the action on its own beneath.
          
          They were one row with `items-end`, which aligns the *bottoms* of the
          cells — so the moment a validation message appeared under one field,
          that cell grew and its input rose above the others. Putting the button
          on its own row removes the alignment coupling entirely rather than
          compensating for it with a margin that would break again at the next
          breakpoint. */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-[12rem_1fr_12rem]">
        <Field label="Type" error={fieldErrors['type']}>
          <SimpleSelect
            value={type}
            onValueChange={(next) => {
              setType(next as FeeHeadType);
              // The type is a strong hint at the name, and retyping "Tuition
              // Fee" after choosing "Tuition" is the kind of small friction
              // that makes software feel unfinished. Only ever fills a blank.
              if (name === '') {
                setName(`${FEE_HEAD_TYPE_LABELS[next as FeeHeadType]} Fee`);
              }
            }}
            options={TYPE_OPTIONS}
            ariaLabel="Fee type"
          />
        </Field>

        <Field label="Name" error={fieldErrors['name']} required>
          <Input
            value={name}
            placeholder="Tuition Fee"
            onChange={(event) => {
              setName(event.target.value);
            }}
          />
        </Field>

        <Field label="Amount (PKR)" error={fieldErrors['defaultAmountMinor']} required>
          <Input
            value={amount}
            inputMode="decimal"
            placeholder="6000"
            className="text-right font-mono tabular-nums"
            onChange={(event) => {
              setAmount(event.target.value);
            }}
          />
        </Field>
      </div>

      <div className="mt-4 flex justify-end">
        <Button type="submit" isPending={isPending} size="touch">
          {editing === undefined ? (
            <>
              <CreateIcon className={ICON_SIZE.inline} aria-hidden />
              Add fee
            </>
          ) : (
            'Save changes'
          )}
        </Button>
      </div>
    </form>
  );
}
