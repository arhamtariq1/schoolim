import { FeesIcon, ChevronRightIcon, ICON_SIZE } from '@ilm/ui/icons';
import Link from 'next/link';

import { AppShell } from '@/components/app-shell';
import { getSession } from '@/lib/session';

/**
 * Settings — an index of what is configurable, not a page of its own.
 *
 * It lists only what exists. A settings screen full of greyed-out sections for
 * unbuilt modules teaches people that half the product is broken; a short list
 * that grows is honest and reads as finished at every size.
 */

const SECTIONS = [
  {
    href: '/settings/fees',
    label: 'Fees',
    description: 'What your school charges. Admission forms fill themselves in from this list.',
    icon: FeesIcon,
    permission: 'fees.plan.read',
  },
] as const;

export default async function SettingsPage() {
  const session = await getSession();
  const permissions = session?.permissions ?? [];
  const visible = SECTIONS.filter((entry) => permissions.includes(entry.permission));

  return (
    <AppShell
      user={{ name: session?.name ?? '', roleLabel: session?.roles.join(', ') ?? '' }}
      school={{ name: session?.school.name ?? '' }}
      permissions={permissions}
      unverifiedEmail={session === undefined || session.emailVerified ? undefined : session.email}
    >
      <div className="max-w-2xl space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            How this school is configured. More arrives with each module (docs/14).
          </p>
        </div>

        <ul className="space-y-3">
          {visible.map((entry) => (
            <li key={entry.href}>
              <Link
                href={entry.href}
                className="flex items-center gap-4 rounded-xl border border-border bg-card p-4 hover:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <entry.icon className={`${ICON_SIZE.heading} shrink-0 text-primary`} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-foreground">{entry.label}</span>
                  <span className="mt-0.5 block text-sm text-muted-foreground">
                    {entry.description}
                  </span>
                </span>
                <ChevronRightIcon
                  className={`${ICON_SIZE.inline} shrink-0 text-muted-foreground`}
                  aria-hidden
                />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </AppShell>
  );
}
