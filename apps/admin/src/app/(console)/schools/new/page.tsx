import Link from 'next/link';
import { redirect } from 'next/navigation';

import { CreateSchoolForm } from '@/components/create-school-form';
import { getPlatformSession } from '@/lib/api';

/**
 * Add a school.
 *
 * The capability is checked here as well as in the API. Not redundantly: this
 * one decides whether the page renders at all, so a SUPPORT operator who types
 * the URL gets sent back rather than filling in a form that would be refused on
 * submit. The API's check is the one that actually enforces it — a check that
 * happens only in the UI does not exist (docs/08).
 */
export default async function NewSchoolPage() {
  const session = await getPlatformSession();
  if (session === undefined) {
    redirect('/login');
  }
  if (!session.capabilities.includes('schools.create')) {
    redirect('/schools');
  }

  const appDomain = process.env['APP_DOMAIN'] ?? 'localhost';

  return (
    <main className="mx-auto max-w-xl px-4 py-8 sm:px-6">
      <nav className="mb-6">
        <Link href="/schools" className="text-sm text-muted-foreground underline">
          ← All schools
        </Link>
      </nav>

      <h1 className="mb-1 text-xl font-semibold">Add a school</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        This creates the school, its address and its first owner account in one step.
      </p>

      <CreateSchoolForm appDomain={appDomain} />
    </main>
  );
}
