import { type SchoolListItem } from '@ilm/contracts';
import { StatusBadge } from '@ilm/ui';

const TONE: Record<SchoolListItem['status'], 'success' | 'neutral' | 'warning' | 'danger'> = {
  ACTIVE: 'success',
  TRIAL: 'neutral',
  PAST_DUE: 'warning',
  SUSPENDED: 'warning',
  CHURNED: 'danger',
};

export const STATUS_LABEL: Record<SchoolListItem['status'], string> = {
  ACTIVE: 'Active',
  TRIAL: 'Trial',
  PAST_DUE: 'Past due',
  SUSPENDED: 'Suspended',
  CHURNED: 'Churned',
};

/** One mapping from status to colour and wording, so no screen invents its own. */
export function SchoolStatusBadge({ status }: { status: SchoolListItem['status'] }) {
  return <StatusBadge tone={TONE[status]}>{STATUS_LABEL[status]}</StatusBadge>;
}
