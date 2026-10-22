import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Reveal, Rule, WordReveal } from './marketing-parts';

afterEach(cleanup);

/**
 * The landing page's typographic primitives.
 *
 * There is one thing worth testing here and it is not the styling: a headline
 * split into one `<span>` per word is the standard way a premium marketing page
 * quietly becomes unreadable to a screen reader, and the standard way it
 * becomes invisible to everybody when the JavaScript that was meant to reveal
 * it does not run. Both are failures you cannot see in a screenshot, which is
 * exactly why they belong in a test.
 */
describe('WordReveal', () => {
  const TEXT = 'One place for the register, the ledger and the result card.';

  it('reads as one heading, not as eleven fragments', () => {
    render(<WordReveal as="h1" text={TEXT} />);

    // The accessible name is the whole sentence. `aria-label` is valid here
    // because a heading has a role to name — on a bare <span> it would be
    // ignored, which is the trap this guards.
    const heading = screen.getByRole('heading', { level: 1, name: TEXT });
    expect(heading.tagName).toBe('H1');

    for (const word of heading.querySelectorAll('[data-word]')) {
      expect(word.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('renders the full text even with no CSS and no JavaScript', () => {
    const { container } = render(<WordReveal text={TEXT} />);

    // Every word is present as real text, and the spaces survive as text nodes
    // *between* the spans — a trailing space inside an inline-block is not a
    // word gap, and the headline sets solid without them.
    expect(container.textContent).toBe(TEXT);
  });

  it('numbers the words so each one can be delayed in turn', () => {
    const { container } = render(<WordReveal text="Three steps, one afternoon." startIndex={2} />);
    const indices = [...container.querySelectorAll('[data-word]')].map((word) =>
      word.getAttribute('style'),
    );

    // Offset by `startIndex`, so a subtitle can continue a headline's stagger
    // rather than restarting it.
    expect(indices).toEqual([
      '--word-index: 2;',
      '--word-index: 3;',
      '--word-index: 4;',
      '--word-index: 5;',
    ]);
  });

  it('is the observer’s target, so the words wait to be seen', () => {
    const { container } = render(<WordReveal text={TEXT} />);

    // Not `data-reveal`: that would fade the whole heading as a block *and*
    // stagger the words inside it. This attribute drives the words alone.
    expect(container.querySelector('[data-reveal-words]')).not.toBeNull();
    expect(container.querySelector('[data-reveal]')).toBeNull();
  });
});

describe('Reveal and Rule', () => {
  it('render their children and carry their stagger index', () => {
    const { container } = render(
      <Reveal index={3}>
        <p>Books that balance</p>
      </Reveal>,
    );

    expect(screen.getByText('Books that balance')).toBeDefined();
    expect(container.querySelector('[data-reveal]')?.getAttribute('style')).toBe(
      '--reveal-index: 3;',
    );
  });

  it('keeps the hairline out of the accessibility tree', () => {
    const { container } = render(<Rule index={1} />);
    const rule = container.querySelector('[data-rule]');

    expect(rule?.getAttribute('aria-hidden')).toBe('true');
    expect(rule?.getAttribute('style')).toBe('--reveal-index: 1;');
  });
});
