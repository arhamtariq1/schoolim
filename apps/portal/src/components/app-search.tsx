'use client';

import { ROUTES, type Permission, type StudentLookupResult } from '@ilm/contracts';
import {
  CommandEmpty,
  CommandFooter,
  CommandGroup,
  CommandItem,
  CommandKey,
  CommandPalette,
  Money,
} from '@ilm/ui';
import { ICON_SIZE, StudentsIcon } from '@ilm/ui/icons';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { NAV_ICONS } from '@/components/nav-icons';
import { searchDestinations } from '@/lib/search-destinations';
import { useTenantHref } from '@/lib/use-tenant-href';

/**
 * ⌘K.
 *
 * docs/00 §6 makes this the answer to the old portal's thirty flat menu items,
 * and docs/16 §13 asks for it by name. The sidebar is capped at eight things
 * people do daily; everything else is reachable from here in three keystrokes
 * instead of by remembering which section it was filed under.
 *
 * ## What it searches
 *
 * **Pages**, always — every destination the person's permissions actually
 * reveal, taken from the same tree the sidebar is built from, so a screen
 * nobody can open is never offered. Matching is local and instant.
 *
 * **Students**, once two characters are typed. That is one debounced request,
 * on a keystroke, rather than anything on page load: the palette costs nothing
 * until it is opened and nothing until it is used.
 *
 * Vouchers are not in yet. The placeholder says what it does rather than what
 * it will do — a search box that promises vouchers and finds none is worse than
 * one that never mentioned them.
 *
 * ## Why the pages are flattened
 *
 * The sidebar is a tree because structure helps when you are browsing. Nobody
 * browses a palette — they type three letters and press Enter — so the tree is
 * flattened to its leaves and each one carries its parent's name as a subtitle:
 * "Defaulters · Fees" tells you which one you are about to open when two
 * sections have a page with a similar name.
 */

export interface AppSearchProps {
  readonly permissions: readonly string[];
  /** Rendered as the trigger; the palette owns the open state. */
  readonly children: (open: () => void) => React.ReactNode;
}

export function AppSearch({ permissions, children }: AppSearchProps) {
  const router = useRouter();
  const tenantHref = useTenantHref();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [students, setStudents] = useState<readonly StudentLookupResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const canReadStudents = permissions.includes('students.student.read' satisfies Permission);

  // Flattened once per permission set, not per keystroke.
  const destinations = useMemo(() => searchDestinations(permissions), [permissions]);

  const term = query.trim().toLowerCase();

  const matchedPages = useMemo(() => {
    if (term === '') {
      // An empty palette is a dead end. With nothing typed it offers the
      // sections themselves, which doubles as a list of what this product
      // actually does for somebody who has just been given an account.
      return destinations.slice(0, 7);
    }
    return destinations.filter((entry) => entry.haystack.includes(term)).slice(0, 8);
  }, [destinations, term]);

  // ⌘K from anywhere, and Ctrl+K for the half of the world not on a Mac.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((wasOpen) => !wasOpen);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  // Students, debounced.
  useEffect(() => {
    if (!open || !canReadStudents || term.length < 2) {
      setStudents([]);
      setIsSearching(false);
      return;
    }

    let cancelled = false;
    setIsSearching(true);

    const timer = setTimeout(() => {
      void (async () => {
        const url = `${ROUTES.vouchers.studentLookup}?q=${encodeURIComponent(term)}&limit=5`;
        const response = await fetch(url, { credentials: 'include' });
        if (cancelled) {
          return;
        }
        setIsSearching(false);
        if (!response.ok) {
          // A failed lookup leaves the pages showing rather than taking the
          // palette down: the half that works still works.
          setStudents([]);
          return;
        }
        const body = (await response.json()) as { data: StudentLookupResult[] };
        if (!cancelled) {
          setStudents(body.data);
        }
      })();
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      setIsSearching(false);
    };
  }, [open, term, canReadStudents]);

  function go(href: string): void {
    setOpen(false);
    // Cleared on the way out, so reopening starts fresh instead of on last
    // week's search.
    setQuery('');
    router.push(tenantHref(href));
  }

  return (
    <>
      {children(() => {
        setOpen(true);
      })}

      <CommandPalette
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setQuery('');
          }
        }}
        value={query}
        onValueChange={setQuery}
        isLoading={isSearching}
        label="Search"
        placeholder={canReadStudents ? 'Search pages and students…' : 'Search pages…'}
        footer={
          <CommandFooter>
            <span className="flex items-center gap-1.5">
              <CommandKey>↑</CommandKey>
              <CommandKey>↓</CommandKey>
              to move
            </span>
            <span className="flex items-center gap-1.5">
              <CommandKey>↵</CommandKey>
              to open
            </span>
            <span className="ms-auto flex items-center gap-1.5">
              <CommandKey>esc</CommandKey>
              to close
            </span>
          </CommandFooter>
        }
      >
        {matchedPages.length === 0 && students.length === 0 && !isSearching ? (
          <CommandEmpty>
            Nothing matches “{query}”.
            <span className="mt-1 block text-xs">
              Try a page name, a student’s name, or their GR number.
            </span>
          </CommandEmpty>
        ) : null}

        {matchedPages.length === 0 ? null : (
          <CommandGroup heading={term === '' ? 'Go to' : 'Pages'}>
            {matchedPages.map((entry) => {
              const Icon = NAV_ICONS[entry.icon];
              return (
                <CommandItem
                  key={entry.href}
                  value={entry.href}
                  onSelect={() => {
                    go(entry.href);
                  }}
                >
                  {Icon === undefined ? null : (
                    <Icon
                      className={`${ICON_SIZE.inline} shrink-0 text-muted-foreground`}
                      aria-hidden
                    />
                  )}
                  <span className="truncate">{entry.label}</span>
                  {entry.section === undefined ? null : (
                    <span className="ms-auto shrink-0 text-xs text-muted-foreground">
                      {entry.section}
                    </span>
                  )}
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}

        {students.length === 0 ? null : (
          <CommandGroup heading="Students">
            {students.map((student) => (
              <CommandItem
                key={student.id}
                value={`student-${student.id}`}
                onSelect={() => {
                  go(`/students/${student.id}`);
                }}
              >
                <StudentsIcon
                  className={`${ICON_SIZE.inline} shrink-0 text-muted-foreground`}
                  aria-hidden
                />
                <span className="min-w-0">
                  <span className="block truncate">{student.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {[student.grNo, student.className, student.fatherName]
                      .filter((part) => part !== null && part !== '')
                      .join(' · ')}
                  </span>
                </span>
                {/* What they owe, where a school's eye goes first. Silent when
                    it is nothing, rather than a column of zeroes. */}
                {student.outstandingMinor > 0 ? (
                  <span className="ms-auto shrink-0 font-mono text-xs text-danger tabular-nums">
                    <Money valueMinor={student.outstandingMinor} />
                  </span>
                ) : null}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandPalette>
    </>
  );
}
