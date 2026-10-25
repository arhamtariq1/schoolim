import { cardSurfaceClassName, cn } from '@ilm/ui';
import { ChevronRightIcon, DepositIcon, ICON_SIZE, TrendUpIcon } from '@ilm/ui/icons';
import Link from 'next/link';

import { WorkspacePageHeader } from '@/components/workspace-page-header';
import { getSession } from '@/lib/session';

const OTHER_SETTINGS = [
  {
    href: '/fees/increments',
    label: 'Fee increment',
    description: 'Raise what families pay by a percentage or a fixed amount, for a class or the school.',
    icon: TrendUpIcon,
    permission: 'fees.plan.read',
  },
  {
    href: '/fees/security-deposits',
    label: 'Security deposits',
    description: 'Track deposits collected with admission fees and what is refundable.',
    icon: DepositIcon,
    permission: 'fees.deposit.read',
  },
] as const;

/** Settings › Fee Settings › Other. Only what this person is allowed to open. */
export default async function OtherFeeSettingsPage() {
  const session = await getSession();
  const permissions = session?.permissions ?? [];
  const items = OTHER_SETTINGS.filter((item) => permissions.includes(item.permission));

  return (
    <>
      <WorkspacePageHeader
        title="Other Fee Settings"
        description="More fee-related tools and settings for your school."
      />

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          There is nothing else you can configure here.
        </p>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    'group flex h-full items-start gap-4 p-5 transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                    cardSurfaceClassName,
                  )}
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className={ICON_SIZE.nav} aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-semibold text-foreground">
                      {item.label}
                    </span>
                    <span className="mt-1 block text-sm text-muted-foreground">
                      {item.description}
                    </span>
                  </span>
                  <ChevronRightIcon
                    className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
