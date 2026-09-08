import type { ReactNode } from 'react';

/**
 * The top of every screen.
 *
 * Before this existed each page wrote its own header, and they drifted: some
 * `text-xl`, some `text-lg`, some with the description above the title, some
 * with the primary action on the left. None of it was wrong on its own and all
 * of it together made the product feel assembled rather than designed.
 *
 * One component, three slots — title, one line of what the screen is for, and
 * the actions. The description is not decoration: docs/16 §7 wants the empty
 * and error states to explain themselves, and a screen that cannot say what it
 * is for in a sentence usually has not decided.
 */
export interface PageHeaderProps {
  title: string;
  description?: string;
  /** Buttons. Right-aligned on a wide screen, wrapped underneath on a phone. */
  actions?: ReactNode;
  /** A status badge or count that belongs beside the title, not below it. */
  badge?: ReactNode;
}

export function PageHeader({ title, description, actions, badge }: PageHeaderProps) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
          {badge}
        </div>
        {description === undefined ? null : (
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {actions === undefined ? null : (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      )}
    </header>
  );
}
