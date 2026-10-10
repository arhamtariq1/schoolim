'use client';

import {
  createFeeHeadSchema,
  FEE_FREQUENCY_TABLE_LABELS,
  FEE_HEAD_TYPE_LABELS,
  FEE_HEAD_TYPES,
  FEE_FREQUENCIES,
  ROUTES,
  type FeeHead,
  type FeeHeadType,
  type FeeFrequency,
} from '@ilm/contracts';
import {
  Button,
  CardTable,
  cn,
  ConfirmDialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Field,
  Input,
  Label,
  Money,
  RadioGroup,
  RadioGroupItem,
  SimpleSelect,
  StatusBadge,
  useToast,
  type CardTableColumn,
} from '@ilm/ui';
import {
  ClassIcon,
  CreateIcon,
  DeleteIcon,
  EditIcon,
  FeesIcon,
  FilterIcon,
  ICON_SIZE,
  MoreIcon,
  UndoIcon,
} from '@ilm/ui/icons';
import { minorUnits } from '@ilm/utils';
import { useRouter } from 'next/navigation';
import { useMemo, useState, type FormEvent, type ReactNode } from 'react';

import { ListPageToolbar } from '@/components/list-page-toolbar';
import { mutate } from '@/lib/mutate';

const TYPE_OPTIONS = FEE_HEAD_TYPES.map((type) => ({
  value: type,
  label: FEE_HEAD_TYPE_LABELS[type],
}));

const FREQUENCY_OPTIONS = FEE_FREQUENCIES.map((value) => ({
  value,
  label: FEE_FREQUENCY_TABLE_LABELS[value],
}));

const TYPE_FILTER_OPTIONS = [{ value: '', label: 'All types' }, ...TYPE_OPTIONS];

/** Pill colours per fee type — semantic tokens only. */
const TYPE_BADGE_CLASS: Readonly<Record<FeeHeadType, string>> = {
  TUITION: 'bg-primary/10 text-primary',
  ADMISSION: 'bg-danger/10 text-danger',
  ANNUAL: 'bg-warning/15 text-warning',
  EXAM: 'bg-success/10 text-success',
  LAB: 'bg-muted text-muted-foreground',
  STATIONERY: 'bg-muted text-muted-foreground',
  SECURITY: 'bg-muted text-muted-foreground',
  TRANSPORT: 'bg-muted text-muted-foreground',
  CUSTOM: 'bg-muted text-muted-foreground',
};

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
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  const heads = initialHeads;

  const filteredHeads = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return heads.filter((head) => {
      if (typeFilter !== '' && head.type !== typeFilter) {
        return false;
      }
      if (q === '') {
        return true;
      }
      return (
        head.name.toLowerCase().includes(q) ||
        FEE_HEAD_TYPE_LABELS[head.type].toLowerCase().includes(q)
      );
    });
  }, [heads, searchQuery, typeFilter]);

  const isFiltered = searchQuery.trim() !== '' || typeFilter !== '';

  function clearFilters(): void {
    setSearchQuery('');
    setTypeFilter('');
  }

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

  const columns = useMemo((): CardTableColumn<FeeHead & { index: number }>[] => {
    return [
      {
        key: 'index',
        label: '#',
        width: 'w-[4%]',
        align: 'end',
        render: (row) => (
          <span className="font-mono text-sm text-muted-foreground tabular-nums">{row.index}.</span>
        ),
      },
      {
        key: 'name',
        label: 'Fee Name',
        icon: FeesIcon,
        width: 'w-[22%]',
        render: (row) => (
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FeeTypeIcon type={row.type} />
            </span>
            <span className="truncate font-medium text-foreground">{row.name}</span>
          </div>
        ),
      },
      {
        key: 'type',
        label: 'Type',
        icon: FilterIcon,
        width: 'w-[12%]',
        hideOnMobile: true,
        render: (row) => (
          <span
            className={cn(
              'inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium',
              TYPE_BADGE_CLASS[row.type],
            )}
          >
            {FEE_HEAD_TYPE_LABELS[row.type]}
          </span>
        ),
      },
      {
        key: 'amount',
        label: 'Amount (PKR)',
        icon: FeesIcon,
        align: 'end',
        width: 'w-[12%]',
        render: (row) => (
          <Money valueMinor={minorUnits(row.defaultAmountMinor)} className="font-mono tabular-nums" />
        ),
      },
      {
        key: 'applicable',
        label: 'Applicable To',
        icon: ClassIcon,
        width: 'w-[14%]',
        hideOnMobile: true,
        render: () => <span className="text-sm text-foreground">All Classes</span>,
      },
      {
        key: 'frequency',
        label: 'Frequency',
        width: 'w-[12%]',
        hideOnMobile: true,
        render: (row) => (
          <span className="text-sm text-foreground">
            {FEE_FREQUENCY_TABLE_LABELS[row.frequency]}
          </span>
        ),
      },
      {
        key: 'status',
        label: 'Status',
        width: 'w-[10%]',
        render: (row) => (
          <StatusBadge tone={row.isActive ? 'success' : 'neutral'} size="sm">
            {row.isActive ? 'Active' : 'Inactive'}
          </StatusBadge>
        ),
      },
      {
        key: 'actions',
        label: 'Actions',
        align: 'end',
        width: 'w-[8%]',
        render: (row) =>
          !canConfigure ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <FeeRowActions
              head={row}
              busy={isBusy}
              onEdit={() => {
                setEditing(row);
              }}
              onToggle={() => {
                void toggleActive(row);
              }}
              onDelete={() => {
                setPendingDelete(row);
              }}
            />
          ),
      },
    ];
  }, [canConfigure, isBusy]);

  const tableRows = useMemo(
    () => filteredHeads.map((head, index) => ({ ...head, index: index + 1 })),
    [filteredHeads],
  );

  return (
    <div className="space-y-8">
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

      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Manage, edit or delete fee types. These appear in the admission form and fee collection.
        </p>

        <ListPageToolbar
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          searchPlaceholder="Search fees…"
          searchAriaLabel="Search fees"
          filters={
            <SimpleSelect
              className="w-full sm:w-44"
              value={typeFilter}
              onValueChange={setTypeFilter}
              options={TYPE_FILTER_OPTIONS}
              ariaLabel="Filter by fee type"
            />
          }
        />

        <CardTable
          title="All Fees"
          caption="School fee catalogue"
          rows={tableRows}
          columns={columns}
          rowKey={(row) => row.id}
          error={error}
          isFiltered={isFiltered}
          onClearFilters={clearFilters}
          empty={{
            title: 'No fees set up yet',
            description:
              'Add what you charge above — admission, tuition, annual charges. Every admission form then fills itself in from this list.',
          }}
        />
      </div>

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
              Deleting removes the charge from their fee structures. Use Turn off instead if you only
              want new admissions affected.
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

function FeeRowActions({
  head,
  busy,
  onEdit,
  onToggle,
  onDelete,
}: {
  head: FeeHead;
  busy: boolean;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex justify-end" data-stop-row-click>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            tone="ghost"
            size="icon"
            className="size-8 text-muted-foreground hover:text-foreground"
            disabled={busy}
            aria-label={`Actions for ${head.name}`}
          >
            <MoreIcon className="size-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem
            onSelect={() => {
              onEdit();
            }}
          >
            <EditIcon className="size-4" aria-hidden="true" />
            Edit fee
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              onToggle();
            }}
          >
            {head.isActive ? 'Turn off' : 'Turn on'}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-danger focus:text-danger"
            onSelect={() => {
              onDelete();
            }}
          >
            <DeleteIcon className="size-4" aria-hidden="true" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

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
  const [amount, setAmount] = useState(
    editing === undefined ? '' : (editing.defaultAmountMinor / 100).toFixed(2),
  );
  const [frequency, setFrequency] = useState<FeeFrequency>(editing?.frequency ?? 'ONE_TIME');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | undefined>(undefined);
  const [isPending, setIsPending] = useState(false);

  function clearForm(): void {
    setType('CUSTOM');
    setName('');
    setAmount('');
    setFrequency('ONE_TIME');
    setFieldErrors({});
    setFormError(undefined);
    onCancelEdit();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldErrors({});
    setFormError(undefined);

    const rupees = Number(amount);
    if (!Number.isFinite(rupees) || rupees < 0) {
      setFieldErrors({ defaultAmountMinor: 'Enter an amount, for example 6000.' });
      return;
    }

    const parsed = createFeeHeadSchema.safeParse({
      type,
      name,
      frequency,
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
    if (editing === undefined) {
      setName('');
      setAmount('');
      setType('CUSTOM');
      setFrequency('ONE_TIME');
    }
    onDone();
  }

  return (
    <FeesSettingsSection
      icon={CreateIcon}
      iconClassName="bg-success/10 text-success"
      title={editing === undefined ? 'Add a New Fee' : `Edit ${editing.name}`}
      description="Create a new fee type to be used in admissions and fee collection."
    >
      <form
        onSubmit={(event) => {
          void submit(event);
        }}
        noValidate
        className="space-y-5"
      >
        {formError === undefined ? null : (
          <div
            role="alert"
            className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
          >
            {formError}
          </div>
        )}

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          <Field label="Fee Type" error={fieldErrors['type']} required>
            <SimpleSelect
              value={type}
              onValueChange={(next) => {
                setType(next as FeeHeadType);
                if (name === '') {
                  setName(`${FEE_HEAD_TYPE_LABELS[next as FeeHeadType]} Fee`);
                }
              }}
              options={TYPE_OPTIONS}
              ariaLabel="Fee type"
            />
          </Field>

          <Field label="Fee Name" error={fieldErrors['name']} required>
            <Input
              value={name}
              placeholder="e.g. Tuition Fee"
              onChange={(event) => {
                setName(event.target.value);
              }}
            />
          </Field>

          <Field label="Amount (PKR)" error={fieldErrors['defaultAmountMinor']} required>
            <Input
              value={amount}
              inputMode="decimal"
              placeholder="0.00"
              className="text-end font-mono tabular-nums"
              onChange={(event) => {
                setAmount(event.target.value);
              }}
            />
          </Field>
        </div>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          <Field label="Applicable To" required>
            <RadioGroup value="all" className="flex flex-col gap-3 pt-1 sm:flex-row sm:gap-6">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="all" id="fee-applicable-all" />
                <Label htmlFor="fee-applicable-all" className="font-normal">
                  All Classes
                </Label>
              </div>
              <div className="flex items-center gap-2 opacity-50">
                <RadioGroupItem value="specific" id="fee-applicable-specific" disabled />
                <Label htmlFor="fee-applicable-specific" className="font-normal">
                  Specific Classes
                </Label>
              </div>
            </RadioGroup>
          </Field>

          <Field label="Frequency" error={fieldErrors['frequency']} required>
            <SimpleSelect
              value={frequency}
              onValueChange={(next) => {
                setFrequency(next as FeeFrequency);
              }}
              options={FREQUENCY_OPTIONS}
              ariaLabel="Fee frequency"
            />
          </Field>
        </div>

        <div className="flex flex-wrap justify-end gap-3 border-t border-border pt-5">
          <Button type="button" tone="outline" size="touch" onClick={clearForm}>
            <UndoIcon className={ICON_SIZE.inline} aria-hidden />
            Clear
          </Button>
          <Button type="submit" isPending={isPending} size="touch">
            <CreateIcon className={ICON_SIZE.inline} aria-hidden />
            {editing === undefined ? 'Add Fee' : 'Save changes'}
          </Button>
        </div>
      </form>
    </FeesSettingsSection>
  );
}

function FeesSettingsSection({
  icon: Icon,
  iconClassName,
  title,
  description,
  children,
}: {
  icon: typeof FeesIcon;
  iconClassName: string;
  title: string;
  description?: string | undefined;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-raised">
      <div className="flex gap-4 border-b border-border px-6 py-5">
        <span
          className={cn(
            'flex size-11 shrink-0 items-center justify-center rounded-lg',
            iconClassName,
          )}
        >
          <Icon className={ICON_SIZE.nav} aria-hidden="true" />
        </span>
        <div className="min-w-0 space-y-0.5">
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          {description === undefined ? null : (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>
      </div>
      <div className="px-6 py-6">{children}</div>
    </section>
  );
}

function FeeTypeIcon({ type }: { type: FeeHeadType }) {
  switch (type) {
    case 'TUITION':
      return <ClassIcon className={ICON_SIZE.inline} aria-hidden="true" />;
    case 'ADMISSION':
      return <CreateIcon className={ICON_SIZE.inline} aria-hidden="true" />;
    default:
      return <FeesIcon className={ICON_SIZE.inline} aria-hidden="true" />;
  }
}
