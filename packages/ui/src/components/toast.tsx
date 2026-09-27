'use client';

import { type ReactNode } from 'react';
import { Toaster as SonnerToaster, toast as sonner } from 'sonner';

/**
 * Toasts, on **sonner** — the library docs/16 §2 locks in.
 *
 * ## Placement and surface
 *
 * **Top right**, minimal card: white (`bg-card`), thin border, soft shadow,
 * status icon on the left, dismiss control on the right. Keeps the centre of
 * auth and work screens clear.
 *
 * ## Close control
 *
 * Sonner paints the dismiss button `position: absolute`, which is why long
 * titles ran under the ×. The styles below put it back in the flex row so the
 * text and the button never share the same pixels.
 *
 * ## Duration
 *
 * Every toast disappears after three seconds.
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

const TOAST_MS = 3_000;

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
    const options = {
      duration: TOAST_MS,
      ...(description === undefined ? {} : { description }),
    };
    if (tone === 'success') {
      sonner.success(title, options);
    } else if (tone === 'error') {
      sonner.error(title, options);
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
      <style>{`
        /* Three columns: icon | copy | dismiss. Absolute close was painting
           over the title; grid keeps each piece in its own cell. */
        [data-sonner-toast] {
          display: grid !important;
          grid-template-columns: auto minmax(0, 1fr) auto !important;
          align-items: start !important;
          column-gap: 0.75rem !important;
          row-gap: 0 !important;
          padding: 0.875rem 0.875rem 0.875rem 1rem !important;
          width: auto !important;
          min-width: 20rem !important;
          max-width: 24rem !important;
        }
        [data-sonner-toaster] [data-icon] {
          grid-column: 1 !important;
          grid-row: 1 !important;
          width: 1.25rem;
          height: 1.25rem;
          margin: 0.125rem 0 0 !important;
        }
        [data-sonner-toast] [data-content] {
          grid-column: 2 !important;
          grid-row: 1 !important;
          min-width: 0 !important;
          max-width: 100% !important;
          padding: 0 !important;
          margin: 0 !important;
        }
        [data-sonner-toaster] [data-close-button] {
          grid-column: 3 !important;
          grid-row: 1 !important;
          position: static !important;
          inset: auto !important;
          transform: none !important;
          margin: 0.125rem 0 0 !important;
          width: 1.5rem !important;
          height: 1.5rem !important;
          border-radius: 9999px !important;
          border: 1px solid var(--border) !important;
          background: var(--muted) !important;
          color: var(--muted-fg) !important;
        }
        [data-sonner-toaster] [data-close-button]:hover {
          background: var(--muted) !important;
          color: var(--fg) !important;
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
        [data-sonner-toast] [data-title],
        [data-sonner-toast] [data-description] {
          overflow-wrap: anywhere;
          word-break: break-word;
        }
      `}</style>
      <SonnerToaster
        position="top-right"
        closeButton
        duration={TOAST_MS}
        offset={16}
        gap={10}
        toastOptions={{
          duration: TOAST_MS,
          classNames: {
            toast:
              'group rounded-lg border border-border bg-card text-foreground shadow-md',
            title: 'text-sm font-normal text-foreground',
            description: 'text-sm text-muted-foreground',
            icon: 'shrink-0',
            content: 'min-w-0 flex-1',
            closeButton: 'shrink-0',
          },
        }}
      />
    </>
  );
}
