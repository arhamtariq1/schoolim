import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DatePicker } from './date-picker';

/**
 * The typing path, which is the one people actually use.
 *
 * A calendar-only picker cannot be tested this way and cannot be *used* this
 * way either — which is the argument for the text box being the primary
 * control. See the note at the top of date-picker.tsx.
 */

// Explicit rather than relying on testing-library's auto-cleanup, which only
// registers itself when vitest globals are enabled. They are not.
afterEach(cleanup);

function value(): string {
  return screen.getByLabelText<HTMLInputElement>('Date').value;
}

function Controlled({
  initial = '',
  onChange,
}: {
  initial?: string;
  onChange?: (v: string) => void;
}) {
  const [current, setCurrent] = useState(initial);
  return (
    <DatePicker
      value={current}
      onChange={(next) => {
        setCurrent(next);
        onChange?.(next);
      }}
      aria-label="Date"
    />
  );
}

describe('DatePicker', () => {
  it('shows an existing value in the day-first form people read here', () => {
    render(<Controlled initial="2026-09-07" />);

    expect(value()).toBe('07/09/2026');
  });

  it('is empty, not "Invalid Date", when there is no value', () => {
    render(<Controlled />);

    expect(value()).toBe('');
  });

  it('emits ISO when a full date is typed', () => {
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '07/09/2026' } });

    expect(onChange).toHaveBeenCalledWith('2026-09-07');
  });

  it('stays quiet while a date is still half-typed', () => {
    // "0", "07", "07/", "07/0"… must not each fire a change: a parent that
    // refetches on change would issue a request per keystroke.
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);
    const input = screen.getByLabelText('Date');

    for (const partial of ['0', '07', '07/', '07/0', '07/09', '07/09/20']) {
      fireEvent.change(input, { target: { value: partial } });
    }

    expect(onChange).not.toHaveBeenCalled();
  });

  it('accepts the separators people actually paste', () => {
    for (const [typed, expected] of [
      ['7-9-2026', '2026-09-07'],
      ['07.09.2026', '2026-09-07'],
      ['2026-09-07', '2026-09-07'],
      ['7/9/2026', '2026-09-07'],
    ] as const) {
      const onChange = vi.fn();
      render(<Controlled onChange={onChange} />);

      fireEvent.change(screen.getByLabelText('Date'), { target: { value: typed } });
      expect(onChange, typed).toHaveBeenCalledWith(expected);

      cleanup();
    }
  });

  it('reverts unparseable text on blur instead of leaving it looking accepted', () => {
    render(<Controlled initial="2026-09-07" />);
    const input = screen.getByLabelText('Date');

    fireEvent.change(input, { target: { value: 'tomorrow' } });
    fireEvent.blur(input);

    expect(value()).toBe('07/09/2026');
  });

  it('does not accept an impossible day', () => {
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '31/02/2026' } });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('clears to empty string, which is what the API contracts accept', () => {
    const onChange = vi.fn();
    render(<Controlled initial="2026-09-07" onChange={onChange} />);

    fireEvent.click(screen.getByLabelText('Clear date'));

    expect(onChange).toHaveBeenCalledWith('');
    expect(value()).toBe('');
  });

  it('offers no clear button when there is nothing to clear', () => {
    render(<Controlled />);

    expect(screen.queryByLabelText('Clear date')).toBeNull();
  });

  it('follows a value changed from outside', () => {
    const { rerender } = render(
      <DatePicker value="2026-09-07" onChange={() => undefined} aria-label="Date" />,
    );

    rerender(<DatePicker value="2026-10-01" onChange={() => undefined} aria-label="Date" />);

    expect(value()).toBe('01/10/2026');
  });

  it('exposes a calendar for the case where someone is looking, not transcribing', () => {
    render(<Controlled />);

    expect(screen.queryByLabelText('Open calendar')).not.toBeNull();
  });
});
