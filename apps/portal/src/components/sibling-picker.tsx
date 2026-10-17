'use client';

import { ROUTES, type StudentListItem } from '@ilm/contracts';
import { cn } from '@ilm/ui';
import { CloseIcon, SearchIcon } from '@ilm/ui/icons';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';

import { displayPhone } from '@/lib/phone-format';
import { fetchJson } from '@/lib/mutate';

const DEBOUNCE_MS = 300;
const MAX_RESULTS = 10;

type SiblingChoice = Pick<
  StudentListItem,
  'id' | 'firstName' | 'lastName' | 'grNo' | 'className' | 'fatherName' | 'guardianPhone'
>;

/**
 * Find an existing student of this school, to admit a brother or sister.
 *
 * Searches by GR number, the child's name, the father's name or the guardian's
 * phone — the list endpoint already does all four, and only ever inside this
 * school. The query waits for a pause in typing, so a fast typist sends one
 * request, not one per letter, and a slow answer to an old query can never
 * overwrite the answer to a newer one.
 *
 * A plain combobox rather than a popover: focus has to stay in the box while
 * somebody types, and the arrow keys, Enter and Escape work the way they do in
 * every other dropdown.
 */
export function SiblingPicker({
  value,
  onSelect,
  onClear,
  disabled = false,
}: {
  readonly value: SiblingChoice | undefined;
  readonly onSelect: (student: SiblingChoice) => void;
  readonly onClear: () => void;
  readonly disabled?: boolean;
}) {
  const listId = useId();
  const container = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [results, setResults] = useState<SiblingChoice[]>([]);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      setLoading(false);
      setError(undefined);
      return;
    }

    let stale = false;
    setLoading(true);
    const timer = window.setTimeout(() => {
      void (async () => {
        const params = new URLSearchParams({ q: term, limit: String(MAX_RESULTS), offset: '0' });
        const result = await fetchJson<{ data: StudentListItem[] }>(
          `${ROUTES.students.list}?${params.toString()}`,
        );
        if (stale) {
          return;
        }
        setLoading(false);
        if (!result.ok) {
          setError(result.message);
          setResults([]);
          return;
        }
        setError(undefined);
        setResults(result.data.data);
        setActive(0);
      })();
    }, DEBOUNCE_MS);

    return () => {
      stale = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent): void {
      if (container.current !== null && !container.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, []);

  function choose(student: SiblingChoice): void {
    onSelect(student);
    setOpen(false);
    setQuery('');
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActive((current) => Math.min(current + 1, Math.max(results.length - 1, 0)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((current) => Math.max(current - 1, 0));
    } else if (event.key === 'Enter') {
      const picked = results[active];
      if (open && picked !== undefined) {
        event.preventDefault();
        choose(picked);
      }
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  }

  if (value !== undefined) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/30 px-3 py-2.5">
        <div className="min-w-0 text-sm">
          <p className="truncate font-medium text-foreground">
            {value.firstName} {value.lastName}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {value.grNo}
            {value.className === null ? '' : ` · ${value.className}`}
          </p>
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={onClear}
          className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-sm font-medium text-primary hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <CloseIcon className="size-4" aria-hidden="true" />
          Change
        </button>
      </div>
    );
  }

  const term = query.trim();

  return (
    <div ref={container} className="relative">
      <SearchIcon
        className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <input
        type="search"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        disabled={disabled}
        value={query}
        placeholder="Search by GR number, student name, father’s name or phone"
        aria-label="Search for the sibling"
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
        className="h-10 w-full rounded-md border border-input bg-background ps-9 pe-3 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50"
      />

      {open && term.length > 0 ? (
        <div
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1.5 max-h-72 w-full overflow-y-auto overscroll-contain rounded-xl border border-border bg-popover p-1 shadow-overlay"
          onWheel={(event) => {
            event.stopPropagation();
          }}
        >
          {term.length < 2 ? (
            <p className="px-3 py-4 text-center text-sm text-muted-foreground">
              Type at least two characters.
            </p>
          ) : loading ? (
            <p className="px-3 py-4 text-center text-sm text-muted-foreground">Searching…</p>
          ) : error !== undefined ? (
            <p role="alert" className="px-3 py-4 text-center text-sm text-danger">
              {error}
            </p>
          ) : results.length === 0 ? (
            <p className="px-3 py-4 text-center text-sm text-muted-foreground">
              No student matches “{term}”.
            </p>
          ) : (
            results.map((student, index) => (
              <button
                key={student.id}
                type="button"
                role="option"
                aria-selected={index === active}
                onMouseEnter={() => {
                  setActive(index);
                }}
                onClick={() => {
                  choose(student);
                }}
                className={cn(
                  'flex w-full flex-col gap-0.5 rounded-lg px-3 py-2 text-start text-sm',
                  index === active ? 'bg-muted' : undefined,
                )}
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="truncate font-medium text-foreground">
                    {student.firstName} {student.lastName}
                  </span>
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">
                    {student.grNo}
                  </span>
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {student.className ?? 'No class'} · Father: {student.fatherName ?? '—'} ·{' '}
                  {student.guardianPhone === null ? '—' : displayPhone(student.guardianPhone)}
                </span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

export type { SiblingChoice };
