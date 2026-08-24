import { minorUnits } from '@ilm/utils';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Money } from './money';

/**
 * Money is the component an accountant stares at all day, so it is the one
 * whose rendering rules are worth asserting rather than eyeballing.
 */

// Explicit rather than relying on testing-library's auto-cleanup, which only
// registers itself when vitest globals are enabled. They are not.
afterEach(cleanup);

describe('Money', () => {
  it('renders exactly two decimals, never truncated', () => {
    render(<Money valueMinor={minorUnits(123450)} data-testid="m" />);
    expect(screen.getByTestId('m').textContent).toMatch(/1,234\.50/);
  });

  it('renders a sub-rupee amount with a leading zero', () => {
    render(<Money valueMinor={minorUnits(5)} data-testid="m" />);
    expect(screen.getByTestId('m').textContent).toMatch(/0\.05/);
  });

  it('renders a negative in parentheses, the accounting convention', () => {
    render(<Money valueMinor={minorUnits(-123450)} data-testid="m" />);
    const text = screen.getByTestId('m').textContent ?? '';
    expect(text.startsWith('(')).toBe(true);
    expect(text.endsWith(')')).toBe(true);
    expect(text).not.toContain('-');
  });

  it('marks a negative with colour AND a label, never colour alone', () => {
    // This product is printed in black and white constantly, and ~8% of men
    // cannot distinguish the red.
    render(<Money valueMinor={minorUnits(-100)} data-testid="m" />);
    const element = screen.getByTestId('m');
    expect(element.className).toContain('text-danger');
    expect(element.getAttribute('aria-label')).toContain('negative');
  });

  it('is monospace and tabular, so a column aligns on the decimal point', () => {
    render(<Money valueMinor={minorUnits(100)} data-testid="m" />);
    const className = screen.getByTestId('m').className;
    expect(className).toContain('font-mono');
    expect(className).toContain('tabular-nums');
  });

  it('shows an em dash for zero when asked', () => {
    render(<Money valueMinor={minorUnits(0)} dashOnZero data-testid="m" />);
    expect(screen.getByTestId('m').textContent).toBe('—');
  });

  it('rejects a float rather than rendering drift', () => {
    // The last point before a number reaches a person: a float arriving from an
    // untyped boundary must fail loudly, not render as 1234.5600000001.
    expect(() => render(<Money valueMinor={1234.56} />)).toThrow(/whole number of paisa/);
  });

  it('accepts a caller className without losing its own', () => {
    render(<Money valueMinor={minorUnits(100)} className="text-lg" data-testid="m" />);
    const className = screen.getByTestId('m').className;
    expect(className).toContain('text-lg');
    expect(className).toContain('font-mono');
  });
});
