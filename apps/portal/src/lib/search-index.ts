/**
 * What is *inside* the pages, so ⌘K can find a word and not only a page name.
 *
 * Searching "subject" should lead somewhere even though no page is called that:
 * subjects are managed under Marks, and each class page has a Subjects section.
 * The page list (`search-destinations.ts`) is derived from the sidebar and only
 * knows page names; this is the second half, a hand-written map of the
 * sections, settings and tasks that live on those pages, each with the words a
 * person would actually type for it.
 *
 * ## Rules
 *
 * - **Permission-filtered, like the sidebar.** An entry a person cannot open is
 *   never offered; the API still decides, this only avoids showing a 403.
 * - **Pure.** No hooks, no fetching, so it is testable and cheap to run on every
 *   keystroke.
 * - **Every `href` is a real, openable URL.** A section on a page that needs an
 *   id (a class) is `classScoped`: the palette turns it into one row per class
 *   rather than linking to a URL that does not exist.
 */

export interface Topic {
  readonly id: string;
  /** What the thing is called on screen. */
  readonly title: string;
  /** Where it lives, as a breadcrumb: "Classes › Class page". */
  readonly where: string;
  /** For a class-scoped topic, the page without the class id (`/classes`). */
  readonly href: string;
  /** Appended to the class page URL for a class-scoped topic: `#subjects`. */
  readonly anchor?: string;
  /** Words a person might type that are not in the title. */
  readonly keywords: readonly string[];
  readonly permission: string;
  /** The page needs a class: the palette offers one row per class. */
  readonly classScoped?: true;
}

export const TOPICS: readonly Topic[] = [
  // --- A class page: one page, five sections --------------------------------
  {
    id: 'class-subjects',
    title: 'Subjects',
    where: 'Classes › Class page',
    href: '/classes',
    anchor: 'subjects',
    keywords: ['subject', 'courses', 'syllabus', 'tests per subject', 'average'],
    permission: 'academics.structure.read',
    classScoped: true,
  },
  {
    id: 'class-assessment-types',
    title: 'Assessment types',
    where: 'Classes › Class page',
    href: '/classes',
    anchor: 'assessment-types',
    keywords: ['assessment', 'exam types', 'quiz', 'midterm', 'final', 'test types'],
    permission: 'academics.structure.read',
    classScoped: true,
  },
  {
    id: 'class-tests',
    title: 'Tests',
    where: 'Classes › Class page',
    href: '/classes',
    anchor: 'tests',
    keywords: ['exam', 'exams', 'tests entered', 'marks entered', 'results'],
    permission: 'academics.structure.read',
    classScoped: true,
  },
  {
    id: 'class-students',
    title: 'Students in this class',
    where: 'Classes › Class page',
    href: '/classes',
    anchor: 'students',
    keywords: ['class list', 'enrolled', 'roster', 'section', 'strength'],
    permission: 'academics.structure.read',
    classScoped: true,
  },
  {
    id: 'class-teachers',
    title: 'Class teacher',
    where: 'Classes › Class page',
    href: '/classes',
    anchor: 'overview',
    keywords: ['teacher', 'teachers', 'incharge', 'assigned teacher', 'homeroom'],
    permission: 'academics.structure.read',
    classScoped: true,
  },

  // --- Marks and exams ------------------------------------------------------
  {
    id: 'marks-subjects',
    title: 'Add or edit subjects',
    where: 'Marks › Subjects & assessment types',
    href: '/marks/setup',
    keywords: ['subject', 'subjects', 'new subject', 'course', 'syllabus'],
    permission: 'exams.setup.manage',
  },
  {
    id: 'marks-assessment-types',
    title: 'Add or edit assessment types',
    where: 'Marks › Subjects & assessment types',
    href: '/marks/setup',
    keywords: ['assessment', 'exam type', 'quiz', 'midterm', 'final term', 'weightage'],
    permission: 'exams.setup.manage',
  },
  {
    id: 'marks-new-test',
    title: 'Create a test and enter marks',
    where: 'Marks › New test',
    href: '/marks/new',
    keywords: ['enter marks', 'new test', 'new exam', 'record marks', 'marks sheet', 'result'],
    permission: 'exams.mark.create',
  },

  // --- Students and staff profile pages -------------------------------------
  {
    id: 'student-fees-tab',
    title: 'A student’s fees and payments',
    where: 'Students › Student page › Fees',
    href: '/students',
    keywords: ['family fee', 'paid', 'balance', 'dues', 'arrears', 'payment history'],
    permission: 'students.student.read',
  },
  {
    id: 'student-guardians',
    title: 'Guardians and parents',
    where: 'Students › Student page',
    href: '/students',
    keywords: ['guardian', 'parent', 'father', 'mother', 'contact', 'phone', 'whatsapp'],
    permission: 'students.student.read',
  },
  {
    id: 'student-attendance-tab',
    title: 'A student’s attendance',
    where: 'Students › Student page › Attendance',
    href: '/students',
    keywords: ['absent', 'present', 'leave', 'percentage'],
    permission: 'students.student.read',
  },
  {
    id: 'staff-salary-history',
    title: 'A staff member’s salary history',
    where: 'Staff › Staff page › Salary History',
    href: '/staff',
    keywords: ['pay', 'payroll', 'wages', 'advance', 'deduction'],
    permission: 'staff.salary.read',
  },

  // --- Settings -------------------------------------------------------------
  {
    id: 'settings-school-details',
    title: 'School name, address and contact details',
    where: 'Settings › School',
    href: '/settings/school',
    keywords: ['school name', 'address', 'phone', 'email', 'city', 'timezone', 'levels'],
    permission: 'settings.school.configure',
  },
  {
    id: 'settings-brand-colour',
    title: 'Brand colour and school logo',
    where: 'Settings › School',
    href: '/settings/school#brand-colour',
    keywords: ['logo', 'colour', 'color', 'theme', 'branding', 'upload logo'],
    permission: 'settings.school.configure',
  },
  {
    id: 'settings-fee-heads',
    title: 'Fee heads and fee plans',
    where: 'Settings › Fees',
    href: '/settings/fees',
    keywords: ['tuition', 'fee head', 'monthly fee', 'amount', 'transport', 'admission fee'],
    permission: 'fees.plan.read',
  },
  {
    id: 'settings-late-fee',
    title: 'Late fee rule',
    where: 'Settings › Fees › Late Fee',
    href: '/settings/fees/late-fee',
    keywords: ['fine', 'penalty', 'surcharge', 'grace days', 'percent', 'after due date'],
    permission: 'fees.plan.read',
  },
  {
    id: 'settings-voucher-layout',
    title: 'Voucher layout, copies and numbering',
    where: 'Settings › Voucher Settings',
    href: '/settings/voucher',
    keywords: ['challan', 'voucher number', 'page layout', 'copy names', 'a4', 'print'],
    permission: 'fees.voucher.read',
  },
  {
    id: 'settings-bank-logos',
    title: 'Bank logos and the note under the signature',
    where: 'Settings › Voucher Settings',
    href: '/settings/voucher',
    keywords: ['bank', 'bank logo', 'signature', 'note', 'footer', 'account number'],
    permission: 'fees.voucher.read',
  },
  {
    id: 'settings-gr-number',
    title: 'GR number format',
    where: 'Settings › GR Number',
    href: '/settings/gr-number',
    keywords: ['gr', 'registration number', 'admission number', 'prefix', 'sequence'],
    permission: 'settings.school.configure',
  },
  {
    id: 'settings-access',
    title: 'Users & Access',
    where: 'Settings › Users & Access',
    href: '/settings/access',
    keywords: ['permissions', 'roles', 'access', 'screens', 'modules', 'who can see', 'teacher access'],
    permission: 'settings.user.manage',
  },
  {
    id: 'settings-password',
    title: 'Change your password',
    where: 'Settings › Password',
    href: '/settings/password',
    keywords: ['password', 'security', 'sign in', 'login'],
    permission: 'dashboard.workspace.read',
  },
  {
    id: 'calendar-working-days',
    title: 'Working days and holidays',
    where: 'Calendar',
    href: '/academics/holidays',
    keywords: ['holiday', 'weekend', 'vacation', 'eid', 'summer break', 'off days'],
    permission: 'academics.structure.read',
  },
  {
    id: 'sessions-new-year',
    title: 'Start a new academic year',
    where: 'Academics › Sessions',
    href: '/academics/sessions',
    keywords: ['session', 'year', 'term', 'rollover', 'current session'],
    permission: 'academics.session.configure',
  },
];

/** A topic that matched, ready to render. */
export interface TopicHit {
  readonly topic: Topic;
  readonly score: number;
}

/** Lower-cased, accent-stripped, single-spaced. Both sides of every comparison go through this. */
export function normalise(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The words to look for.
 *
 * A trailing "s" is tolerated in both directions, so "subjects" finds a topic
 * written "subject" and the reverse. Only for longer words: stripping the "s"
 * from "gs" or "is" would match half the alphabet.
 */
export function tokens(term: string): string[] {
  return normalise(term)
    .split(' ')
    .filter((word) => word !== '');
}

function wordMatches(haystack: string, word: string): boolean {
  if (haystack.includes(word)) {
    return true;
  }
  return word.length >= 5 && word.endsWith('s') && haystack.includes(word.slice(0, -1));
}

function startsAWord(haystack: string, word: string): boolean {
  const stem = word.length >= 5 && word.endsWith('s') ? word.slice(0, -1) : word;
  return (
    haystack.startsWith(word) ||
    haystack.includes(` ${word}`) ||
    haystack.startsWith(stem) ||
    haystack.includes(` ${stem}`)
  );
}

/**
 * Every word typed must be found somewhere in the topic, in any order, so
 * "late fee" and "fee late" are the same search. Ranked so a title match beats
 * a keyword match beats a breadcrumb match, and a word at the start of a word
 * beats the middle of one.
 */
export function searchTopics(
  permissions: readonly string[],
  term: string,
  limit = 6,
): TopicHit[] {
  const words = tokens(term);
  if (words.length === 0) {
    return [];
  }
  const held = new Set(permissions);

  const hits: TopicHit[] = [];
  for (const topic of TOPICS) {
    if (!held.has(topic.permission)) {
      continue;
    }
    const title = normalise(topic.title);
    const keywords = normalise(topic.keywords.join(' '));
    const where = normalise(topic.where);

    let score = 0;
    let matchedAll = true;
    for (const word of words) {
      if (wordMatches(title, word)) {
        score += startsAWord(title, word) ? 100 : 60;
      } else if (wordMatches(keywords, word)) {
        score += startsAWord(keywords, word) ? 40 : 25;
      } else if (wordMatches(where, word)) {
        score += 10;
      } else {
        matchedAll = false;
        break;
      }
    }
    if (matchedAll) {
      hits.push({ topic, score });
    }
  }

  return hits
    .sort((a, b) => b.score - a.score || a.topic.title.length - b.topic.title.length)
    .slice(0, limit);
}

/**
 * The slices of `text` to highlight for a search, as `[start, end)` pairs.
 *
 * Offsets are into the original string. Normalising can change a string's
 * length (accents, case folding of some scripts), so when it would, no ranges
 * are returned: highlighting nothing is better than highlighting the wrong
 * characters.
 */
export function highlightRanges(text: string, term: string): Array<[number, number]> {
  const lowered = text.toLowerCase();
  if (lowered.length !== text.length) {
    return [];
  }
  const found: Array<[number, number]> = [];

  for (const word of tokens(term)) {
    const forms =
      word.length >= 5 && word.endsWith('s') ? [word, word.slice(0, -1)] : [word];
    for (const form of forms) {
      const start = lowered.indexOf(form);
      if (start !== -1) {
        found.push([start, start + form.length]);
        break;
      }
    }
  }

  // Merge overlaps so one stretch is not wrapped twice.
  found.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const range of found) {
    const last = merged[merged.length - 1];
    if (last !== undefined && range[0] <= last[1]) {
      last[1] = Math.max(last[1], range[1]);
    } else {
      merged.push([range[0], range[1]]);
    }
  }
  return merged;
}

/** Split `text` into alternating plain and highlighted parts. */
export function splitHighlight(
  text: string,
  term: string,
): Array<{ readonly text: string; readonly match: boolean }> {
  const ranges = highlightRanges(text, term);
  if (ranges.length === 0) {
    return [{ text, match: false }];
  }
  const parts: Array<{ text: string; match: boolean }> = [];
  let cursor = 0;
  for (const [start, end] of ranges) {
    if (start > cursor) {
      parts.push({ text: text.slice(cursor, start), match: false });
    }
    parts.push({ text: text.slice(start, end), match: true });
    cursor = end;
  }
  if (cursor < text.length) {
    parts.push({ text: text.slice(cursor), match: false });
  }
  return parts;
}

/** The URL for a topic on a particular class. */
export function classTopicHref(classId: string, anchor: string | undefined): string {
  return `/classes/${encodeURIComponent(classId)}${anchor === undefined ? '' : `#${anchor}`}`;
}
