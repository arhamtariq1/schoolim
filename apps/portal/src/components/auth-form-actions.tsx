import type { ReactNode } from 'react';

import { AuthOrDivider } from './auth-or-divider';

/** Primary button + optional “Or” rule + centered footer (sign-up pattern). */
export function AuthFormActions({
  nav,
  children,
  footer,
  showDivider = true,
}: {
  readonly nav?: ReactNode;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
  readonly showDivider?: boolean;
}) {
  return (
    <div className="space-y-3.5">
      {nav === undefined ? null : nav}
      {children}
      {footer === undefined ? null : (
        <>
          {showDivider ? <AuthOrDivider /> : null}
          {footer}
        </>
      )}
    </div>
  );
}
