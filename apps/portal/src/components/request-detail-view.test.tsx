import { type RequestDetail } from '@ilm/contracts';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RequestDetailView } from './request-detail-view';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/requests/r1',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/lib/use-tenant-href', () => ({ useTenantHref: () => (path: string) => path }));

afterEach(cleanup);

/**
 * What the screen offers, by who is looking.
 *
 * The buttons come from the server's answer — `allowedStatuses`, `canReply`,
 * `canAssign` — so these feed it each answer and check the screen does what it
 * was told, rather than working anything out itself.
 */

const PARENT = { id: 'p1', name: 'Amna Parent', roleLabel: 'Parent' };
const OFFICE = { id: 'o1', name: 'Rita Office', roleLabel: 'Office Staff' };

function request(over: Partial<RequestDetail> = {}): RequestDetail {
  return {
    id: 'r1',
    requestNo: 'REQ-0001',
    subject: 'Fee voucher shows the wrong month',
    category: 'FEE',
    priority: 'HIGH',
    status: 'PENDING',
    requester: PARENT,
    student: { id: 's1', name: 'Zara Khan', grNo: 'GR-1', className: 'Class A' },
    assignee: null,
    createdAt: '2026-10-01T09:00:00.000Z',
    lastActivityAt: '2026-10-01T09:00:00.000Z',
    description: 'The October voucher is billed for September as well.',
    resolvedAt: null,
    events: [
      {
        id: 'e1',
        kind: 'CREATED',
        actor: PARENT,
        body: null,
        fromStatus: null,
        toStatus: null,
        assignee: null,
        attachments: [],
        createdAt: '2026-10-01T09:00:00.000Z',
      },
    ],
    allowedStatuses: [],
    canAssign: false,
    isRequester: true,
    requesterContact: null,
    ...over,
  };
}

describe('the request, as the person who raised it', () => {
  it('shows what they asked and who it is about, with no reply box', () => {
    render(<RequestDetailView request={request()} assignees={[]} canManage={false} />);

    expect(screen.getByText('The October voucher is billed for September as well.')).toBeTruthy();
    expect(screen.getByText('Zara Khan')).toBeTruthy();
    // No chat: the school contacts them, and the request shows where it stands.
    expect(screen.queryByLabelText(/your reply/i)).toBeNull();
    expect(screen.getByRole('link', { name: /my requests/i })).toBeTruthy();
  });

  it('offers no way to set a status or assign it', () => {
    render(<RequestDetailView request={request()} assignees={[]} canManage={false} />);

    expect(screen.queryByRole('heading', { name: 'Update status' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Assign' })).toBeNull();
  });

  it('offers to reopen a closed request', () => {
    render(
      <RequestDetailView
        request={request({ status: 'RESOLVED', allowedStatuses: ['REOPENED'] })}
        assignees={[]}
        canManage={false}
      />,
    );

    expect(screen.queryByLabelText(/your reply/i)).toBeNull();
    expect(screen.getByRole('button', { name: /reopen/i })).toBeTruthy();
    expect(screen.getByText(/reopen it if you still need help/i)).toBeTruthy();
  });

  it('says the school will contact them', () => {
    render(<RequestDetailView request={request()} assignees={[]} canManage={false} />);
    expect(screen.getByText(/they will contact you/i)).toBeTruthy();
  });
});

describe('the request, as the office', () => {
  const managed = request({
    canAssign: true,
    isRequester: false,
    allowedStatuses: ['IN_PROGRESS', 'RESOLVED', 'REJECTED'],
  });

  it('offers assigning and the status moves the server allowed', () => {
    render(<RequestDetailView request={managed} assignees={[OFFICE]} canManage />);

    expect(screen.getByRole('heading', { name: 'Assign' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Update status' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /all requests/i })).toBeTruthy();
  });

  it('offers neither once there is nothing left to move it to', () => {
    render(
      <RequestDetailView
        request={request({ canAssign: true, isRequester: false, allowedStatuses: [] })}
        assignees={[OFFICE]}
        canManage
      />,
    );
    expect(screen.queryByRole('heading', { name: 'Update status' })).toBeNull();
  });

  it('writes the history in order: who changed what, with the note they left', () => {
    const history = request({
      isRequester: false,
      events: [
        ...request().events,
        {
          id: 'e2',
          kind: 'ASSIGNED',
          actor: OFFICE,
          body: null,
          fromStatus: null,
          toStatus: null,
          assignee: OFFICE,
          attachments: [],
          createdAt: '2026-10-01T10:00:00.000Z',
        },
        {
          id: 'e3',
          kind: 'STATUS_CHANGED',
          actor: OFFICE,
          body: 'Voucher corrected.',
          fromStatus: 'PENDING',
          toStatus: 'RESOLVED',
          assignee: null,
          attachments: [],
          createdAt: '2026-10-01T11:00:00.000Z',
        },
      ],
    });
    render(<RequestDetailView request={history} assignees={[]} canManage />);

    expect(screen.getByText(/assigned this request to Rita Office/)).toBeTruthy();
    expect(screen.getByText(/changed the status from Pending to Resolved/)).toBeTruthy();
    expect(screen.getByText('Voucher corrected.')).toBeTruthy();
  });

  it('shows the office the way to reach the person who raised it', () => {
    render(
      <RequestDetailView
        request={request({
          isRequester: false,
          requesterContact: { phone: '+923001112223', email: 'amna@example.test' },
        })}
        assignees={[]}
        canManage
      />,
    );
    expect(screen.getByText('+923001112223')).toBeTruthy();
    expect(screen.getByText('amna@example.test')).toBeTruthy();
  });

  it('never shows the person who raised it their own contact box', () => {
    render(<RequestDetailView request={request()} assignees={[]} canManage={false} />);
    expect(screen.queryByText('Contact')).toBeNull();
  });
});
