import {
  REQUEST_CATEGORY_LABELS,
  REQUEST_PRIORITY_LABELS,
  REQUEST_STATUS_LABELS,
  type RequestCategory,
  type RequestPriority,
  type RequestStatus,
} from '@ilm/contracts';
import { StatusBadge } from '@ilm/ui';

import { REQUEST_PRIORITY_TONES, REQUEST_STATUS_TONES } from '@/lib/request-ui';

/** A request's status: always a colour and a word. */
export function RequestStatusBadge({ status }: { readonly status: RequestStatus }) {
  return <StatusBadge tone={REQUEST_STATUS_TONES[status]}>{REQUEST_STATUS_LABELS[status]}</StatusBadge>;
}

export function RequestPriorityBadge({ priority }: { readonly priority: RequestPriority }) {
  return (
    <StatusBadge tone={REQUEST_PRIORITY_TONES[priority]} showIcon={false}>
      {REQUEST_PRIORITY_LABELS[priority]}
    </StatusBadge>
  );
}

export function RequestCategoryLabel({ category }: { readonly category: RequestCategory }) {
  return <span className="text-sm text-foreground">{REQUEST_CATEGORY_LABELS[category]}</span>;
}
