import { Card, CardContent, CardHeader, CardTitle, StatusBadge, cn } from '@ilm/ui';

import type { DashboardUpcomingEvent } from '@/lib/dashboard-data';

type DashboardUpcomingEventsProps = {
  events: DashboardUpcomingEvent[];
};

export function DashboardUpcomingEvents({ events }: DashboardUpcomingEventsProps) {
  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="border-0 pb-0">
        <CardTitle>Upcoming events</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3 pt-4">
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No events scheduled.</p>
        ) : (
          events.map((event) => (
            <article
              key={event.id}
              className="flex gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:bg-muted/40"
            >
              <DateBadge date={event.date} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">{event.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{event.time}</p>
                <StatusBadge
                  tone={event.tone === 'danger' ? 'danger' : event.tone === 'warning' ? 'warning' : 'neutral'}
                  className="mt-2"
                >
                  {event.tag}
                </StatusBadge>
              </div>
            </article>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function DateBadge({ date }: { date: string }) {
  const parsed = new Date(`${date}T12:00:00Z`);
  const month = parsed.toLocaleDateString('en-PK', { month: 'short', timeZone: 'UTC' }).toUpperCase();
  const day = parsed.getUTCDate();

  return (
    <div
      className={cn(
        'flex size-14 shrink-0 flex-col items-center justify-center rounded-xl',
        'border border-danger/30 bg-danger/10 text-danger',
      )}
    >
      <span className="text-[10px] font-bold tracking-wide">{month}</span>
      <span className="text-lg font-semibold leading-none">{day}</span>
    </div>
  );
}
