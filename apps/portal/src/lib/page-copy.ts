import type { Route } from 'next';

/**
 * Static one-line intros for workspace pages (heading subtitle).
 * Dynamic counts belong in tables or summary chips, not here.
 */
export const PAGE_INTRO: Partial<Record<Route, string>> = {
  '/': 'Your school at a glance — enrolment, fees, attendance, and alerts.',
  '/students': 'Find students, open profiles, and manage the register.',
  '/students/new': 'Capture a new admission, guardian contact, and opening fees.',
  '/fees/vouchers': 'Issued bills, collections, and what is still outstanding.',
  '/fees/generate': 'Create fee vouchers for a class or selection of students.',
  '/fees/defaulters': 'Families with overdue balances and open vouchers.',
  '/fees/increments': 'Scheduled fee changes and discounts by student or class.',
  '/fees/security-deposits': 'Deposits held, refunded, or adjusted on withdrawal.',
  '/finance/expenses': 'Operating costs, categories, and month-to-date totals.',
  '/finance/expense-types': 'Expense categories used when recording payments.',
  '/attendance/mark/students': 'Daily student register by class and section.',
  '/attendance/mark/teachers': 'Staff attendance for payroll and compliance.',
  '/attendance/reports/students': 'Class-wise attendance summaries and trends.',
  '/attendance/reports/teachers': 'Staff attendance history and totals.',
  '/academics/sessions': 'Academic years, terms, and the current session.',
  '/academics/holidays': 'Days off that affect attendance and fee calendars.',
  '/academics/promote': 'Move students to the next class for a new session.',
  '/classes': 'Classes, sections, and strength for the active session.',
  '/staff': 'Teachers and support staff on payroll.',
  '/requests': 'Parent and staff requests awaiting action.',
};

export function pageIntro(path: Route): string | undefined {
  return PAGE_INTRO[path];
}
