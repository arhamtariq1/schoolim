'use client';

import { type ReactNode } from 'react';
import { Toaster as SonnerToaster, toast as sonner } from 'sonner';

/**
 * Toasts, on **sonner** — the library docs/16 §2 locks in.
 *
 * ## Placement and surface
 *
 * **Top right**, minimal card: white (`bg-card`), thin border, soft shadow,
 * status icon on the left, dismiss circle on the right. Keeps the centre of
 * auth and work screens clear.
 *
 * ## Errors do not auto-dismiss
 *
 * A success may disappear — the change is visible behind it. A failure must
 * not, because it is the only evidence the thing did not happen.
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
 * because it still is one conceptually — it just no longer carries state.
 */
export function ToastProvider({ children }: { children?: ReactNode }) {
  return (
    <>
      {children}
      {/* Sonner pins the dismiss control top-left by default; the reference
          puts a circular X on the right, vertically centred. */}
      <style>{`
        [data-sonner-toaster][data-x-position=right] [data-close-button] {
          left: auto !important;
          right: 0.75rem !important;
          top: 50% !important;
          transform: translateY(-50%) !important;
          width: 1.5rem !important;
          height: 1.5rem !important;
          border-radius: 9999px !important;
          border: 1px solid var(--border) !important;
          background: var(--muted) !important;
          color: var(--muted-fg) !important;
        }
        [data-sonner-toaster][data-x-position=right] [data-close-button]:hover {
          background: var(--muted) !important;
          color: var(--fg) !important;
        }
        [data-sonner-toaster][data-x-position=right] [data-icon] {
          width: 1.25rem;
          height: 1.25rem;
        }
        [data-sonner-toast][data-type=success] [data-icon] {
          color: var(--success);
        }
        [data-sonner-toast][data-type=error] [data-icon] {
          color: var(--danger);
        }
        [data-sonner-toast][data-type=warning] [data-icon] {
          color: var(--warning);
        }
      `}</style>
      <SonnerToaster
        position="top-right"
        closeButton
        offset={16}
        gap={10}
        toastOptions={{
          classNames: {
            toast:
              'group flex w-auto min-w-80 max-w-sm items-center gap-3 rounded-lg border border-border bg-card py-3.5 pr-12 pl-4 text-foreground shadow-md',
            title: 'text-sm font-normal text-foreground',
            description: 'text-sm text-muted-foreground',
            icon: 'mt-0 shrink-0',
            content: 'flex-1 gap-0.5',
          },
        }}
      />
    </>
  );
}
