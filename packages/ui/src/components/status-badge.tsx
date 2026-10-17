import { cva, type VariantProps } from 'class-variance-authority';
import type { LucideIcon } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';

import { cn } from '../lib/cn';
import { ErrorIcon, InfoIcon, SuccessIcon, WarningIcon } from '../icons';

/**
 * The one status badge design — the Students table's (`rounded-md`, `px-2.5
 * py-1`, `text-xs font-medium`, a 16px glyph). Every list, detail screen and
 * card takes it from here rather than restating it, so a status looks the same
 * wherever it appears and a change is one edit.
 */
const badge = cva('inline-flex items-center gap-1.5 rounded-md font-medium', {
  variants: {
    tone: {
      // The brand colour, not gray: a status that is neither good, bad nor a
      // warning is still a status, and gray reads as "disabled". `primary` has a
      // separate dark-mode value, so this holds in both themes.
      neutral: 'bg-primary/10 text-primary',
      success: 'bg-success/10 text-success',
      warning: 'bg-warning/10 text-warning',
      danger: 'bg-danger/10 text-danger',
      info: 'bg-info/10 text-info',
      // Categorical colours, for telling roles or kinds apart where no
      // good/bad meaning is intended.
      violet: 'bg-violet/10 text-violet',
      pink: 'bg-pink/10 text-pink',
      orange: 'bg-orange/10 text-orange',
      teal: 'bg-teal/10 text-teal',
      indigo: 'bg-indigo/10 text-indigo',
      slate: 'bg-slate/10 text-slate',
      cyan: 'bg-cyan/10 text-cyan',
    },
    size: { sm: 'px-2.5 py-1 text-xs', md: 'px-3 py-1.5 text-sm' },
  },
  defaultVariants: { tone: 'neutral', size: 'sm' },
});

export type StatusTone = NonNullable<VariantProps<typeof badge>['tone']>;

export interface StatusBadgeProps extends ComponentProps<'span'>, VariantProps<typeof badge> {
  /** Override tone default; omit to use {@link statusToneIcon}. */
  icon?: LucideIcon;
  /** Set false to hide the icon (rare — prefer a tone default). */
  showIcon?: boolean;
}

/**
 * Default icon for a badge tone when no domain-specific glyph is needed.
 */
export function statusToneIcon(tone: StatusTone | null | undefined): LucideIcon {
  switch (tone) {
    case 'success':
      return SuccessIcon;
    case 'warning':
      return WarningIcon;
    case 'danger':
      return ErrorIcon;
    case 'info':
      return InfoIcon;
    default:
      return InfoIcon;
  }
}

/**
 * Status is a colour **and** a label, always (docs/16 section 6).
 *
 * The children are the label and are not optional by convention: this product
 * is printed in black and white constantly, and roughly 8% of men cannot
 * distinguish the red from the green.
 */
export function StatusBadge({
  className,
  tone,
  size,
  icon: Icon,
  showIcon = true,
  children,
  ...props
}: StatusBadgeProps) {
  const ResolvedIcon = Icon ?? statusToneIcon(tone);

  return (
    <span className={cn(badge({ tone, size }), className)} {...props}>
      {showIcon ? (
        <ResolvedIcon className="size-4 shrink-0 opacity-90" aria-hidden="true" />
      ) : null}
      <span>{children as ReactNode}</span>
    </span>
  );
}
