import { systemClock } from '@ilm/utils';

type DashboardHeaderBandProps = {
  greeting: string;
  schoolName: string;
};

export function DashboardHeaderBand({ greeting, schoolName }: DashboardHeaderBandProps) {
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

/**
 * "Good morning" in the school's own time, not the server's.
 *
 * This renders on the server, so a bare `new Date().getHours()` is the *host's*
 * hour — a Karachi head teacher opening the portal after dinner would be
 * greeted with "Good afternoon" by a machine in UTC. The school's timezone is
 * on the session for exactly this reason, and `systemClock` is how this
 * codebase reads the time at all (the `new Date()` ban is this bug, written
 * down).
 */
export function timeBasedGreeting(firstName: string, timeZone: string): string {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: 'numeric',
      hour12: false,
    }).format(systemClock.now()),
  );

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
