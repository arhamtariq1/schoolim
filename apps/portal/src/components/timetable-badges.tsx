import {
  TIMETABLE_EVENT_KIND_LABELS,
  TIMETABLE_STATUS_LABELS,
  type TimetableEventKind,
  type TimetableStatus,
} from '@ilm/contracts';
import { StatusBadge } from '@ilm/ui';

import { TIMETABLE_EVENT_TONES, TIMETABLE_STATUS_TONES } from '@/lib/timetable-ui';

export function TimetableStatusBadge({ status }: { readonly status: TimetableStatus }) {
  return <StatusBadge tone={TIMETABLE_STATUS_TONES[status]}>{TIMETABLE_STATUS_LABELS[status]}</StatusBadge>;
}

export function TimetableEventBadge({ kind }: { readonly kind: TimetableEventKind }) {
  return (
    <StatusBadge tone={TIMETABLE_EVENT_TONES[kind]} showIcon={false}>
      {TIMETABLE_EVENT_KIND_LABELS[kind]}
    </StatusBadge>
  );
}
