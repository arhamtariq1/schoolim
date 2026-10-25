'use client';

import { Field, Input } from '@ilm/ui';

import {
  aLevelNamesForForm,
  oLevelNamesForForm,
} from '@/components/school-level-class-preview';

type LevelClassMappingFieldsProps = {
  oLevelSelected: boolean;
  aLevelSelected: boolean;
  oLevelClassNames: readonly string[];
  aLevelClassNames: readonly string[];
  onChange: (patch: { oLevelClassNames?: string[]; aLevelClassNames?: string[] }) => void;
  disabled?: boolean;
};

function parseCommaList(value: string): string[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
}

export function LevelClassMappingFields({
  oLevelSelected,
  aLevelSelected,
  oLevelClassNames,
  aLevelClassNames,
  onChange,
  disabled = false,
}: LevelClassMappingFieldsProps) {
  if (!oLevelSelected && !aLevelSelected) {
    return null;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {oLevelSelected ? (
        <Field
          label="O-Level classes"
          hint="Comma-separated names, in teaching order."
        >
          <Input
            disabled={disabled}
            value={oLevelNamesForForm(oLevelClassNames).join(', ')}
            placeholder="O1, O2, O3"
            onChange={(event) => {
              onChange({ oLevelClassNames: parseCommaList(event.target.value) });
            }}
          />
        </Field>
      ) : null}

      {aLevelSelected ? (
        <Field
          label="A-Level classes"
          hint="Comma-separated names, in teaching order."
        >
          <Input
            disabled={disabled}
            value={aLevelNamesForForm(aLevelClassNames).join(', ')}
            placeholder="AS Level, A2 Level"
            onChange={(event) => {
              onChange({ aLevelClassNames: parseCommaList(event.target.value) });
            }}
          />
        </Field>
      ) : null}
    </div>
  );
}
