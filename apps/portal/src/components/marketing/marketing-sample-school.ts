/**
 * The sample school the landing page's product previews are drawn from.
 *
 * ADR-0019 (as amended) allows the marketing surface to show the product, on
 * one condition: every preview is visibly labelled as a sample, and every
 * number on it comes from this file — so "is this a real customer?" has one
 * answer, in one place, and nothing on the page can be mistaken for proof.
 *
 * Money is in paisa (minor units), like everywhere else; the previews render it
 * through `<Money>` and never format it by hand.
 */

export const SAMPLE_LABEL = 'Sample school · illustrative data';

export const SAMPLE_SCHOOL = {
  name: 'Greenfield School',
  campus: 'Main campus',
  session: 'Session 2026–27',
} as const;

export const SAMPLE_KPIS = {
  students: 482,
  collectedThisMonthMinor: 184_250_000,
  attendanceToday: '94.2%',
  defaulters: 23,
} as const;

/** Six months of collection against what was billed, as a share of the tallest bar. */
export const SAMPLE_COLLECTION = [
  { month: 'May', collected: 72, expected: 80 },
  { month: 'Jun', collected: 64, expected: 78 },
  { month: 'Jul', collected: 81, expected: 86 },
  { month: 'Aug', collected: 88, expected: 92 },
  { month: 'Sep', collected: 79, expected: 90 },
  { month: 'Oct', collected: 95, expected: 100 },
] as const;

export const SAMPLE_PAYMENTS = [
  { name: 'Ayesha Khan', section: 'Grade 5-A', voucher: 'FV-2610-0142', amountMinor: 450_000 },
  { name: 'Muhammad Ali', section: 'Grade 8-B', voucher: 'FV-2610-0157', amountMinor: 620_000 },
  { name: 'Fatima Noor', section: 'Grade 2-C', voucher: 'FV-2610-0163', amountMinor: 380_000 },
  { name: 'Hamza Siddiqui', section: 'Grade 10-A', voucher: 'FV-2610-0171', amountMinor: 780_000 },
] as const;

/** One class register for the attendance previews: P present, A absent, L leave. */
export const SAMPLE_REGISTER = 'PPPPAPPPPPPPLPPPPPPPPAPPPPPPPPPPPP';

export const SAMPLE_TIMETABLE = [
  ['Maths', 'English', 'Science', 'Urdu', 'Break', 'Islamiat'],
  ['English', 'Maths', 'Computer', 'Science', 'Break', 'Art'],
  ['Science', 'Urdu', 'Maths', 'English', 'Break', 'Games'],
] as const;

export const SAMPLE_RESULTS = [
  { subject: 'Mathematics', marks: 92, grade: 'A+' },
  { subject: 'English', marks: 84, grade: 'A' },
  { subject: 'Science', marks: 88, grade: 'A' },
  { subject: 'Urdu', marks: 79, grade: 'B+' },
] as const;
