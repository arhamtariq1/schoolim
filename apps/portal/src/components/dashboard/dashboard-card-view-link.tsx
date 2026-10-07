import { cn } from '@ilm/ui';
import { ChevronRightIcon } from '@ilm/ui/icons';
import Link from 'next/link';

type DashboardCardViewLinkProps = {
  href: string;
  label?: string;
  className?: string;
};

export function DashboardCardViewLink({
  href,
  label = 'View details',
  className,
}: DashboardCardViewLinkProps) {
  return (
    <Link
      href={href}
      className={cn(
        'inline-flex items-center gap-1 text-xs font-semibold tracking-wide text-primary uppercase hover:underline',
        className,
      )}
    >
      {label}
      <ChevronRightIcon className="size-3.5" aria-hidden="true" />
    </Link>
  );
}
