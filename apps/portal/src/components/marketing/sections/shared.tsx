import { cn } from '@ilm/ui';
import { BRAND } from '@ilm/utils';
import Image from 'next/image';
import type { ReactNode } from 'react';

import lemmaLogo from '../../../../public/auth/lemma-logo.png';

import { Reveal } from '@/components/marketing/marketing-parts';

/** The column every section sits in. */
export const CONTAINER = 'mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8';

/** Vertical rhythm between sections. */
export const SECTION_Y = 'py-20 sm:py-28';

export const LINK =
  'inline-flex rounded-sm text-sm text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

export const PRIMARY =
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-primary px-7 text-base font-semibold text-primary-foreground shadow-tile transition-colors duration-150 hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

export const SECONDARY =
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-border bg-card px-6 text-base font-semibold text-foreground transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

/** The secondary action on a dark band. */
export const GHOST_ON_DARK =
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-foreground/25 px-6 text-base font-semibold text-foreground transition-colors duration-150 hover:bg-foreground/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

/**
 * `original` keeps the wordmark's own colours on a white pill, wherever it
 * sits; otherwise a dark band recolours it white (see `[data-logo]` in
 * globals.css).
 */
export function Logo({ className, original = false }: { className?: string; original?: boolean }) {
  return (
    <Image
      src={lemmaLogo}
      alt={BRAND.name}
      data-logo={original ? 'original' : ''}
      className={cn('h-8 w-auto object-contain object-left', className)}
      priority
    />
  );
}

/** The small teal line above a section title. */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={cn('inline-flex items-center gap-2 text-sm font-semibold text-primary', className)}
    >
      <span aria-hidden className="h-px w-6 bg-primary" />
      {children}
    </p>
  );
}

/**
 * A section's opening: eyebrow, a bold title and a short lead. Kept plain on
 * purpose — the product owner's main complaint about the last page was that
 * it was hard to tell what each section was saying.
 */
export function SectionHeading({
  eyebrow,
  title,
  titleId,
  lead,
  align = 'start',
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  titleId: string;
  lead?: string;
  align?: 'start' | 'center';
  className?: string;
}) {
  const centre = align === 'center';
  return (
    <Reveal className={cn(centre && 'mx-auto max-w-3xl text-center', className)}>
      {eyebrow === undefined ? null : (
        <Eyebrow className={cn('mb-4', centre && 'justify-center')}>{eyebrow}</Eyebrow>
      )}
      <h2
        id={titleId}
        className="font-display text-display-md text-heading font-medium text-balance"
      >
        {title}
      </h2>
      {lead === undefined ? null : (
        <p
          className={cn(
            'mt-5 max-w-2xl text-lg text-pretty text-muted-foreground',
            centre && 'mx-auto',
          )}
        >
          {lead}
        </p>
      )}
    </Reveal>
  );
}

/** Teal words inside a title. */
export function Accent({ children }: { children: ReactNode }) {
  return <span className="text-primary">{children}</span>;
}
