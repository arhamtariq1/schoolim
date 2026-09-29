'use client';

import {
  type ClipboardEvent,
  type KeyboardEvent,
  useRef,
  type ComponentPropsWithoutRef,
} from 'react';

import { cn } from '../lib/cn';

export interface OtpInputProps
  extends Omit<ComponentPropsWithoutRef<'div'>, 'onChange' | 'children'> {
  /** Digits only. Length is truncated to `length`. */
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly length?: number;
  readonly disabled?: boolean;
  readonly autoFocus?: boolean;
  readonly id?: string;
  readonly required?: boolean;
  readonly 'aria-invalid'?: boolean;
  readonly 'aria-describedby'?: string;
  readonly name?: string;
}

/**
 * Six (by default) digit boxes for one-time codes.
 *
 * Built for `<Field>`: `id` lands on the first slot so the label focuses it,
 * and `aria-invalid` / `aria-describedby` paint every box.
 *
 * Typing advances, Backspace retreats, paste fills the whole code.
 */
export function OtpInput({
  value,
  onChange,
  length = 6,
  disabled = false,
  autoFocus = false,
  id,
  required,
  name,
  className,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
  ...props
}: OtpInputProps) {
  const digits = value.replace(/\D/g, '').slice(0, length);
  const slots = Array.from({ length }, (_, index) => digits[index] ?? '');
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  function commit(next: string) {
    onChange(next.replace(/\D/g, '').slice(0, length));
  }

  function focusAt(index: number) {
    const clamped = Math.max(0, Math.min(length - 1, index));
    refs.current[clamped]?.focus();
    refs.current[clamped]?.select();
  }

  function handleChange(index: number, raw: string) {
    const cleaned = raw.replace(/\D/g, '');
    if (cleaned === '') {
      const next = slots.slice();
      next[index] = '';
      commit(next.join(''));
      return;
    }

    // One key or a paste into a single box — take as many digits as fit from here.
    const next = slots.slice();
    const chars = cleaned.slice(0, length - index).split('');
    for (let offset = 0; offset < chars.length; offset += 1) {
      next[index + offset] = chars[offset] ?? '';
    }
    commit(next.join(''));
    focusAt(index + chars.length);
  }

  function handleKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Backspace') {
      event.preventDefault();
      if (slots[index] !== '') {
        const next = slots.slice();
        next[index] = '';
        commit(next.join(''));
        return;
      }
      if (index > 0) {
        const next = slots.slice();
        next[index - 1] = '';
        commit(next.join(''));
        focusAt(index - 1);
      }
      return;
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      focusAt(index - 1);
      return;
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      focusAt(index + 1);
      return;
    }

    if (event.key === 'Home') {
      event.preventDefault();
      focusAt(0);
      return;
    }

    if (event.key === 'End') {
      event.preventDefault();
      focusAt(length - 1);
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
    event.preventDefault();
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (pasted === '') {
      return;
    }
    commit(pasted);
    focusAt(Math.min(pasted.length, length - 1));
  }

  const invalid = ariaInvalid === true;

  const mid = Math.floor(length / 2);

  return (
    <div
      role="group"
      aria-describedby={ariaDescribedBy}
      {...props}
      className={cn('flex w-full items-center justify-center gap-2 pt-2 sm:gap-2.5', className)}
    >
      {/* Keeps autocomplete / form submit happy without showing a second field. */}
      <input type="hidden" name={name} value={digits} readOnly />

      {slots.map((digit, index) => (
        <span key={index} className="contents">
          {index === mid ? (
            <span
              aria-hidden="true"
              className="mx-0.5 select-none text-lg font-medium text-muted-foreground/45 sm:mx-1"
            >
              ·
            </span>
          ) : null}
          <input
            ref={(node) => {
              refs.current[index] = node;
            }}
            id={index === 0 ? id : undefined}
            type="text"
            inputMode="numeric"
            autoComplete={index === 0 ? 'one-time-code' : 'off'}
            autoFocus={autoFocus && index === 0}
            required={required && index === 0}
            disabled={disabled}
            maxLength={1}
            aria-label={`Digit ${String(index + 1)} of ${String(length)}`}
            aria-invalid={invalid}
            value={digit}
            onChange={(event) => {
              handleChange(index, event.target.value);
            }}
            onKeyDown={(event) => {
              handleKeyDown(index, event);
            }}
            onPaste={handlePaste}
            onFocus={(event) => {
              event.target.select();
            }}
            className={cn(
              'h-12 w-10 shrink-0 rounded-lg border border-input bg-card text-center text-lg font-medium text-foreground tabular-nums transition-[border-color,background-color,box-shadow] duration-150 sm:h-14 sm:w-12 sm:text-xl',
              'focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
              'disabled:cursor-not-allowed disabled:opacity-50',
              digit !== '' && !invalid && 'border-primary/35 bg-primary/5',
              invalid && 'border-danger bg-danger/5 focus-visible:ring-danger',
            )}
          />
        </span>
      ))}
    </div>
  );
}
