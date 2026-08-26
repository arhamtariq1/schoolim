'use client';

import * as ToastPrimitive from '@radix-ui/react-toast';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import { ErrorIcon, SuccessIcon, WarningIcon } from '../icons';
import { cn } from '../lib/cn';

/**
 * Confirmation that something happened.
 *
 * docs/16 §7: every mutation must visibly resolve. Without this, saving a form
 * inside a dialog closes the dialog and looks identical to the dialog being
 * dismissed — the person cannot tell whether the record saved, so they do it
 * again.
 *
 * Radix rather than a fixed-position div: it renders in an ARIA live region so
 * a screen reader announces it, pauses the timer on hover and on window blur so
 * a message is not missed while someone is looking elsewhere, and supports
 * swipe-to-dismiss on touch.
 *
 * **Errors do not auto-dismiss.** A success message may disappear — the change
 * is visible in the list behind it. A failure must not, because it is the only
 * evidence that the thing did not happen.
 */

export type ToastTone = 'success' | 'error' | 'warning';

export interface ToastMessage {
  readonly id: number;
  readonly tone: ToastTone;
  readonly title: string;
  readonly description?: string | undefined;
}

interface ToastContextValue {
  readonly show: (toast: Omit<ToastMessage, 'id'>) => void;
  readonly success: (title: string, description?: string) => void;
  readonly error: (title: string, description?: string) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

/**
 * Throws when used outside the provider, deliberately.
 *
 * A silent no-op would mean a screen that looks finished and quietly tells the
 * user nothing — which is the exact failure this component exists to prevent.
 */
export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (context === undefined) {
    throw new Error('useToast must be used inside <ToastProvider>. Add it to the app shell.');
  }
  return context;
}

const TONE_STYLES: Record<ToastTone, { border: string; icon: ReactNode }> = {
  success: {
    border: 'border-success/40',
    icon: <SuccessIcon className="size-5 shrink-0 text-success" aria-hidden="true" />,
  },
  error: {
    border: 'border-danger/40',
    icon: <ErrorIcon className="size-5 shrink-0 text-danger" aria-hidden="true" />,
  },
  warning: {
    border: 'border-warning/40',
    icon: <WarningIcon className="size-5 shrink-0 text-warning" aria-hidden="true" />,
  },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const show = useCallback((toast: Omit<ToastMessage, 'id'>) => {
    // Date.now() would collide when two toasts fire in the same millisecond,
    // and React would then reuse one DOM node for both.
    setToasts((current) => [...current, { ...toast, id: (current.at(-1)?.id ?? 0) + 1 }]);
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({
      show,
      success: (title, description) => {
        show({ tone: 'success', title, description });
      },
      error: (title, description) => {
        show({ tone: 'error', title, description });
      },
    }),
    [show],
  );

  return (
    <ToastContext.Provider value={value}>
      <ToastPrimitive.Provider swipeDirection="right" duration={5000}>
        {children}

        {toasts.map((toast) => (
          <ToastPrimitive.Root
            key={toast.id}
            // An error stays until dismissed: it is the only evidence the
            // action failed.
            duration={toast.tone === 'error' ? Infinity : 5000}
            onOpenChange={(open) => {
              if (!open) {
                setToasts((current) => current.filter((entry) => entry.id !== toast.id));
              }
            }}
            className={cn(
              'flex items-start gap-3 rounded-md border bg-background p-4 shadow-lg',
              TONE_STYLES[toast.tone].border,
              'data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom-2',
              'data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
              'data-[swipe=end]:animate-out data-[swipe=end]:fade-out-0',
            )}
          >
            {TONE_STYLES[toast.tone].icon}

            <div className="min-w-0 flex-1">
              <ToastPrimitive.Title className="text-sm font-medium">
                {toast.title}
              </ToastPrimitive.Title>
              {toast.description === undefined ? null : (
                <ToastPrimitive.Description className="mt-0.5 text-sm text-muted-foreground">
                  {toast.description}
                </ToastPrimitive.Description>
              )}
            </div>

            <ToastPrimitive.Close
              className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Dismiss"
            >
              <span aria-hidden="true">×</span>
            </ToastPrimitive.Close>
          </ToastPrimitive.Root>
        ))}

        <ToastPrimitive.Viewport
          className={cn(
            'fixed end-0 bottom-0 z-100 flex max-h-dvh w-full flex-col gap-2 p-4',
            'sm:max-w-sm',
          )}
        />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}
