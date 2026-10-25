import { ROUTES, type RequestAssigneeOption, type RequestDetail } from '@ilm/contracts';
import { ErrorState } from '@ilm/ui';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { RequestDetailView } from '@/components/request-detail-view';
import { apiFetch } from '@/lib/api';
import { getSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Request' };

/**
 * One request.
 *
 * A request that is not yours answers 404 from the API — the same as one that
 * does not exist — and this page says the same: it never confirms that an id is
 * real. Anything else that goes wrong is said in words, with a way back.
 */
export default async function RequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  const canManage = session?.permissions.includes('workflow.request.manage') ?? false;

  const [detail, assignees] = await Promise.all([
    apiFetch<{ data: RequestDetail }>(ROUTES.requests.detail(id)),
    canManage
      ? apiFetch<{ data: RequestAssigneeOption[] }>(ROUTES.requests.assignees)
      : Promise.resolve(undefined),
  ]);

  if (!detail.ok) {
    if (detail.status === 404 || detail.status === 400) {
      notFound();
    }
    return <ErrorState title="That request did not load" description={detail.message} />;
  }

  return (
    <RequestDetailView
      request={detail.data.data}
      assignees={assignees?.ok === true ? assignees.data.data : []}
      canManage={canManage}
    />
  );
}
