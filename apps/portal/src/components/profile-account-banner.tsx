import { StatusBadge } from '@ilm/ui';
import { EditIcon, ICON_SIZE } from '@ilm/ui/icons';

type ProfileAccountBannerProps = {
  name: string;
  email: string;
  phone: string | null;
  roleLabel: string;
  readOnly?: boolean;
};

export function ProfileAccountBanner({
  name,
  email,
  phone,
  roleLabel,
  readOnly = false,
}: ProfileAccountBannerProps) {
  return (
    <div className="mb-6 flex flex-col gap-4 border-b border-border/70 pb-6 sm:flex-row sm:items-center">
      <div className="relative shrink-0">
        <span className="flex size-20 items-center justify-center rounded-full bg-primary/10 text-xl font-semibold text-primary ring-2 ring-card">
          {initials(name)}
        </span>
        {readOnly ? null : (
          <span
            className="absolute -end-0.5 -bottom-0.5 flex size-8 items-center justify-center rounded-full border border-border bg-card text-primary shadow-sm"
            aria-hidden="true"
          >
            <EditIcon className={ICON_SIZE.inline} />
          </span>
        )}
      </div>
      <div className="min-w-0 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-lg font-semibold text-foreground">{name}</p>
          {roleLabel === '' ? null : <StatusBadge tone="success">{roleLabel}</StatusBadge>}
        </div>
        <p className="text-sm text-muted-foreground">{email}</p>
        {phone === null || phone === '' ? null : (
          <p className="text-sm text-muted-foreground">{phone}</p>
        )}
      </div>
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
