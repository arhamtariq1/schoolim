'use client';

import {
  classesForSchoolLevels,
  DEFAULT_A_LEVEL_CLASS_NAMES,
  DEFAULT_O_LEVEL_CLASS_NAMES,
  type SchoolLevelId,
} from '@ilm/contracts';

type SchoolLevelClassPreviewProps = {
  levels: readonly SchoolLevelId[];
  oLevelClassNames: readonly string[];
  aLevelClassNames: readonly string[];
};

export function SchoolLevelClassPreview({
  levels,
  oLevelClassNames,
  aLevelClassNames,
}: SchoolLevelClassPreviewProps) {
  if (levels.length === 0) {
    return null;
  }

  const classes = classesForSchoolLevels(levels, {
    oLevelClassNames: [...oLevelClassNames],
    aLevelClassNames: [...aLevelClassNames],
  });

  return (
    <div className="rounded-lg border border-border/70 bg-muted/20 p-4">
      <p className="text-sm font-medium text-foreground">Classes that will be created</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Saved when you submit this form. Existing classes are kept; only missing names are added.
      </p>
      <ul className="mt-3 flex flex-wrap gap-2">
        {classes.map((entry) => (
          <li
            key={entry.name}
            className="rounded-full border border-border bg-card px-2.5 py-0.5 text-xs font-medium text-foreground"
          >
            {entry.name}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function oLevelNamesForForm(stored: readonly string[]): string[] {
  return stored.length === 0 ? [...DEFAULT_O_LEVEL_CLASS_NAMES] : [...stored];
}

export function aLevelNamesForForm(stored: readonly string[]): string[] {
  return stored.length === 0 ? [...DEFAULT_A_LEVEL_CLASS_NAMES] : [...stored];
}
