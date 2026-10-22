import { cn } from '@ilm/ui';
import type { CSSProperties } from 'react';

/**
 * A statement that lights up word by word as it is scrolled through — ADR-0019.
 *
 * The page's one long paragraph. It begins dim and each word reaches full
 * strength as the reading position passes it, so the act of scrolling *is* the
 * act of reading rather than something that happens to the page while you read.
 *
 * ## How it is driven, and why not by JavaScript per word
 *
 * `MarketingSmoothScroll` writes a single number — `--read` from 0 to 1 — onto
 * this element as the viewport crosses it. Every word carries its own index,
 * and the opacity is worked out in CSS:
 *
 *     opacity: clamp(0.22, calc(var(--read) * var(--word-count) - var(--i)), 1)
 *
 * As `--read` grows, `--read × count` sweeps past each index in turn and that
 * word fades up over the following unit. So one custom property per frame on
 * one element animates a hundred words, with no per-word measurement, no
 * observer per word, and no React state in the scroll path.
 *
 * ## Its resting state is "fully lit"
 *
 * `--read` defaults to 1. With no JavaScript, under `prefers-reduced-motion`,
 * or before hydration, the paragraph is simply a paragraph at full contrast —
 * the dimming is something motion *adds*, never something legibility depends
 * on. The dim floor is 0.22 rather than 0 for the same reason: at no point in
 * the animation is a word actually invisible.
 */
export function Manifesto({
  text,
  className,
}: {
  text: string;
  /** Pass the type size; the component only owns the reveal. */
  className?: string;
}) {
  const words = text.split(' ');

  return (
    <p
      data-illuminate
      suppressHydrationWarning
      style={{ '--word-count': words.length } as CSSProperties}
      className={cn('text-balance', className)}
    >
      {words.map((word, position) => (
        <span key={`${position}-${word}`}>
          <span data-read-word style={{ '--word-index': position } as CSSProperties}>
            {word}
          </span>
          {position === words.length - 1 ? null : ' '}
        </span>
      ))}
    </p>
  );
}
