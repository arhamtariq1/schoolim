import { SCHOOL_LEVEL_LABELS, type SchoolLevelId } from '@ilm/contracts';
import { StatusBadge, cn } from '@ilm/ui';

export function ProfileDisplayField({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  const empty = value.trim() === '';
  return (
    <div className={cn('space-y-1', className)}>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className={cn('text-sm font-medium text-foreground', empty && 'text-muted-foreground')}>
        {empty ? '—' : value}
      </dd>
    </div>
  );
}

export function ProfileDisplayLevelBadges({ levelIds }: { levelIds: readonly string[] }) {
  if (levelIds.length === 0) {
    return <p className="text-sm text-muted-foreground">—</p>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {levelIds.map((id) => (
        <StatusBadge key={id} tone="neutral">
          {SCHOOL_LEVEL_LABELS[id as SchoolLevelId] ?? id}
        </StatusBadge>
      ))}
    </div>
  );
}
