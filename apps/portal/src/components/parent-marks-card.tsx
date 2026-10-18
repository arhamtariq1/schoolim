'use client';

import { type StudentMarkResult } from '@ilm/contracts';
import {
  Button,
  Card,
  DateDisplay,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  StatusBadge,
  TwoLineCell,
  type CardTableColumn,
} from '@ilm/ui';
import { FileIcon, ICON_SIZE } from '@ilm/ui/icons';
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

/** How many of the latest results the card itself shows; the rest are one click away. */
const LATEST = 5;

const COLUMNS: CardTableColumn<StudentMarkResult>[] = [
  {
    key: 'subject',
    label: 'Subject',
    ...FEE_LIST_TABLE_CELL,
    headerCell: feeListTableHeader('Subject'),
    render: (row) => (
      <TwoLineCell primary={<span className="font-medium">{row.subjectName}</span>} secondary={row.typeName} />
    ),
  },
  {
    key: 'date',
    label: 'Date',
    ...FEE_LIST_TABLE_CELL,
    headerCell: feeListTableHeader('Date'),
    render: (row) => <DateDisplay value={row.heldOn} className="text-sm" />,
  },
  {
    key: 'marks',
    label: 'Marks',
    ...FEE_LIST_TABLE_CELL,
    headerCell: feeListTableHeader('Marks'),
    render: (row) =>
      row.obtained === null ? (
        <StatusBadge tone="warning" size="sm" showIcon={false} className={LIST_TABLE_BADGE_CLASS}>
          Absent
        </StatusBadge>
      ) : (
        <span className="text-sm font-medium tabular-nums">
          {row.obtained} / {row.totalMarks}
        </span>
      ),
  },
  {
    key: 'result',
    label: 'Result',
    ...FEE_LIST_TABLE_CELL,
    headerCell: feeListTableHeader('Result'),
    render: (row) => <PercentBar percent={row.percent} />,
  },
];

function ResultsTable({ rows }: { readonly rows: readonly StudentMarkResult[] }) {
  return (
    <ListDataTable
      title="Results"
      caption="Results"
      rows={rows}
      columns={COLUMNS}
      rowKey={(row) => row.assessmentId}
      minWidthClass="min-w-[28rem]"
      empty={{
        title: 'No results yet',
        description: 'Test and exam marks appear here as soon as your child’s teacher enters them.',
      }}
      renderMobileRow={(row) => (
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <TwoLineCell primary={<span className="font-medium">{row.subjectName}</span>} secondary={row.typeName} />
          <span className="text-sm tabular-nums">
            {row.obtained === null ? 'Absent' : `${String(row.obtained)} / ${String(row.totalMarks)}`}
          </span>
        </div>
      )}
    />
  );
}

/**
 * The parent's view of a child's tests and exams — read-only.
 *
 * Nothing here can be edited and there is no control that implies it. The data
 * is the API's answer for the **linked child only**; this component never asks
 * for anybody else's.
 *
 * The card shows the latest few results, newest first (the API orders them), and
 * "View all" opens the full list in a dialog — so the dashboard stays a glance
 * and the whole history is still one click away.
 */
export function ParentMarksCard({ marks }: { marks: readonly StudentMarkResult[] | undefined }) {
  const [open, setOpen] = useState(false);
  const all = useMemo(() => marks ?? [], [marks]);

  return (
    <Card className="flex flex-col gap-4 overflow-hidden p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <span className="text-primary">
            <FileIcon className={ICON_SIZE.nav} aria-hidden />
          </span>
          Tests and exams
        </h2>
        {all.length === 0 ? null : (
          <Button
            size="sm"
            tone="outline"
            className="border-primary/30 bg-primary/10 text-primary hover:bg-primary/15"
            onClick={() => {
              setOpen(true);
            }}
          >
            View all
          </Button>
        )}
      </div>

      <ResultsTable rows={all.slice(0, LATEST)} />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Tests and exams</DialogTitle>
            <DialogDescription>Every result entered by your child’s teachers, newest first.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <ResultsTable rows={all} />
          </DialogBody>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
