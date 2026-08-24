import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';

import { cn } from '../lib/cn';

const badge = cva('inline-flex items-center gap-1.5 rounded-full font-medium', {
  variants: {
    tone: {
      neutral: 'bg-muted text-muted-foreground',
      success: 'bg-success/10 text-success',
      warning: 'bg-warning/10 text-warning',
      danger: 'bg-danger/10 text-danger',
      info: 'bg-info/10 text-info',
    },
    size: { sm: 'px-2 py-0.5 text-xs', md: 'px-2.5 py-1 text-sm' },
  },
  defaultVariants: { tone: 'neutral', size: 'sm' },
});

export interface StatusBadgeProps extends ComponentProps<'span'>, VariantProps<typeof badge> {}

/**
 * Status is a colour **and** a label, always (docs/16 section 6).
 *
 * The children are the label and are not optional by convention: this product
 * is printed in black and white constantly, and roughly 8% of men cannot
 * distinguish the red from the green.
 */
export function StatusBadge({ className, tone, size, ...props }: StatusBadgeProps) {
  return <span className={cn(badge({ tone, size }), className)} {...props} />;
}
