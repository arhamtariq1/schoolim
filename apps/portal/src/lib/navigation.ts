import type { Permission } from '@ilm/contracts';
import type { Route } from 'next';

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
  readonly href: Route;
  readonly label: string;
  /** The icon's exported name in `@ilm/ui/icons`. */
  readonly icon: string;
  /** Shown only when the user holds this. */
  readonly permission: Permission;
  /**
   * Nested items, up to two levels deep.
   *
   * A section only earns children when it has genuinely distinct screens that
   * people go to directly — attendance has four, and a teacher marking a
   * register and a principal reading a month are different errands. A section
   * whose children are just its tabs should not have any: two ways to reach the
   * same page is two things to keep in step.
   *
   * A child is filtered by its own permission, so a role that can mark but not
   * report sees one branch and not the other.
   */
  readonly children?: readonly NavItem[];
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
    // live here, and only one of them configures anything. The parent asks for
    // the lowest bar of its children so somebody who may only chase defaulters
    // still sees the section that contains them.
    permission: 'fees.voucher.read',
    // Five screens, each a separate errand: billing a month, collecting on it,
    // chasing what went unpaid, changing what a family pays, and the deposits
    // held on the side. They were a tab strip until there were five of them —
    // at which point a row of tabs stops reading as navigation and starts
    // reading as clutter, and the sidebar is where people already look.
    children: [
      {
        // First, because it is where anyone opening "Fees" actually wants to
        // be: what has been billed, and what is owed.
        href: '/fees/vouchers',
        label: 'Fee vouchers',
        icon: 'FeesIcon',
        permission: 'fees.voucher.read',
      },
      {
        href: '/fees/generate',
        label: 'Generate fee',
        icon: 'CreateIcon',
        permission: 'fees.voucher.generate',
      },
      {
        href: '/fees/defaulters',
        label: 'Defaulters',
        icon: 'OverdueIcon',
        permission: 'fees.defaulter.read',
      },
      {
        href: '/fees/increments',
        label: 'Fee increment',
        icon: 'TrendUpIcon',
        // Reading the list is the plan-read permission; changing an amount is
        // `fees.increment.generate` and is checked on the server. Somebody who
        // may look up what a family pays still sees the screen.
        permission: 'fees.plan.read',
      },
      {
        href: '/fees/security-deposits',
        label: 'Security deposits',
        icon: 'DepositIcon',
        permission: 'fees.deposit.read',
      },
    ],
  },
  {
    href: '/attendance',
    label: 'Attendance',
    icon: 'AttendanceIcon',
    // The parent asks for the lesser of its children's permissions, so somebody
    // who may only mark still sees the section that contains marking.
    permission: 'attendance.record.read',
    children: [
      {
        href: '/attendance/mark',
        label: 'Mark attendance',
        icon: 'AttendanceIcon',
        permission: 'attendance.record.read',
        children: [
          {
            href: '/attendance/mark/students',
            label: 'Students',
            icon: 'StudentsIcon',
            permission: 'attendance.record.read',
          },
          {
            href: '/attendance/mark/teachers',
            label: 'Staff',
            icon: 'AccountIcon',
            permission: 'attendance.record.read',
          },
        ],
      },
      {
        href: '/attendance/reports',
        label: 'Attendance report',
        icon: 'FinanceIcon',
        permission: 'attendance.report.read',
        children: [
          {
            href: '/attendance/reports/students',
            label: 'Students',
            icon: 'StudentsIcon',
            permission: 'attendance.report.read',
          },
          {
            href: '/attendance/reports/teachers',
            label: 'Staff',
            icon: 'AccountIcon',
            permission: 'attendance.report.read',
          },
        ],
      },
    ],
  },
  {
    href: '/academics',
    label: 'Academics',
    icon: 'AcademicsIcon',
    permission: 'academics.structure.read',
  },
  {
    href: '/staff',
    label: 'Staff',
    icon: 'AccountIcon',
    permission: 'staff.record.read',
  },
  {
    href: '/finance',
    label: 'Finance',
    icon: 'FinanceIcon',
    permission: 'finance.expense.read',
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
  return prune(NAV_ITEMS, held);
}

/**
 * Filter a level, and every level under it.
 *
 * A branch whose children are all hidden is dropped rather than left as a
 * heading that expands to nothing — which is the bug where a menu item leads to
 * a 403, wearing a different hat.
 */
function prune(items: readonly NavItem[], held: ReadonlySet<string>): readonly NavItem[] {
  return items
    .filter((item) => held.has(item.permission))
    .map((item) => {
      if (item.children === undefined) {
        return item;
      }
      const children = prune(item.children, held);
      return children.length === 0 ? { ...item, children: undefined } : { ...item, children };
    })
    .filter((item) => item.children !== undefined || !hasOnlyChildren(item));
}

/**
 * A section that is only a container — no page of its own worth landing on.
 *
 * `/attendance` and `/fees` both redirect to their first child, so an item
 * pointing at either with nothing under it would be a dead heading.
 */
function hasOnlyChildren(item: NavItem): boolean {
  return CONTAINER_ONLY.has(item.href);
}

const CONTAINER_ONLY: ReadonlySet<string> = new Set(['/attendance', '/fees']);
