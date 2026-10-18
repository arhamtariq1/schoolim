'use client';

import { type ReactNode } from 'react';
import { Toaster as SonnerToaster, toast as sonner } from 'sonner';

/**
 * Toasts on **sonner** (docs/16 §2). Top-center, semantic tones, deduped by id.
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

const TOAST_MS = 3_500;

function toastId(tone: ToastTone, title: string, description?: string): string {
  return `${tone}:${title}:${description ?? ''}`;
}

function push(tone: ToastTone, title: string, description?: string) {
  const id = toastId(tone, title, description);
  const options = {
    duration: TOAST_MS,
    id,
  };

  // Title only in the UI; optional description is for dedupe ids and call-site copy only.
  if (tone === 'success') {
    sonner.success(title, options);
    return;
  }
  if (tone === 'error') {
    sonner.error(title, options);
    return;
  }
  sonner.warning(title, options);
}

/** No context — sonner's `toast()` is callable anywhere. */
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
          align-items: center !important;
          column-gap: 0.625rem !important;
          row-gap: 0 !important;
          padding: 0.625rem 0.875rem !important;
          width: auto !important;
          min-width: min(18rem, calc(100vw - 2rem)) !important;
          max-width: min(24rem, calc(100vw - 2rem)) !important;
        }
        /* Sonner paints toasts from its own variables, white unless told otherwise.
           Pointing them at the theme makes a toast a card in light and in dark mode. */
        [data-sonner-toaster] {
          --normal-bg: var(--card);
          --normal-text: var(--fg);
          --normal-border: var(--border);
        }
        [data-sonner-toaster] [data-close-button] svg {
          width: 0.75rem !important;
          height: 0.75rem !important;
          stroke: currentColor !important;
        }
        [data-sonner-toaster] [data-icon] {
          grid-column: 1 !important;
          grid-row: 1 !important;
          align-self: center !important;
          width: 1.25rem !important;
          height: 1.25rem !important;
          margin: 0 !important;
        }
        [data-sonner-toast] [data-content] {
          grid-column: 2 !important;
          grid-row: 1 !important;
          align-self: center !important;
          justify-self: start !important;
          min-width: 0 !important;
          max-width: 100% !important;
          padding: 0 !important;
          margin: 0 !important;
          text-align: start !important;
        }
        [data-sonner-toast] [data-title] {
          text-align: start !important;
          width: 100% !important;
          line-height: 1.35 !important;
          margin: 0 !important;
          overflow-wrap: anywhere;
          word-break: break-word;
        }
        [data-sonner-toast] [data-description] {
          display: none !important;
        }
        [data-sonner-toaster] [data-close-button] {
          grid-column: 3 !important;
          grid-row: 1 !important;
          align-self: center !important;
          position: static !important;
          inset: auto !important;
          transform: none !important;
          margin: 0 !important;
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
      `}</style>
      <SonnerToaster
        position="top-center"
        expand={false}
        closeButton
        richColors={false}
        duration={TOAST_MS}
        offset={16}
        gap={10}
        visibleToasts={3}
        toastOptions={{
          duration: TOAST_MS,
          classNames: {
            toast:
              'group rounded-lg border border-border bg-card text-foreground shadow-md',
            title: 'text-sm font-medium text-foreground',
            description: 'text-muted-foreground',
            icon: 'shrink-0',
            content: 'min-w-0 flex-1',
            closeButton: 'shrink-0',
          },
        }}
      />
    </>
  );
}
