import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { OtpInput } from './otp-input';

afterEach(cleanup);

function Harness({ initial = '' }: { readonly initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <div>
      <OtpInput value={value} onChange={setValue} />
      <output data-testid="value">{value}</output>
    </div>
  );
}

function boxes(): HTMLInputElement[] {
  // No cast: testing-library already types this as HTMLInputElement[], and the
  // redundant assertion was the one thing failing lint on the branch.
  return screen.getAllByLabelText(/Digit \d of 6/);
}

describe('OtpInput', () => {
  it('renders six digit boxes', () => {
    render(<Harness />);
    expect(boxes()).toHaveLength(6);
  });

  it('advances as digits are typed', () => {
    render(<Harness />);
    const slots = boxes();

    fireEvent.change(slots[0]!, { target: { value: '8' } });
    expect(screen.getByTestId('value').textContent).toBe('8');
    expect(slots[0]!.value).toBe('8');

    fireEvent.change(slots[1]!, { target: { value: '2' } });
    fireEvent.change(slots[2]!, { target: { value: '6' } });
    expect(screen.getByTestId('value').textContent).toBe('826');
    expect(slots[2]!.value).toBe('6');
  });

  it('fills every box from a paste', () => {
    render(<Harness />);
    const slots = boxes();

    fireEvent.paste(slots[0]!, {
      clipboardData: { getData: () => '123456' },
    });

    expect(screen.getByTestId('value').textContent).toBe('123456');
    expect(slots[5]!.value).toBe('6');
  });

  it('strips non-digits from paste', () => {
    render(<Harness />);

    fireEvent.paste(boxes()[0]!, {
      clipboardData: { getData: () => '12-34-ab' },
    });

    expect(screen.getByTestId('value').textContent).toBe('1234');
  });

  it('backspace clears then moves left', () => {
    render(<Harness initial="826" />);
    const slots = boxes();

    slots[2]!.focus();
    fireEvent.keyDown(slots[2]!, { key: 'Backspace' });
    expect(screen.getByTestId('value').textContent).toBe('82');

    fireEvent.keyDown(slots[2]!, { key: 'Backspace' });
    expect(screen.getByTestId('value').textContent).toBe('8');
  });

  it('arrow keys move between boxes', () => {
    render(<Harness initial="12" />);
    const slots = boxes();

    slots[1]!.focus();
    fireEvent.keyDown(slots[1]!, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(slots[0]);

    fireEvent.keyDown(slots[0]!, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(slots[1]);
  });

  it('ignores letters', () => {
    render(<Harness />);

    fireEvent.change(boxes()[0]!, { target: { value: 'a' } });
    expect(screen.getByTestId('value').textContent).toBe('');

    fireEvent.change(boxes()[0]!, { target: { value: '9' } });
    expect(screen.getByTestId('value').textContent).toBe('9');
  });
});
