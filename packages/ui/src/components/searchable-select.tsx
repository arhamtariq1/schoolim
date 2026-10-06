'use client';

import { Command as CommandPrimitive } from 'cmdk';
import { useMemo, useState, type ComponentProps, type ReactNode } from 'react';

import { ApproveIcon, ChevronDownIcon } from '../icons';
import { cn } from '../lib/cn';

import { Popover, PopoverContent, PopoverTrigger } from './popover';

export interface SearchableSelectOption {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
}

export interface SearchableSelectProps {
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  readonly options: readonly SearchableSelectOption[];
  readonly placeholder?: string;
  readonly searchPlaceholder?: string;
  readonly emptyMessage?: string;
  readonly disabled?: boolean;
  readonly id?: string;
  readonly 'aria-invalid'?: boolean;
  readonly 'aria-describedby'?: string;
  readonly required?: boolean;
  readonly className?: string;
}

/**
 * Single choice from a long list — combobox with type-to-filter.
 *
 * Radix `Select` does not search; this uses `cmdk` inside a popover so province
 * and city pickers stay usable without a native `<select>` hundreds of rows long.
 */
export function SearchableSelect({
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
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selected = options.find((option) => option.value === value);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle === '') {
      return options;
    }
    return options.filter((option) => option.label.toLowerCase().includes(needle));
  }, [options, query]);

  function pick(next: string): void {
    onValueChange(next);
    setOpen(false);
    setQuery('');
  }

  return (
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
            className,
          )}
          {...aria}
        >
          <span className={cn('min-w-0 truncate', selected === undefined && 'text-muted-foreground')}>
            {selected?.label ?? placeholder}
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
              className={cn(
                'h-9 w-full bg-transparent text-sm outline-none',
                'placeholder:text-muted-foreground',
              )}
            />
          </div>
          <CommandPrimitive.List className="overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <CommandPrimitive.Empty className="px-2 py-6 text-center text-sm text-muted-foreground">
                {emptyMessage}
              </CommandPrimitive.Empty>
            ) : (
              filtered.map((option) => (
                <CommandItem
                  key={option.value}
                  disabled={option.disabled}
                  selected={option.value === value}
                  onSelect={() => {
                    pick(option.value);
                  }}
                >
                  {option.label}
                </CommandItem>
              ))
            )}
          </CommandPrimitive.List>
        </CommandPrimitive>
      </PopoverContent>
    </Popover>
  );
}

function CommandItem({
  children,
  selected,
  onSelect,
  disabled,
}: {
  children: ReactNode;
  selected: boolean;
  onSelect: () => void;
  disabled?: boolean;
}) {
  return (
    <CommandPrimitive.Item
      disabled={disabled}
      onSelect={onSelect}
      className={cn(
        'relative flex cursor-default items-center gap-2 rounded-sm px-2 py-2 text-sm outline-none select-none',
        'data-[selected=true]:bg-muted data-[selected=true]:text-foreground',
        'data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50',
      )}
      data-selected={selected}
    >
      <ApproveIcon
        className={cn('size-4 shrink-0', selected ? 'opacity-100' : 'opacity-0')}
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </CommandPrimitive.Item>
  );
}

export type SearchableSelectTriggerProps = ComponentProps<'button'>;
