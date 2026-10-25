import { type TimetableEntry, type TimetableEventKind, type TimetableStatus } from '@ilm/contracts';
import { type StatusTone } from '@ilm/ui';
import {
  PaletteIcon,
  SubjectComputerIcon,
  SubjectIcon,
  SubjectIslamicIcon,
  SubjectLanguageIcon,
  SubjectMathIcon,
  SubjectScienceIcon,
} from '@ilm/ui/icons';
import { type ComponentType } from 'react';

/**
 * How timetables look. A status or an event kind is always a colour **and** a
 * word (docs/16 §6) — a timetable is printed and pinned up as often as it is read.
 */
export const TIMETABLE_STATUS_TONES: Readonly<Record<TimetableStatus, StatusTone>> = {
  DRAFT: 'warning',
  PUBLISHED: 'success',
};

/** Subtle, distinct colours for what is on the calendar. */
export const TIMETABLE_EVENT_TONES: Readonly<Record<TimetableEventKind, StatusTone>> = {
  CLASS: 'info',
  TEST: 'warning',
  EXAM: 'danger',
};

/** The small dot that stands for an event in a calendar cell. */
export const TIMETABLE_EVENT_DOT_CLASSES: Readonly<Record<TimetableEventKind, string>> = {
  CLASS: 'bg-info',
  TEST: 'bg-warning',
  EXAM: 'bg-danger',
};

/** Weekly periods grouped by weekday, earliest first, for the grid. */
export function entriesByWeekday(entries: readonly TimetableEntry[]): Map<number, TimetableEntry[]> {
  const days = new Map<number, TimetableEntry[]>();
  for (const entry of entries) {
    if (entry.dayOfWeek === null) continue;
    days.set(entry.dayOfWeek, [...(days.get(entry.dayOfWeek) ?? []), entry]);
  }
  for (const list of days.values()) {
    list.sort((a, b) => a.startTime.localeCompare(b.startTime));
  }
  return days;
}

/** Dated papers grouped by date, earliest first. */
export function entriesByDate(entries: readonly TimetableEntry[]): [string, TimetableEntry[]][] {
  const dates = new Map<string, TimetableEntry[]>();
  for (const entry of entries) {
    if (entry.onDate === null) continue;
    dates.set(entry.onDate, [...(dates.get(entry.onDate) ?? []), entry]);
  }
  return [...dates.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, list]) => [date, list.sort((a, b) => a.startTime.localeCompare(b.startTime))]);
}

/**
 * One colour per subject, so a week reads at a glance. Semantic tokens only; the
 * class names are written out in full because Tailwind cannot see a built one.
 */
export interface SubjectTone {
  readonly card: string;
  readonly dot: string;
  readonly icon: string;
}

const SUBJECT_TONES: readonly SubjectTone[] = [
  { card: 'border-success/30 bg-success/10', dot: 'bg-success', icon: 'text-success' },
  { card: 'border-danger/30 bg-danger/10', dot: 'bg-danger', icon: 'text-danger' },
  { card: 'border-info/30 bg-info/10', dot: 'bg-info', icon: 'text-info' },
  { card: 'border-warning/30 bg-warning/10', dot: 'bg-warning', icon: 'text-warning' },
  { card: 'border-violet/30 bg-violet/10', dot: 'bg-violet', icon: 'text-violet' },
  { card: 'border-orange/30 bg-orange/10', dot: 'bg-orange', icon: 'text-orange' },
  { card: 'border-teal/30 bg-teal/10', dot: 'bg-teal', icon: 'text-teal' },
  { card: 'border-pink/30 bg-pink/10', dot: 'bg-pink', icon: 'text-pink' },
  { card: 'border-indigo/30 bg-indigo/10', dot: 'bg-indigo', icon: 'text-indigo' },
  { card: 'border-cyan/30 bg-cyan/10', dot: 'bg-cyan', icon: 'text-cyan' },
];

/** The same subject is the same colour everywhere on a timetable: by name, in order. */
export function subjectTones(entries: readonly TimetableEntry[]): Map<string, SubjectTone> {
  const subjects = new Map<string, string>();
  for (const entry of entries) {
    if (entry.subject !== null) subjects.set(entry.subject.id, entry.subject.name);
  }
  const tones = new Map<string, SubjectTone>();
  [...subjects.entries()]
    .sort(([, a], [, b]) => a.localeCompare(b))
    .forEach(([id], index) => {
      const tone = SUBJECT_TONES[index % SUBJECT_TONES.length];
      if (tone !== undefined) tones.set(id, tone);
    });
  return tones;
}

/** What to show when a subject has no colour: a break, or a period with no subject. */
export const NEUTRAL_TONE: SubjectTone = {
  card: 'border-border bg-muted/40',
  dot: 'bg-muted-foreground',
  icon: 'text-muted-foreground',
};

/** A fitting icon from the school's own subject name; a book when nothing fits. */
export function subjectIcon(name: string): ComponentType<{ className?: string }> {
  const text = name.toLowerCase();
  if (/math|algebra|geometry|arithmetic/.test(text)) return SubjectMathIcon;
  if (/science|physics|chemistry|biology/.test(text)) return SubjectScienceIcon;
  if (/computer|\bit\b|ict|coding/.test(text)) return SubjectComputerIcon;
  if (/art|drawing|craft|paint/.test(text)) return PaletteIcon;
  if (/islam|quran|nazra|deen|dini/.test(text)) return SubjectIslamicIcon;
  if (/english|urdu|arabic|sindhi|punjabi|pashto|language/.test(text)) return SubjectLanguageIcon;
  return SubjectIcon;
}

/** A colour for a subject known only by name — the same name is always the same colour. */
export function subjectToneByName(name: string): SubjectTone {
  let sum = 0;
  for (const letter of name.toLowerCase()) {
    sum += letter.charCodeAt(0);
  }
  return SUBJECT_TONES[sum % SUBJECT_TONES.length] ?? NEUTRAL_TONE;
}
