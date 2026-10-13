import type { ToastApi } from './components/toast';

/** One toast when client-side validation fails — never one toast per field. */
export const FORM_VALIDATION_TOAST = 'Please check the highlighted fields below.';

export const NETWORK_ERROR_TOAST =
  'Check your internet connection and try again.' as const;

/** Deduped via toast id inside {@link ToastApi}. */
export function showFormValidationToast(
  toast: Pick<ToastApi, 'error'>,
  message: string = FORM_VALIDATION_TOAST,
): void {
  toast.error(message);
}

export function showNetworkErrorToast(toast: Pick<ToastApi, 'error'>): void {
  toast.error(NETWORK_ERROR_TOAST);
}

/** Shows one line: server detail when present, otherwise fallback or title. */
export function showApiErrorToast(
  toast: Pick<ToastApi, 'error'>,
  title: string,
  detail?: string | undefined,
  fallbackDetail?: string,
): void {
  toast.error(detail ?? fallbackDetail ?? title);
}
