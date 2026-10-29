'use client';

import {
  ACCESS_MODULES,
  isGrantedWith,
  PERMISSION_GRANT,
  type EffectiveGrants,
  type Permission,
  type PermissionOverrides,
} from '@ilm/contracts';
import { cardSurfaceClassName, Checkbox, cn, StatusBadge } from '@ilm/ui';

/**
 * Every customisable permission, grouped by the part of the product it opens,
 * as a checkbox against what it starts from.
 *
 * Checkboxes, not switches: nothing here applies until the save bar is used,
 * and a switch tells people their change has already landed (see `<Switch>`).
 *
 * The badges say *why* a box is in its state, because a ticked box alone does
 * not tell an administrator whether they did that or the role did: "Added" and
 * "Removed" are this school's changes, "Own classes" is a grant the role holds
 * only for the rows that are theirs.
 */
export function AccessPermissionGrid({
  base,
  overrides,
  editable,
  grantable,
  onToggle,
}: {
  /** What the permissions start from: the role default, or a person's roles. */
  readonly base: EffectiveGrants;
  readonly overrides: PermissionOverrides;
  readonly editable: boolean;
  /** What the signed-in person may hand out — only what they hold themselves. */
  readonly grantable: ReadonlySet<string>;
  readonly onToggle: (permission: Permission, on: boolean) => void;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
      {ACCESS_MODULES.map((module) => {
        const onCount = module.permissions.filter((entry) =>
          isGrantedWith(base, overrides, entry.permission),
        ).length;

        return (
          <section key={module.key} className={cn(cardSurfaceClassName, 'p-4')}>
            <header className="mb-2 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-foreground">{module.label}</h3>
              <span className="text-xs text-muted-foreground tabular-nums">
                {onCount} of {module.permissions.length} on
              </span>
            </header>

            <ul className="divide-y divide-border/60">
              {module.permissions.map((entry) => {
                const id = `access-${module.key}-${entry.permission}`;
                const checked = isGrantedWith(base, overrides, entry.permission);
                const added = overrides.grant.includes(entry.permission);
                const removed = overrides.revoke.includes(entry.permission);
                // Turning on something you do not hold yourself is refused by the
                // API; the box says so up front rather than after a save.
                const blocked = !checked && !grantable.has(entry.permission);
                const disabled = !editable || blocked;

                return (
                  <li key={entry.permission}>
                    <label
                      htmlFor={id}
                      title={
                        blocked && editable ? 'You can only give access you have yourself.' : undefined
                      }
                      className={cn(
                        'flex min-h-11 items-center gap-3 py-2',
                        disabled ? 'cursor-not-allowed' : 'cursor-pointer',
                      )}
                    >
                      <Checkbox
                        id={id}
                        checked={checked}
                        disabled={disabled}
                        onCheckedChange={(next) => {
                          onToggle(entry.permission, next === true);
                        }}
                      />
                      <span
                        className={cn(
                          'min-w-0 flex-1 text-sm',
                          disabled ? 'text-muted-foreground' : 'text-foreground',
                        )}
                      >
                        {entry.label}
                      </span>
                      {added ? (
                        <StatusBadge tone="success">Added</StatusBadge>
                      ) : removed ? (
                        <StatusBadge tone="warning">Removed</StatusBadge>
                      ) : checked && base.get(entry.permission) === PERMISSION_GRANT.SCOPED ? (
                        <StatusBadge>Own classes</StatusBadge>
                      ) : null}
                    </label>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
