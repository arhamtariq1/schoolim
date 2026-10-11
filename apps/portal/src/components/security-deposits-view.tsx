'use client';

import {
  ROUTES,
  type ClassLevel,
  type SecurityDepositList,
  type SecurityDepositRow,
} from '@ilm/contracts';
import {
  Button,
  CardTable,
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
  Pagination,
  SimpleSelect,
  StatusBadge,
  Textarea,
  TwoLineCell,
  useToast,
  type CardTableColumn,
} from '@ilm/ui';
import {
  AccountIcon,
  CalendarIcon,
  DepositIcon,
  FeesIcon,
  ICON_SIZE,
  MoreIcon,
  PhoneIcon,
  RefundIcon,
  SpinnerIcon,
  StudentsIcon,
  ViewIcon,
} from '@ilm/ui/icons';
import { systemClock } from '@ilm/utils';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState, type ReactElement } from 'react';

import {
  FEE_LIST_TABLE_CELL,
  afterMenuAction,
  feeListTableHeader,
  useDebouncedSearchFilter,
} from '@/components/fees/fee-list-shared';
import { ListPageToolbar } from '@/components/list-page-toolbar';
import { WorkspacePageHeader } from '@/components/workspace-page-header';
import { rupeesToMinor } from '@/lib/money';
import { mutate } from '@/lib/mutate';
import { useTenantHref } from '@/lib/use-tenant-href';

/**
 * Fees › Security deposits.
 *
 * ## This money is not the school's
 *
 * A deposit is a family's money that the school is holding and owes back, less
 * whatever the child breaks. It is deliberately kept apart from fee income:
 * counted together, a year's collection is overstated by the whole float, which
 * is the kind of error an accountant finds once and never forgets.
 *
 * Hence two figures at the top rather than one. **Deposited** is what came in.
 * **Left** is what is still owed back — the number that matters, because it is a
 * liability rather than a total.
 *
 * ## Refunding in pieces
 *
 * A child deposits 5,000 and breaks a window worth 2,000, so 3,000 goes back and
 * 2,000 stays. Each repayment is its own record with its own reason, never an
 * edit to a running balance: "who returned what, when, and why" is the only
 * thing anybody asks afterwards.
 */

export interface SecurityDepositsViewProps {
  readonly page: SecurityDepositList;
  readonly classes: readonly ClassLevel[];
  readonly limit: number;
  readonly offset: number;
  readonly filters: {
    q: string;
    classLevelId: string;
    status: string;
    state: string;
  };
  readonly error?: string | undefined;
  readonly canRefund: boolean;
}

export function SecurityDepositsView({
  page,
  classes,
  limit,
  offset,
  filters,
  error,
  canRefund,
}: SecurityDepositsViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tenantHref = useTenantHref();
  const toast = useToast();

  const { searchQuery, onSearchQueryChange } = useDebouncedSearchFilter(filters.q, (value) => {
    pushFilters({ q: value });
  });
  const [refunding, setRefunding] = useState<SecurityDepositRow | undefined>(undefined);
  const [viewing, setViewing] = useState<SecurityDepositRow | undefined>(undefined);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [refundedOn, setRefundedOn] = useState(() =>
    systemClock.now().toISOString().slice(0, 10),
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | undefined>(undefined);

  const amountMinor = rupeesToMinor(amount);
  const available = refunding?.leftMinor ?? 0;

  const isFiltered = Object.values(filters).some((value) => value !== '');

  function pushFilters(next: Record<string, string>): void {
    const query = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value === '') {
        query.delete(key);
      } else {
        query.set(key, value);
      }
    }
    query.set('limit', String(limit));
    query.delete('offset');
    router.push(`${pathname}?${query.toString()}`);
  }

  function clearFilters(): void {
    router.push(tenantHref('/fees/security-deposits'));
  }

  function openRefund(row: SecurityDepositRow): void {
    setRefunding(row);
    setAmount('');
    setReason('');
    setFormError(undefined);
  }

  async function submitRefund(): Promise<void> {
    if (refunding === undefined || amountMinor === undefined) {
      return;
    }
    setIsSubmitting(true);
    setFormError(undefined);

    const result = await mutate<{ id: string }>(
      ROUTES.securityDeposits.refund(refunding.id),
      'POST',
      {
        amountMinor,
        reason: reason.trim(),
        refundedOn,
        // Keyed on the deposit, the amount and the day, so a double-clicked
        // Confirm returns the first refund rather than sending money twice.
        idempotencyKey: `refund-${refunding.id}-${refundedOn}-${String(amountMinor)}`,
      },
    );

    setIsSubmitting(false);

    if (!result.ok) {
      setFormError(result.message);
      return;
    }

    const student = refunding.name;
    setRefunding(undefined);
    toast.success(`Refunded ${formatRupees(amountMinor)} to ${student}.`);
    router.refresh();
  }

  const columns = useMemo((): CardTableColumn<SecurityDepositRow>[] => {
    return [
      {
        key: 'grNo',
        label: 'GR No',
        ...FEE_LIST_TABLE_CELL,
        colStyle: { width: '5.75rem' },
        headerCell: feeListTableHeader('GR No', StudentsIcon),
        render: (row) => (
          <span className="font-mono text-sm leading-none tabular-nums">{row.grNo}</span>
        ),
      },
      {
        key: 'month',
        label: 'Received',
        ...FEE_LIST_TABLE_CELL,
        width: 'w-[12%]',
        headerCell: feeListTableHeader('Received', CalendarIcon),
        render: (row) => (
          <TwoLineCell
            primary={<DateDisplay value={row.receivedOn} />}
            secondary={row.voucherNo ?? ''}
            secondaryMono
          />
        ),
      },
      {
        key: 'name',
        label: 'Student',
        ...FEE_LIST_TABLE_CELL,
        width: 'w-[16%]',
        headerCell: feeListTableHeader('Student', StudentsIcon),
        render: (row) => (
          <TwoLineCell primary={row.name} secondary={row.className ?? '—'} />
        ),
      },
      {
        key: 'fatherName',
        label: 'Father',
        ...FEE_LIST_TABLE_CELL,
        width: 'w-[12%]',
        hideOnMobile: true,
        headerCell: feeListTableHeader('Father', AccountIcon),
        render: (row) => <span className="text-sm">{row.fatherName ?? '—'}</span>,
      },
      {
        key: 'contact',
        label: 'Contact',
        ...FEE_LIST_TABLE_CELL,
        width: 'w-[11%]',
        hideOnMobile: true,
        headerCell: feeListTableHeader('Contact', PhoneIcon),
        render: (row) => <span className="font-mono text-sm">{row.contact ?? '—'}</span>,
      },
      {
        key: 'status',
        label: 'Status',
        ...FEE_LIST_TABLE_CELL,
        width: 'w-[9%]',
        hideOnMobile: true,
        headerCell: feeListTableHeader('Status'),
        render: (row) => (
          <StatusBadge tone={row.status === 'ACTIVE' ? 'success' : 'neutral'}>
            {row.status === 'ACTIVE' ? 'Active' : titleCase(row.status)}
          </StatusBadge>
        ),
      },
      {
        key: 'deposited',
        label: 'Deposited',
        ...FEE_LIST_TABLE_CELL,
        width: 'w-[10%]',
        headerCell: feeListTableHeader('Deposited', DepositIcon),
        render: (row) => (
          <span className="font-mono text-sm tabular-nums">
            <Money valueMinor={row.depositedMinor} />
          </span>
        ),
      },
      {
        key: 'refunded',
        label: 'Refunded',
        ...FEE_LIST_TABLE_CELL,
        width: 'w-[10%]',
        hideOnMobile: true,
        headerCell: feeListTableHeader('Refunded', RefundIcon),
        render: (row) => (
          <span className="font-mono text-sm tabular-nums text-muted-foreground">
            <Money valueMinor={row.refundedMinor} dashOnZero />
          </span>
        ),
      },
      {
        key: 'left',
        label: 'Left',
        ...FEE_LIST_TABLE_CELL,
        width: 'w-[10%]',
        headerCell: feeListTableHeader('Left', FeesIcon),
        render: (row) => (
          <span className="font-mono text-sm font-medium tabular-nums">
            <Money valueMinor={row.leftMinor} />
          </span>
        ),
      },
      {
        key: 'actions',
        label: 'Actions',
        ...FEE_LIST_TABLE_CELL,
        width: 'w-[8%]',
        headerCell: feeListTableHeader('Actions'),
        render: (row) => (
          <DepositRowActions
            row={row}
            canRefund={canRefund}
            onView={() => {
              setViewing(row);
            }}
            onRefund={() => {
              openRefund(row);
            }}
          />
        ),
      },
    ];
  }, [canRefund]);

  return (
    <div className="w-full space-y-6">
      <WorkspacePageHeader
        title="Security deposits"
        description="Money the school is holding for families, and what has been given back."
        actions={
          <>
            <div className="rounded-lg border border-border bg-card px-4 py-2">
              <p className="text-xs text-muted-foreground">Total deposited</p>
              <p className="font-mono text-lg font-semibold tabular-nums">
                <Money valueMinor={page.totalDepositedMinor} />
              </p>
            </div>
            <div className="rounded-lg border border-warning/30 bg-warning/5 px-4 py-2">
              <p className="text-xs text-muted-foreground">Total left to refund</p>
              <p className="font-mono text-lg font-semibold tabular-nums text-warning">
                <Money valueMinor={page.totalLeftMinor} />
              </p>
            </div>
          </>
        }
      />

      <ListPageToolbar
        searchQuery={searchQuery}
        onSearchQueryChange={onSearchQueryChange}
        searchPlaceholder="Name, father, GR number"
        searchAriaLabel="Search security deposits"
        filters={
          <>
            <SimpleSelect
              className="w-full sm:w-36"
              ariaLabel="Filter by class"
              value={filters.classLevelId}
              emptyOption={{ value: '', label: 'Any class' }}
              placeholder="Any class"
              options={classes.map((entry) => ({ value: entry.id, label: entry.name }))}
              onValueChange={(next) => {
                pushFilters({ classLevelId: next });
              }}
            />
            <SimpleSelect
              className="w-full sm:w-36"
              ariaLabel="Filter by status"
              value={filters.status}
              emptyOption={{ value: '', label: 'Any status' }}
              placeholder="Any status"
              options={[
                { value: 'ACTIVE', label: 'Active' },
                { value: 'INACTIVE', label: 'Inactive' },
                { value: 'LEFT', label: 'Left' },
              ]}
              onValueChange={(next) => {
                pushFilters({ status: next });
              }}
            />
            <SimpleSelect
              className="w-full sm:w-40"
              ariaLabel="Filter by deposit state"
              value={filters.state}
              emptyOption={{ value: '', label: 'All deposits' }}
              placeholder="All deposits"
              options={[
                { value: 'held', label: 'Still held' },
                { value: 'settled', label: 'Fully refunded' },
              ]}
              onValueChange={(next) => {
                pushFilters({ state: next });
              }}
            />
          </>
        }
      />

      <CardTable
        title="All deposits"
        caption="Security deposits held"
        rows={page.rows}
        columns={columns}
        rowKey={(row) => row.id}
        minWidthClass="min-w-[56rem]"
        error={error}
        isFiltered={isFiltered}
        onClearFilters={clearFilters}
        empty={{
          title: 'No deposits recorded',
          description:
            'A security deposit is recorded when it is collected — on a fee voucher, or at the counter. None have been taken yet.',
        }}
      />

      {page.total === 0 ? null : (
        <Pagination
          total={page.total}
          limit={limit}
          offset={offset}
          label="deposits"
          onChange={(next) => {
            const query = new URLSearchParams(params.toString());
            if (next === 0) {
              query.delete('offset');
            } else {
              query.set('offset', String(next));
            }
            router.push(tenantHref(`/fees/security-deposits?${query.toString()}`));
          }}
        />
      )}

      {/* Money leaving the building, so the dialog states the three figures
          rather than asking "are you sure?" (docs/16 §11), and the reason is in
          the same box as the amount — a confirmation whose reason field lives
          elsewhere is a reason nobody fills in. */}
      <Dialog
        open={refunding !== undefined}
        onOpenChange={(open) => {
          if (!open) {
            setRefunding(undefined);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Refund security deposit</DialogTitle>
            <DialogDescription>
              {refunding?.name ?? ''}
              {refunding?.className === null || refunding === undefined
                ? ''
                : ` · ${refunding.className ?? ''}`}
              {refunding === undefined ? '' : ` · G.R ${refunding.grNo}`}
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-4">
            {formError === undefined ? null : (
              <p
                role="alert"
                className="rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-danger"
              >
                {formError}
              </p>
            )}

            <dl className="grid grid-cols-3 gap-3 rounded-xl border border-border bg-muted/30 p-3 text-center">
              <div>
                <dt className="text-xs text-muted-foreground">Deposited</dt>
                <dd className="font-mono text-sm tabular-nums">
                  <Money valueMinor={refunding?.depositedMinor ?? 0} />
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Already refunded</dt>
                <dd className="font-mono text-sm tabular-nums">
                  <Money valueMinor={refunding?.refundedMinor ?? 0} dashOnZero />
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Available</dt>
                <dd className="font-mono text-sm font-semibold tabular-nums text-warning">
                  <Money valueMinor={available} />
                </dd>
              </div>
            </dl>

            <Field
              label="Refund amount"
              required
              hint="What is being returned now, not the balance to leave behind"
              error={
                amountMinor !== undefined && amountMinor > available
                  ? `That is more than the ${formatRupees(available)} available.`
                  : undefined
              }
            >
              <Input
                inputMode="decimal"
                value={amount}
                placeholder="3000"
                autoFocus
                onChange={(event) => {
                  setAmount(event.target.value);
                }}
              />
            </Field>

            <Field
              label="Reason"
              required
              hint="Kept with the refund. “Broken window, Class V” is the difference between a refund and an unexplained withdrawal."
            >
              <Textarea
                rows={2}
                value={reason}
                onChange={(event) => {
                  setReason(event.target.value);
                }}
              />
            </Field>

            <Field label="Refunded on" required>
              <DatePicker value={refundedOn} onChange={setRefundedOn} />
            </Field>
          </DialogBody>

          <DialogFooter>
            <Button
              tone="ghost"
              disabled={isSubmitting}
              onClick={() => {
                setRefunding(undefined);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                void submitRefund();
              }}
              disabled={
                isSubmitting ||
                amountMinor === undefined ||
                amountMinor <= 0 ||
                amountMinor > available ||
                reason.trim() === ''
              }
            >
              {isSubmitting ? (
                <SpinnerIcon className={`${ICON_SIZE.inline} animate-spin`} aria-hidden />
              ) : null}
              Refund {amountMinor === undefined ? '' : formatRupees(amountMinor)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={viewing !== undefined}
        onOpenChange={(open) => {
          if (!open) {
            setViewing(undefined);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              <DepositIcon className={`${ICON_SIZE.heading} inline`} aria-hidden /> Refunds from this
              deposit
            </DialogTitle>
            <DialogDescription>
              {viewing?.name ?? ''} · deposited <Money valueMinor={viewing?.depositedMinor ?? 0} />{' '}
              on <DateDisplay value={viewing?.receivedOn ?? ''} />
            </DialogDescription>
          </DialogHeader>

          <DialogBody>
            <ul className="divide-y divide-border rounded-xl border border-border">
              {(viewing?.refunds ?? []).map((refund) => (
                <li key={refund.id} className="px-3 py-2">
                  <div className="flex items-baseline justify-between gap-3">
                    <DateDisplay value={refund.refundedOn} />
                    <span className="font-mono text-sm tabular-nums">
                      <Money valueMinor={refund.amountMinor} />
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-balance text-muted-foreground">
                    {refund.reason}
                  </p>
                </li>
              ))}
            </ul>
          </DialogBody>

          <DialogFooter>
            <p className="me-auto text-xs text-muted-foreground">
              <Money valueMinor={viewing?.leftMinor ?? 0} /> still held
            </p>
            <Button
              tone="ghost"
              onClick={() => {
                setViewing(undefined);
              }}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Rupees for a sentence, from integer paisa.
 *
 * `<Money>` is the component for a figure in a column; this is for the middle of
 * a message, where a React element cannot go. The arithmetic is integer
 * division, never a float.
 */
function formatRupees(minor: number): string {
  const rupees = Math.trunc(minor / 100);
  const paisa = minor % 100;
  const grouped = rupees.toLocaleString('en-PK');
  return paisa === 0 ? `PKR ${grouped}` : `PKR ${grouped}.${String(paisa).padStart(2, '0')}`;
}

function titleCase(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase();
}

function DepositRowActions({
  row,
  canRefund,
  onView,
  onRefund,
}: {
  readonly row: SecurityDepositRow;
  readonly canRefund: boolean;
  readonly onView: () => void;
  readonly onRefund: () => void;
}): ReactElement {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button tone="ghost" size="sm" aria-label={`Actions for ${row.name}`}>
          <MoreIcon className={ICON_SIZE.inline} aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{row.name}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={row.refunds.length === 0}
          onSelect={() => {
            afterMenuAction(onView);
          }}
        >
          <ViewIcon className={ICON_SIZE.inline} aria-hidden />
          View refunds
        </DropdownMenuItem>
        {canRefund && row.leftMinor > 0 ? (
          <DropdownMenuItem
            onSelect={() => {
              afterMenuAction(onRefund);
            }}
          >
            <RefundIcon className={ICON_SIZE.inline} aria-hidden />
            Refund
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
