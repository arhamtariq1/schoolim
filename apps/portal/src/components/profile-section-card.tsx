import { cn } from '@ilm/ui';
import type { ComponentType, ReactNode } from 'react';

type ProfileSectionCardProps = {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function ProfileSectionCard({
  icon: Icon,
  title,
  description,
  action,
  children,
  className,
}: ProfileSectionCardProps) {
  return (
    <section
      className={cn(
        'flex h-full flex-col rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6',
        className,
      )}
    >
      <header className="mb-5 flex flex-col gap-3 border-b border-border/70 pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-foreground">{title}</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
          </div>
        </div>
        {action === undefined ? null : <div className="shrink-0">{action}</div>}
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
}
