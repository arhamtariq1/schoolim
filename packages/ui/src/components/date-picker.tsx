'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { Matcher } from 'react-day-picker';

import { CalendarIcon, CloseIcon } from '../icons';
import { cn } from '../lib/cn';
import {
  formatPlainDate,
  formatPlainMonth,
  parsePlainDate,
  parsePlainMonth,
  todayPlainDate,
} from '../lib/plain-date';

import { Calendar } from './calendar';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

/**
 * The date field.
 *
 * ## Why it is a text box *and* a calendar, not just a calendar
 *
 * A calendar-only picker is a trap for the two jobs this product does most.
 * Entering a date of birth means paging back twenty-five years one month at a
 * time — three hundred clicks — and a clerk admitting forty students does that
 * forty times. Meanwhile the fee counter has someone reading a date off a slip;
 * they can type `07/09/2026` faster than they can find it on a grid.
 *
 * So the input is the primary control and typing is always allowed. The
 * calendar hangs off a button beside it for the other case — "the Tuesday after
 * next" — where a person is looking rather than transcribing. Both write the
 * same `YYYY-MM-DD` string.
 *
 * ## The value on the wire
 *
 * `value` and `onChange` speak `YYYY-MM-DD`, exactly like the `type="date"`
 * this replaces, so a call site changes its component and nothing else. Empty
 * string means no date — not `null`, not `undefined` — because that is what a
 * cleared input gives you and what the API contracts already accept.
 */

export interface DatePickerProps {
  /** `YYYY-MM-DD`, or `''` for empty. */
  value: string;
  onChange: (value: string) => void;
  /** Earliest selectable day, `YYYY-MM-DD`. */
  min?: string | undefined;
  /** Latest selectable day, `YYYY-MM-DD`. */
  max?: string | undefined;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  /** Show a year dropdown — worth it for a date of birth, noise for "today". */
  yearNavigation?: boolean;
  /** Renders an × once a date is set. Off where the field is mandatory. */
  clearable?: boolean;
  className?: string;
  id?: string;
  name?: string;
  'aria-label'?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
}

/** What a person types and reads. Pakistan writes the day first. */
function toDisplay(iso: string): string {
  const date = parsePlainDate(iso);
  if (date === undefined) return '';
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
}

/**
 * Read a typed date, forgivingly.
 *
 * Accepts `07/09/2026`, `7-9-2026`, `07.09.2026` and `2026-09-07`, because
 * people paste as well as type and rejecting a date that is plainly legible is
 * just rudeness with a validation message attached.
 */
function fromDisplay(text: string): string | undefined {
  const trimmed = text.trim();
  if (trimmed === '') return '';

  // Already ISO, from a paste or a browser autofill.
  const iso = parsePlainDate(trimmed);
  if (iso !== undefined) return formatPlainDate(iso);

  const parts = trimmed.split(/[/\-.\s]+/).filter((part) => part !== '');
  if (parts.length !== 3) return undefined;

  const [dayText, monthText, yearText] = parts as [string, string, string];
  if (!/^\d{1,2}$/.test(dayText) || !/^\d{1,2}$/.test(monthText) || !/^\d{4}$/.test(yearText)) {
    return undefined;
  }

  const candidate = `${yearText}-${monthText.padStart(2, '0')}-${dayText.padStart(2, '0')}`;
  const parsed = parsePlainDate(candidate);
  return parsed === undefined ? undefined : formatPlainDate(parsed);
}

export function DatePicker({
  value,
  onChange,
  min,
  max,
  placeholder = 'dd/mm/yyyy',
  disabled = false,
  required = false,
  yearNavigation = false,
  clearable = true,
  className,
  id,
  name,
  ...aria
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(() => toDisplay(value));
  const inputRef = useRef<HTMLInputElement>(null);
  const generatedId = useId();
  const inputId = id ?? generatedId;

  // Keep the box in step when the value is changed from outside — a "This
  // month" shortcut, a form reset, a server round-trip. Guarded on the parsed
  // value rather than the text, so re-rendering never rewrites what someone is
  // halfway through typing.
  useEffect(() => {
    setText((current) => (fromDisplay(current) === value ? current : toDisplay(value)));
  }, [value]);

  const selected = parsePlainDate(value);
  const minDate = parsePlainDate(min);
  const maxDate = parsePlainDate(max);

  // Two separate matchers rather than one object: react-day-picker's Matcher is
  // a union, and `{ before, after }` with both keys means "inside that range",
  // which is the exact opposite of the bound we want.
  const disabledDays = useMemo<Matcher[]>(() => {
    const rules: Matcher[] = [];
    if (minDate !== undefined) rules.push({ before: minDate });
    if (maxDate !== undefined) rules.push({ after: maxDate });
    return rules;
  }, [minDate, maxDate]);

  function commit(next: string) {
    setText(toDisplay(next));
    onChange(next);
  }

  return (
    <div className={cn('relative', className)}>
      <input
        ref={inputRef}
        id={inputId}
        name={name}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={text}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        onChange={(event) => {
          const next = event.target.value;
          setText(next);
          // Only propagate once it parses. Typing "0", "07", "07/" would
          // otherwise fire three changes, two of them nonsense, and any parent
          // that refetches on change would fire three requests per keystroke.
          const parsed = fromDisplay(next);
          if (parsed !== undefined && parsed !== value) onChange(parsed);
        }}
        onBlur={() => {
          const parsed = fromDisplay(text);
          // Unparseable leftovers snap back to the last good value rather than
          // sitting there looking accepted.
          setText(parsed === undefined ? toDisplay(value) : toDisplay(parsed));
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && event.altKey) {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className={cn(
          'flex h-10 w-full rounded-md border border-input bg-background ps-3 text-base tabular-nums',
          clearable && value !== '' ? 'pe-16' : 'pe-10',
          'placeholder:text-muted-foreground',
          'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'aria-[invalid=true]:border-danger aria-[invalid=true]:focus-visible:ring-danger',
        )}
        {...aria}
      />

      <div className="absolute inset-y-0 end-1 flex items-center gap-0.5">
        {clearable && value !== '' && !disabled ? (
          <button
            type="button"
            onClick={() => {
              commit('');
              inputRef.current?.focus();
            }}
            aria-label="Clear date"
            className="inline-flex size-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <CloseIcon className="size-4" aria-hidden="true" />
          </button>
        ) : null}

        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={disabled}
              aria-label="Open calendar"
              className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50"
            >
              <CalendarIcon className="size-4" aria-hidden="true" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="p-2">
            <Calendar
              mode="single"
              selected={selected}
              defaultMonth={selected ?? maxDate ?? minDate}
              disabled={disabledDays}
              {...(minDate === undefined ? {} : { startMonth: minDate })}
              {...(maxDate === undefined ? {} : { endMonth: maxDate })}
              {...(yearNavigation ? { captionLayout: 'dropdown' as const } : {})}
              onSelect={(day) => {
                if (day === undefined) return;
                commit(formatPlainDate(day));
                setOpen(false);
                inputRef.current?.focus();
              }}
              autoFocus
            />
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

export interface MonthPickerProps {
  /** `YYYY-MM`, or `''`. */
  value: string;
  onChange: (value: string) => void;
  min?: string | undefined;
  max?: string | undefined;
  disabled?: boolean;
  className?: string;
  id?: string;
  'aria-label'?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
}

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/**
 * A month, chosen as a month.
 *
 * `<input type="month">` is the worst-supported date input there is — Firefox
 * and Safari fall back to a bare text box, so half the people using this get no
 * picker at all. A billing month is also not a day, and offering a day grid to
 * choose one invites picking "the 3rd" and wondering which part mattered.
 *
 * So this is a twelve-cell grid with the year on a stepper: two clicks to any
 * month in the current year, three to any month at all.
 */
export function MonthPicker({
  value,
  onChange,
  min,
  max,
  disabled = false,
  className,
  id,
  ...aria
}: MonthPickerProps) {
  const [open, setOpen] = useState(false);
  const selected = parsePlainMonth(value);
  const minMonth = parsePlainMonth(min);
  const maxMonth = parsePlainMonth(max);

  const [year, setYear] = useState(
    () => (selected ?? parsePlainDate(todayPlainDate()) ?? new Date(Date.now())).getFullYear(),
  );

  // Follow the value when it is set from outside, so reopening the panel after
  // a "Previous month" shortcut lands on the year actually in the field.
  // Keyed on the year rather than the whole value: stepping between months of
  // the same year must not yank the panel back while someone is browsing it.
  const selectedYear = selected?.getFullYear();
  useEffect(() => {
    if (selectedYear !== undefined) setYear(selectedYear);
  }, [selectedYear]);

  const label =
    selected === undefined
      ? 'Select month'
      : `${MONTH_NAMES[selected.getMonth()] ?? ''} ${selected.getFullYear()}`;

  function outOfRange(monthIndex: number): boolean {
    const candidate = new Date(year, monthIndex, 1);
    if (minMonth !== undefined && candidate < minMonth) return true;
    if (maxMonth !== undefined && candidate > maxMonth) return true;
    return false;
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          id={id}
          disabled={disabled}
          className={cn(
            'flex h-10 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-sm',
            'transition-colors hover:bg-muted/50',
            'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
            'disabled:cursor-not-allowed disabled:opacity-50',
            'aria-[invalid=true]:border-danger',
            className,
          )}
          {...aria}
        >
          <span className={cn('truncate', selected === undefined && 'text-muted-foreground')}>
            {label}
          </span>
          <CalendarIcon className="size-4 shrink-0 opacity-60" aria-hidden="true" />
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-64 p-3">
        <div className="mb-3 flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              setYear((current) => current - 1);
            }}
            aria-label="Previous year"
            className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <span aria-hidden="true">‹</span>
          </button>
          <span className="text-sm font-semibold tabular-nums">{year}</span>
          <button
            type="button"
            onClick={() => {
              setYear((current) => current + 1);
            }}
            aria-label="Next year"
            className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <span aria-hidden="true">›</span>
          </button>
        </div>

        <div className="grid grid-cols-3 gap-1">
          {MONTH_NAMES.map((month, index) => {
            const isSelected =
              selected !== undefined &&
              selected.getFullYear() === year &&
              selected.getMonth() === index;

            return (
              <button
                key={month}
                type="button"
                disabled={outOfRange(index)}
                aria-pressed={isSelected}
                onClick={() => {
                  onChange(formatPlainMonth(new Date(year, index, 1)));
                  setOpen(false);
                }}
                className={cn(
                  'h-9 rounded-md text-sm transition-colors',
                  'hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                  'disabled:pointer-events-none disabled:opacity-30',
                  isSelected
                    ? 'bg-primary font-semibold text-primary-foreground hover:bg-primary'
                    : 'text-foreground',
                )}
              >
                {month}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
