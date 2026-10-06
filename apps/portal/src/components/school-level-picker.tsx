'use client';

import {
  SCHOOL_LEVEL_IDS,
  SCHOOL_LEVEL_LABELS,
  type SchoolLevelId,
} from '@ilm/contracts';
import { Checkbox, Field } from '@ilm/ui';

export function SchoolLevelPicker({
  value,
  onChange,
  error,
  disabled = false,
}: {
  value: readonly SchoolLevelId[];
  onChange: (next: SchoolLevelId[]) => void;
  error?: string | undefined;
  disabled?: boolean;
}) {
  function toggle(level: SchoolLevelId, checked: boolean): void {
    if (checked) {
      onChange([...value, level]);
      return;
    }
    onChange(value.filter((entry) => entry !== level));
  }

  return (
    <Field
      label="School level / type"
      error={error}
      hint="Select every level your school runs. You can change this later in Settings."
      required
    >
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {SCHOOL_LEVEL_IDS.map((level) => {
          const id = `school-level-${level}`;
          const checked = value.includes(level);
          return (
            <label
              key={level}
              htmlFor={id}
              className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-border/70 bg-background px-3 py-2.5 text-sm has-disabled:cursor-not-allowed has-disabled:opacity-60"
            >
              <Checkbox
                id={id}
                checked={checked}
                disabled={disabled}
                onCheckedChange={(next) => {
                  toggle(level, next === true);
                }}
              />
              <span className="text-foreground">{SCHOOL_LEVEL_LABELS[level]}</span>
            </label>
          );
        })}
      </div>
    </Field>
  );
}
