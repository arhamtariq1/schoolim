'use client';

import {
  ROUTES,
  STAFF_ROLE_LABELS,
  staffRoleCanSignIn,
  type StaffInviteResult,
  type StaffProfile,
} from '@ilm/contracts';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  DateDisplay,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Money,
  StatusBadge,
  useToast,
} from '@ilm/ui';
import {
  BackIcon,
  DeleteIcon,
  EditIcon,
  ExportIcon,
  MoreIcon,
  SendIcon,
} from '@ilm/ui/icons';
import { minorUnits } from '@ilm/utils';
import type { Route } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';

import { StaffDialog } from '@/components/staff-dialog';
import { mutate } from '@/lib/mutate';
import { displayPhone } from '@/lib/phone-format';
import { useTenantHref } from '@/lib/use-tenant-href';

export function StaffProfileView({
  profile: initial,
  canManage,
}: {
  profile: StaffProfile;
  canManage: boolean;
}) {
  const router = useRouter();
  const tenantHref = useTenantHref();
  const toast = useToast();
  const [profile] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [inviting, setInviting] = useState(false);

  async function sendInvite() {
    setInviting(true);
    const result = await mutate<StaffInviteResult>(ROUTES.staff.invite(profile.id), 'POST');
    setInviting(false);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    if (result.data.sent) {
      toast.success(`Invitation sent to ${result.data.email}`);
    } else {
      toast.warning('Invitation created, but the email did not go', 'Try Re-send from the menu.');
    }
    router.refresh();
  }

  async function confirmDelete() {
    const result = await mutate(ROUTES.staff.remove(profile.id), 'DELETE', {
      reason: 'Removed from the staff list',
    });
    if (!result.ok) {
      toast.error(result.message);
      setDeleting(false);
      return;
    }
    toast.success(`${profile.name} removed`);
    router.push(tenantHref('/staff' as Route));
  }

  const canInvite =
    canManage &&
    staffRoleCanSignIn(profile.role) &&
    profile.email !== null &&
    profile.email !== '';

  return (
    <div className="w-full space-y-6">
      <nav>
        <Link
          href={tenantHref('/staff' as Route)}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground underline"
        >
          <BackIcon className="size-4" aria-hidden="true" />
          All staff
        </Link>
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
        <div className="flex min-w-0 items-start gap-4">
          {profile.photoUrl === null || profile.photoUrl === '' ? (
            <span className="flex size-16 shrink-0 items-center justify-center rounded-xl bg-muted text-lg font-semibold text-muted-foreground">
              {initials(profile.name)}
            </span>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- staff photo may be a data URL or external URL
            <img
              src={profile.photoUrl}
              alt=""
              className="size-16 shrink-0 rounded-xl border border-border object-cover"
            />
          )}
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
                {profile.name}
              </h1>
              <StatusBadge tone={profile.status === 'ACTIVE' ? 'success' : 'neutral'}>
                {profile.status === 'ACTIVE' ? 'Active' : 'Left'}
              </StatusBadge>
            </div>
            <p className="text-sm text-muted-foreground md:text-base">
              {STAFF_ROLE_LABELS[profile.role]} · ID {profile.employeeNo}
            </p>
          </div>
        </div>

        {canManage ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" tone="outline" size="icon" className="size-9" aria-label="Actions">
                <MoreIcon className="size-4" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {canInvite ? (
                <DropdownMenuItem
                  disabled={inviting}
                  onSelect={() => {
                    void sendInvite();
                  }}
                >
                  <SendIcon className="size-4" aria-hidden="true" />
                  {profile.hasLogin ? 'Re-send invite' : 'Send invite'}
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem
                onSelect={() => {
                  setEditing(true);
                }}
              >
                <EditIcon className="size-4" aria-hidden="true" />
                Edit staff
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-danger focus:text-danger"
                onSelect={() => {
                  setDeleting(true);
                }}
              >
                <DeleteIcon className="size-4" aria-hidden="true" />
                Remove staff
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="shadow-raised">
          <CardHeader>
            <CardTitle className="text-base">Contact</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <DetailRow label="Email" value={profile.email ?? '—'} />
            <DetailRow
              label="Phone"
              value={
                profile.phone === null || profile.phone === ''
                  ? '—'
                  : displayPhone(profile.phone)
              }
            />
            <DetailRow label="CNIC" value={profile.cnic ?? '—'} mono />
            <DetailRow label="Address" value={profile.address ?? '—'} />
            <DetailRow
              label="Gender"
              value={
                profile.gender === null
                  ? '—'
                  : profile.gender.charAt(0) + profile.gender.slice(1).toLowerCase()
              }
            />
          </CardContent>
        </Card>

        <Card className="shadow-raised">
          <CardHeader>
            <CardTitle className="text-base">Employment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <DetailRow label="Role" value={STAFF_ROLE_LABELS[profile.role]} />
            <DetailRow label="Designation" value={profile.designation ?? '—'} />
            <DetailRow
              label="Joined"
              value={
                profile.joinedOn === null ? '—' : <DateDisplay value={profile.joinedOn} />
              }
            />
            <DetailRow label="Portal access" value={portalAccessLabel(profile)} />
            <DetailRow
              label="Basic salary"
              value={<Money valueMinor={minorUnits(profile.basicSalaryMinor)} dashOnZero />}
            />
            <DetailRow
              label="Leave allowance"
              value={`${String(profile.casualLeaves)} casual · ${String(profile.sickLeaves)} sick`}
            />
          </CardContent>
        </Card>

        <Card className="shadow-raised lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Documents</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {profile.cvUrl === null || profile.cvUrl === '' ? (
              <p className="text-muted-foreground">No CV on file.</p>
            ) : (
              <a
                href={profile.cvUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-primary underline"
              >
                <ExportIcon className="size-4" aria-hidden="true" />
                View CV
              </a>
            )}
          </CardContent>
        </Card>
      </div>

      {editing ? (
        <StaffDialog
          editing={profile}
          onClose={() => {
            setEditing(false);
            router.refresh();
          }}
        />
      ) : null}

      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Remove ${profile.name}?`}
        description="Their employment record is kept for payroll history, but they disappear from the staff list and lose portal access."
        confirmLabel="Remove"
        tone="danger"
        onConfirm={confirmDelete}
      />
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-4">
      <span className="w-32 shrink-0 text-muted-foreground">{label}</span>
      <span className={mono ? 'font-mono tabular-nums text-foreground' : 'text-foreground'}>
        {value}
      </span>
    </div>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) {
    return '?';
  }
  if (parts.length === 1) {
    return parts[0]?.slice(0, 2).toUpperCase() ?? '?';
  }
  return `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}`.toUpperCase();
}

function portalAccessLabel(profile: StaffProfile): string {
  if (profile.invitePending) {
    return 'Invited — awaiting password';
  }
  if (profile.hasLogin) {
    return 'Active login';
  }
  if (staffRoleCanSignIn(profile.role)) {
    return 'No login yet';
  }
  return 'Payroll only — no portal';
}
