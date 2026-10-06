import { BrandColourCard } from '@/components/brand-colour-card';
import { SchoolLogoCard } from '@/components/school-logo-card';
import type { ProfileSchoolWorkspace } from '@/lib/profile-school-workspace';

/** Brand colour and logo — dashboard-width two-column row. */
export function ProfileSchoolBranding({ workspace }: { workspace: ProfileSchoolWorkspace }) {
  return (
    <section
      aria-label="Portal appearance"
      className="grid w-full gap-3 lg:grid-cols-2 lg:items-start"
    >
      <BrandColourCard
        appearance={{ primaryColor: workspace.settings.primaryColor }}
        canConfigure={workspace.canConfigure}
      />
      <SchoolLogoCard
        info={workspace.logo}
        canConfigure={workspace.canConfigure}
        error={workspace.logoError}
      />
    </section>
  );
}
