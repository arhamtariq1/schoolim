'use client';

import {
  createExpenseSchema,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  ROUTES,
  type AcademicSession,
  type Expense,
  type ExpenseCategory,
  type ExpenseTotals,
} from '@ilm/contracts';
import { Button, ConfirmDialog, DataTable, DateDisplay, DatePicker, Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Field, Input, Money, Pagination, SimpleSelect, type Column, useToast } from '@ilm/ui';
import { CreateIcon, DeleteIcon, EditIcon, ICON_SIZE, SearchIcon } from '@ilm/ui/icons';
import { minorUnits } from '@ilm/utils';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition, type FormEvent } from 'react';

import { mutate } from '@/lib/mutate';

/**
 * Expenses — what the school spent, filtered and totalled.
 *
 * ## The total is the point of this screen
 *
 * It is the sum over **everything matching the filters**, computed by the
 * database, not by adding up the page. A figure that changed when you turned
 * the page would be worse than showing none — and this one is quoted to a
 * board.
 */

const METHOD_OPTIONS = PAYMENT_METHODS.map((value) => ({
  value,
  label: PAYMENT_METHOD_LABELS[value],
}));

export interface ExpensesViewProps {
  rows: Expense[];
  categories: ExpenseCategory[];
  sessions: AcademicSession[];
  totals: ExpenseTotals;
  total: number;
  limit: number;
  offset: number;
  filters: { q: string; categoryId: string; sessionId: string; from: string; to: string };
  error?: string | undefined;
  canManage: boolean;
}

export function ExpensesView({
  rows,
  categories,
  sessions,
  totals,
  total,
  limit,
  offset,
  filters,
  error,
  canManage,
}: ExpensesViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const toast = useToast();
  const [, startTransition] = useTransition();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | undefined>(undefined);
  const [deleting, setDeleting] = useState<Expense | undefined>(undefined);

  function apply(next: Record<string, string>) {
    const query = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value === '') {
        query.delete(key);
      } else {
        query.set(key, value);
      }
    }
    // Any filter change returns to page one; paging itself is exempt or it
    // would undo the page it just set.
    if (!Object.hasOwn(next, 'offset')) {
      query.delete('offset');
    }
    startTransition(() => {
      router.push(`${pathname}?${query.toString()}`);
    });
  }

  const isFiltered =
    filters.q !== '' || filters.categoryId !== '' || filters.from !== '' || filters.to !== '';

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

  const columns: Column<Expense>[] = [
    {
      key: 'voucherNo',
      header: 'Voucher',
      render: (row) => <span className="font-mono text-xs select-all">{row.voucherNo}</span>,
    },
    {
      key: 'description',
      header: 'Description',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{row.description}</p>
          {row.payee === null ? null : (
            <p className="truncate text-xs text-muted-foreground">to {row.payee}</p>
          )}
        </div>
      ),
    },
    {
      key: 'paidOn',
      header: 'Date',
      render: (row) => <DateDisplay value={row.paidOn} />,
    },
    {
      key: 'category',
      header: 'Category',
      render: (row) => <span className="text-sm">{row.categoryName}</span>,
    },
    {
      key: 'method',
      header: 'Method',
      hideOnMobile: true,
      render: (row) => (
        <span className="text-sm text-muted-foreground">{PAYMENT_METHOD_LABELS[row.method]}</span>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'end',
      render: (row) => <Money valueMinor={minorUnits(row.amountMinor)} />,
    },
    {
      key: 'actions',
      header: '',
      align: 'end',
      render: (row) =>
        !canManage ? null : (
          <div className="flex items-center justify-end gap-1">
            <Button
              tone="ghost"
              size="sm"
              onClick={() => {
                setEditing(row);
                setDialogOpen(true);
              }}
            >
              <EditIcon className={ICON_SIZE.inline} aria-hidden />
              Edit
            </Button>
            <Button
              tone="ghost"
              size="sm"
              aria-label={`Delete ${row.voucherNo}`}
              onClick={() => {
                setDeleting(row);
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
          <h1 className="text-xl font-semibold text-foreground">Expenses</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isFiltered ? 'Matching these filters' : 'This session'}
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-4">
          <div className="rounded-xl border border-border bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">
              {isFiltered ? 'Total, filtered' : 'Total spent'}
            </p>
            <p className="mt-1">
              <Money valueMinor={minorUnits(totals.totalMinor)} withSymbol className="text-lg" />
            </p>
          </div>

          {canManage ? (
            <Button
              onClick={() => {
                setEditing(undefined);
                setDialogOpen(true);
              }}
            >
              <CreateIcon className={ICON_SIZE.inline} aria-hidden />
              Add expense
            </Button>
          ) : null}
        </div>
      </header>

      <form
        className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-5"
        onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          const value = new FormData(event.currentTarget).get('q');
          apply({ q: typeof value === 'string' ? value : '' });
        }}
      >
        <div className="relative lg:col-span-2">
          <SearchIcon
            className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            name="q"
            defaultValue={filters.q}
            placeholder="Description, payee or voucher"
            aria-label="Search expenses"
            className="ps-9"
          />
        </div>

        <SimpleSelect
          value={filters.categoryId}
          onValueChange={(next) => {
            apply({ categoryId: next });
          }}
          options={categories.map((entry) => ({ value: entry.id, label: entry.name }))}
          ariaLabel="Filter by category"
          emptyOption={{ value: '', label: 'Any category' }}
        />

        <DatePicker
          aria-label="From date"
          value={filters.from}
          onChange={(nextValue) => {
            apply({ from: nextValue });
          }}
        />
        <DatePicker
          aria-label="To date"
          value={filters.to}
          onChange={(nextValue) => {
            apply({ to: nextValue });
          }}
        />

        <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-5">
          <Button type="submit" tone="outline" size="sm">
            Search
          </Button>
          {isFiltered ? (
            <Button
              type="button"
              tone="ghost"
              size="sm"
              onClick={() => {
                apply({ q: '', categoryId: '', from: '', to: '' });
              }}
            >
              Reset
            </Button>
          ) : null}
          {sessions.length > 1 ? (
            <div className="ms-auto w-48">
              <SimpleSelect
                value={filters.sessionId}
                onValueChange={(next) => {
                  apply({ sessionId: next });
                }}
                options={sessions.map((entry) => ({
                  value: entry.id,
                  label: entry.isCurrent ? `${entry.name} (current)` : entry.name,
                }))}
                ariaLabel="Session"
              />
            </div>
          ) : null}
        </div>
      </form>

      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(row) => row.id}
        error={error}
        isFiltered={isFiltered}
        onClearFilters={() => {
          apply({ q: '', categoryId: '', from: '', to: '' });
        }}
        caption="Expenses"
        empty={{
          title: 'Nothing recorded yet',
          description:
            'Every payment out — salaries, utilities, repairs. Categories group them so the totals mean something.',
          action: canManage ? (
            <Button
              onClick={() => {
                setEditing(undefined);
                setDialogOpen(true);
              }}
            >
              <CreateIcon className={ICON_SIZE.inline} aria-hidden />
              Add the first expense
            </Button>
          ) : undefined,
        }}
      />

      {total === 0 ? null : (
        <Pagination
          total={total}
          limit={limit}
          offset={offset}
          label="expenses"
          onChange={(next) => {
            apply({ offset: next === 0 ? '' : String(next) });
          }}
        />
      )}

      <ExpenseDialog
        open={dialogOpen}
        editing={editing}
        categories={categories.filter((entry) => entry.isActive)}
        sessions={sessions}
        defaultSessionId={filters.sessionId}
        onClose={() => {
          setDialogOpen(false);
          setEditing(undefined);
        }}
      />

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
    </div>
  );
}

function ExpenseDialog({
  open,
  editing,
  categories,
  sessions,
  defaultSessionId,
  onClose,
}: {
  open: boolean;
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
  const [method, setMethod] = useState('CASH');
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
    // Defaults to the date the session covers rather than "today", which may
    // fall outside it when somebody is entering last year's books.
    setPaidOn(editing?.paidOn ?? '');
    setReference(editing?.reference ?? '');
    setFieldErrors({});
    setFormError(undefined);
  }

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
      open={open}
      onOpenChange={(next) => {
        if (next) {
          reset();
        } else {
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
                <DatePicker
                  value={paidOn}
                  onChange={setPaidOn}
                />
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
                  onValueChange={setMethod}
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
