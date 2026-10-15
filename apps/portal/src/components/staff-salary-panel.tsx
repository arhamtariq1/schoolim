'use client';

import {
  ROUTES,
  type StaffSalaryHistory,
  type StaffSalaryRow,
} from '@ilm/contracts';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DatePicker,
  DateDisplay,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldIconWrap,
  Input,
  Money,
  StatusBadge,
  useToast,
  type CardTableColumn,
} from '@ilm/ui';
import { FeesIcon } from '@ilm/ui/icons';
import { minorUnits } from '@ilm/utils';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';

import { ListDataTable } from './list-data-table';

import {
  FEE_LIST_TABLE_CELL,
  LIST_TABLE_BADGE_CLASS,
  feeListTableHeader,
} from '@/components/fees/fee-list-shared';
import { fetchJson, mutate } from '@/lib/mutate';

function monthLabel(month: string): string {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * A member of staff's salary, month by month.
 *
 * **Paid** and **Due** are labelled, never inferred from the amount: a due
 * month shows the basic salary because that is what is owed, and a paid month
 * shows what was actually paid and the day. A payment is recorded once and
 * cannot be edited here — there is no edit control because the database does
 * not allow one (append-only).
 */
export function StaffSalaryPanel({
  staffId,
  staffName,
  canPay,
  today,
}: {
  staffId: string;
  staffName: string;
  canPay: boolean;
  /** `YYYY-MM-DD` — the latest date a payment can be recorded as made. */
  today: string;
}) {
  const router = useRouter();
  const [history, setHistory] = useState<StaffSalaryHistory | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>(undefined);
  const [paying, setPaying] = useState<StaffSalaryRow | undefined>(undefined);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await fetchJson<{ data: StaffSalaryHistory }>(ROUTES.staff.salary(staffId));
    setLoading(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setError(undefined);
    setHistory(result.data.data);
  }, [staffId]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = history?.rows ?? [];
  const paidRows = rows.filter((row) => row.status === 'PAID');
  const dueRows = rows.filter((row) => row.status === 'DUE');
  const totalPaid = paidRows.reduce((sum, row) => sum + row.amountMinor, 0);

  const columns: CardTableColumn<StaffSalaryRow>[] = [
    {
      key: 'month',
      label: 'Month',
      ...FEE_LIST_TABLE_CELL,
      width: 'w-[26%]',
      headerCell: feeListTableHeader('Month'),
      render: (row) => <span className="text-sm font-medium">{monthLabel(row.month)}</span>,
    },
    {
      key: 'amount',
      label: 'Salary',
      ...FEE_LIST_TABLE_CELL,
      width: 'w-[20%]',
      headerCell: feeListTableHeader('Salary', FeesIcon),
      render: (row) => <Money valueMinor={minorUnits(row.amountMinor)} withSymbol />,
    },
    {
      key: 'status',
      label: 'Status',
      ...FEE_LIST_TABLE_CELL,
      width: 'w-[16%]',
      headerCell: feeListTableHeader('Status'),
      render: (row) => (
        <StatusBadge
          tone={row.status === 'PAID' ? 'success' : 'warning'}
          size="sm"
          className={LIST_TABLE_BADGE_CLASS}
        >
          {row.status === 'PAID' ? 'Paid' : 'Due'}
        </StatusBadge>
      ),
    },
    {
      key: 'paidOn',
      label: 'Payment date',
      ...FEE_LIST_TABLE_CELL,
      width: 'w-[20%]',
      headerCell: feeListTableHeader('Payment date'),
      render: (row) =>
        row.paidOn === null ? (
          <span className="text-sm text-muted-foreground">—</span>
        ) : (
          <DateDisplay value={row.paidOn} className="text-sm" />
        ),
    },
    {
      key: 'actions',
      label: 'Actions',
      ...FEE_LIST_TABLE_CELL,
      width: 'w-[18%]',
      headerCell: feeListTableHeader('Actions'),
      render: (row) =>
        canPay && row.status === 'DUE' ? (
          <Button
            type="button"
            size="sm"
            tone="outline"
            onClick={() => {
              setPaying(row);
            }}
          >
            Record payment
          </Button>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        ),
    },
  ];

  return (
    <div className="space-y-6">
      <dl className="grid gap-3 sm:grid-cols-3">
        <Tile label="Basic salary" value={<Money valueMinor={minorUnits(history?.basicSalaryMinor ?? 0)} withSymbol dashOnZero />} />
        <Tile label="Total paid" value={<Money valueMinor={minorUnits(totalPaid)} withSymbol dashOnZero />} note={`${String(paidRows.length)} month${paidRows.length === 1 ? '' : 's'}`} />
        <Tile
          label="Months due"
          value={<span className="tabular-nums">{dueRows.length}</span>}
          note="At the basic salary"
        />
      </dl>

      <Card className="overflow-hidden">
        <CardHeader className="space-y-1 border-b border-border">
          <CardTitle className="text-lg">Salary history</CardTitle>
          <CardDescription>
            Newest first. A recorded payment is permanent — it cannot be edited or deleted.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <ListDataTable
            title="Salary history"
            caption="Salary history"
            rows={rows}
            columns={columns}
            rowKey={(row) => row.month}
            minWidthClass="min-w-[40rem]"
            isLoading={loading}
            error={error}
            onRetry={() => {
              void load();
            }}
            empty={{
              title: 'No salary months yet',
              description: 'Months appear from the day this person joined.',
            }}
            renderMobileRow={(row) => (
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="text-sm font-medium">{monthLabel(row.month)}</p>
                  <p className="text-xs text-muted-foreground">
                    {row.paidOn === null ? 'Not paid yet' : `Paid ${row.paidOn}`}
                  </p>
                </div>
                <StatusBadge tone={row.status === 'PAID' ? 'success' : 'warning'} size="sm">
                  {row.status === 'PAID' ? 'Paid' : 'Due'}
                </StatusBadge>
              </div>
            )}
          />
        </CardContent>
      </Card>

      {paying === undefined ? null : (
        <RecordPaymentDialog
          staffId={staffId}
          staffName={staffName}
          row={paying}
          today={today}
          onClose={() => {
            setPaying(undefined);
          }}
          onSaved={(next) => {
            setHistory(next);
            setPaying(undefined);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function Tile({ label, value, note }: { label: string; value: React.ReactNode; note?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-2xl font-medium tracking-tight text-foreground">{value}</dd>
      {note === undefined ? null : <p className="text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}

function RecordPaymentDialog({
  staffId,
  staffName,
  row,
  today,
  onClose,
  onSaved,
}: {
  staffId: string;
  staffName: string;
  row: StaffSalaryRow;
  today: string;
  onClose: () => void;
  onSaved: (history: StaffSalaryHistory) => void;
}) {
  const toast = useToast();
  const [paidOn, setPaidOn] = useState(today);
  const [amount, setAmount] = useState((row.amountMinor / 100).toFixed(2));
  const [error, setError] = useState<string | undefined>(undefined);
  const [isPending, setIsPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const rupees = Number(amount);
    if (!Number.isFinite(rupees) || rupees <= 0) {
      setError('Enter the amount paid, e.g. 40000.');
      return;
    }
    if (paidOn === '') {
      setError('Choose the date it was paid.');
      return;
    }

    setIsPending(true);
    const result = await mutate<{ data: StaffSalaryHistory }>(
      ROUTES.staff.salaryPayments(staffId),
      'POST',
      { month: row.month, paidOn, amountMinor: Math.trunc(rupees * 100 + 0.5) },
    );
    setIsPending(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }
    toast.success(`${monthLabel(row.month)} salary recorded for ${staffName}`);
    onSaved(result.data.data);
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
      <DialogContent className="max-w-md">
        <form
          noValidate
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          <DialogHeader>
            <DialogTitle>Record salary payment</DialogTitle>
            <DialogDescription>
              {staffName} · {monthLabel(row.month)}. Once saved, a payment cannot be changed.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            {error === undefined ? null : (
              <div
                role="alert"
                className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
              >
                {error}
              </div>
            )}
            <Field label="Paid on" required>
              <DatePicker value={paidOn} onChange={setPaidOn} max={today} aria-label="Payment date" />
            </Field>
            <Field label="Amount paid (PKR)" required>
              <FieldIconWrap icon={FeesIcon}>
                <Input
                  value={amount}
                  inputMode="decimal"
                  onChange={(event) => {
                    setAmount(event.target.value);
                  }}
                />
              </FieldIconWrap>
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" tone="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" isPending={isPending}>
              Save payment
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
