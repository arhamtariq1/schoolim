import { GuidanceView } from '@/components/guidance-view';
import { requireSchoolSession } from '@/lib/require-session';
import { withTenantPrefix } from '@/lib/tenant-mode';
import { tenantPrefix } from '@/lib/tenant-server';

/**
 * The in-app guide, reached from the account menu.
 *
 * Open to every signed-in person: what it shows is narrowed to the areas their
 * permissions reveal, so a parent and an owner read different guides from the
 * same route.
 */
export default async function GuidancePage() {
  const [session, prefix] = await Promise.all([requireSchoolSession(), tenantPrefix()]);
  const tenantHref = (path: string): string =>
    prefix === '' ? path : withTenantPrefix(path, prefix.slice(1));

  return <GuidanceView permissions={session.permissions} tenantHref={tenantHref} />;
}
