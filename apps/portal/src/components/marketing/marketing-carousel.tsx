'use client';

import { cn } from '@ilm/ui';
import { ChevronLeftIcon, ChevronRightIcon, ICON_SIZE } from '@ilm/ui/icons';
import { Children, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * A numbered horizontal track — "01 / 05" and two arrows — ADR-0021.
 *
 * The scrolling is the browser's own: `overflow-x: auto` with scroll-snap, so
 * a swipe, a trackpad, Shift+wheel and the keyboard all work with no script.
 * The script does two things only: keep the counter in step with what is in
 * view, and give the arrows something to call. Without JavaScript the arrows
 * do nothing and the counter reads "01" — the cards are all still reachable.
 *
 * The counter is `aria-live="polite"` so a screen-reader user who presses an
 * arrow hears where they landed; it is not announced while merely scrolling,
 * because the polite region only speaks when the text actually changes.
 */
export function MarketingCarousel({
  label,
  children,
  className,
}: {
  /** The region's accessible name, e.g. "Before and after". */
  label: string;
  children: ReactNode;
  className?: string;
}) {
  const trackRef = useRef<HTMLUListElement | null>(null);
  const [index, setIndex] = useState(0);
  const items = Children.toArray(children);
  const count = items.length;

  /** The distance between two cards' start edges, measured rather than assumed. */
  const step = useCallback((): number => {
    const track = trackRef.current;
    const first = track?.children[0];
    const second = track?.children[1];
    if (!(first instanceof HTMLElement) || !(second instanceof HTMLElement)) {
      return track?.clientWidth ?? 1;
    }
    return second.offsetLeft - first.offsetLeft;
  }, []);

  useEffect(() => {
    const track = trackRef.current;
    if (track === null) {
      return;
    }
    const onScroll = (): void => {
      // `trunc(x + 0.5)` is nearest-card; the house lint restricts
      // `Math.round` because of what rounding does to money (ADR-0007).
      const next = Math.trunc(track.scrollLeft / Math.max(1, step()) + 0.5);
      setIndex(Math.min(count - 1, Math.max(0, next)));
    };
    track.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      track.removeEventListener('scroll', onScroll);
    };
  }, [count, step]);

  const go = (direction: -1 | 1): void => {
    const track = trackRef.current;
    if (track === null) {
      return;
    }
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    track.scrollBy({ left: direction * step(), behavior: reduce ? 'auto' : 'smooth' });
  };

  const pad = (value: number) => String(value).padStart(2, '0');

  return (
    <section aria-label={label} aria-roledescription="carousel" className={className}>
      <div className="flex items-center justify-between gap-4">
        <p aria-live="polite" className="tracking-label text-xs font-medium uppercase tabular-nums">
          <span className="text-foreground">{pad(index + 1)}</span>
          <span className="text-muted-foreground"> / {pad(count)}</span>
        </p>
        <div className="flex gap-2">
          <ArrowButton label="Previous" disabled={index === 0} onClick={() => go(-1)}>
            <ChevronLeftIcon className={ICON_SIZE.nav} aria-hidden />
          </ArrowButton>
          <ArrowButton label="Next" disabled={index >= count - 1} onClick={() => go(1)}>
            <ChevronRightIcon className={ICON_SIZE.nav} aria-hidden />
          </ArrowButton>
        </div>
      </div>

      <ul
        ref={trackRef}
        data-track
        // A focusable scroll container, so arrow keys scroll it (WCAG 2.1.1).
        tabIndex={0}
        className="rounded-tile mt-8 flex snap-x snap-mandatory gap-4 overflow-x-auto focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none lg:gap-6"
      >
        {items.map((item, position) => (
          <li
            key={position}
            aria-roledescription="slide"
            aria-label={`${pad(position + 1)} of ${pad(count)}`}
            className="flex shrink-0 basis-5/6 snap-start sm:basis-1/2 lg:basis-2/5"
          >
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}

function ArrowButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex size-11 items-center justify-center rounded-full border border-foreground/20 transition-colors duration-200',
        'hover:bg-foreground hover:text-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        'disabled:pointer-events-none disabled:opacity-40',
      )}
    >
      {children}
    </button>
  );
}
