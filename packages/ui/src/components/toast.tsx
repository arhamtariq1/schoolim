'use client';

import { type ReactNode } from 'react';
import { Toaster as SonnerToaster, toast as sonner } from 'sonner';

/**
 * Toasts, on **sonner** — the library docs/16 §2 locks in.
 *
 * **Top center**, title only (no description line). Icon, left-aligned copy,
 * dismiss — same row as before.
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

function push(tone: ToastTone, title: string, description?: string) {
  const message =
    description === undefined || description === '' ? title : `${title} — ${description}`;
  const options = {
    duration: TOAST_MS,
  };
  if (tone === 'success') {
    sonner.success(message, options);
  } else if (tone === 'error') {
    sonner.error(message, options);
  } else {
    sonner.warning(message, options);
  }
}

/**
 * No context, no provider lookup — sonner's `toast()` is callable anywhere.
 */
export function useToast(): ToastApi {
  return TOAST;
}

const TOAST: ToastApi = {
  show: ({ tone, title, description }) => {
    push(tone, title, description);
  },
  success: (title, description) => {
    push('success', title, description);
  },
  error: (title, description) => {
    push('error', title, description);
  },
  warning: (title, description) => {
    push('warning', title, description);
  },
};

export function ToastProvider({ children }: { children?: ReactNode }) {
  return (
    <>
      {children}
      <style>{`
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
          text-align: left !important;
        }
        [data-sonner-toast] [data-title] {
          text-align: left !important;
          width: 100% !important;
        }
        [data-sonner-toast] [data-description] {
          display: none !important;
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
        [data-sonner-toast] [data-title],
        [data-sonner-toast] [data-description] {
          overflow-wrap: anywhere;
          word-break: break-word;
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
      `}</style>
      <SonnerToaster
        position="top-center"
        expand
        closeButton
        richColors={false}
        duration={TOAST_MS}
        offset={16}
        gap={12}
        visibleToasts={3}
        toastOptions={{
          duration: TOAST_MS,
          classNames: {
            toast:
              'group rounded-lg border border-border bg-card text-foreground shadow-md',
            title: 'text-sm font-normal text-foreground',
            description: 'hidden',
            icon: 'shrink-0',
            content: 'min-w-0 flex-1',
            closeButton: 'shrink-0',
          },
        }}
      />
    </>
  );
}
