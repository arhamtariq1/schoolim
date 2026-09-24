import { Slot } from '@radix-ui/react-slot';
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
    'inline-flex cursor-pointer items-center justify-center gap-2 rounded-md font-medium',
    'transition-colors duration-150',
    // Never `outline: none` without a replacement (docs/16 section 13).
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    'focus-visible:ring-offset-2 focus-visible:ring-offset-background',
    'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
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
  /**
   * Render the child element with this button's styling instead of a `<button>`.
   *
   * For the case where the thing being pressed is a **navigation**, not an
   * action: "Admit student" opens a page, so it has to be an `<a>` — middle
   * click, open-in-new-tab, and a status bar showing where it goes all stop
   * working the moment it becomes a `<button>` with an `onClick`. Styling a
   * `<Link>` by hand instead would fork the button's appearance into a second
   * place, which is how a design system quietly stops being one (docs/16 §1).
   *
   * `isPending` is meaningless here — a link does not pend — and is ignored.
   */
  asChild?: boolean;
}

export function Button({
  className,
  tone,
  size,
  isPending = false,
  disabled,
  asChild = false,
  children,
  ...props
}: ButtonProps) {
  // Two returns rather than one with conditionals inside, because Radix's Slot
  // requires **exactly one** element child — and `{null}{children}` is two, so
  // a shared body that renders a spinner slot at all throws "Slot failed to
  // slot onto its children" the moment `asChild` is used. Splitting them makes
  // that impossible rather than merely avoided.
  if (asChild) {
    return (
      <Slot className={cn(button({ tone, size }), className)} {...props}>
        {children}
      </Slot>
    );
  }

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
