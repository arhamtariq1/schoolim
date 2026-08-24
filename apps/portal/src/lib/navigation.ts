import type { Permission } from '@ilm/contracts';

/**
 * The sidebar, generated from permissions.
 *
 * This is the fix for the single biggest UX problem in the old portal
 * (docs/00 §6, docs/08 §1): ~30 flat destinations, identical for a teacher and
 * an owner, ordered by database table, with configuration sitting beside hourly
 * work.
 *
 * Three rules make it different:
 *
 * 1. **Maximum 8 items.** Everything else is an in-page tab, a row action, or
 *    Settings. A teacher sees five; an owner sees eight.
 * 2. **Each item declares the permission that reveals it.** Granting a
 *    permission reveals its menu item automatically, so navigation and access
 *    can never drift — the bug where a menu item leads to a 403.
 * 3. **Ordered by how often someone opens it**, not by table name. "Mark
 *    attendance" is a daily act by forty people; "Expense types" is twice a
 *    year by one person, and it lives in Settings.
 */

export interface NavItem {
  readonly href: string;
  readonly label: string;
  /** The icon's exported name in `@ilm/ui/icons`. */
  readonly icon: string;
  /** Shown only when the user holds this. */
  readonly permission: Permission;
}

export const NAV_ITEMS: readonly NavItem[] = [
  {
    href: '/',
    label: 'Home',
    icon: 'DashboardIcon',
    permission: 'dashboard.workspace.read',
  },
  {
    href: '/students',
    label: 'Students',
    icon: 'StudentsIcon',
    permission: 'students.student.read',
  },
  {
    href: '/fees',
    label: 'Fees',
    icon: 'FeesIcon',
    // Voucher read, not plan configure: an accountant and a receptionist both
    // live here, and only one of them configures anything.
    permission: 'fees.voucher.read',
  },
  {
    href: '/attendance',
    label: 'Attendance',
    icon: 'AttendanceIcon',
    permission: 'attendance.report.read',
  },
  {
    href: '/academics',
    label: 'Academics',
    icon: 'AcademicsIcon',
    permission: 'academics.structure.read',
  },
  {
    href: '/finance',
    label: 'Finance',
    icon: 'FinanceIcon',
    permission: 'finance.report.read',
  },
  {
    href: '/requests',
    label: 'Requests',
    icon: 'RequestsIcon',
    permission: 'workflow.request.create',
  },
  {
    href: '/settings',
    label: 'Settings',
    icon: 'SettingsIcon',
    permission: 'settings.school.configure',
  },
];

/**
 * The items a set of permissions reveals.
 *
 * The UI hides; **the API decides** (docs/08 §4). Filtering here is a
 * convenience so people are not shown doors they cannot open — it is not a
 * security control, and every route behind these is permission-checked on the
 * server regardless.
 */
export function visibleNavItems(permissions: readonly string[]): readonly NavItem[] {
  const held = new Set(permissions);
  return NAV_ITEMS.filter((item) => held.has(item.permission));
}
