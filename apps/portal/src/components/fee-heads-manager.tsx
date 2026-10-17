'use client';

import {
  createFeeHeadSchema,
  FEE_FREQUENCY_TABLE_LABELS,
  FEE_HEAD_TYPE_LABELS,
  FEE_HEAD_TYPES,
  FEE_FREQUENCIES,
  ROUTES,
  type ClassLevel,
  type FeeHead,
  type FeeHeadType,
  type FeeFrequency,
} from '@ilm/contracts';
import {
  Button,
  CardTable,
  Checkbox,
  cn,
  ConfirmDialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Field,
  Input,
  Money,
  Popover,
  PopoverContent,
  PopoverTrigger,
  SimpleSelect,
  StatusBadge,
  type StatusTone,
  useToast,
  type CardTableColumn,
} from '@ilm/ui';
import {
  ChevronDownIcon,
  ClassIcon,
  CreateIcon,
  DeleteIcon,
  EditIcon,
  FeesIcon,
  FilterIcon,
  ICON_SIZE,
  MoreIcon,
  TurnOffIcon,
  TurnOnIcon,
  UndoIcon,
} from '@ilm/ui/icons';
import { minorUnits } from '@ilm/utils';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';

import { ListPageToolbar } from '@/components/list-page-toolbar';
import { TableSelectionBar } from '@/components/table-selection-bar';
import { fetchJson } from '@/lib/mutate';
import { mutate } from '@/lib/mutate';
import { listTableSelectColumn, useRowSelection } from '@/lib/use-row-selection';

const APPLICABLE_OPTIONS = [
  { value: 'all', label: 'All Classes' },
  { value: 'specific', label: 'Specific Classes' },
] as const;

type ApplicableMode = (typeof APPLICABLE_OPTIONS)[number]['value'];

/**
 * The defaults first, then a way to make your own: `CUSTOM` is the type a
 * school uses for any fee that is not one of the standard ones, named however
 * it likes. It is listed last and labelled for what it does.
 */
const TYPE_OPTIONS = FEE_HEAD_TYPES.map((type) => ({
  value: type,
  label: type === 'CUSTOM' ? 'Other — create your own' : FEE_HEAD_TYPE_LABELS[type],
}));

const FREQUENCY_OPTIONS = FEE_FREQUENCIES.map((value) => ({
  value,
  label: FEE_FREQUENCY_TABLE_LABELS[value],
}));

/** Tone per fee type, for the shared `StatusBadge` — no colour classes of our own. */
const TYPE_TONE: Readonly<Record<FeeHeadType, StatusTone>> = {
  TUITION: 'info',
  ADMISSION: 'danger',
  ANNUAL: 'warning',
  EXAM: 'success',
  LAB: 'neutral',
  STATIONERY: 'neutral',
  SECURITY: 'neutral',
  TRANSPORT: 'neutral',
  CUSTOM: 'neutral',
};

export interface FeeHeadsManagerProps {
  initialHeads: FeeHead[];
  classes: readonly Pick<ClassLevel, 'id' | 'name'>[];
  error?: string | undefined;
  canConfigure: boolean;
}

export function FeeHeadsManager({
  initialHeads,
  classes,
  error: initialError,
  canConfigure,
}: FeeHeadsManagerProps) {
  const router = useRouter();
  const toast = useToast();

  const [heads, setHeads] = useState(initialHeads);
  const [loadError, setLoadError] = useState(initialError);
  const [editing, setEditing] = useState<FeeHead | undefined>(undefined);
  const [pendingDelete, setPendingDelete] = useState<FeeHead | undefined>(undefined);
  const [pendingBulkDelete, setPendingBulkDelete] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  useEffect(() => {
    setHeads(initialHeads);
    setLoadError(initialError);
  }, [initialHeads, initialError]);

  // If the server render missed the catalogue (common after a mid-deploy 500),
  // retry from the browser so a hard refresh is not the only recovery path.
  useEffect(() => {
    if (initialError === undefined) {
      return;
    }

    let cancelled = false;
    void (async () => {
      const result = await fetchJson<{ data: FeeHead[] }>(ROUTES.fees.heads);
      if (cancelled) {
        return;
      }
      if (result.ok) {
        setHeads(result.data.data);
        setLoadError(undefined);
        return;
      }
      setLoadError(result.message);
    })();

    return () => {
      cancelled = true;
    };
  }, [initialError]);

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

  const tableRows = useMemo(
    () => filteredHeads.map((head, index) => ({ ...head, index: index + 1 })),
    [filteredHeads],
  );

  const {
    selected,
    clearSelection,
    allOnPageSelected,
    someOnPageSelected,
    toggleAllOnPage,
    toggleRowSelected,
  } = useRowSelection(tableRows, (row) => row.id);

  const isFiltered = searchQuery.trim() !== '' || typeFilter !== '';

  function clearFilters(): void {
    setSearchQuery('');
    setTypeFilter('');
    clearSelection();
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
      removed !== undefined && removed > 0
        ? `${pendingDelete.name} deleted (removed from ${String(removed)} ${removed === 1 ? 'student' : 'students'}).`
        : `${pendingDelete.name} deleted.`,
    );
    clearSelection();
    router.refresh();
  }

  async function confirmBulkDelete() {
    const ids = [...selected];
    if (ids.length === 0) {
      return;
    }

    setIsBusy(true);
    let deleted = 0;
    let failed = 0;
    for (const id of ids) {
      const result = await mutate(ROUTES.fees.head(id), 'DELETE');
      if (result.ok) {
        deleted += 1;
      } else {
        failed += 1;
      }
    }
    setIsBusy(false);
    setPendingBulkDelete(false);
    clearSelection();

    if (deleted > 0) {
      toast.success(
        deleted === 1 ? '1 fee type deleted.' : `${String(deleted)} fee types deleted.`,
      );
    }
    if (failed > 0) {
      toast.error(
        failed === 1
          ? '1 fee type could not be deleted.'
          : `${String(failed)} fee types could not be deleted.`,
      );
    }
    router.refresh();
  }

  const columns = useMemo((): CardTableColumn<FeeHead & { index: number }>[] => {
    const selectColumn = canConfigure
      ? [
          listTableSelectColumn({
            selected,
            allOnPageSelected,
            someOnPageSelected,
            toggleAllOnPage,
            toggleRowSelected,
            getRowId: (row) => row.id,
            rowAriaLabel: (row) => row.name,
            selectAllAriaLabel: 'Select every fee on this page',
          }),
        ]
      : [];

    return [
      ...selectColumn,
      {
        key: 'index',
        label: '#',
        width: 'w-[4%]',
        align: 'end',
        render: (row) => (
          <span className="text-sm text-muted-foreground tabular-nums">{row.index}.</span>
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
          <StatusBadge tone={TYPE_TONE[row.type]} size="sm" showIcon={false}>
            {FEE_HEAD_TYPE_LABELS[row.type]}
          </StatusBadge>
        ),
      },
      {
        key: 'amount',
        label: 'Amount (PKR)',
        icon: FeesIcon,
        align: 'end',
        width: 'w-[12%]',
        render: (row) => <Money valueMinor={minorUnits(row.defaultAmountMinor)} />,
      },
      {
        key: 'applicable',
        label: 'Applicable To',
        icon: ClassIcon,
        width: 'w-[14%]',
        hideOnMobile: true,
        render: (row) => (
          <span className="text-sm text-foreground">
            {(row.classLevels?.length ?? 0) === 0
              ? 'All Classes'
              : row.classLevels.map((entry) => entry.name).join(', ')}
          </span>
        ),
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
  }, [
    canConfigure,
    isBusy,
    selected,
    allOnPageSelected,
    someOnPageSelected,
    toggleAllOnPage,
    toggleRowSelected,
  ]);

  return (
    <div className="space-y-8">
      {canConfigure ? (
        <FeeHeadForm
          key={editing?.id ?? 'create'}
          editing={editing}
          classes={classes}
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
              options={TYPE_OPTIONS}
              emptyOption={{ value: '', label: 'All types' }}
              placeholder="All types"
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
          error={loadError}
          onRetry={() => {
            router.refresh();
          }}
          isFiltered={isFiltered}
          onClearFilters={clearFilters}
          empty={{
            title: 'No fees set up yet',
            description:
              'Add what you charge above — admission, tuition, annual charges. Every admission form then fills itself in from this list.',
          }}
        />
      </div>

      {canConfigure ? (
        <TableSelectionBar
          count={selected.size}
          noun="fee type"
          onClear={clearSelection}
          actions={
            <Button
              tone="danger"
              size="sm"
              disabled={isBusy || selected.size === 0}
              onClick={() => {
                setPendingBulkDelete(true);
              }}
            >
              <DeleteIcon className={ICON_SIZE.inline} aria-hidden />
              Delete selected
            </Button>
          }
        />
      ) : null}

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

      <ConfirmDialog
        open={pendingBulkDelete}
        onOpenChange={(open) => {
          if (!open) {
            setPendingBulkDelete(false);
          }
        }}
        title={
          selected.size === 1
            ? 'Delete 1 fee type?'
            : `Delete ${String(selected.size)} fee types?`
        }
        description="Deleting removes each charge from student fee structures where it is used. Turn off instead if you only want new admissions affected."
        confirmLabel="Delete"
        tone="danger"
        onConfirm={() => {
          void confirmBulkDelete();
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
            {head.isActive ? (
              <TurnOffIcon className="size-4" aria-hidden="true" />
            ) : (
              <TurnOnIcon className="size-4" aria-hidden="true" />
            )}
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
  classes,
  onDone,
  onCancelEdit,
}: {
  editing: FeeHead | undefined;
  classes: readonly Pick<ClassLevel, 'id' | 'name'>[];
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
  const [applicable, setApplicable] = useState<ApplicableMode>(
    editing !== undefined && (editing.classLevels?.length ?? 0) > 0 ? 'specific' : 'all',
  );
  const [classLevelIds, setClassLevelIds] = useState<string[]>(
    () => editing?.classLevels?.map((entry) => entry.id) ?? [],
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | undefined>(undefined);
  const [isPending, setIsPending] = useState(false);

  function clearForm(): void {
    setType('CUSTOM');
    setName('');
    setAmount('');
    setFrequency('ONE_TIME');
    setApplicable('all');
    setClassLevelIds([]);
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

    if (applicable === 'specific' && classLevelIds.length === 0) {
      setFieldErrors({ classLevelIds: 'Select at least one class.' });
      return;
    }

    const parsed = createFeeHeadSchema.safeParse({
      type,
      name,
      frequency,
      defaultAmountMinor: Math.trunc(rupees * 100 + (rupees < 0 ? -0.5 : 0.5)),
      classLevelIds: applicable === 'all' ? [] : classLevelIds,
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
      // Duplicate name means the catalogue already has this row — refresh so
      // the table catches up instead of staying on a stale empty/error state.
      if (result.status === 409) {
        onDone();
      }
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
      setApplicable('all');
      setClassLevelIds([]);
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
                const nextType = next as FeeHeadType;
                // Replace the name only while it is still the one suggested for
                // the previous type; something the person typed is never touched.
                const suggested = (value: FeeHeadType): string =>
                  value === 'CUSTOM' ? '' : `${FEE_HEAD_TYPE_LABELS[value]} Fee`;
                if (name === '' || name === suggested(type)) {
                  setName(suggested(nextType));
                }
                setType(nextType);
              }}
              options={TYPE_OPTIONS}
              ariaLabel="Fee type"
            />
          </Field>

          <Field
            label={type === 'CUSTOM' ? 'New fee type name' : 'Fee Name'}
            error={fieldErrors['name']}
            hint={
              type === 'CUSTOM'
                ? 'Name your own fee type, for example Uniform Fee or Trip Fee.'
                : undefined
            }
            required
          >
            <Input
              value={name}
              placeholder={type === 'CUSTOM' ? 'e.g. Uniform Fee' : 'e.g. Tuition Fee'}
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
              className="text-end tabular-nums"
              onChange={(event) => {
                setAmount(event.target.value);
              }}
            />
          </Field>
        </div>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          <Field label="Applicable To" required>
            <SimpleSelect
              value={applicable}
              onValueChange={(next) => {
                const mode = next as ApplicableMode;
                setApplicable(mode);
                if (mode === 'all') {
                  setClassLevelIds([]);
                  setFieldErrors((current) => {
                    const { classLevelIds: _removed, ...rest } = current;
                    return rest;
                  });
                }
              }}
              options={[...APPLICABLE_OPTIONS]}
              ariaLabel="Applicable to"
            />
          </Field>

          {applicable === 'specific' ? (
            <Field label="Classes" error={fieldErrors['classLevelIds']} required>
              <ClassMultiSelect
                classes={classes}
                value={classLevelIds}
                onChange={(next) => {
                  setClassLevelIds(next);
                  setFieldErrors((current) => {
                    const { classLevelIds: _removed, ...rest } = current;
                    return rest;
                  });
                }}
              />
            </Field>
          ) : null}

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
    <section className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-raised">
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

function ClassMultiSelect({
  classes,
  value,
  onChange,
}: {
  classes: readonly Pick<ClassLevel, 'id' | 'name'>[];
  value: readonly string[];
  onChange: (next: string[]) => void;
}) {
  const selected = new Set(value);
  const label =
    value.length === 0
      ? 'Select classes'
      : value.length === 1
        ? (classes.find((entry) => entry.id === value[0])?.name ?? '1 class')
        : `${String(value.length)} classes selected`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex h-10 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-sm',
            'hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
            value.length === 0 ? 'text-muted-foreground' : 'text-foreground',
          )}
          aria-label="Select classes"
        >
          <span className="truncate">{label}</span>
          <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-2" align="start">
        {classes.length === 0 ? (
          <p className="px-2 py-3 text-sm text-muted-foreground">
            No classes yet. Add classes under Academics first.
          </p>
        ) : (
          <ul
            className="max-h-56 space-y-0.5 overflow-y-auto overscroll-contain"
            onWheel={(event) => {
              event.stopPropagation();
            }}
            onTouchMove={(event) => {
              event.stopPropagation();
            }}
          >
            {classes.map((entry) => {
              const checked = selected.has(entry.id);
              return (
                <li key={entry.id}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(next) => {
                        if (next === true) {
                          onChange([...value, entry.id]);
                          return;
                        }
                        onChange(value.filter((id) => id !== entry.id));
                      }}
                    />
                    <span className="min-w-0 truncate">{entry.name}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
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
