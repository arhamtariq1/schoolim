import { SALARY_STATUS_LABELS, type SalaryStatus } from '@ilm/contracts';
import { cn, StatusBadge, type StatusTone } from '@ilm/ui';
import type {  } from 'react';

/** `2026-10` → `October 2026`. */
export function salaryMonthLabel(month: string): string {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

const STATUS_TONES: Readonly<Record<SalaryStatus, StatusTone>> = {
  PAID: 'success',
  PARTIAL: 'warning',
  UNPAID: 'danger',
};

/** Paid, partially paid, unpaid — the one badge every salary screen uses. */
export function SalaryStatusBadge({ status }: { readonly status: SalaryStatus }) {
  return (
    <StatusBadge tone={STATUS_TONES[status]} size="sm">
      {SALARY_STATUS_LABELS[status]}
    </StatusBadge>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter((part) => part !== '')
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

/** A round photo, or the person's initials when there is none. */
export function SalaryAvatar({
  name,
  photoUrl,
  className,
}: {
  readonly name: string;
  readonly photoUrl: string | null;
  readonly className?: string;
}) {
  return photoUrl === null || photoUrl === '' ? (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary',
        className,
      )}
    >
      {initials(name)}
    </span>
  ) : (
    // eslint-disable-next-line @next/next/no-img-element -- a stored staff photo URL, same as the profile page.
    <img
      src={photoUrl}
      alt=""
      className={cn('size-9 shrink-0 rounded-full border border-border object-cover', className)}
    />
  );
}

