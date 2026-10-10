import {
  classesForSchoolLevels,
  SCHOOL_LEVEL_IDS,
  SCHOOL_LEVEL_LABELS,
  type SchoolLevelId,
} from '@ilm/contracts';
import type { StatusTone } from '@ilm/ui';

const PRE_SCHOOL_AGE: Record<string, string> = {
  Playgroup: 'Age 3–4 years',
  Nursery: 'Age 4–5 years',
  KG: 'Age 5–6 years',
};

const LEVEL_TONE: Record<SchoolLevelId, StatusTone> = {
  'pre-school': 'danger',
  primary: 'info',
  middle: 'info',
  secondary: 'success',
  'higher-secondary': 'neutral',
  'o-level': 'warning',
  'a-level': 'neutral',
};

const LEVEL_ICON_TONE: Record<SchoolLevelId, string> = {
  'pre-school': 'bg-danger/10 text-danger',
  primary: 'bg-info/10 text-info',
  middle: 'bg-primary/10 text-primary',
  secondary: 'bg-success/10 text-success',
  'higher-secondary': 'bg-muted text-muted-foreground',
  'o-level': 'bg-warning/10 text-warning',
  'a-level': 'bg-muted text-muted-foreground',
};

const NAME_TO_LEVEL = new Map<string, SchoolLevelId>();

for (const level of SCHOOL_LEVEL_IDS) {
  for (const entry of classesForSchoolLevels([level])) {
    NAME_TO_LEVEL.set(entry.name.toLowerCase(), level);
  }
}

const LEVEL_BASE_ORDER: Record<SchoolLevelId, number> = {
  'pre-school': 0,
  primary: 10,
  middle: 20,
  secondary: 30,
  'higher-secondary': 40,
  'o-level': 50,
  'a-level': 60,
};

export type ClassDisplayMeta = {
  levelId: SchoolLevelId | null;
  levelLabel: string;
  tone: StatusTone;
  iconToneClass: string;
  iconCode: string;
  ageHint: string | undefined;
};

function levelFromNumericOrder(order: number): SchoolLevelId | null {
  if (order >= LEVEL_BASE_ORDER['a-level']) {
    return 'a-level';
  }
  if (order >= LEVEL_BASE_ORDER['o-level']) {
    return 'o-level';
  }
  if (order >= LEVEL_BASE_ORDER['higher-secondary']) {
    return 'higher-secondary';
  }
  if (order >= LEVEL_BASE_ORDER.secondary) {
    return 'secondary';
  }
  if (order >= LEVEL_BASE_ORDER.middle) {
    return 'middle';
  }
  if (order >= LEVEL_BASE_ORDER.primary) {
    return 'primary';
  }
  if (order >= LEVEL_BASE_ORDER['pre-school']) {
    return 'pre-school';
  }
  return null;
}

export function iconCodeForClassName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.toLowerCase() === 'playgroup') {
    return 'PG';
  }
  if (trimmed.toLowerCase() === 'nursery') {
    return 'N';
  }
  if (trimmed.toLowerCase() === 'kg') {
    return 'KG';
  }
  const classMatch = /^Class\s+(\d+)$/i.exec(trimmed);
  if (classMatch !== null) {
    return classMatch[1] ?? trimmed.slice(0, 2);
  }
  if (trimmed.length <= 3) {
    return trimmed.toUpperCase();
  }
  return trimmed.slice(0, 2).toUpperCase();
}

/** Promotion sequence: Playgroup → Nursery → KG → Class 1 → … (uses `numericOrder`). */
export function compareClassesByProgression(
  left: { name: string; numericOrder: number },
  right: { name: string; numericOrder: number },
): number {
  const byOrder = left.numericOrder - right.numericOrder;
  if (byOrder !== 0) {
    return byOrder;
  }
  return left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' });
}

export function classDisplayMeta(name: string, numericOrder: number): ClassDisplayMeta {
  const levelId = NAME_TO_LEVEL.get(name.trim().toLowerCase()) ?? levelFromNumericOrder(numericOrder);
  if (levelId === null) {
    return {
      levelId: null,
      levelLabel: 'Other',
      tone: 'neutral',
      iconToneClass: 'bg-muted text-muted-foreground',
      iconCode: iconCodeForClassName(name),
      ageHint: undefined,
    };
  }

  return {
    levelId,
    levelLabel: SCHOOL_LEVEL_LABELS[levelId],
    tone: LEVEL_TONE[levelId],
    iconToneClass: LEVEL_ICON_TONE[levelId],
    iconCode: iconCodeForClassName(name),
    ageHint: PRE_SCHOOL_AGE[name.trim()] ?? undefined,
  };
}
