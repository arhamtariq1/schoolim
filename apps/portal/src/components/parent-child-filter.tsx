'use client';

import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, cn } from '@ilm/ui';
import { ICON_SIZE, StudentsIcon } from '@ilm/ui/icons';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition, type ReactNode } from 'react';

import { parentChildCookieValue } from '@/lib/parent-child-selection';

const ALL = 'all';

/**
 * Remember the chosen child (undefined: all of them) and redraw the page from it.
 *
 * The choice is a cookie, so it holds on every parent page until changed; a
 * refresh re-renders the current page on the server with the new cookie.
 */
export function useChooseChild(): {
  choose: (childId: string | undefined) => void;
  pending: boolean;
} {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return {
    pending,
    choose: (childId) => {
      document.cookie = parentChildCookieValue(childId);
      startTransition(() => {
        router.refresh();
      });
    },
  };
}

/**
 * "All children" or one of them, in the header of every parent page.
 *
 * Only drawn when there is a choice to make — a parent with one child has
 * nothing to filter. The pages read the same cookie this writes, and each
 * decides what "this child" means for it (their vouchers, their class's
 * timetable, requests about them). The API decides what each id may return;
 * this only asks.
 */
export function ParentChildFilter({
  kids,
  selectedId,
  className,
}: {
  kids: readonly { id: string; name: string }[];
  /** The child the server rendered with, or undefined for all of them. */
  selectedId: string | undefined;
  className?: string;
}) {
  const { choose, pending } = useChooseChild();
  // Shown at once, before the refreshed page arrives; the shell does not re-render
  // on navigation, so this is also what keeps the choice on screen between pages.
  const [value, setValue] = useState(selectedId ?? ALL);
  // A choice made elsewhere (a child's card on the dashboard) arrives with the refresh.
  useEffect(() => {
    setValue(selectedId ?? ALL);
  }, [selectedId]);

  if (kids.length < 2) {
    return null;
  }

  return (
    <Select
      value={kids.some((child) => child.id === value) ? value : ALL}
      onValueChange={(next) => {
        setValue(next);
        choose(next === ALL ? undefined : next);
      }}
    >
      <SelectTrigger
        aria-label="Show children"
        aria-busy={pending}
        className={cn(
          'h-10 w-40 rounded-xl bg-muted/40 transition-opacity sm:w-52',
          pending && 'opacity-60',
          className,
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          <StudentsIcon
            className={cn(ICON_SIZE.inline, 'shrink-0 text-primary')}
            aria-hidden="true"
          />
          <span className="truncate">
            <SelectValue />
          </span>
        </span>
      </SelectTrigger>
      <SelectContent align="end">
        <SelectItem value={ALL}>All children</SelectItem>
        {kids.map((child) => (
          <SelectItem key={child.id} value={child.id}>
            {child.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Narrow every parent page to one child — the header filter's choice, from a button. */
export function ChooseChildButton({ childId, children }: { childId: string; children: ReactNode }) {
  const { choose, pending } = useChooseChild();
  return (
    <Button
      size="sm"
      tone="outline"
      disabled={pending}
      className="w-full border-primary/30 bg-primary/10 text-primary hover:bg-primary/15"
      onClick={() => {
        choose(childId);
      }}
    >
      {children}
    </Button>
  );
}
