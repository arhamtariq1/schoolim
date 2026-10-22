import { cn } from '@ilm/ui';
import type { CSSProperties } from 'react';

/**
 * A label whose letters roll over, one after another, on hover — ADR-0019.
 *
 * Each character is its own little window containing two stacked copies of
 * itself. On hover the stack slides up by exactly one line, so the first copy
 * leaves through the top as the second arrives from the bottom, and a delay
 * keyed to the character's position makes the word break like a wave rather
 * than flipping as a block.
 *
 * ## Why it is built per character and not per word
 *
 * A single two-line stack for the whole word is four lines of CSS and reads as
 * a label being swapped. The stagger is the entire effect: it turns a hover
 * state into something that looks mechanical and deliberate, which is the
 * register this page is going for.
 *
 * ## Accessibility
 *
 * The rolling letters are `aria-hidden` and the accessible name comes from a
 * visually hidden copy of the real string. Otherwise every link on the page
 * announces as its own text twice over — the duplicate is structural, not
 * content, and a screen reader has no way to know that.
 *
 * Spaces become non-breaking spaces because an inline-block containing a
 * single ordinary space collapses to zero width, which closes up the gaps in
 * a two-word label.
 */
export function LetterRoll({ text, className }: { text: string; className?: string }) {
  return (
    <span className={cn('inline-flex', className)}>
      <span className="sr-only">{text}</span>

      <span aria-hidden className="inline-flex">
        {[...text].map((character, position) => (
          <span
            key={`${position}-${character}`}
            data-roll-letter
            style={{ '--letter-index': position } as CSSProperties}
          >
            <span data-roll-stack>
              <span>{character === ' ' ? ' ' : character}</span>
              <span>{character === ' ' ? ' ' : character}</span>
            </span>
          </span>
        ))}
      </span>
    </span>
  );
}
