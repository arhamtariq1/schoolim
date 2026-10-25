import { describe, expect, it } from 'vitest';

import { classesForSchoolLevels } from './school-level-classes';

describe('classesForSchoolLevels', () => {
  it('merges pre-school, primary and middle without duplicates', () => {
    const classes = classesForSchoolLevels(['pre-school', 'primary', 'middle']);
    expect(classes.map((entry) => entry.name)).toEqual([
      'Playgroup',
      'Nursery',
      'KG',
      'Class 1',
      'Class 2',
      'Class 3',
      'Class 4',
      'Class 5',
      'Class 6',
      'Class 7',
      'Class 8',
    ]);
  });

  it('uses custom O-Level and A-Level names when provided', () => {
    const classes = classesForSchoolLevels(['o-level', 'a-level'], {
      oLevelClassNames: ['Year 9', 'Year 10', 'Year 11'],
      aLevelClassNames: ['AS', 'A2'],
    });
    expect(classes.map((entry) => entry.name)).toEqual(['Year 9', 'Year 10', 'Year 11', 'AS', 'A2']);
  });

  it('deduplicates when higher secondary and a-level overlap by name', () => {
    const classes = classesForSchoolLevels(['higher-secondary', 'a-level'], {
      oLevelClassNames: [],
      aLevelClassNames: ['Class 11', 'Class 12', 'AS Level'],
    });
    expect(classes.map((entry) => entry.name)).toEqual(['Class 11', 'Class 12', 'AS Level']);
  });
});
