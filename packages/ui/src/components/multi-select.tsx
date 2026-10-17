'use client';

import { Command as CommandPrimitive } from 'cmdk';
import { useMemo, useState } from 'react';

import { ChevronDownIcon, CloseIcon } from '../icons';
import { cn } from '../lib/cn';

import { Checkbox } from './checkbox';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

export interface MultiSelectOption {
  readonly value: string;
  readonly label: string;
}

export interface MultiSelectProps {
  readonly value: readonly string[];
  readonly onValueChange: (value: string[]) => void;
  readonly options: readonly MultiSelectOption[];
  readonly placeholder?: string;
  readonly searchPlaceholder?: string;
  readonly emptyMessage?: string;
  readonly disabled?: boolean;
  readonly id?: string;
  readonly 'aria-invalid'?: boolean;
  readonly 'aria-describedby'?: string;
  readonly className?: string;
}

/**
 * Several choices from a list — a combobox that stays open while you toggle.
 *
 * What is chosen is shown as chips under the trigger, each removable on its
 * own, because "3 selected" alone makes somebody reopen the list to find out
 * which three. The popover does not close on pick: assigning a teacher five
 * classes should be five taps, not five round trips through the menu.
 */
export function MultiSelect({
  value,
  onValueChange,
  options,
  placeholder = 'Select…',
  searchPlaceholder = 'Search…',
  emptyMessage = 'No matches.',
  disabled = false,
  id,
  className,
  ...aria
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const chosen = useMemo(() => new Set(value), [value]);
  const selected = options.filter((option) => chosen.has(option.value));

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle === ''
      ? options
      : options.filter((option) => option.label.toLowerCase().includes(needle));
  }, [options, query]);

  function toggle(next: string): void {
    onValueChange(
      chosen.has(next) ? value.filter((entry) => entry !== next) : [...value, next],
    );
  }

  return (
    <div className={cn('space-y-2', className)}>
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setQuery('');
          }
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            id={id}
            disabled={disabled}
            aria-expanded={open}
            aria-haspopup="listbox"
            className={cn(
              'flex h-10 w-full items-center justify-between gap-2 rounded-md border border-input',
              'bg-background px-3 text-sm text-start',
              'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
              'disabled:cursor-not-allowed disabled:opacity-50',
              'aria-[invalid=true]:border-danger aria-[invalid=true]:focus-visible:ring-danger',
            )}
            {...aria}
          >
            <span
              className={cn('min-w-0 truncate', selected.length === 0 && 'text-muted-foreground')}
            >
              {selected.length === 0
                ? placeholder
                : selected.length <= 2
                  ? selected.map((option) => option.label).join(', ')
                  : `${String(selected.length)} classes selected`}
            </span>
            <ChevronDownIcon className="size-4 shrink-0 opacity-60" aria-hidden="true" />
          </button>
        </PopoverTrigger>

        <PopoverContent
          align="start"
          className="w-[var(--radix-popover-trigger-width)] p-0"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
          }}
        >
          <CommandPrimitive shouldFilter={false} className="flex max-h-72 flex-col overflow-hidden">
            <div className="border-b border-border px-3 py-2">
              <CommandPrimitive.Input
                value={query}
                onValueChange={setQuery}
                placeholder={searchPlaceholder}
                className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
            <CommandPrimitive.List
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1"
              // Inside a modal dialog the popover is portalled outside the
              // dialog, so the dialog's scroll lock swallows the wheel and the
              // list cannot move. Stopping the event at the list keeps it from
              // reaching that lock, and `overscroll-contain` keeps the end of
              // the list from scrolling the dialog behind it.
              onWheel={(event) => {
                event.stopPropagation();
              }}
              onTouchMove={(event) => {
                event.stopPropagation();
              }}
            >
              {filtered.length === 0 ? (
                <CommandPrimitive.Empty className="px-2 py-6 text-center text-sm text-muted-foreground">
                  {emptyMessage}
                </CommandPrimitive.Empty>
              ) : (
                filtered.map((option) => (
                  <CommandPrimitive.Item
                    key={option.value}
                    value={option.value}
                    onSelect={() => {
                      toggle(option.value);
                    }}
                    className={cn(
                      'relative flex cursor-default items-center gap-2 rounded-sm px-2 py-2 text-sm outline-none select-none',
                      'data-[selected=true]:bg-muted data-[selected=true]:text-foreground',
                    )}
                  >
                    <Checkbox
                      checked={chosen.has(option.value)}
                      tabIndex={-1}
                      aria-hidden="true"
                      className="pointer-events-none"
                    />
                    <span className="min-w-0 flex-1 truncate">{option.label}</span>
                  </CommandPrimitive.Item>
                ))
              )}
            </CommandPrimitive.List>
          </CommandPrimitive>
        </PopoverContent>
      </Popover>

      {selected.length === 0 ? null : (
        <ul className="flex flex-wrap gap-2">
          {selected.map((option) => (
            <li
              key={option.value}
              className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs font-medium text-foreground"
            >
              {option.label}
              <button
                type="button"
                disabled={disabled}
                aria-label={`Remove ${option.label}`}
                className="rounded-full p-0.5 hover:bg-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                onClick={() => {
                  toggle(option.value);
                }}
              >
                <CloseIcon className="size-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
