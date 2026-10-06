import { Card, CardContent, CardHeader, CardTitle, cn } from '@ilm/ui';

import type { DashboardActivityRow } from '@/lib/dashboard-data';

type DashboardActivityTableProps = {
  rows: DashboardActivityRow[];
};

const DOT: Record<DashboardActivityRow['tone'], string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  primary: 'bg-primary',
};

export function DashboardActivityTable({ rows }: DashboardActivityTableProps) {
  return (
    <Card>
      <CardHeader className="border-0 pb-0">
        <CardTitle>Recent activity</CardTitle>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-start text-xs font-medium text-muted-foreground">
                <th className="px-4 py-3 font-medium">Date &amp; time</th>
                <th className="px-4 py-3 font-medium">Activity</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">Details</th>
                <th className="px-4 py-3 font-medium">By</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                    No recent activity.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums text-muted-foreground">
                      {formatActivityAt(row.at)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-2 font-medium text-foreground">
                        <span
                          aria-hidden="true"
                          className={cn('size-2 shrink-0 rounded-full', DOT[row.tone])}
                        />
                        {row.activity}
                      </span>
                    </td>
                    <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">
                      {row.details}
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-2">
                        <span
                          aria-hidden="true"
                          className="flex size-7 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
                        >
                          {row.byName
                            .split(/\s+/)
                            .map((part) => part[0])
                            .join('')
                            .slice(0, 2)
                            .toUpperCase()}
                        </span>
                        <span className="truncate text-foreground">{row.byName}</span>
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function formatActivityAt(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString('en-PK', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
