import { z } from 'zod';

/** Stable ids for school levels — stored in `schools.school_levels`. */
export const SCHOOL_LEVEL_IDS = [
  'pre-school',
  'primary',
  'middle',
  'secondary',
  'higher-secondary',
  'o-level',
  'a-level',
] as const;

export type SchoolLevelId = (typeof SCHOOL_LEVEL_IDS)[number];

export const schoolLevelSchema = z.enum(SCHOOL_LEVEL_IDS);

export const schoolLevelsSchema = z
  .array(schoolLevelSchema)
  .min(1, 'Select at least one school level.');

export const SCHOOL_LEVEL_LABELS: Record<SchoolLevelId, string> = {
  'pre-school': 'Pre-School',
  primary: 'Primary',
  middle: 'Middle',
  secondary: 'Secondary',
  'higher-secondary': 'Higher Secondary',
  'o-level': 'O-Level',
  'a-level': 'A-Level',
};
