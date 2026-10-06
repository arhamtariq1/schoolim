import { Button } from '@ilm/ui';
import type { ReactNode } from 'react';

/** Primary / secondary actions aligned like the reference profile editor footer. */
export function ProfileFormActions({
  primaryLabel,
  primaryPending = false,
  onCancel,
  cancelLabel = 'Cancel',
  hint,
}: {
  primaryLabel: string;
  primaryPending?: boolean;
  cancelLabel?: string;
  onCancel?: () => void;
  hint?: ReactNode;
}) {
  return (
    <div className="flex flex-col-reverse gap-4 pt-2 sm:flex-row sm:items-center sm:justify-between">
      {hint === undefined ? <span className="hidden sm:block" /> : (
        <p className="text-sm text-muted-foreground">{hint}</p>
      )}
      <div className="flex flex-wrap justify-end gap-3">
        {onCancel === undefined ? null : (
          <Button type="button" tone="outline" disabled={primaryPending} onClick={onCancel}>
            {cancelLabel}
          </Button>
        )}
        <Button type="submit" disabled={primaryPending} className="min-w-36">
          {primaryPending ? 'Saving…' : primaryLabel}
        </Button>
      </div>
    </div>
  );
}
