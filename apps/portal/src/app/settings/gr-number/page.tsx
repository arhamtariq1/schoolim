import { ROUTES, type GrNumberSettings } from '@ilm/contracts';
import { redirect } from 'next/navigation';

import { NumberStartForm } from '@/components/number-start-form';
import { WorkspacePageHeader } from '@/components/workspace-page-header';
import { apiFetch } from '@/lib/api';
import { requireSchoolSession } from '@/lib/require-session';

/**
 * Settings › GR numbers.
 *
 * Admin-only: the starting number is a decision about the school's legal
 * register, so the page is not shown to anybody who cannot configure the school
 * (and the API refuses them regardless).
 */
export default async function GrNumberSettingsPage() {
  const session = await requireSchoolSession();
  if (!session.permissions.includes('settings.school.configure')) {
    redirect('/');
  }

  const result = await apiFetch<{ data: GrNumberSettings }>(ROUTES.school.grNumber);

  return (
    <div className="w-full space-y-8">
      <WorkspacePageHeader
        title="GR numbers"
        description="Where the school’s General Register numbering starts. Each new admission receives the next number, and the same number is the student’s roll number."
      />

      <NumberStartForm
        className="max-w-2xl"
        title="Starting GR number"
        noun="GR numbers"
        route={ROUTES.school.grNumber}
        example="A-1001"
        kind="gr"
        settings={
          result.ok
            ? {
                configured: result.data.data.configured,
                next: result.data.data.nextGrNo,
                highestIssued: result.data.data.highestIssued,
              }
            : undefined
        }
        error={result.ok ? undefined : result.message}
      />
    </div>
  );
}
