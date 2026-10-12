'use client';

import {
  createExpenseSchema,
  PAYMENT_METHOD_LABELS,
  ROUTES,
  type AcademicSession,
  type Expense,
  type ExpenseCategory,
  type ExpenseTotals,
  type PaymentMethod,
  paymentMethodSchema,
} from '@ilm/contracts';
import {
  Button,
  CardTable,
  ConfirmDialog,
  DateDisplay,
  DatePicker,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Field,
  Input,
  Money,
  Popover,
  PopoverContent,
  PopoverTrigger,
  SimpleSelect,
  StatusBadge,
  TwoLineCell,
  cn,
  useToast,
  type CardTableColumn,
  type StatusBadgeProps,
} from '@ilm/ui';
import {
  CalendarIcon,
  CreateIcon,
  DateRangeIcon,
  DeleteIcon,
  EditIcon,
  ExpenseIcon,
  FeesIcon,
  FinanceIcon,
  ICON_SIZE,
  MoreIcon,
  SessionIcon,
} from '@ilm/ui/icons';
import { minorUnits } from '@ilm/utils';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState, type FormEvent, type ReactElement } from 'react';

import { DASHBOARD_STAT_NUMBER_CLASS } from '@/components/dashboard/dashboard-stat-card';
import { ExpenseWorkspaceShell } from '@/components/expense-workspace-shell';
import { ListPageToolbar } from '@/components/list-page-toolbar';
import { ListDataTable } from '@/components/list-data-table';
import { ListTablePaginationFooter } from '@/components/list-table-pagination-footer';
import { ListTableScreen } from '@/components/list-table-screen';
import { TableSelectionBar } from '@/components/table-selection-bar';
import { listTableSelectColumn, useRowSelection } from '@/lib/use-row-selection';
import {
  FEE_LIST_TABLE_CELL,
  afterMenuAction,
  feeListSortableTableHeader,
  feeListTableHeader,
  useDebouncedSearchFilter,
} from '@/components/fees/fee-list-shared';
import { formatInclusiveDateRange } from '@/lib/expense-date-range';
import { nextSortParams } from '@/lib/list-page';
import { mutate } from '@/lib/mutate';
import { useTenantHref } from '@/lib/use-tenant-href';

const METHOD_OPTIONS = (
  ['CASH', 'BANK_TRANSFER', 'CHEQUE', 'CARD', 'OTHER'] as const satisfies readonly PaymentMethod[]
).map((value) => ({
  value,
  label: PAYMENT_METHOD_LABELS[value],
}));

const CATEGORY_TONES: readonly StatusBadgeProps['tone'][] = [
  'info',
  'warning',
  'success',
  'neutral',
];

export interface ExpensesViewProps {
  rows: Expense[];
  categories: ExpenseCategory[];
  sessions: AcademicSession[];
  totals: ExpenseTotals;
  monthTotals: ExpenseTotals;
  lastMonthTotals: ExpenseTotals;
  total: number;
  limit: number;
  offset: number;
  filters: {
    q: string;
    categoryId: string;
    sessionId: string;
    method: string;
    from: string;
    to: string;
  };
  sort: 'paidOn' | 'amount' | 'voucherNo' | 'createdAt';
  order: 'asc' | 'desc';
  error?: string | undefined;
  canManage: boolean;
  paymentMethods: readonly PaymentMethod[];
}

export function ExpensesView({
  rows,
  categories,
  sessions,
  totals,
  monthTotals,
  lastMonthTotals,
  total,
  limit,
  offset,
  filters,
  sort,
  order,
  error,
  canManage,
  paymentMethods,
}: ExpensesViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tenantHref = useTenantHref();
  const toast = useToast();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | undefined>(undefined);
  const [deleting, setDeleting] = useState<Expense | undefined>(undefined);
  const {
    selected,
    clearSelection,
    allOnPageSelected,
    someOnPageSelected,
    toggleAllOnPage,
    toggleRowSelected,
  } = useRowSelection(rows, (row) => row.id);

  const [rangeDraft, setRangeDraft] = useState({ from: filters.from, to: filters.to });

  useEffect(() => {
    setRangeDraft({ from: filters.from, to: filters.to });
  }, [filters.from, filters.to]);

  function pushFilters(next: Record<string, string>) {
    const query = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value === '') {
        query.delete(key);
      } else {
        query.set(key, value);
      }
    }
    if (!Object.hasOwn(next, 'offset')) {
      query.delete('offset');
      clearSelection();
    }
    router.push(`${pathname}?${query.toString()}`);
  }

  function clearFilters() {
    router.push(tenantHref('/finance/expenses'));
  }

  const { searchQuery, onSearchQueryChange } = useDebouncedSearchFilter(filters.q, (value) => {
    pushFilters({ q: value });
  });

  function toggleSort(columnKey: string) {
    const next = nextSortParams(sort, order, columnKey);
    pushFilters({ sort: next.sort, order: next.order });
  }

  const sortState = useMemo(() => ({ key: sort, direction: order }), [sort, order]);

  const isFiltered = Object.entries(filters).some(([key, value]) => {
    if (key === 'from' || key === 'to') {
      return false;
    }
    return value !== '';
  });

  function openCreate() {
    setEditing(undefined);
    setDialogOpen(true);
  }

  async function confirmDelete() {
    if (deleting === undefined) {
      return;
    }
    const result = await mutate(ROUTES.expenses.detail(deleting.id), 'DELETE');
    if (!result.ok) {
      toast.error(result.message);
      setDeleting(undefined);
      return;
    }
    toast.success(`${deleting.voucherNo} deleted`);
    setDeleting(undefined);
    router.refresh();
  }

  const columns = useMemo((): CardTableColumn<Expense>[] => {
    return [
      listTableSelectColumn({
        selected,
        allOnPageSelected,
        someOnPageSelected,
        toggleAllOnPage,
        toggleRowSelected,
        getRowId: (row) => row.id,
        rowAriaLabel: (row) => row.voucherNo,
        selectAllAriaLabel: 'Select every expense on this page',
      }),
      {
        key: 'voucherNo',
        label: 'Voucher #',
        ...FEE_LIST_TABLE_CELL,
        colStyle: { width: '7.5rem' },
        sortable: true,
        headerCell: feeListSortableTableHeader(
          'Voucher #',
          'voucherNo',
          sortState,
          toggleSort,
          ExpenseIcon,
        ),
        render: (row) => (
          <span className="font-mono text-sm tabular-nums">{row.voucherNo}</span>
        ),
      },
      {
        key: 'description',
        label: 'Description',
        ...FEE_LIST_TABLE_CELL,
        width: 'w-[18%]',
        headerCell: feeListTableHeader('Description'),
        render: (row) => (
          <TwoLineCell
            primary={row.description}
            secondary={row.payee === null ? '—' : row.payee}
          />
        ),
      },
      {
        key: 'category',
        label: 'Category',
        ...FEE_LIST_TABLE_CELL,
        width: 'w-[11%]',
        headerCell: feeListTableHeader('Category'),
        render: (row) => (
          <StatusBadge tone={categoryTone(row.categoryName, categories)}>
            {row.categoryName}
          </StatusBadge>
        ),
      },
      {
        key: 'paidOn',
        label: 'Date',
        ...FEE_LIST_TABLE_CELL,
        width: 'w-[10%]',
        hideOnMobile: true,
        sortable: true,
        headerCell: feeListSortableTableHeader(
          'Date',
          'paidOn',
          sortState,
          toggleSort,
          CalendarIcon,
        ),
        render: (row) => (
          <span className="text-sm">
            <DateDisplay value={row.paidOn} />
          </span>
        ),
      },
      {
        key: 'method',
        label: 'Payment method',
        ...FEE_LIST_TABLE_CELL,
        width: 'w-[12%]',
        hideOnMobile: true,
        headerCell: feeListTableHeader('Payment method'),
        render: (row) => (
          <StatusBadge tone={methodTone(row.method)}>{PAYMENT_METHOD_LABELS[row.method]}</StatusBadge>
        ),
      },
      {
        key: 'amount',
        label: 'Amount',
        ...FEE_LIST_TABLE_CELL,
        width: 'w-[10%]',
        sortable: true,
        headerCell: feeListSortableTableHeader(
          'Amount',
          'amount',
          sortState,
          toggleSort,
          FeesIcon,
        ),
        render: (row) => (
          <Money valueMinor={minorUnits(row.amountMinor)} className={DASHBOARD_STAT_NUMBER_CLASS} />
        ),
      },
      {
        key: 'status',
        label: 'Status',
        ...FEE_LIST_TABLE_CELL,
        width: 'w-[9%]',
        hideOnMobile: true,
        headerCell: feeListTableHeader('Status'),
        render: () => <StatusBadge tone="success">Paid</StatusBadge>,
      },
      {
        key: 'actions',
        label: 'Actions',
        ...FEE_LIST_TABLE_CELL,
        width: 'w-[8%]',
        headerCell: feeListTableHeader('Actions'),
        render: (row) =>
          !canManage ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <ExpenseRowActions
              row={row}
              onEdit={() => {
                setEditing(row);
                setDialogOpen(true);
              }}
              onDelete={() => {
                setDeleting(row);
              }}
            />
          ),
      },
    ];
  }, [
    allOnPageSelected,
    canManage,
    categories,
    selected,
    someOnPageSelected,
    sortState,
    toggleAllOnPage,
    toggleRowSelected,
  ]);

  return (
    <>
      <ExpenseWorkspaceShell
        totals={totals}
        monthTotals={monthTotals}
        lastMonthTotals={lastMonthTotals}
        canManage={canManage}
        onAddExpense={canManage ? openCreate : undefined}
      >
        <ListTableScreen
          tableTitle="All expenses"
          headerActions={
            canManage ? (
              <Button size="sm" onClick={openCreate}>
                <CreateIcon className={ICON_SIZE.inline} aria-hidden />
                Add expense
              </Button>
            ) : null
          }
          filters={
            <ListPageToolbar
              searchQuery={searchQuery}
              onSearchQueryChange={onSearchQueryChange}
              searchPlaceholder="Search by description, voucher, category…"
              searchAriaLabel="Search expenses"
              searchClassName="md:max-w-xs lg:max-w-sm"
              filters={
                <>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button tone="outline" className="shrink-0 gap-2">
                        <DateRangeIcon className={ICON_SIZE.inline} aria-hidden />
                        {formatInclusiveDateRange(filters.from, filters.to)}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-auto space-y-3 p-4">
                      <Field label="From">
                        <DatePicker
                          value={rangeDraft.from}
                          aria-label="From date"
                          onChange={(next) => {
                            setRangeDraft((prev) => ({ ...prev, from: next }));
                          }}
                        />
                      </Field>
                      <Field label="To">
                        <DatePicker
                          value={rangeDraft.to}
                          aria-label="To date"
                          onChange={(next) => {
                            setRangeDraft((prev) => ({ ...prev, to: next }));
                          }}
                        />
                      </Field>
                      <Button
                        className="w-full"
                        onClick={() => {
                          pushFilters({ from: rangeDraft.from, to: rangeDraft.to });
                        }}
                      >
                        Apply range
                      </Button>
                    </PopoverContent>
                  </Popover>
                  <SimpleSelect
                    className="w-full min-w-32 sm:w-36"
                    ariaLabel="Filter by category"
                    value={filters.categoryId}
                    triggerIcon={ExpenseIcon}
                    emptyOption={{ value: '', label: 'All categories' }}
                    placeholder="All categories"
                    options={categories.map((entry) => ({ value: entry.id, label: entry.name }))}
                    onValueChange={(next) => {
                      pushFilters({ categoryId: next });
                    }}
                  />
                  <SimpleSelect
                    className="w-full min-w-32 sm:w-40"
                    ariaLabel="Filter by payment method"
                    value={filters.method}
                    triggerIcon={FinanceIcon}
                    emptyOption={{ value: '', label: 'All payment methods' }}
                    placeholder="All payment methods"
                    options={paymentMethods.map((method) => ({
                      value: method,
                      label: PAYMENT_METHOD_LABELS[method],
                    }))}
                    onValueChange={(next) => {
                      pushFilters({ method: next });
                    }}
                  />
                  {sessions.length > 1 ? (
                    <SimpleSelect
                      className="w-full min-w-32 sm:w-36"
                      ariaLabel="Filter by session"
                      value={filters.sessionId}
                      triggerIcon={SessionIcon}
                      emptyOption={{ value: '', label: 'All sessions' }}
                      placeholder="All sessions"
                      options={sessions.map((entry) => ({
                        value: entry.id,
                        label: entry.isCurrent ? `${entry.name} (current)` : entry.name,
                      }))}
                      onValueChange={(next) => {
                        pushFilters({ sessionId: next });
                      }}
                    />
                  ) : null}
                </>
              }
            />
          }
          footer={
            <ListTablePaginationFooter
              total={total}
              limit={limit}
              offset={offset}
              label="expenses"
              onPageChange={(next) => {
                pushFilters({ offset: next === 0 ? '' : String(next) });
              }}
              onLimitChange={(next) => {
                pushFilters({ limit: next, offset: '' });
              }}
            />
          }
        >
          <ListDataTable
            title="Expenses"
            rows={rows}
            columns={columns}
            rowKey={(row) => row.id}
            tableLayout="auto"
            minWidthClass="min-w-[64rem]"
            error={error}
            isFiltered={isFiltered}
            onClearFilters={clearFilters}
            sort={{
              key: sort,
              direction: order,
              onToggle: toggleSort,
            }}
            empty={{
              title: 'Nothing recorded yet',
              description:
                'Every payment out — salaries, utilities, repairs. Categories group them so the totals mean something.',
              action: canManage ? (
                <Button onClick={openCreate}>
                  <CreateIcon className={ICON_SIZE.inline} aria-hidden />
                  Add the first expense
                </Button>
              ) : undefined,
            }}
          />
        </ListTableScreen>
      </ExpenseWorkspaceShell>

      <TableSelectionBar count={selected.size} noun="expense" onClear={clearSelection} />

      {dialogOpen ? (
        <ExpenseDialog
          key={editing?.id ?? 'new'}
          editing={editing}
          categories={categories.filter((entry) => entry.isActive)}
          sessions={sessions}
          defaultSessionId={filters.sessionId}
          onClose={() => {
            setDialogOpen(false);
            setEditing(undefined);
          }}
        />
      ) : null}

      <ConfirmDialog
        open={deleting !== undefined}
        onOpenChange={(open) => {
          if (!open) {
            setDeleting(undefined);
          }
        }}
        title={`Delete ${deleting?.voucherNo ?? ''}?`}
        description="This removes the payment from every total that includes it. It cannot be undone."
        confirmLabel="Delete"
        tone="danger"
        onConfirm={confirmDelete}
      />
    </>
  );
}

function categoryTone(
  name: string,
  categories: readonly ExpenseCategory[],
): StatusBadgeProps['tone'] {
  const index = categories.findIndex((entry) => entry.name === name);
  return CATEGORY_TONES[(index < 0 ? 0 : index) % CATEGORY_TONES.length] ?? 'neutral';
}

function methodTone(method: PaymentMethod): StatusBadgeProps['tone'] {
  switch (method) {
    case 'CASH':
      return 'success';
    case 'BANK_TRANSFER':
      return 'info';
    case 'CHEQUE':
      return 'warning';
    case 'CARD':
      return 'neutral';
    default:
      return 'neutral';
  }
}

function ExpenseRowActions({
  row,
  onEdit,
  onDelete,
}: {
  readonly row: Expense;
  readonly onEdit: () => void;
  readonly onDelete: () => void;
}): ReactElement {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button tone="ghost" size="sm" aria-label={`Actions for ${row.voucherNo}`}>
          <MoreIcon className={ICON_SIZE.inline} aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{row.voucherNo}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            afterMenuAction(onEdit);
          }}
        >
          <EditIcon className={ICON_SIZE.inline} aria-hidden />
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem
          destructive
          onSelect={() => {
            afterMenuAction(onDelete);
          }}
        >
          <DeleteIcon className={ICON_SIZE.inline} aria-hidden />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ExpenseDialog({
  editing,
  categories,
  sessions,
  defaultSessionId,
  onClose,
}: {
  editing: Expense | undefined;
  categories: readonly ExpenseCategory[];
  sessions: readonly AcademicSession[];
  defaultSessionId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();

  const [sessionId, setSessionId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [description, setDescription] = useState('');
  const [payee, setPayee] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [paidOn, setPaidOn] = useState('');
  const [reference, setReference] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | undefined>(undefined);
  const [isPending, setIsPending] = useState(false);

  function reset() {
    setSessionId(
      editing?.sessionId ??
        (defaultSessionId !== ''
          ? defaultSessionId
          : (sessions.find((s) => s.isCurrent)?.id ?? '')),
    );
    setCategoryId(editing?.categoryId ?? '');
    setDescription(editing?.description ?? '');
    setPayee(editing?.payee ?? '');
    setAmount(editing === undefined ? '' : (editing.amountMinor / 100).toFixed(2));
    setMethod(editing?.method ?? 'CASH');
    setPaidOn(editing?.paidOn ?? '');
    setReference(editing?.reference ?? '');
    setFieldErrors({});
    setFormError(undefined);
  }

  useEffect(reset, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldErrors({});
    setFormError(undefined);

    const rupees = Number(amount);
    if (!Number.isFinite(rupees) || rupees < 0) {
      setFieldErrors({ amountMinor: 'Enter an amount, for example 8000.' });
      return;
    }

    const payload = {
      sessionId,
      categoryId,
      description,
      amountMinor: Math.trunc(rupees * 100 + 0.5),
      method,
      paidOn,
      ...(payee.trim() === '' ? {} : { payee }),
      ...(reference.trim() === '' ? {} : { reference }),
    };

    const parsed = createExpenseSchema.safeParse(payload);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        next[issue.path.join('.')] = issue.message;
      }
      setFieldErrors(next);
      setFormError('Check the highlighted fields.');
      return;
    }

    setIsPending(true);
    const result =
      editing === undefined
        ? await mutate(ROUTES.expenses.create, 'POST', parsed.data)
        : await mutate(ROUTES.expenses.detail(editing.id), 'PATCH', parsed.data);
    setIsPending(false);

    if (!result.ok) {
      setFormError(result.message);
      setFieldErrors(result.fieldErrors);
      return;
    }

    toast.success(editing === undefined ? 'Expense recorded' : 'Expense updated');
    onClose();
    router.refresh();
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) {
          onClose();
        }
      }}
    >
      <DialogContent>
        <form
          onSubmit={(event) => {
            void submit(event);
          }}
          noValidate
        >
          <DialogHeader>
            <DialogTitle>
              {editing === undefined ? 'Add an expense' : `Edit ${editing.voucherNo}`}
            </DialogTitle>
            <DialogDescription>
              A voucher number is issued automatically and cannot be reused.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-4">
            {formError === undefined ? null : (
              <div
                role="alert"
                className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
              >
                {formError}
              </div>
            )}

            {categories.length === 0 ? (
              <div className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm">
                No categories yet — add one first so the totals group into something meaningful.
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Session" error={fieldErrors['sessionId']} required>
                <SimpleSelect
                  value={sessionId}
                  onValueChange={setSessionId}
                  options={sessions.map((entry) => ({ value: entry.id, label: entry.name }))}
                  ariaLabel="Session"
                />
              </Field>
              <Field label="Category" error={fieldErrors['categoryId']} required>
                <SimpleSelect
                  value={categoryId}
                  onValueChange={setCategoryId}
                  options={categories.map((entry) => ({ value: entry.id, label: entry.name }))}
                  ariaLabel="Category"
                />
              </Field>
            </div>

            <Field label="Description" error={fieldErrors['description']} required>
              <Input
                value={description}
                autoFocus
                placeholder="Electricity bill, August"
                onChange={(event) => {
                  setDescription(event.target.value);
                }}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Amount (PKR)" error={fieldErrors['amountMinor']} required>
                <Input
                  value={amount}
                  inputMode="decimal"
                  placeholder="8000"
                  className="text-right font-mono tabular-nums"
                  onChange={(event) => {
                    setAmount(event.target.value);
                  }}
                />
              </Field>
              <Field label="Date paid" error={fieldErrors['paidOn']} required>
                <DatePicker value={paidOn} onChange={setPaidOn} />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Paid to" error={fieldErrors['payee']}>
                <Input
                  value={payee}
                  placeholder="K-Electric"
                  onChange={(event) => {
                    setPayee(event.target.value);
                  }}
                />
              </Field>
              <Field label="Method" error={fieldErrors['method']}>
                <SimpleSelect
                  value={method}
                  onValueChange={(next) => {
                    const parsed = paymentMethodSchema.safeParse(next);
                    if (parsed.success) {
                      setMethod(parsed.data);
                    }
                  }}
                  options={METHOD_OPTIONS}
                  ariaLabel="Payment method"
                />
              </Field>
            </div>

            <Field
              label="Reference"
              error={fieldErrors['reference']}
              hint="Cheque number, transaction id — whatever you would look it up by."
            >
              <Input
                value={reference}
                onChange={(event) => {
                  setReference(event.target.value);
                }}
              />
            </Field>
          </DialogBody>

          <DialogFooter>
            <Button type="button" tone="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" isPending={isPending} disabled={categories.length === 0}>
              {editing === undefined ? 'Record expense' : 'Save changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
