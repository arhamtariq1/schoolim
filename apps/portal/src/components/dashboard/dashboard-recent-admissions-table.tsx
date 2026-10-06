'use client';

import type { StudentListItem } from '@ilm/contracts';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Money,
  cn,
} from '@ilm/ui';
import {
  AccountIcon,
  CalendarIcon,
  ClassIcon,
  EditIcon,
  FeesIcon,
  ForwardIcon,
  SortIcon,
  StudentsIcon,
} from '@ilm/ui/icons';
import { minorUnits } from '@ilm/utils';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Route } from 'next';
import { useMemo, type ReactNode } from 'react';

import { StudentAdmissionAvatar } from '@/components/dashboard/student-admission-avatar';
import { displayPhone } from '@/lib/phone-format';
import { useTenantHref } from '@/lib/use-tenant-href';

type DashboardRecentAdmissionsTableProps = {
  rows: StudentListItem[];
  listHref: string;
};

export function DashboardRecentAdmissionsTable({
  rows,
  listHref,
}: DashboardRecentAdmissionsTableProps) {
  const router = useRouter();
  const tenantHref = useTenantHref();
  const visibleRows = useMemo(() => rows.slice(0, 8), [rows]);

  function openStudent(id: string): void {
    router.push(tenantHref(`/students/${id}` as Route));
  }

  return (
    <Card className="overflow-hidden rounded-lg shadow-raised">
      <CardHeader className="flex flex-row items-center justify-between gap-2 bg-card px-4 pb-2 pt-4 sm:px-6">
        <CardTitle className="text-base font-semibold text-foreground">Recent admissions</CardTitle>
        <Link href={listHref as Route} className="text-xs font-medium text-primary hover:underline">
          View all students
        </Link>
      </CardHeader>
      <CardContent className="p-0">
        {visibleRows.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-muted-foreground">No admissions yet.</p>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[52rem] table-fixed border-collapse text-sm">
                <caption className="sr-only">Recent admissions</caption>
                <colgroup>
                  <col className="w-[26%]" />
                  <col className="w-[18%]" />
                  <col className="w-[14%]" />
                  <col className="w-[14%]" />
                  <col className="w-[14%]" />
                  <col className="w-[14%]" />
                </colgroup>
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <HeaderCell icon={StudentsIcon} label="Student" />
                    <HeaderCell icon={AccountIcon} label="Guardian" />
                    <HeaderCell icon={CalendarIcon} label="Admitted" />
                    <HeaderCell icon={ClassIcon} label="Class" />
                    <HeaderCell icon={FeesIcon} label="Tuition" className="text-end" />
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
                    const studentHref = tenantHref(`/students/${row.id}` as Route);
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
                            primary={row.guardianName ?? '—'}
                            secondary={
                              row.guardianPhone === null || row.guardianPhone === ''
                                ? 'No phone on file'
                                : displayPhone(row.guardianPhone)
                            }
                          />
                        </td>
                        <td className="px-4 py-3 align-middle">
                          <TwoLine
                            primary={
                              row.admittedOn === null ? '—' : formatAdmittedDate(row.admittedOn)
                            }
                            secondary={`GR ${row.grNo}`}
                            secondaryMono
                          />
                        </td>
                        <td className="px-4 py-3 align-middle">
                          <TwoLine primary={classPrimary} secondary={classSecondary} />
                        </td>
                        <td className="px-4 py-3 align-middle text-end">
                          <div className="inline-block min-w-0 text-end">
                            {row.tuitionFeeMinor === null ? (
                              <TwoLine primary="—" secondary="Not set" align="end" />
                            ) : (
                              <TwoLine
                                primary={
                                  <Money
                                    valueMinor={minorUnits(row.tuitionFeeMinor)}
                                    withSymbol
                                    className="font-normal text-foreground"
                                  />
                                }
                                secondary="Monthly tuition"
                                align="end"
                              />
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 align-middle">
                          <div
                            className="flex items-center justify-end gap-1"
                            data-stop-row-click="true"
                          >
                            <Button
                              type="button"
                              tone="ghost"
                              size="icon"
                              className="size-8 text-muted-foreground hover:text-foreground"
                              aria-label={`Edit ${row.firstName} ${row.lastName}`}
                              onClick={() => {
                                openStudent(row.id);
                              }}
                            >
                              <EditIcon className="size-4" aria-hidden="true" />
                            </Button>
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
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 px-4 py-3 text-start hover:bg-muted/30"
                    onClick={() => {
                      openStudent(row.id);
                    }}
                  >
                    <StudentAdmissionAvatar
                      firstName={row.firstName}
                      lastName={row.lastName}
                      photoUrl={row.photoUrl}
                    />
                    <TwoLine
                      primary={`${row.firstName} ${row.lastName}`}
                      secondary={row.className ?? 'Not enrolled'}
                    />
                  </button>
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
  align = 'start',
}: {
  primary: ReactNode;
  secondary: ReactNode;
  secondaryMono?: boolean;
  align?: 'start' | 'end';
}) {
  return (
    <div className={cn('min-w-0', align === 'end' ? 'text-end' : undefined)}>
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

function formatAdmittedDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-PK', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
