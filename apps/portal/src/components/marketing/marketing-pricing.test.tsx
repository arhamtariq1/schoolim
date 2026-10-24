import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { MarketingPricing } from './marketing-pricing';

afterEach(cleanup);

/**
 * The billing switch. What matters is that the figure and the period always
 * agree — an annual price shown "/ month" is the kind of mistake a school
 * reads as a bait-and-switch.
 */
describe('MarketingPricing', () => {
  it('quotes monthly prices first, with the monthly button pressed', () => {
    render(<MarketingPricing />);

    expect(screen.getByRole('button', { name: 'Monthly' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.getAllByText(/\/ campus \/ month/)).toHaveLength(3);
    expect(screen.queryByText(/\/ campus \/ year/)).toBeNull();
  });

  it('switches every card to the annual figure and period together', () => {
    render(<MarketingPricing />);

    fireEvent.click(screen.getByRole('button', { name: /Annual/ }));

    expect(screen.getByRole('button', { name: /Annual/ }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.getAllByText(/\/ campus \/ year/)).toHaveLength(3);
    expect(screen.queryByText(/\/ campus \/ month/)).toBeNull();
    // Ten months for twelve on the Starter plan: Rs 4,000 × 10.
    expect(screen.getAllByText(/40,000/).length).toBeGreaterThan(0);
  });

  it('sends the multi-campus plan to a conversation, not the sign-up form', () => {
    render(<MarketingPricing />);

    expect(screen.getByRole('link', { name: /Talk to us/ }).getAttribute('href')).toMatch(
      /^mailto:/,
    );
  });
});
