import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';

import { SpinnerIcon } from '../icons';
import { cn } from '../lib/cn';

/**
 * docs/16 section 4: variants are `cva`, never a chain of ternaries in JSX;
 * every component takes `className`; native props are spread, because a
 * `<Button>` that cannot take `type="submit"` is broken.
 *
 * Sizes respect the 44px touch-target minimum on anything a teacher taps
 * (docs/16 section 5) — `default` is 40px for dense desktop chrome, `touch` is
 * the one to use on mobile-first screens.
 */
const button = cva(
  [
    'inline-flex items-center justify-center gap-2 rounded-md font-medium',
    'transition-colors duration-150',
    // Never `outline: none` without a replacement (docs/16 section 13).
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    'focus-visible:ring-offset-2 focus-visible:ring-offset-background',
    'disabled:pointer-events-none disabled:opacity-50',
    '[&_svg]:shrink-0',
  ],
  {
    variants: {
      tone: {
        primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
        secondary: 'bg-muted text-foreground hover:bg-muted/80',
        outline: 'border border-border bg-background hover:bg-muted',
        ghost: 'hover:bg-muted',
        danger: 'bg-danger text-primary-foreground hover:bg-danger/90',
      },
      size: {
        sm: 'h-8 px-3 text-xs',
        default: 'h-10 px-4 text-sm',
        touch: 'h-11 px-4 text-sm',
        icon: 'size-10',
      },
    },
    defaultVariants: { tone: 'primary', size: 'default' },
  },
);

export interface ButtonProps extends ComponentProps<'button'>, VariantProps<typeof button> {
  /**
   * Disables the button and shows a spinner.
   *
   * docs/16 section 7: a button that can be double-clicked into a double
   * payment is a bug, not a UX detail — so pending state is built in rather
   * than left to each call site to remember.
   */
  isPending?: boolean;
}

export function Button({
  className,
  tone,
  size,
  isPending = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(button({ tone, size }), className)}
      disabled={disabled === true || isPending}
      aria-busy={isPending || undefined}
      {...props}
    >
      {isPending ? <SpinnerIcon className="size-4 animate-spin" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

export { button as buttonVariants };
