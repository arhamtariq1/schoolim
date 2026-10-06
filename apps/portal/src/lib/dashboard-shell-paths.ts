/**
 * Routes that render without the dashboard chrome (sidebar + header).
 *
 * Everything else on a school hostname is a workspace screen and shares one
 * persistent shell from the root layout.
 */
const PATHS_WITHOUT_DASHBOARD_SHELL: ReadonlySet<string> = new Set([
  '/welcome',
  '/signup',
  '/signup/school',
  '/login',
  '/forgot-password',
  '/otp-verification',
  '/new-password',
  '/invite',
  '/settings/password',
  '/fees/vouchers/print',
]);

export function pathUsesDashboardShell(innerPath: string | null | undefined): boolean {
  if (innerPath === null || innerPath === undefined || innerPath === '') {
    return false;
  }
  return !PATHS_WITHOUT_DASHBOARD_SHELL.has(innerPath);
}
