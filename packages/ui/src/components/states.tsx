import type { ReactNode } from 'react';

import { EmptyIcon, ErrorIcon, LockedIcon, RetryIcon, SearchIcon } from '../icons';
import { cn } from '../lib/cn';

import { Button } from './button';

/**
 * The states docs/16 section 7 makes part of "done".
 *
 * These exist as components rather than as a checklist item because the
 * previous portal's single most common gap was a screen that handled the happy
 * path and nothing else. A missing empty state is not a polish issue: it is the
 * screen a school sees on their first day, before they have any data at all.
 */

interface StateShellProps {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

function StateShell({ icon, title, description, action, className }: StateShellProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-xl border border-border',
        'px-6 py-12 text-center',
        className,
      )}
    >
      <div className="text-muted-foreground">{icon}</div>
      <p className="text-base font-medium text-balance text-foreground">{title}</p>
      {description === undefined ? null : (
        <p className="max-w-prose text-sm text-balance text-muted-foreground">{description}</p>
      )}
      {action === undefined ? null : <div className="mt-2">{action}</div>}
    </div>
  );
}

/**
 * First use: nothing exists yet.
 *
 * docs/16 section 7 requires this to **explain what belongs here and offer the
 * action that fills it** — "No fee plans yet. A fee plan defines what each
 * class pays. [Create your first plan]". A bare "No data" teaches nobody
 * anything and is why school staff phone you on day one.
 */
export function EmptyState({
  title,
  description,
  action,
  className,
}: Omit<StateShellProps, 'icon'>) {
  return (
    <StateShell
      icon={<EmptyIcon className="size-10" aria-hidden="true" />}
      title={title}
      {...(description === undefined ? {} : { description })}
      {...(action === undefined ? {} : { action })}
      {...(className === undefined ? {} : { className })}
    />
  );
}

/**
 * A filter matched nothing. Deliberately different copy from first use — the
 * data exists, the filter is wrong — and the action clears the filter rather
 * than offering to create something.
 */
export function NoResultsState({
  onClearFilters,
  className,
}: {
  onClearFilters?: () => void;
  className?: string;
}) {
  return (
    <StateShell
      icon={<SearchIcon className="size-10" aria-hidden="true" />}
      title="Nothing matches these filters"
      description="There is data here, but none of it matches what you are filtering by."
      {...(onClearFilters === undefined
        ? {}
        : {
            action: (
              <Button tone="outline" onClick={onClearFilters}>
                Clear filters
              </Button>
            ),
          })}
      {...(className === undefined ? {} : { className })}
    />
  );
}

/**
 * Something failed.
 *
 * docs/16 section 7: say what failed in plain language and what to do about it.
 * Never a raw code, never a silent failure. The retry is inline so a failed
 * widget does not take the page down.
 */
export function ErrorState({
  title = 'That did not load',
  description = 'Something went wrong on our side. Trying again usually works.',
  onRetry,
  className,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <StateShell
      icon={<ErrorIcon className="size-10 text-danger" aria-hidden="true" />}
      title={title}
      description={description}
      {...(onRetry === undefined
        ? {}
        : {
            action: (
              <Button tone="outline" onClick={onRetry}>
                <RetryIcon className="size-4" aria-hidden="true" />
                Try again
              </Button>
            ),
          })}
      {...(className === undefined ? {} : { className })}
    />
  );
}

/**
 * Permission denied.
 *
 * docs/16 section 7 says the control is **hidden, not disabled-with-a-shrug** —
 * so this is for a whole route a person reached by a direct link, not for a
 * button they should never have seen. It names no record: cross-tenant is a
 * 404, never a 403, because a 403 confirms the record exists.
 */
export function PermissionDeniedState({ className }: { className?: string }) {
  return (
    <StateShell
      icon={<LockedIcon className="size-10" aria-hidden="true" />}
      title="You do not have access to this"
      description="Ask your school administrator if you think you should. Nothing has been logged against you."
      {...(className === undefined ? {} : { className })}
    />
  );
}
