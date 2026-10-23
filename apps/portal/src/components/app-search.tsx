'use client';

import {
  ROUTES,
  type ClassLevel,
  type Permission,
  type StudentLookupResult,
} from '@ilm/contracts';
import {
  CommandEmpty,
  CommandFooter,
  CommandGroup,
  CommandItem,
  CommandKey,
  CommandPalette,
  Money,
} from '@ilm/ui';
import { ChevronRightIcon, ClassIcon, ICON_SIZE, StudentsIcon } from '@ilm/ui/icons';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { Highlight } from '@/components/search-highlight';
import { searchDestinations } from '@/lib/search-destinations';
import { classTopicHref, normalise, searchTopics, tokens } from '@/lib/search-index';
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
 * **Pages**, always: every destination the person's permissions actually
 * reveal, taken from the same tree the sidebar is built from.
 *
 * **Inside pages** (`search-index.ts`): the sections, settings and tasks that
 * live on those pages, found by the words a person would type, so "subject"
 * leads to where subjects are managed and to each class's Subjects section even
 * though no page is called that. Matched words are highlighted and each result
 * says where it lives.
 *
 * **Classes**, once the list has loaded: by name, and as the target of a
 * class-scoped section (which needs a class id to be a real URL).
 *
 * **Students**, once two characters are typed: one debounced request.
 *
 * Everything local is instant and costs nothing until the palette is opened.
 */

export interface AppSearchProps {
  readonly permissions: readonly string[];
  /** Rendered as the trigger; the palette owns the open state. */
  readonly children: (open: () => void) => React.ReactNode;
}

/** How many classes one section expands into. A school can have twenty. */
const CLASS_ROWS = 5;

export function AppSearch({ permissions, children }: AppSearchProps) {
  const router = useRouter();
  const tenantHref = useTenantHref();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [students, setStudents] = useState<readonly StudentLookupResult[]>([]);
  const [classes, setClasses] = useState<readonly ClassLevel[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const canReadStudents = permissions.includes('students.student.read' satisfies Permission);
  const canReadClasses = permissions.includes('academics.structure.read' satisfies Permission);

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
    const words = tokens(term);
    return destinations
      .filter((entry) => words.every((word) => entry.haystack.includes(word)))
      .slice(0, 6);
  }, [destinations, term]);

  const topicHits = useMemo(() => searchTopics(permissions, term, 6), [permissions, term]);

  // The best class-scoped section, expanded to one row per class.
  const classTopic = topicHits.find((hit) => hit.topic.classScoped === true)?.topic;

  const matchedClasses = useMemo(() => {
    if (term === '' || classes.length === 0) {
      return [];
    }
    const words = tokens(term);
    return classes
      .filter((entry) => {
        const name = normalise(entry.name);
        return words.every((word) => name.includes(word));
      })
      .slice(0, CLASS_ROWS);
  }, [classes, term]);

  const topicClasses = useMemo(
    () => (classTopic === undefined ? [] : classes.filter((entry) => entry.isActive).slice(0, CLASS_ROWS)),
    [classTopic, classes],
  );

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

  // The class list, once, the first time it could be needed. A failure leaves
  // class-scoped sections linking to the Classes page instead.
  useEffect(() => {
    if (!open || !canReadClasses || classes.length > 0 || term === '') {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(ROUTES.academics.classes, { credentials: 'include' });
        if (!response.ok || cancelled) {
          return;
        }
        const body = (await response.json()) as { data: ClassLevel[] };
        if (!cancelled) {
          setClasses(body.data);
        }
      } catch {
        // Offline or the API is down: the rest of the palette still works.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, canReadClasses, classes.length, term]);

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

  const hasResults =
    matchedPages.length > 0 ||
    topicHits.length > 0 ||
    matchedClasses.length > 0 ||
    students.length > 0;

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
        placeholder={
          canReadStudents ? 'Search pages, settings and students…' : 'Search pages and settings…'
        }
        footer={
          <CommandFooter>
            <span className="flex items-center gap-1.5">
              <CommandKey>↑</CommandKey>
              <CommandKey>↓</CommandKey>
              to move
            </span>
            <span className="flex items-center gap-1.5">
              <CommandKey>↵</CommandKey>
              Open
            </span>
            <span className="ms-auto flex items-center gap-1.5">
              <CommandKey>esc</CommandKey>
              to close
            </span>
          </CommandFooter>
        }
      >
        {!hasResults && !isSearching ? (
          <CommandEmpty>
            Nothing matches “{query}”.
            <span className="mt-1 block text-xs">
              Try a page name, a setting like “late fee”, a student’s name or their GR number.
            </span>
          </CommandEmpty>
        ) : null}

        {matchedPages.length === 0 ? null : (
          <CommandGroup heading="Pages">
            {matchedPages.map((entry) => (
              <CommandItem
                key={entry.href}
                value={`page-${entry.href}`}
                onSelect={() => {
                  go(entry.href);
                }}
              >
                <ChevronRightIcon
                  className={`${ICON_SIZE.inline} shrink-0 text-muted-foreground`}
                  aria-hidden
                />
                <span className="truncate">
                  <Highlight text={entry.label} term={term} />
                </span>
                {entry.section === undefined ? null : (
                  <span className="ms-auto shrink-0 text-xs text-muted-foreground">
                    {entry.section}
                  </span>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {topicHits.length === 0 ? null : (
          <CommandGroup heading="Found inside pages">
            {topicHits.map(({ topic }) => (
              <CommandItem
                key={topic.id}
                value={`topic-${topic.id}`}
                onSelect={() => {
                  go(topic.href);
                }}
              >
                <ChevronRightIcon
                  className={`${ICON_SIZE.inline} shrink-0 text-muted-foreground`}
                  aria-hidden
                />
                <span className="min-w-0">
                  <span className="block truncate">
                    <Highlight text={topic.title} term={term} />
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    <Highlight text={topic.where} term={term} />
                    {topic.classScoped === true ? ' · choose a class' : ''}
                  </span>
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {classTopic === undefined || topicClasses.length === 0 ? null : (
          <CommandGroup heading={`${classTopic.title} in a class`}>
            {topicClasses.map((entry) => (
              <CommandItem
                key={entry.id}
                value={`class-topic-${entry.id}`}
                onSelect={() => {
                  go(classTopicHref(entry.id, classTopic.anchor));
                }}
              >
                <ClassIcon
                  className={`${ICON_SIZE.inline} shrink-0 text-muted-foreground`}
                  aria-hidden
                />
                <span className="truncate">
                  {classTopic.title} · {entry.name}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {matchedClasses.length === 0 ? null : (
          <CommandGroup heading="Classes">
            {matchedClasses.map((entry) => (
              <CommandItem
                key={entry.id}
                value={`class-${entry.id}`}
                onSelect={() => {
                  go(classTopicHref(entry.id, undefined));
                }}
              >
                <ClassIcon
                  className={`${ICON_SIZE.inline} shrink-0 text-muted-foreground`}
                  aria-hidden
                />
                <span className="truncate">
                  <Highlight text={entry.name} term={term} />
                </span>
                <span className="ms-auto shrink-0 text-xs text-muted-foreground">
                  {entry.studentCount} students
                </span>
              </CommandItem>
            ))}
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
