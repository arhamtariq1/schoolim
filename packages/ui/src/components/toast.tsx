'use client';

import { type ReactNode } from 'react';
import { Toaster as SonnerToaster, toast as sonner } from 'sonner';

/**
 * Toasts, on **sonner** — the library docs/16 §2 locks in.
 *
 * This was a hand-rolled provider with its own reducer, portal and animation.
 * It worked, and it was still the wrong call: the design system names sonner,
 * and a bespoke reimplementation of a locked library is exactly how a component
 * set stops being one. sonner also brings the things a hand-rolled version gets
 * to last — stacking, swipe-to-dismiss, hover-to-pause, screen-reader
 * announcement, reduced-motion.
 *
 * The **`useToast()` shape is unchanged** so no call site had to move. That is
 * the point of having wrapped it: thirty call sites across thirteen files kept
 * working, and swapping the implementation was one file.
 *
 * ## Two decisions worth keeping
 *
 * **Top right.** Where this product's users expect it, and out of the way of
 * the primary action, which on nearly every screen here sits bottom-right.
 *
 * **Errors do not auto-dismiss.** A success may disappear — the change is
 * visible in the list behind it. A failure must not, because it is the only
 * evidence the thing did not happen.
 */

export type ToastTone = 'success' | 'error' | 'warning';

export interface ToastMessage {
  readonly tone: ToastTone;
  readonly title: string;
  readonly description?: string | undefined;
}

export interface ToastApi {
  readonly show: (toast: ToastMessage) => void;
  readonly success: (title: string, description?: string) => void;
  readonly error: (title: string, description?: string) => void;
  readonly warning: (title: string, description?: string) => void;
}

/**
 * No context, no provider lookup — sonner's `toast()` is callable anywhere.
 *
 * The hook stays because every call site uses it, and because it keeps the
 * option open of swapping the implementation again without touching them.
 */
export function useToast(): ToastApi {
  return TOAST;
}

const TOAST: ToastApi = {
  show: ({ tone, title, description }) => {
    const options = description === undefined ? {} : { description };
    if (tone === 'success') {
      sonner.success(title, options);
    } else if (tone === 'error') {
      // `duration: Infinity` — see the note above. It stays until dismissed.
      sonner.error(title, { ...options, duration: Infinity });
    } else {
      sonner.warning(title, options);
    }
  },
  success: (title, description) => {
    TOAST.show({ tone: 'success', title, ...(description === undefined ? {} : { description }) });
  },
  error: (title, description) => {
    TOAST.show({ tone: 'error', title, ...(description === undefined ? {} : { description }) });
  },
  warning: (title, description) => {
    TOAST.show({ tone: 'warning', title, ...(description === undefined ? {} : { description }) });
  },
};

/**
 * Mounted once at the root.
 *
 * Kept named `ToastProvider` so `app/layout.tsx` did not have to change, and
 * because it still is one conceptually — it just no longer carries state. It
 * accepts children so the existing `<ToastProvider>{children}</ToastProvider>`
 * shape still reads naturally.
 */
export function ToastProvider({ children }: { children?: ReactNode }) {
  return (
    <>
      {children}
      <SonnerToaster
        position="top-right"
        closeButton
        // Semantic tokens, never raw colour (docs/16 §6), so toasts follow the
        // school's branding and dark mode along with everything else.
        toastOptions={{
          classNames: {
            toast: 'group rounded-xl border border-border bg-card text-foreground shadow-lg gap-3',
            title: 'text-sm font-medium',
            description: 'text-sm text-muted-foreground',
            actionButton: 'bg-primary text-primary-foreground',
            cancelButton: 'bg-muted text-muted-foreground',
            closeButton: 'bg-card border-border text-muted-foreground hover:text-foreground',
            success: 'border-success/40 [&_[data-icon]]:text-success',
            error: 'border-danger/40 [&_[data-icon]]:text-danger',
            warning: 'border-warning/40 [&_[data-icon]]:text-warning',
          },
        }}
      />
    </>
  );
}
