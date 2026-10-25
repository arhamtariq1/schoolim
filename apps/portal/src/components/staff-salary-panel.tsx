'use client';

import {
  ROUTES,
  SALARY_PAYMENT_METHOD_LABELS,
  STAFF_ROLE_LABELS,
  type StaffSalaryDetail,
  type StaffSalaryMonth,
  type StaffSalaryPaymentRecord,
} from '@ilm/contracts';
import {
  DateDisplay,
  DropdownMenuItem,
  Money,
  StatusBadge,
  type CardTableColumn,
} from '@ilm/ui';
import {
  CalendarIcon,
  CreateIcon,
  EmailIcon,
  FeesIcon,
  FinanceIcon,
  PhoneIcon,
  PrintIcon,
} from '@ilm/ui/icons';
import { minorUnits } from '@ilm/utils';
import { useCallback, useEffect, useState, type ComponentType, type ReactNode } from 'react';

import { ListDataTable } from './list-data-table';
import { ListTablePaginationFooter } from './list-table-pagination-footer';
import { ListTableRowActions } from './list-table-row-actions';
import { PaySalaryDialog, type PaySalaryTarget } from './pay-salary-dialog';
import { SalaryDetailSkeleton } from './salary-skeletons';
import { SalaryAvatar, SalaryStatusBadge, salaryMonthLabel } from './salary-ui';

import { DashboardStatCard } from '@/components/dashboard/dashboard-stat-card';
import { afterMenuAction } from '@/components/fees/fee-list-shared';
import { fetchJson } from '@/lib/mutate';
import { useTenantHref } from '@/lib/use-tenant-href';

const DEFAULT_PAGE_SIZE = 20;

function money(minor: number, dashOnZero = false) {
  return <Money valueMinor={minorUnits(minor)} withSymbol dashOnZero={dashOnZero} />;
}

function dateOrDash(value: string | null) {
  return value === null ? (
    <span className="text-sm text-muted-foreground">—</span>
  ) : (
    <DateDisplay value={value} className="text-sm" />
  );
}

/**
 * One person's salary: who they are, this year in four figures, month by month,
 * and every payment.
 *
 * The single place that shows it. The Salary Details page renders it with the
 * person's card on top, and the staff profile's Salary History tab renders the
 * very same panel without — one source of figures, one set of rules.
 */
export function StaffSalaryPanel({
  staffId,
  staffName,
  canPay,
  today,
  showStaffInfo = false,
  initial,
}: {
  staffId: string;
  staffName: string;
  canPay: boolean;
  /** `YYYY-MM-DD` — the latest date a payment can be recorded as made. */
  today: string;
  /** The Salary Details page shows who this is; the profile tab already does. */
  showStaffInfo?: boolean;
  /** What the page already fetched, so the panel does not ask twice. */
  initial?: StaffSalaryDetail | undefined;
}) {
  const tenantHref = useTenantHref();
  const [detail, setDetail] = useState<StaffSalaryDetail | undefined>(initial);
  const [loading, setLoading] = useState(initial === undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [paying, setPaying] = useState<PaySalaryTarget | undefined>(undefined);

  const [monthLimit, setMonthLimit] = useState(DEFAULT_PAGE_SIZE);
  const [monthOffset, setMonthOffset] = useState(0);
  const [paymentLimit, setPaymentLimit] = useState(DEFAULT_PAGE_SIZE);
  const [paymentOffset, setPaymentOffset] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await fetchJson<{ data: StaffSalaryDetail }>(ROUTES.staff.salary(staffId));
    setLoading(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setError(undefined);
    setDetail(result.data.data);
  }, [staffId]);

  useEffect(() => {
    if (initial === undefined) {
      void load();
    }
  }, [load, initial]);

  if (loading && detail === undefined) {
    return <SalaryDetailSkeleton showStaffInfo={showStaffInfo} />;
  }

  if (detail === undefined) {
    return (
      <div
        role="alert"
        className="rounded-md border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger"
      >
        {error ?? 'Could not load the salary.'}{' '}
        <button
          type="button"
          className="font-medium underline"
          onClick={() => {
            void load();
          }}
        >
          Try again
        </button>
      </div>
    );
  }

  const openPay = (row: StaffSalaryMonth): void => {
    setPaying({
      staffId,
      staffName,
      month: row.month,
      netMinor: row.netMinor,
      paidMinor: row.paidMinor,
    });
  };

  const monthColumns: CardTableColumn<StaffSalaryMonth>[] = [
    {
      key: 'month',
      label: 'Month',
      width: 'w-[20%]',
      render: (row) => (
        <div>
          <span className="text-sm font-medium">{salaryMonthLabel(row.month)}</span>
          {row.partialMonth === null ? null : (
            <p className="text-xs text-muted-foreground">
              {row.partialMonth === 'JOINED' ? 'Joined' : 'Left'} part-way through the month.
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'salary',
      label: 'Salary',
      width: 'w-[15%]',
      render: (row) => (
        <div className="text-sm">
          {money(row.netMinor)}
          {row.adjustmentsMinor === 0 ? null : (
            <p className="text-xs text-muted-foreground">
              {row.adjustmentsMinor > 0 ? '+' : '−'}
              {money(Math.abs(row.adjustmentsMinor))} adjusted
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'paid',
      label: 'Paid',
      width: 'w-[14%]',
      render: (row) => <span className="text-sm">{money(row.paidMinor)}</span>,
    },
    {
      key: 'remaining',
      label: 'Remaining',
      width: 'w-[14%]',
      render: (row) => <span className="text-sm">{money(row.remainingMinor)}</span>,
    },
    {
      key: 'status',
      label: 'Status',
      width: 'w-[15%]',
      render: (row) => <SalaryStatusBadge status={row.status} />,
    },
    {
      key: 'lastPaid',
      label: 'Last payment',
      width: 'w-[15%]',
      render: (row) => dateOrDash(row.lastPaidOn),
    },
    {
      key: 'actions',
      label: 'Actions',
      width: 'w-[7%]',
      render: (row) =>
        canPay && row.remainingMinor > 0 ? (
          <ListTableRowActions ariaLabel={`Actions for ${salaryMonthLabel(row.month)}`}>
            <DropdownMenuItem
              onSelect={() => {
                afterMenuAction(() => {
                  openPay(row);
                });
              }}
            >
              <CreateIcon aria-hidden="true" />
              Pay salary
            </DropdownMenuItem>
          </ListTableRowActions>
        ) : null,
    },
  ];

  const paymentColumns: CardTableColumn<StaffSalaryPaymentRecord>[] = [
    {
      key: 'paidOn',
      label: 'Payment date',
      width: 'w-[13%]',
      render: (row) => dateOrDash(row.paidOn),
    },
    {
      key: 'month',
      label: 'Salary month',
      width: 'w-[15%]',
      render: (row) => <span className="text-sm">{salaryMonthLabel(row.month)}</span>,
    },
    {
      key: 'amount',
      label: 'Amount paid',
      width: 'w-[13%]',
      render: (row) => <span className="text-sm">{money(row.amountMinor)}</span>,
    },
    {
      key: 'method',
      label: 'Method',
      width: 'w-[12%]',
      render: (row) => (
        <span className="text-sm">{SALARY_PAYMENT_METHOD_LABELS[row.method]}</span>
      ),
    },
    {
      key: 'reference',
      label: 'Reference',
      width: 'w-[13%]',
      render: (row) => <span className="text-sm">{row.reference ?? '—'}</span>,
    },
    {
      key: 'by',
      label: 'Recorded by',
      width: 'w-[16%]',
      render: (row) => <span className="text-sm">{row.recordedByName ?? '—'}</span>,
    },
    {
      key: 'notes',
      label: 'Notes',
      width: 'w-[11%]',
      render: (row) => (
        <span className="line-clamp-2 text-sm text-muted-foreground">{row.notes ?? '—'}</span>
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      width: 'w-[7%]',
      render: (row) => (
        <ListTableRowActions ariaLabel={`Actions for the ${salaryMonthLabel(row.month)} payment`}>
          <DropdownMenuItem asChild>
            <a href={tenantHref(`/salaries/receipt/${row.id}`)} target="_blank" rel="noreferrer">
              <PrintIcon aria-hidden="true" />
              View receipt
            </a>
          </DropdownMenuItem>
        </ListTableRowActions>
      ),
    },
  ];

  const year = today.slice(0, 4);
  const paymentsThisYear = detail.payments.filter((payment) =>
    payment.paidOn.startsWith(year),
  ).length;
  const last = detail.summary.lastPayment;
  const monthsOwing = detail.months.filter((month) => month.remainingMinor > 0).length;

  return (
    <div className="space-y-5">
      {showStaffInfo ? <StaffInfoCard detail={detail} /> : null}

      <section aria-label="Salary summary" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <DashboardStatCard
          label="Current monthly salary"
          value={money(detail.summary.currentMonthlySalaryMinor, true)}
        />
        <DashboardStatCard
          label="Total paid this year"
          value={money(detail.summary.paidThisYearMinor, true)}
          description={`${String(paymentsThisYear)} payment${paymentsThisYear === 1 ? '' : 's'}`}
        />
        <DashboardStatCard
          label="Outstanding salary"
          value={money(detail.summary.outstandingMinor)}
          description={
            detail.summary.outstandingMinor === 0
              ? 'Fully paid'
              : `${String(monthsOwing)} month${monthsOwing === 1 ? '' : 's'} pending`
          }
        />
        <DashboardStatCard
          label="Last payment"
          value={
            last === null ? (
              '—'
            ) : (
              <DateDisplay value={last.paidOn} />
            )
          }
          description={
            last === null
              ? 'Nothing paid yet'
              : `${SALARY_PAYMENT_METHOD_LABELS[last.method]} · ${salaryMonthLabel(last.month)}`
          }
        />
      </section>

      <SectionCard icon={FeesIcon} title="Monthly Salary History">
        <ListDataTable
          title="Monthly salary history"
          caption="Monthly salary history"
          rows={detail.months.slice(monthOffset, monthOffset + monthLimit)}
          columns={monthColumns}
          rowKey={(row) => row.month}
          minWidthClass="min-w-[48rem]"
          empty={{
            title: 'No salary months yet',
            description: 'Months appear from the month this person joined, once a salary is set.',
          }}
          renderMobileRow={(row) => (
            <div className="flex w-full items-center justify-between gap-3 px-4 py-3">
              <span>
                <span className="block text-sm font-medium">{salaryMonthLabel(row.month)}</span>
                <span className="block text-xs text-muted-foreground">
                  {money(row.paidMinor, true)} of {money(row.netMinor)}
                </span>
              </span>
              <SalaryStatusBadge status={row.status} />
            </div>
          )}
        />
        <ListTablePaginationFooter
          total={detail.months.length}
          limit={monthLimit}
          offset={monthOffset}
          label="records"
          onPageChange={setMonthOffset}
          onLimitChange={(next) => {
            setMonthLimit(Number(next));
            setMonthOffset(0);
          }}
        />
      </SectionCard>

      <section id="payment-history">
        <SectionCard icon={FinanceIcon} title="Payment History">
          <ListDataTable
            title="Payment history"
            caption="Payment history"
            rows={detail.payments.slice(paymentOffset, paymentOffset + paymentLimit)}
            columns={paymentColumns}
            rowKey={(row) => row.id}
            minWidthClass="min-w-[56rem]"
            empty={{ title: 'No payments yet', description: 'Payments appear here once recorded.' }}
            renderMobileRow={(row) => (
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="text-sm font-medium">{money(row.amountMinor)}</p>
                  <p className="text-xs text-muted-foreground">
                    {salaryMonthLabel(row.month)} · {row.paidOn}
                  </p>
                </div>
                <a
                  className="text-sm font-medium text-primary underline-offset-2 hover:underline"
                  href={tenantHref(`/salaries/receipt/${row.id}`)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Receipt
                </a>
              </div>
            )}
          />
          <ListTablePaginationFooter
            total={detail.payments.length}
            limit={paymentLimit}
            offset={paymentOffset}
            label="records"
            onPageChange={setPaymentOffset}
            onLimitChange={(next) => {
              setPaymentLimit(Number(next));
              setPaymentOffset(0);
            }}
          />
        </SectionCard>
      </section>

      {paying === undefined ? null : (
        <PaySalaryDialog
          target={paying}
          today={today}
          onClose={() => {
            setPaying(undefined);
          }}
          onSaved={(next) => {
            setDetail(next);
            setPaying(undefined);
          }}
        />
      )}
    </div>
  );
}


function SectionCard({
  icon: Icon,
  title,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <header className="flex items-center gap-3 px-4 py-3">
        <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
      </header>
      {children}
    </div>
  );
}

function StaffInfoCard({ detail }: { detail: StaffSalaryDetail }) {
  const { staff } = detail;
  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-5">
          <SalaryAvatar name={staff.name} photoUrl={staff.photoUrl} className="size-20 text-2xl" />
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-xl font-semibold text-foreground">{staff.name}</h2>
              <StatusBadge tone={staff.status === 'ACTIVE' ? 'success' : 'neutral'} size="sm">
                {staff.status === 'ACTIVE' ? 'Active' : 'Left'}
              </StatusBadge>
            </div>
            <p className="text-sm text-muted-foreground">
              {staff.employeeNo} · {STAFF_ROLE_LABELS[staff.role]}
            </p>
            <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
              {staff.email === null ? null : (
                <li className="flex items-center gap-1.5">
                  <EmailIcon className="size-4" aria-hidden="true" />
                  {staff.email}
                </li>
              )}
              {staff.phone === null ? null : (
                <li className="flex items-center gap-1.5">
                  <PhoneIcon className="size-4" aria-hidden="true" />
                  {staff.phone}
                </li>
              )}
              {staff.joinedOn === null ? null : (
                <li className="flex items-center gap-1.5">
                  <CalendarIcon className="size-4" aria-hidden="true" />
                  Joined <DateDisplay value={staff.joinedOn} />
                </li>
              )}
            </ul>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-x-8 gap-y-3 border-t border-border pt-4 text-sm sm:grid-cols-4 lg:border-s lg:border-t-0 lg:ps-8 lg:pt-0">
          <div>
            <dt className="text-xs text-muted-foreground">Monthly salary</dt>
            <dd className="mt-0.5 font-semibold">{money(staff.basicSalaryMinor, true)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Role</dt>
            <dd className="mt-0.5 font-semibold">{STAFF_ROLE_LABELS[staff.role]}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Designation</dt>
            <dd className="mt-0.5 font-semibold">{staff.designation ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Joining date</dt>
            <dd className="mt-0.5 font-semibold">{dateOrDash(staff.joinedOn)}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
