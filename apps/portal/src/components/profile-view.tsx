import type { UserProfile } from '@ilm/contracts';
import { AccountIcon, ICON_SIZE, SchoolIcon, SuccessIcon } from '@ilm/ui/icons';
import Link from 'next/link';


/**
 * Read-only profile card — personal details plus the school this account belongs to.
 */
export function ProfileView({ profile }: { profile: UserProfile }) {
  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6 lg:grid-cols-5">
      <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm lg:col-span-3">
        <div className="flex items-start gap-4 border-b border-border bg-muted/30 px-4 py-5 sm:px-6">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg font-semibold text-primary">
            {initials(profile.name)}
          </span>
          <div className="min-w-0 flex-1 space-y-1">
            <h2 className="truncate text-lg font-semibold tracking-tight text-foreground">
              {profile.name}
            </h2>
            {profile.designation === null || profile.designation === '' ? null : (
              <p className="text-sm text-muted-foreground">{profile.designation}</p>
            )}
            <p className="truncate text-sm text-muted-foreground">{profile.email}</p>
          </div>
          <Link
            href="/profile/edit"
            className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            Edit
          </Link>
        </div>

        <dl className="divide-y divide-border text-sm">
          <DetailRow label="Email" value={profile.email} />
          <DetailRow label="Phone" value={profile.phone ?? '—'} />
          <DetailRow label="Designation" value={profile.designation ?? '—'} />
        </dl>

        <div className="flex items-center gap-2 border-t border-border px-4 py-3 text-xs text-muted-foreground sm:px-6">
          <SuccessIcon className={ICON_SIZE.inline} aria-hidden="true" />
          Profile complete
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm lg:col-span-2">
        <header className="flex items-start gap-3 border-b border-border bg-muted/30 px-4 py-4 sm:px-5">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <SchoolIcon className={ICON_SIZE.nav} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold tracking-tight text-foreground">School</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">This campus</p>
          </div>
        </header>
        <dl className="divide-y divide-border text-sm">
          <DetailRow label="Name" value={profile.school.name} />
          <DetailRow label="Address" value={profile.school.slug} mono />
          <DetailRow label="City" value={profile.school.city ?? '—'} />
          <DetailRow label="Phone" value={profile.school.phone ?? '—'} />
          <DetailRow label="Email" value={profile.school.email ?? '—'} />
        </dl>
        <div className="flex items-center gap-2 border-t border-border px-4 py-3 text-xs text-muted-foreground sm:px-5">
          <AccountIcon className={ICON_SIZE.inline} aria-hidden="true" />
          Linked to your account
        </div>
      </section>
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between gap-4 px-4 py-3 sm:px-6">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd
        className={`min-w-0 truncate text-end font-medium text-foreground ${mono ? 'font-mono text-xs' : ''}`}
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return '?';
  }
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}
