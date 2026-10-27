import { cn } from '@ilm/ui';
import { Fragment, type CSSProperties, type ReactNode } from 'react';

/**
 * The landing page's four typographic primitives — ADR-0019.
 *
 * All four are Server Components: they ship no JavaScript, and every one of
 * them renders complete, readable content on its own. What they add is a
 * `data-` attribute and an index, which the CSS in `globals.css` turns into
 * motion *if* `MarketingBootstrap` has decided motion is wanted. Nothing here
 * knows whether it will animate, which is why removing the motion is a
 * one-line change and not a rewrite.
 *
 * None of them belong in `@ilm/ui`. docs/16 §1 settles it with one question —
 * "will a second screen need this?" — and the answer for a word-splitting
 * display headline is no.
 *
 * ## Why all three carry `suppressHydrationWarning`
 *
 * `MarketingBootstrap` runs before React does, and anything already on screen
 * gets `is-visible` the moment its observer registers — which is before
 * hydration. React then finds a `className` on the DOM node that its own props
 * do not produce and reports a mismatch it will not patch up. The attribute is
 * the sanctioned way to say "a script owns this one", the same answer the root
 * layout gives for the theme class on `<html>`.
 *
 * The alternative — waiting for hydration before revealing anything — was
 * rejected: it would put the page's legibility behind React booting, which is
 * the single failure `MarketingBootstrap` exists to survive.
 */

/**
 * The stagger index, as a custom property.
 *
 * docs/16 §2 bans inline styles "except for a genuinely computed value", and a
 * row's position in a list is exactly that: the alternative is nine hand-written
 * delay classes, or an `nth-child` rule per section that has to be edited
 * whenever a row is added.
 */
function indexStyle(name: '--reveal-index' | '--word-index' | '--rise-index', value: number) {
  return { [name]: value } as CSSProperties;
}

/**
 * The small uppercase label that marks a section or numbers a row.
 *
 * Not a pill, not a badge, not an eyebrow with a dot. docs/16 §15 and the
 * house anti-slop rule both say the same thing: hierarchy before labels. This
 * is the smallest thing on the page and it is doing a real job — telling you
 * where you are in a sequence.
 */
export function Label({
  children,
  id,
  className,
}: {
  children: ReactNode;
  /** For a section's `aria-labelledby` to point at, where the label *is* the heading. */
  id?: string;
  className?: string;
}) {
  return (
    <span
      id={id}
      className={cn(
        'tracking-label block text-xs font-medium text-muted-foreground uppercase',
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * A hairline that draws itself left to right when it comes into view.
 *
 * The only motion on this page that is not a fade, and deliberately so: a rule
 * is a structural element, so it arrives structurally. It is also the whole of
 * this page's separation model — there are no card borders here, because
 * boxing every paragraph is how an editorial layout turns into a dashboard.
 */
export function Rule({ index = 0, className }: { index?: number; className?: string }) {
  return (
    <div
      data-rule
      aria-hidden
      suppressHydrationWarning
      style={indexStyle('--reveal-index', index)}
      className={cn('h-px w-full bg-border', className)}
    />
  );
}

/**
 * Fades and rises into place once, when it enters the viewport.
 *
 * `index` staggers siblings. Keep it under about five per group: past that the
 * last item arrives half a second after the first and the reveal stops reading
 * as one gesture.
 */
export function Reveal({
  children,
  index = 0,
  from = 'below',
  className,
}: {
  children: ReactNode;
  index?: number;
  /**
   * Where it arrives from. `below` is the page's default rise; `scale` grows a
   * product window into place; `start` and `end` slide in from the reading
   * edges (they swap in a right-to-left page), for two columns that meet.
   */
  from?: 'below' | 'scale' | 'start' | 'end';
  className?: string;
}) {
  return (
    <div
      data-reveal={from}
      suppressHydrationWarning
      style={indexStyle('--reveal-index', index)}
      className={className}
    >
      {children}
    </div>
  );
}

/**
 * The same gesture, but played on load rather than on intersection — for the
 * hero, which is already on screen. An observer that fires for something
 * already visible costs a frame of flicker and buys nothing.
 */
export function Rise({
  children,
  index = 0,
  className,
}: {
  children: ReactNode;
  index?: number;
  className?: string;
}) {
  return (
    <div data-rise style={indexStyle('--rise-index', index)} className={className}>
      {children}
    </div>
  );
}

/**
 * The headline, revealed word by word.
 *
 * ## Accessibility is the whole of the difficulty
 *
 * Split text is where premium pages quietly break for screen readers: a
 * heading chopped into forty spans is announced as forty fragments, or worse,
 * read letter by letter. So the words are `aria-hidden` and the accessible
 * name comes from `aria-label` on the heading itself — which is valid because a
 * heading has a role, unlike the `<span>` the naive version wraps everything in.
 *
 * The spaces are text nodes *between* the spans rather than inside them.
 * A trailing space inside an `inline-block` is not a word gap, and the headline
 * sets solid without them.
 *
 * Words, never letters. Per-letter staggers look like a demo; per-word reads
 * like someone speaking.
 *
 * ## It waits to be seen
 *
 * The heading carries `data-reveal-words`, which the observer in
 * `MarketingBootstrap` watches; the words transition in once it has
 * `is-visible`. An earlier version animated on load, which looked right in the
 * hero and was useless everywhere else — every heading further down the page
 * had finished staggering before the visitor scrolled to it.
 */
export function WordReveal({
  as: Tag = 'h2',
  text,
  id,
  startIndex = 0,
  accent = [],
  className,
}: {
  as?: 'h1' | 'h2' | 'p';
  text: string;
  /** Word positions (0-based) set in the primary colour — a marker, never the only signal. */
  accent?: readonly number[];
  /** For a section's `aria-labelledby` to point at. */
  id?: string;
  /** Where this block's stagger begins, so a subtitle can continue a headline's. */
  startIndex?: number;
  className?: string;
}) {
  const words = text.split(' ');
  // `*word*` marks the accent word (ADR-0021): set in the italic serif, and
  // stripped of its asterisks everywhere it is read or announced.
  const plain = text.replaceAll('*', '');

  return (
    <Tag
      id={id}
      data-reveal-words
      suppressHydrationWarning
      aria-label={plain}
      className={cn('font-display text-balance', className)}
    >
      {words.map((word, position) => {
        const starred = word.startsWith('*') && word.lastIndexOf('*') > 0;
        const [lead, tail] = starred
          ? [word.slice(1, word.lastIndexOf('*')), word.slice(word.lastIndexOf('*') + 1)]
          : [word, ''];
        return (
          <Fragment key={`${position}-${word}`}>
            {position === 0 ? null : ' '}
            <span
              data-word
              aria-hidden
              style={indexStyle('--word-index', startIndex + position)}
              className={accent.includes(position) ? 'text-primary' : undefined}
            >
              {starred ? <span data-accent>{lead}</span> : lead}
              {tail}
            </span>
          </Fragment>
        );
      })}
    </Tag>
  );
}
