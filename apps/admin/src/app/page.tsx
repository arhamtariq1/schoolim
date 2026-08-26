import { redirect } from 'next/navigation';

import { getPlatformSession } from '@/lib/api';

/**
 * The platform console (docs/modules/super-admin.md).
 *
 * A **separate application** from the school portal, deliberately: a
 * privilege-escalation bug in the portal cannot reach platform capability,
 * because platform routes reject any token whose type is not `platform`
 * (docs/00 §3, docs/04 §6).
 *
 * There is no dashboard yet, so the root is a redirect rather than a landing
 * page with nothing on it. Subscriptions, impersonation and platform health
 * arrive in Phase 5; schools are here now because a tenant has to be created
 * somewhere, and doing it by hand in SQL is not a process.
 */
export default async function PlatformHomePage() {
  redirect((await getPlatformSession()) === undefined ? '/login' : '/schools');
}
