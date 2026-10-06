'use client';

import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DateDisplay,
  Money,
  cn,
} from '@ilm/ui';
import {
  AccountIcon,
  CalendarIcon,
  ClassIcon,
  FeesIcon,
  ForwardIcon,
  SortIcon,
  StudentsIcon,
} from '@ilm/ui/icons';
import { minorUnits } from '@ilm/utils';
import Link from 'next/link';
import type { Route } from 'next';
import { useMemo, type ReactNode } from 'react';

import { StudentAdmissionAvatar } from '@/components/dashboard/student-admission-avatar';
import type { DashboardRecentFeePayment } from '@/lib/dashboard-data';
import { displayPhone } from '@/lib/phone-format';
import { useTenantHref } from '@/lib/use-tenant-href';

type DashboardRecentFeePaymentsTableProps = {
  rows: DashboardRecentFeePayment[];
  vouchersHref: string;
};

export function DashboardRecentFeePaymentsTable({
  rows,
  vouchersHref,
}: DashboardRecentFeePaymentsTableProps) {
  const tenantHref = useTenantHref();
  const visibleRows = useMemo(
    () =>
      [...rows].sort((a, b) => (a.paidOn < b.paidOn ? 1 : a.paidOn > b.paidOn ? -1 : 0)).slice(0, 8),
    [rows],
  );

  return (
    <Card className="overflow-hidden rounded-lg shadow-raised">
      <CardHeader className="flex flex-row items-center justify-between gap-2 bg-card px-4 pb-2 pt-4 sm:px-6">
        <CardTitle className="text-base font-semibold text-foreground">Recent fee payments</CardTitle>
        <Link
          href={vouchersHref as Route}
          className="text-xs font-medium text-primary hover:underline"
        >
          View vouchers
        </Link>
      </CardHeader>
      <CardContent className="p-0">
        {visibleRows.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-muted-foreground">
            No fee payments recorded yet.
          </p>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[52rem] table-fixed border-collapse text-sm">
                <caption className="sr-only">Recent fee payments</caption>
                <colgroup>
                  <col className="w-[22%]" />
                  <col className="w-[18%]" />
                  <col className="w-[14%]" />
                  <col className="w-[16%]" />
                  <col className="w-[14%]" />
                  <col className="w-[16%]" />
                </colgroup>
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <HeaderCell icon={StudentsIcon} label="Student" />
                    <HeaderCell icon={AccountIcon} label="Guardian" />
                    <HeaderCell icon={ClassIcon} label="Class" />
                    <HeaderCell icon={CalendarIcon} label="Last paid" />
                    <HeaderCell icon={FeesIcon} label="Amount paid" className="text-end" />
                    <th
                      scope="col"
                      className="px-4 py-3 text-end align-middle text-xs font-medium text-muted-foreground"
                    >
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => {
                    const studentHref = tenantHref(`/students/${row.studentId}` as Route);
                    const guardianPrimary =
                      row.fatherName?.trim() !== '' && row.fatherName !== null
                        ? row.fatherName
                        : (row.guardianName ?? '—');
                    const classPrimary =
                      row.className === null ? 'Not enrolled' : row.className;
                    const classSecondary =
                      row.sectionName === null || row.sectionName === ''
                        ? row.rollNo === null
                          ? '—'
                          : `Roll ${String(row.rollNo)}`
                        : row.sectionName;

                    return (
                      <tr
                        key={row.id}
                        className="border-b border-border last:border-0 hover:bg-muted/30"
                      >
                        <td className="px-4 py-3 align-middle">
                          <div className="flex min-w-0 items-center gap-3">
                            <StudentAdmissionAvatar
                              firstName={row.firstName}
                              lastName={row.lastName}
                              photoUrl={row.photoUrl}
                            />
                            <TwoLine
                              primary={`${row.firstName} ${row.lastName}`}
                              secondary={row.studentCode}
                              secondaryMono
                            />
                          </div>
                        </td>
                        <td className="px-4 py-3 align-middle">
                          <TwoLine
                            primary={guardianPrimary}
                            secondary={
                              row.guardianPhone === null || row.guardianPhone === ''
                                ? 'No phone on file'
                                : displayPhone(row.guardianPhone)
                            }
                          />
                        </td>
                        <td className="px-4 py-3 align-middle">
                          <TwoLine primary={classPrimary} secondary={classSecondary} />
                        </td>
                        <td className="px-4 py-3 align-middle">
                          <TwoLine
                            primary={<DateDisplay value={row.paidOn} />}
                            secondary={row.paymentLabel}
                          />
                        </td>
                        <td className="px-4 py-3 align-middle text-end">
                          <Money
                            valueMinor={minorUnits(row.amountMinor)}
                            withSymbol
                            className="text-sm font-normal text-foreground"
                          />
                        </td>
                        <td className="px-4 py-3 align-middle">
                          <div className="flex items-center justify-end">
                            <Button
                              type="button"
                              tone="ghost"
                              size="icon"
                              className="size-8 text-muted-foreground hover:text-foreground"
                              asChild
                            >
                              <Link
                                href={studentHref}
                                aria-label={`Open ${row.firstName} ${row.lastName}`}
                              >
                                <ForwardIcon className="size-4" aria-hidden="true" />
                              </Link>
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <ul className="divide-y divide-border md:hidden">
              {visibleRows.map((row) => (
                <li key={row.id}>
                  <Link
                    href={tenantHref(`/students/${row.studentId}` as Route)}
                    className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/30"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <StudentAdmissionAvatar
                        firstName={row.firstName}
                        lastName={row.lastName}
                        photoUrl={row.photoUrl}
                      />
                      <TwoLine
                        primary={`${row.firstName} ${row.lastName}`}
                        secondary={
                          row.className === null
                            ? 'Not enrolled'
                            : `${row.className} · ${row.paymentLabel}`
                        }
                      />
                    </div>
                    <Money
                      valueMinor={minorUnits(row.amountMinor)}
                      withSymbol
                      className="shrink-0 text-sm text-foreground"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function HeaderCell({
  icon: Icon,
  label,
  className,
}: {
  icon: typeof StudentsIcon;
  label: string;
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={cn(
        'px-4 py-3 align-middle text-xs font-medium whitespace-nowrap text-muted-foreground',
        className,
      )}
    >
      <span
        className={cn(
          'inline-flex w-full items-center gap-2',
          className?.includes('text-end') ? 'justify-end' : undefined,
        )}
      >
        <Icon className="size-4 shrink-0 opacity-80" aria-hidden="true" />
        <span>{label}</span>
        <SortIcon className="size-3.5 shrink-0 opacity-60" aria-hidden="true" />
      </span>
    </th>
  );
}

function TwoLine({
  primary,
  secondary,
  secondaryMono = false,
}: {
  primary: ReactNode;
  secondary: ReactNode;
  secondaryMono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="truncate text-sm font-normal text-foreground">{primary}</p>
      <p
        className={cn(
          'truncate text-xs text-muted-foreground',
          secondaryMono ? 'font-mono tabular-nums' : undefined,
        )}
      >
        {secondary}
      </p>
    </div>
  );
}
