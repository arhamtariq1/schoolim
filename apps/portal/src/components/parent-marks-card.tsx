'use client';

import { type StudentMarkResult } from '@ilm/contracts';
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  DateDisplay,
  SimpleSelect,
  StatusBadge,
  TwoLineCell,
  type CardTableColumn,
} from '@ilm/ui';
import { useMemo, useState } from 'react';

import { ListDataTable } from './list-data-table';

import {
  FEE_LIST_TABLE_CELL,
  LIST_TABLE_BADGE_CLASS,
  feeListTableHeader,
} from '@/components/fees/fee-list-shared';

/** A result's bar: read-only, with the number beside it so colour is never the message. */
function PercentBar({ percent }: { percent: number | null }) {
  if (percent === null) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${String(Math.min(100, percent))}%` }}
        />
      </div>
      <span className="text-sm tabular-nums">{percent}%</span>
    </div>
  );
}

/**
 * The parent's view of a child's tests and exams — read-only.
 *
 * Nothing here can be edited and there is no control that implies it. The data
 * is the API's answer for the **linked child only**; this component never asks
 * for anybody else's.
 *
 * Subject tiles come first because a parent's first question is "how is she
 * doing in Maths", not "what happened on the 12th". The table below answers the
 * second, filterable by subject and by kind of test.
 */
export function ParentMarksCard({ marks }: { marks: readonly StudentMarkResult[] | undefined }) {
  const [subject, setSubject] = useState('');
  const [type, setType] = useState('');

  const all = useMemo(() => marks ?? [], [marks]);

  const subjects = useMemo(() => [...new Set(all.map((mark) => mark.subjectName))].sort(), [all]);
  const types = useMemo(() => [...new Set(all.map((mark) => mark.typeName))].sort(), [all]);

  const tiles = useMemo(
    () =>
      subjects.map((name) => {
        const sat = all.filter((mark) => mark.subjectName === name && mark.percent !== null);
        const mean =
          sat.length === 0
            ? null
            : Math.trunc(
                (sat.reduce((sum, mark) => sum + (mark.percent ?? 0), 0) / sat.length) * 10 + 0.5,
              ) / 10;
        return { name, mean, tests: all.filter((mark) => mark.subjectName === name).length };
      }),
    [all, subjects],
  );

  const rows = useMemo(
    () =>
      all.filter(
        (mark) =>
          (subject === '' || mark.subjectName === subject) && (type === '' || mark.typeName === type),
      ),
    [all, subject, type],
  );

  const columns: CardTableColumn<StudentMarkResult>[] = [
    {
      key: 'subject',
      label: 'Subject',
      ...FEE_LIST_TABLE_CELL,
      width: 'w-[26%]',
      headerCell: feeListTableHeader('Subject'),
      render: (row) => (
        <TwoLineCell primary={<span className="font-medium">{row.subjectName}</span>} secondary={row.typeName} />
      ),
    },
    {
      key: 'type',
      label: 'Assessment',
      ...FEE_LIST_TABLE_CELL,
      width: 'w-[18%]',
      hideOnMobile: true,
      headerCell: feeListTableHeader('Assessment'),
      render: (row) => (
        <StatusBadge tone="neutral" size="sm" showIcon={false} className={LIST_TABLE_BADGE_CLASS}>
          {row.typeName}
        </StatusBadge>
      ),
    },
    {
      key: 'date',
      label: 'Date',
      ...FEE_LIST_TABLE_CELL,
      width: 'w-[16%]',
      headerCell: feeListTableHeader('Date'),
      render: (row) => <DateDisplay value={row.heldOn} className="text-sm" />,
    },
    {
      key: 'obtained',
      label: 'Obtained',
      ...FEE_LIST_TABLE_CELL,
      width: 'w-[12%]',
      headerCell: feeListTableHeader('Obtained'),
      render: (row) =>
        row.obtained === null ? (
          <StatusBadge tone="warning" size="sm" showIcon={false} className={LIST_TABLE_BADGE_CLASS}>
            Absent
          </StatusBadge>
        ) : (
          <span className="text-sm font-medium tabular-nums">{row.obtained}</span>
        ),
    },
    {
      key: 'total',
      label: 'Total',
      ...FEE_LIST_TABLE_CELL,
      width: 'w-[10%]',
      headerCell: feeListTableHeader('Total'),
      render: (row) => <span className="text-sm tabular-nums">{row.totalMarks}</span>,
    },
    {
      key: 'result',
      label: 'Result',
      ...FEE_LIST_TABLE_CELL,
      width: 'w-[18%]',
      headerCell: feeListTableHeader('Result'),
      render: (row) => <PercentBar percent={row.percent} />,
    },
  ];

  return (
    <Card className="overflow-hidden">
      <CardHeader className="space-y-1">
        <CardTitle className="text-base">Tests and exams</CardTitle>
        <CardDescription>
          Marks entered by your child’s teachers. This page is view-only.
        </CardDescription>
      </CardHeader>

      {tiles.length === 0 ? null : (
        <div className="grid gap-3 px-4 pb-4 sm:grid-cols-2 sm:px-6 xl:grid-cols-3">
          {tiles.map((tile) => (
            <div key={tile.name} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-foreground">{tile.name}</p>
                <span className="text-xs text-muted-foreground">
                  {tile.tests} test{tile.tests === 1 ? '' : 's'}
                </span>
              </div>
              <p className="mt-2 text-2xl font-medium tracking-tight text-foreground tabular-nums">
                {tile.mean === null ? '—' : `${String(tile.mean)}%`}
              </p>
              <p className="text-xs text-muted-foreground">Average</p>
            </div>
          ))}
        </div>
      )}

      {all.length === 0 ? null : (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-4 py-3 sm:px-6">
          <SimpleSelect
            className="w-full min-w-32 sm:w-44"
            ariaLabel="Filter by subject"
            value={subject}
            emptyOption={{ value: '', label: 'All subjects' }}
            placeholder="All subjects"
            onValueChange={setSubject}
            options={subjects.map((name) => ({ value: name, label: name }))}
          />
          <SimpleSelect
            className="w-full min-w-32 sm:w-44"
            ariaLabel="Filter by assessment type"
            value={type}
            emptyOption={{ value: '', label: 'All assessment types' }}
            placeholder="All assessment types"
            onValueChange={setType}
            options={types.map((name) => ({ value: name, label: name }))}
          />
        </div>
      )}

      <ListDataTable
        title="Results"
        caption="Results"
        rows={rows}
        columns={columns}
        rowKey={(row) => row.assessmentId}
        minWidthClass="min-w-[44rem]"
        isFiltered={subject !== '' || type !== ''}
        onClearFilters={() => {
          setSubject('');
          setType('');
        }}
        empty={{
          title: 'No results yet',
          description:
            'Test and exam marks appear here as soon as your child’s teacher enters them.',
        }}
        renderMobileRow={(row) => (
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <TwoLineCell
              primary={<span className="font-medium">{row.subjectName}</span>}
              secondary={row.typeName}
            />
            <span className="text-sm tabular-nums">
              {row.obtained === null ? 'Absent' : `${String(row.obtained)} / ${String(row.totalMarks)}`}
            </span>
          </div>
        )}
      />
    </Card>
  );
}
