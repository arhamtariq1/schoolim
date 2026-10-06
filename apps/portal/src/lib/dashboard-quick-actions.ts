import type { Route } from 'next';

export type DashboardQuickActionTone = 'primary' | 'success' | 'warning' | 'danger' | 'neutral';

export type DashboardQuickActionIconName =
  | 'CreateIcon'
  | 'AttendanceIcon'
  | 'FeesIcon'
  | 'StudentsIcon'
  | 'AccountIcon'
  | 'MessagesIcon';

/** Serializable quick-action row — built on the server, rendered on the client. */
export type DashboardQuickActionConfig = {
  href: string;
  label: string;
  icon: DashboardQuickActionIconName;
  tone: DashboardQuickActionTone;
};

export function buildDashboardQuickActions(
  baseHref: (path: Route) => string,
): DashboardQuickActionConfig[] {
  return [
    {
      href: baseHref('/students/new'),
      label: 'Add admission',
      icon: 'CreateIcon',
      tone: 'primary',
    },
    {
      href: baseHref('/attendance/mark/students'),
      label: 'Mark attendance',
      icon: 'AttendanceIcon',
      tone: 'success',
    },
    {
      href: baseHref('/fees/generate'),
      label: 'Generate fee',
      icon: 'FeesIcon',
      tone: 'warning',
    },
    {
      href: baseHref('/students/new'),
      label: 'Add student',
      icon: 'StudentsIcon',
      tone: 'primary',
    },
    {
      href: baseHref('/staff'),
      label: 'Add teacher',
      icon: 'AccountIcon',
      tone: 'neutral',
    },
    {
      href: baseHref('/requests'),
      label: 'Create notice',
      icon: 'MessagesIcon',
      tone: 'danger',
    },
  ];
}

export function filterDashboardQuickActions(
  actions: DashboardQuickActionConfig[],
  permissions: readonly string[],
): DashboardQuickActionConfig[] {
  const can = (permission: string) => permissions.includes(permission);

  return actions.filter((action) => {
    if (action.href.includes('/students/new')) {
      return can('students.student.create');
    }
    if (action.href.includes('/attendance/')) {
      return can('attendance.record.read');
    }
    if (action.href.includes('/fees/generate')) {
      return can('fees.voucher.generate');
    }
    if (action.href.includes('/staff')) {
      return can('staff.record.read');
    }
    return can('workflow.request.create');
  });
}
