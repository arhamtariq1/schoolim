import type { ReactNode } from 'react';

/** Dashboard-style page title block for workspace list screens. */
export function WorkspacePageHeader({
  title,
  description,
  actions,
  actionsBelow,
}: {
  title: string;
  description?: ReactNode;
  /** Right of the title on wide screens — prefer `actionsBelow` for primary page actions. */
  actions?: ReactNode;
  /** Full-width row under the title and description (e.g. Add session). */
  actionsBelow?: ReactNode;
}) {
  return (
    <header className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
            {title}
          </h1>
          {description === undefined ? null : (
            <p className="text-sm text-muted-foreground md:text-base">{description}</p>
          )}
        </div>
        {actions === undefined ? null : (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        )}
      </div>
      {actionsBelow === undefined ? null : (
        <div className="flex flex-wrap items-center justify-end gap-2">{actionsBelow}</div>
      )}
    </header>
  );
}
