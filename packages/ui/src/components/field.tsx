import type { LucideIcon } from 'lucide-react';
import { type ComponentProps, type ReactElement, cloneElement, useId } from 'react';

import { cn } from '../lib/cn';

import { InputIconWrap } from './input-icon-wrap';
import { Label } from './input';
import { PasswordInput } from './password-input';

function fieldUsesInlineLeadingIcon(child: ReactElement): boolean {
  return child.type === PasswordInput;
}

/**
 * A labelled form field with its error wired up.
 *
 * docs/16 §8 requires a `<Label htmlFor>` and an error linked by
 * `aria-describedby` on every input. Doing that by hand at each call site is
 * how it gets forgotten, so this component generates the ids and applies both.
 *
 * The error is announced politely rather than assertively: a screen-reader user
 * tabbing through a form should not be interrupted mid-field.
 */
export interface FieldProps extends Omit<ComponentProps<'div'>, 'children'> {
  label: string;
  /** Server- or client-side message. Absent means valid. */
  error?: string | undefined;
  hint?: string | undefined;
  required?: boolean;
  /** Same inset icon pattern as admission forms (`InputIconWrap`). */
  leadingIcon?: LucideIcon;
  /** Use for textareas — icon aligns to the first line. */
  leadingIconAlignTop?: boolean;
  children: ReactElement<{
    id?: string;
    className?: string;
    'aria-describedby'?: string;
    'aria-invalid'?: boolean;
    required?: boolean;
  }>;
}

export function Field({
  label,
  error,
  hint,
  required = false,
  leadingIcon,
  leadingIconAlignTop = false,
  children,
  className,
  ...props
}: FieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  const describedBy = [
    error === undefined ? undefined : errorId,
    hint === undefined ? undefined : hintId,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={cn('space-y-1.5', className)} {...props}>
      <Label htmlFor={id}>
        {label}
        {required ? (
          <span className="ms-1 text-danger" aria-hidden="true">
            *
          </span>
        ) : null}
      </Label>

      {(() => {
        const passLeadingIcon =
          leadingIcon !== undefined && fieldUsesInlineLeadingIcon(children)
            ? { leadingIcon }
            : {};
        const control = cloneElement(children, {
          id,
          required,
          'aria-invalid': error !== undefined,
          ...(describedBy === '' ? {} : { 'aria-describedby': describedBy }),
          className: children.props.className,
          ...passLeadingIcon,
        });
        if (leadingIcon === undefined || fieldUsesInlineLeadingIcon(children)) {
          return control;
        }
        return (
          <InputIconWrap icon={leadingIcon} alignTop={leadingIconAlignTop}>
            {control}
          </InputIconWrap>
        );
      })()}

      {hint === undefined ? null : (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error === undefined ? null : (
        <p id={errorId} role="alert" aria-live="polite" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
