import { SCHOOL_LEVEL_IDS, type SchoolLevelId } from '@ilm/contracts';

/** Coerce stored level strings to known ids (profile / school settings). */
export function parseSchoolLevels(values: readonly string[]): SchoolLevelId[] {
  return values.filter((value): value is SchoolLevelId =>
    (SCHOOL_LEVEL_IDS as readonly string[]).includes(value),
  );
}
