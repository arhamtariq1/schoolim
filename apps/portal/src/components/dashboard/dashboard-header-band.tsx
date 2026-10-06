import { Card, CardContent } from '@ilm/ui';
import { SchoolIcon } from '@ilm/ui/icons';

type DashboardHeaderBandProps = {
  greeting: string;
  schoolName: string;
  sessionLabel: string | undefined;
  dateLabel: string;
};

export function DashboardHeaderBand({
  greeting,
  schoolName,
  sessionLabel,
  dateLabel,
}: DashboardHeaderBandProps) {
  return (
    <header className="flex flex-wrap items-stretch justify-between gap-4">
      <div className="min-w-0 flex-1 space-y-1 py-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
          {greeting}
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground md:text-base">
          Here&apos;s what&apos;s happening at {schoolName} today.
        </p>
      </div>
    </header>
  );
}

export function timeBasedGreeting(firstName: string): string {
  const hour = new Date().getHours();
  const salutation =
    hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  return firstName === '' ? salutation : `${salutation}, ${firstName}!`;
}

export function formatDashboardDate(iso: string): string {
  const date = new Date(`${iso}T12:00:00Z`);
  return date.toLocaleDateString('en-PK', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
