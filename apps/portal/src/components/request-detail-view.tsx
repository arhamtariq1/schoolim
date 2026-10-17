'use client';

import {
  REQUEST_CATEGORY_LABELS,
  REQUEST_STATUS_LABELS,
  ROUTES,
  type RequestAssigneeOption,
  type RequestDetail,
  type RequestEvent,
  type RequestStatus,
} from '@ilm/contracts';
import {
  Button,
  Card,
  cn,
  DateDisplay,
  Field,
  SimpleSelect,
  statusToneIcon,
  Textarea,
  useToast,
} from '@ilm/ui';
import {
  AccountIcon,
  ChevronLeftIcon,
  ICON_SIZE,
  SendIcon,
  UndoIcon,
} from '@ilm/ui/icons';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';

import { PageHeader } from '@/components/page-header';
import { RequestPriorityBadge, RequestStatusBadge } from '@/components/request-badges';
import { PictureGallery } from '@/components/request-pictures';
import { mutate } from '@/lib/mutate';
import { REQUEST_STATUS_TONES } from '@/lib/request-ui';
import { useTenantHref } from '@/lib/use-tenant-href';

/**
 * One request, laid out to be read at a glance.
 *
 * Top to bottom: what was asked, then what has happened since as a timeline. To the side, who is involved and — for the office — what can be
 * done next.
 *
 * Who is looking decides what is on offer, and the server decides who is
 * looking: the buttons come from `allowedStatuses` and `canAssign` in the
 * response, never from a role check in the browser.
 */
export function RequestDetailView({
  request,
  assignees,
  canManage,
}: {
  readonly request: RequestDetail;
  /** Who it can be given to. Empty for anyone who cannot assign. */
  readonly assignees: readonly RequestAssigneeOption[];
  readonly canManage: boolean;
}) {
  const tenantHref = useTenantHref();
  const closed = request.status === 'RESOLVED' || request.status === 'REJECTED';
  const raised = request.events.find((event) => event.kind === 'CREATED');
  const timeline = request.events.filter((event) => event.kind !== 'MESSAGE');
  const hasActions = request.canAssign || (canManage && request.allowedStatuses.length > 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title={request.subject}
        description={`${request.requestNo} · ${REQUEST_CATEGORY_LABELS[request.category]}`}
        badge={<RequestStatusBadge status={request.status} />}
        actions={
          <Button asChild tone="outline" size="sm">
            <Link href={tenantHref('/requests')}>
              <ChevronLeftIcon className={ICON_SIZE.inline} aria-hidden />
              {canManage ? 'All requests' : 'My requests'}
            </Link>
          </Button>
        }
      />

      <div className="grid items-start gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <Card className="overflow-hidden">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar name={request.requester.name} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{request.requester.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {request.requester.roleLabel} ·{' '}
                    <DateDisplay value={request.createdAt} precision="datetime" />
                  </p>
                </div>
              </div>
              <RequestPriorityBadge priority={request.priority} />
            </header>

            <div className="space-y-4 px-5 py-5">
              <Eyebrow>What was asked</Eyebrow>
              {/* Plain text, preserved as written: never HTML. */}
              <p className="text-base leading-relaxed whitespace-pre-wrap text-foreground">
                {request.description}
              </p>
              <PictureGallery pictures={raised?.attachments ?? []} />
            </div>

            {request.student === null ? null : (
              <footer className="flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-border bg-muted/30 px-5 py-3 text-sm">
                <span className="text-muted-foreground">About</span>
                <span className="font-medium text-foreground">{request.student.name}</span>
                <span className="text-muted-foreground">
                  {[request.student.className, request.student.grNo === null ? null : `GR ${request.student.grNo}`]
                    .filter((part) => part !== null)
                    .join(' · ')}
                </span>
              </footer>
            )}
          </Card>

          {request.isRequester && !closed && request.status !== 'REOPENED' ? (
            <p className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-foreground">
              Your request has been sent to the school. They will contact you about it.
            </p>
          ) : null}

          {closed && request.isRequester ? (
            <ReopenNotice requestId={request.id} status={request.status} />
          ) : null}

          <section aria-labelledby="activity" className="space-y-4">
            <Eyebrow id="activity">Activity</Eyebrow>
            <ol className="relative ms-3.5 border-s border-border">
              {timeline.map((event) => (
                <TimelineItem key={event.id} event={event} />
              ))}
            </ol>
          </section>
        </div>

        <aside className="min-w-0 space-y-6">
          <Card className="divide-y divide-border">
            <DetailGroup title="Request">
              <Detail label="Status">
                <RequestStatusBadge status={request.status} />
              </Detail>
              <Detail label="Priority">
                <RequestPriorityBadge priority={request.priority} />
              </Detail>
              <Detail label="Category">{REQUEST_CATEGORY_LABELS[request.category]}</Detail>
            </DetailGroup>

            <DetailGroup title="People">
              <Detail label="Raised by">
                {request.requester.name}
                <Sub>{request.requester.roleLabel}</Sub>
              </Detail>
              {request.requesterContact === null ? null : (
                <Detail label="Contact">
                  {request.requesterContact.phone ?? 'No phone on file'}
                  {request.requesterContact.email === null ? null : (
                    <Sub>{request.requesterContact.email}</Sub>
                  )}
                </Detail>
              )}
              <Detail label="Assigned to">
                {request.assignee === null ? (
                  <span className="font-normal text-muted-foreground">Not assigned yet</span>
                ) : (
                  <>
                    {request.assignee.name}
                    <Sub>{request.assignee.roleLabel}</Sub>
                  </>
                )}
              </Detail>
            </DetailGroup>

            <DetailGroup title="Dates">
              <Detail label="Raised">
                <DateDisplay value={request.createdAt} precision="datetime" />
              </Detail>
              <Detail label="Last activity">
                <DateDisplay value={request.lastActivityAt} precision="datetime" />
              </Detail>
              {request.resolvedAt === null ? null : (
                <Detail label="Resolved">
                  <DateDisplay value={request.resolvedAt} precision="datetime" />
                </Detail>
              )}
            </DetailGroup>
          </Card>

          {hasActions ? (
            <Card className="divide-y divide-border">
              {request.canAssign ? <AssignPanel request={request} assignees={assignees} /> : null}
              {canManage && request.allowedStatuses.length > 0 ? <StatusPanel request={request} /> : null}
            </Card>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

// --- What has happened ------------------------------------------------------

function TimelineItem({ event }: { readonly event: RequestEvent }) {
  const { icon: Icon, tone } = eventLook(event);

  return (
    <li className="relative pb-6 ps-8 last:pb-0">
      <span
        aria-hidden
        className={cn(
          'absolute -start-3.5 top-0 flex size-7 items-center justify-center rounded-full border bg-card',
          tone,
        )}
      >
        <Icon className="size-3.5" />
      </span>
      <p className="text-sm text-foreground">
        <span className="font-semibold">{event.actor.name}</span>{' '}
        <span className="text-muted-foreground">{describeEvent(event)}</span>
      </p>
      <p className="text-xs text-muted-foreground">
        <DateDisplay value={event.createdAt} precision="datetime" />
      </p>
      {event.kind === 'STATUS_CHANGED' && event.body !== null ? (
        <blockquote className="mt-2 rounded-lg border-s-2 border-primary/40 bg-muted/40 px-3 py-2 text-sm whitespace-pre-wrap text-foreground">
          {event.body}
        </blockquote>
      ) : null}
    </li>
  );
}

function eventLook(event: RequestEvent): { icon: typeof SendIcon; tone: string } {
  if (event.kind === 'STATUS_CHANGED' && event.toStatus !== null) {
    const tone = REQUEST_STATUS_TONES[event.toStatus];
    return {
      icon: statusToneIcon(tone),
      tone:
        tone === 'success'
          ? 'border-success/40 text-success'
          : tone === 'danger'
            ? 'border-danger/40 text-danger'
            : tone === 'warning' || tone === 'orange'
              ? 'border-warning/40 text-warning'
              : 'border-info/40 text-info',
    };
  }
  if (event.kind === 'ASSIGNED') {
    return { icon: AccountIcon, tone: 'border-primary/40 text-primary' };
  }
  return { icon: SendIcon, tone: 'border-border text-muted-foreground' };
}

function describeEvent(event: RequestEvent): string {
  if (event.kind === 'CREATED') {
    return 'sent this request';
  }
  if (event.kind === 'STATUS_CHANGED' && event.fromStatus !== null && event.toStatus !== null) {
    return `changed the status from ${REQUEST_STATUS_LABELS[event.fromStatus]} to ${REQUEST_STATUS_LABELS[event.toStatus]}`;
  }
  if (event.kind === 'ASSIGNED') {
    return event.assignee === null ? 'unassigned this request' : `assigned this request to ${event.assignee.name}`;
  }
  return 'updated this request';
}

// --- Small pieces -----------------------------------------------------------

function Eyebrow({ children, id }: { readonly children: ReactNode; readonly id?: string }) {
  return (
    <h2 id={id} className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
      {children}
    </h2>
  );
}

function Avatar({ name }: { readonly name: string }) {
  const initials = name
    .split(/\s+/)
    .filter((part) => part !== '')
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
  return (
    <span
      aria-hidden
      className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary"
    >
      {initials === '' ? <AccountIcon className={ICON_SIZE.inline} /> : initials}
    </span>
  );
}

function DetailGroup({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <section className="space-y-3 px-5 py-4">
      <h3 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{title}</h3>
      <dl className="space-y-3 text-sm">{children}</dl>
    </section>
  );
}

function Detail({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-end font-medium text-foreground">{children}</dd>
    </div>
  );
}

function Sub({ children }: { readonly children: ReactNode }) {
  return <span className="block text-xs font-normal break-words text-muted-foreground">{children}</span>;
}

// --- Acting on it -----------------------------------------------------------

function ReopenNotice({ requestId, status }: { readonly requestId: string; readonly status: RequestStatus }) {
  const router = useRouter();
  const toast = useToast();
  const [isPending, setIsPending] = useState(false);

  async function reopen(): Promise<void> {
    setIsPending(true);
    const result = await mutate<RequestDetail>(ROUTES.requests.status(requestId), 'POST', {
      status: 'REOPENED',
    });
    setIsPending(false);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    toast.success('Request reopened. The school has been told.');
    router.refresh();
  }

  return (
    <Card className="flex flex-wrap items-center justify-between gap-3 border-primary/20 bg-primary/5 px-5 py-4">
      <p className="text-sm text-foreground">
        This request is {REQUEST_STATUS_LABELS[status].toLowerCase()}. Reopen it if you still need help — the
        school will be told.
      </p>
      <Button tone="outline" isPending={isPending} onClick={() => void reopen()}>
        <UndoIcon className={ICON_SIZE.inline} aria-hidden />
        Reopen
      </Button>
    </Card>
  );
}

function AssignPanel({
  request,
  assignees,
}: {
  readonly request: RequestDetail;
  readonly assignees: readonly RequestAssigneeOption[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [isPending, setIsPending] = useState(false);

  async function assign(assigneeId: string): Promise<void> {
    setIsPending(true);
    const result = await mutate<RequestDetail>(ROUTES.requests.assign(request.id), 'POST', {
      assigneeId: assigneeId === '' ? null : assigneeId,
    });
    setIsPending(false);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    toast.success(assigneeId === '' ? 'Unassigned.' : 'Assigned.');
    router.refresh();
  }

  return (
    <section className="space-y-3 px-5 py-4">
      <h3 className="text-sm font-semibold text-foreground">Assign</h3>
      <SimpleSelect
        ariaLabel="Assign this request to"
        value={request.assignee?.id ?? ''}
        disabled={isPending}
        placeholder="Not assigned"
        emptyOption={{ value: '', label: 'Not assigned' }}
        options={assignees.map((person) => ({
          value: person.id,
          label: `${person.name} · ${person.roleLabel}`,
        }))}
        onValueChange={(next) => {
          void assign(next);
        }}
      />
    </section>
  );
}

function StatusPanel({ request }: { readonly request: RequestDetail }) {
  const router = useRouter();
  const toast = useToast();
  const [status, setStatus] = useState<RequestStatus | ''>('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [isPending, setIsPending] = useState(false);

  async function update(): Promise<void> {
    if (status === '') {
      return;
    }
    if (status === 'REJECTED' && note.trim().length < 3) {
      setError('Say why it is being rejected.');
      return;
    }
    setError(undefined);
    setIsPending(true);
    const result = await mutate<RequestDetail>(ROUTES.requests.status(request.id), 'POST', {
      status,
      ...(note.trim() === '' ? {} : { note: note.trim() }),
    });
    setIsPending(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    toast.success(`Marked ${REQUEST_STATUS_LABELS[status].toLowerCase()}.`);
    setStatus('');
    setNote('');
    router.refresh();
  }

  return (
    <section className="space-y-3 px-5 py-4">
      <h3 className="text-sm font-semibold text-foreground">Update status</h3>
      <SimpleSelect
        ariaLabel="New status"
        value={status}
        placeholder="Choose a status"
        options={request.allowedStatuses.map((value) => ({
          value,
          label: REQUEST_STATUS_LABELS[value],
        }))}
        onValueChange={(next) => {
          setStatus(next as RequestStatus);
          setError(undefined);
        }}
      />
      <Field
        label={status === 'REJECTED' ? 'Reason' : 'Note (optional)'}
        required={status === 'REJECTED'}
        error={error}
        hint="Shown to the person who raised it."
      >
        <Textarea
          rows={2}
          value={note}
          disabled={isPending}
          onChange={(event) => {
            setNote(event.target.value);
          }}
        />
      </Field>
      <Button className="w-full" disabled={status === ''} isPending={isPending} onClick={() => void update()}>
        Update status
      </Button>
    </section>
  );
}
