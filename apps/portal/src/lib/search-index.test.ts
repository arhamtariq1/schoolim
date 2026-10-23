import { describe, expect, it } from 'vitest';

import { classTopicHref, highlightRanges, searchTopics, splitHighlight, TOPICS } from './search-index';

const OFFICE = [
  'academics.structure.read',
  'exams.setup.manage',
  'exams.mark.create',
  'settings.school.configure',
  'fees.plan.read',
  'fees.voucher.read',
  'dashboard.workspace.read',
];

const titles = (term: string, permissions: readonly string[] = OFFICE) =>
  searchTopics(permissions, term).map((hit) => hit.topic.id);

describe('finding a word inside a page', () => {
  it('finds the class Subjects section and where subjects are managed for "subject"', () => {
    const found = titles('subject');
    expect(found).toContain('class-subjects');
    expect(found).toContain('marks-subjects');
  });

  it('treats a plural and a singular as the same word', () => {
    expect(titles('subjects')).toContain('class-subjects');
    expect(titles('late fees')).toContain('settings-late-fee');
  });

  it('matches every word typed, in any order', () => {
    expect(titles('late fee')).toContain('settings-late-fee');
    expect(titles('fee late')).toContain('settings-late-fee');
    expect(titles('late zebra')).toEqual([]);
  });

  it('finds a topic by a word that is only in its keywords', () => {
    expect(titles('logo')).toContain('settings-brand-colour');
    expect(titles('penalty')).toContain('settings-late-fee');
  });

  it('is not case or accent sensitive', () => {
    expect(titles('SUBJECT')).toContain('class-subjects');
    expect(titles('  Subject  ')).toContain('class-subjects');
  });

  it('ranks a title match above a keyword-only match', () => {
    const [first] = searchTopics(OFFICE, 'subjects');
    expect(first?.topic.title.toLowerCase()).toContain('subject');
  });

  it('returns nothing for an empty or whitespace search', () => {
    expect(searchTopics(OFFICE, '')).toEqual([]);
    expect(searchTopics(OFFICE, '   ')).toEqual([]);
  });

  it('never offers a topic the person cannot open', () => {
    // A teacher cannot configure the school or manage subjects.
    const teacher = ['dashboard.workspace.read'];
    expect(titles('subject', teacher)).toEqual([]);
    expect(titles('logo', teacher)).toEqual([]);
    expect(titles('password', teacher)).toContain('settings-password');
  });

  it('survives characters that are special in a regular expression', () => {
    expect(() => searchTopics(OFFICE, '(.*[')).not.toThrow();
    expect(titles('(.*[')).toEqual([]);
  });
});

describe('the index itself', () => {
  it('has unique ids', () => {
    const ids = TOPICS.map((topic) => topic.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every class-scoped topic an anchor, and no other topic one', () => {
    for (const topic of TOPICS) {
      expect(topic.anchor !== undefined).toBe(topic.classScoped === true);
    }
  });

  it('builds a class URL with the section anchor and an encoded id', () => {
    expect(classTopicHref('abc-123', 'subjects')).toBe('/classes/abc-123#subjects');
    expect(classTopicHref('a/b', undefined)).toBe('/classes/a%2Fb');
  });
});

describe('highlighting', () => {
  it('marks the searched word, including a plural form', () => {
    expect(splitHighlight('Add or edit subjects', 'subject')).toEqual([
      { text: 'Add or edit ', match: false },
      { text: 'subject', match: true },
      { text: 's', match: false },
    ]);
    expect(highlightRanges('Subject', 'subjects')).toEqual([[0, 7]]);
  });

  it('returns the text untouched when nothing matches', () => {
    expect(splitHighlight('Defaulters', 'zzz')).toEqual([{ text: 'Defaulters', match: false }]);
  });

  it('merges overlapping words instead of marking a stretch twice', () => {
    expect(highlightRanges('late fee', 'late late')).toEqual([[0, 4]]);
  });
});
