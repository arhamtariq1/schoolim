import { cn } from '@ilm/ui';
import type { ReactNode } from 'react';

import { SAMPLE_SCHOOL } from '@/components/marketing/marketing-sample-school';

/**
 * A phone drawn in markup, holding sample previews — the landing page's stand-
 * in for a device screenshot, so the screen can never show a product we do not
 * have. `marketing-paper` puts back the product's own light palette, so a phone
 * resting on a teal band still shows the app as it really looks.
 *
 * Decorative: the caller wraps it in `aria-hidden`, because the section's copy
 * already says what the screen shows.
 */
export function PhoneFrame({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'marketing-paper shadow-frame w-64 shrink-0 rounded-4xl border-8 border-foreground bg-background text-start',
        className,
      )}
    >
      <div className="overflow-hidden rounded-3xl">
        <div className="flex justify-center pt-2">
          <span className="h-5 w-20 rounded-full bg-foreground" />
        </div>
        <div className="px-4 pt-3 pb-3">
          <p className="text-xs text-muted-foreground">{SAMPLE_SCHOOL.name}</p>
          <p className="text-sm font-semibold">{title}</p>
        </div>
        <div className="space-y-3 px-3 pb-6">{children}</div>
      </div>
    </div>
  );
}
