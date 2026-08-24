import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge class names, with later Tailwind utilities winning over earlier ones.
 *
 * docs/16 section 4: **every component takes `className` and merges it with
 * `cn()`.** No exceptions — this is what makes the design system usable instead
 * of a cage. Without `twMerge`, a caller passing `p-6` to a component that
 * already sets `p-4` gets both classes and whichever CSS order decides, which
 * is why plain string concatenation is not good enough.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
