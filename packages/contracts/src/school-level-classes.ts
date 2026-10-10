import { z } from 'zod';

import { textSchema } from './primitives';
import { SCHOOL_LEVEL_IDS, type SchoolLevelId } from './school-levels';

/** Default O-Level class names when the school has not customised them. */
export const DEFAULT_O_LEVEL_CLASS_NAMES = ['O1', 'O2', 'O3'] as const;

/** Default A-Level class names when the school has not customised them. */
export const DEFAULT_A_LEVEL_CLASS_NAMES = ['AS Level', 'A2 Level'] as const;

export const levelClassNamesSchema = z
  .object({
    oLevelClassNames: z.array(textSchema(60)).default([]),
    aLevelClassNames: z.array(textSchema(60)).default([]),
  })
  .strict();

export type LevelClassNames = z.infer<typeof levelClassNamesSchema>;

export type GeneratedClassLevel = {
  readonly name: string;
  readonly numericOrder: number;
};

/** Base sort band per level so promotion can walk classes in teaching order. */
const LEVEL_BASE_ORDER: Record<SchoolLevelId, number> = {
  'pre-school': 0,
  primary: 10,
  middle: 20,
  secondary: 30,
  'higher-secondary': 40,
  'o-level': 50,
  'a-level': 60,
};

const FIXED_LEVEL_CLASSES: Record<
  Exclude<SchoolLevelId, 'o-level' | 'a-level'>,
  readonly { readonly name: string; readonly orderOffset: number }[]
> = {
  'pre-school': [
    { name: 'Playgroup', orderOffset: 0 },
    { name: 'Nursery', orderOffset: 1 },
    { name: 'KG', orderOffset: 2 },
  ],
  primary: [
    { name: 'Class 1', orderOffset: 0 },
    { name: 'Class 2', orderOffset: 1 },
    { name: 'Class 3', orderOffset: 2 },
    { name: 'Class 4', orderOffset: 3 },
    { name: 'Class 5', orderOffset: 4 },
  ],
  middle: [
    { name: 'Class 6', orderOffset: 0 },
    { name: 'Class 7', orderOffset: 1 },
    { name: 'Class 8', orderOffset: 2 },
  ],
  secondary: [
    { name: 'Class 9', orderOffset: 0 },
    { name: 'Class 10', orderOffset: 1 },
  ],
  'higher-secondary': [
    { name: 'Class 11', orderOffset: 0 },
    { name: 'Class 12', orderOffset: 1 },
  ],
};

function normalizeNames(values: readonly string[] | undefined, fallback: readonly string[]): string[] {
  const trimmed = (values ?? [])
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
  return trimmed.length === 0 ? [...fallback] : trimmed;
}

/**
 * Classes implied by the selected school levels.
 *
 * Names are deduplicated case-insensitively so overlapping selections (for
 * example Higher Secondary and A-Level) never produce two rows with the same
 * label.
 */
export function classesForSchoolLevels(
  levels: readonly SchoolLevelId[],
  names: LevelClassNames = { oLevelClassNames: [], aLevelClassNames: [] },
): GeneratedClassLevel[] {
  const selected = new Set(levels);
  const seen = new Set<string>();
  const generated: GeneratedClassLevel[] = [];

  for (const level of SCHOOL_LEVEL_IDS) {
    if (!selected.has(level)) {
      continue;
    }

    const base = LEVEL_BASE_ORDER[level];
    let entries: GeneratedClassLevel[];

    if (level === 'o-level') {
      const labels = normalizeNames(names.oLevelClassNames, DEFAULT_O_LEVEL_CLASS_NAMES);
      entries = labels.map((name, index) => ({
        name,
        numericOrder: base + index,
      }));
    } else if (level === 'a-level') {
      const labels = normalizeNames(names.aLevelClassNames, DEFAULT_A_LEVEL_CLASS_NAMES);
      entries = labels.map((name, index) => ({
        name,
        numericOrder: base + index,
      }));
    } else {
      entries = FIXED_LEVEL_CLASSES[level].map((entry) => ({
        name: entry.name,
        numericOrder: base + entry.orderOffset,
      }));
    }

    for (const entry of entries) {
      const key = entry.name.toLowerCase();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      generated.push(entry);
    }
  }

  generated.sort(
    (left, right) =>
      left.numericOrder - right.numericOrder || left.name.localeCompare(right.name),
  );
  return generated;
}
