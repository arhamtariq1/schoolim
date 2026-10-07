import { cn } from '@ilm/ui';
import type { ReactNode } from 'react';

/** Shared surface for full-width setup screens — a card on the shell's muted ground. */
export const setupFormCardClassName =
  'rounded-2xl border border-border/70 bg-card shadow-xs';

/**
 * Stacked form section — title, helper line, fields (Venue-style profile editor).
 */
export function FormSectionCard({
  title,
  description,
  children,
  variant = 'default',
}: {
  title: string;
  description: string;
  children: ReactNode;
  variant?: 'default' | 'setup';
}) {
  if (variant === 'setup') {
    return (
      <section className={cn(setupFormCardClassName, 'p-5 sm:p-6 md:p-7')}>
        <FormSectionHeading title={title} description={description} variant="setup" />
        {children}
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-border/80 bg-card p-6 shadow-sm sm:p-8">
      <FormSectionHeading title={title} description={description} variant="default" />
      {children}
    </section>
  );
}

/** Actions row below setup cards — no extra card chrome. */
export function SetupFormFooter({ children }: { children: ReactNode }) {
  return <div className="px-1 pt-1">{children}</div>;
}

function FormSectionHeading({
  title,
  description,
  variant,
}: {
  title: string;
  description: string;
  variant: 'default' | 'setup';
}) {
  return (
    <div className={variant === 'setup' ? 'mb-6' : 'mb-5 border-b border-border/60 pb-5 sm:mb-6'}>
      <h2
        className={
          variant === 'setup'
            ? 'text-base font-semibold tracking-tight text-foreground'
            : 'text-lg font-semibold tracking-tight text-foreground'
        }
      >
        {title}
      </h2>
      <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-muted-foreground">{description}</p>
    </div>
  );
}
