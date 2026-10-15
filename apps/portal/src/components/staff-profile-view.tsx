'use client';

import { STAFF_ROLE_LABELS, staffRoleCanSignIn, type StaffProfile } from '@ilm/contracts';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DateDisplay,
  EmptyState,
  Money,
  StatusBadge,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@ilm/ui';
import {
  AccountIcon,
  CalendarIcon,
  EditIcon,
  EmailIcon,
  ExportIcon,
  LocationIcon,
  PhoneIcon,
} from '@ilm/ui/icons';
import { minorUnits } from '@ilm/utils';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';

import { StaffDialog } from '@/components/staff-dialog';
import { StaffProfileAttendancePanel } from '@/components/staff-profile-attendance';
import { StaffSalaryPanel } from '@/components/staff-salary-panel';
import { displayPhone } from '@/lib/phone-format';

interface StaffProfileViewProps {
  readonly profile: StaffProfile;
  /** Names of the classes a teacher takes, resolved from `profile.classLevelIds`. */
  readonly classNames: readonly string[];
  readonly can: {
    readonly edit: boolean;
    readonly attendance: boolean;
    readonly salary: boolean;
    readonly pay: boolean;
  };
  /** `YYYY-MM-DD`, today in the school's calendar. */
  readonly today: string;
}

/**
 * Staff › one member of staff.
 *
 * Laid out like a student's page: a header card, then tabs. There is no Back
 * link and no ⋮ menu — the sidebar already goes back, and the actions that menu
 * held (re-send invite, remove) are on the staff list, where they apply to many
 * people at once. What stays is the one thing this page is for changing: Edit.
 */
export function StaffProfileView({ profile, classNames, can, today }: StaffProfileViewProps) {
  const router = useRouter();
  const [tab, setTab] = useState('overview');
  const [editing, setEditing] = useState(false);

  const tabs: (readonly [string, string])[] = [
    ['overview', 'Overview'],
    ['attendance', 'Attendance'],
    ...(can.salary ? ([['salary', 'Salary history']] as const) : []),
  ];

  return (
    <div className="w-full space-y-6">
      <Card className="shadow-raised">
        <CardContent className="flex flex-wrap items-start justify-between gap-4 p-6">
          <div className="flex min-w-0 flex-1 gap-4">
            {profile.photoUrl === null || profile.photoUrl === '' ? (
              <span className="flex size-16 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg font-semibold text-primary">
                {initials(profile.name)}
              </span>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- staff photo may be a data URL or external URL
              <img
                src={profile.photoUrl}
                alt=""
                className="size-16 shrink-0 rounded-full border border-border object-cover"
              />
            )}
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
                  {profile.name}
                </h1>
                <StatusBadge tone={profile.status === 'ACTIVE' ? 'success' : 'neutral'}>
                  {profile.status === 'ACTIVE' ? 'Active' : 'Left'}
                </StatusBadge>
              </div>

              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                <span>
                  Role: <span className="text-foreground">{STAFF_ROLE_LABELS[profile.role]}</span>
                </span>
                <span aria-hidden="true">|</span>
                <span>
                  Employee ID: <span className="font-mono text-foreground">{profile.employeeNo}</span>
                </span>
                {classNames.length === 0 ? null : (
                  <>
                    <span aria-hidden="true">|</span>
                    <span>
                      Classes: <span className="text-foreground">{classNames.join(', ')}</span>
                    </span>
                  </>
                )}
              </p>

              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                {profile.gender === null ? null : (
                  <span className="inline-flex items-center gap-1.5">
                    <AccountIcon className="size-4 shrink-0" aria-hidden="true" />
                    {profile.gender.charAt(0) + profile.gender.slice(1).toLowerCase()}
                  </span>
                )}
                {profile.joinedOn === null ? null : (
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarIcon className="size-4 shrink-0" aria-hidden="true" />
                    Joined <DateDisplay value={profile.joinedOn} />
                  </span>
                )}
                {profile.phone === null || profile.phone === '' ? null : (
                  <span className="inline-flex items-center gap-1.5">
                    <PhoneIcon className="size-4 shrink-0" aria-hidden="true" />
                    <a href={`tel:${profile.phone}`} className="text-foreground underline">
                      {displayPhone(profile.phone)}
                    </a>
                  </span>
                )}
                {profile.email === null || profile.email === '' ? null : (
                  <span className="inline-flex min-w-0 items-center gap-1.5">
                    <EmailIcon className="size-4 shrink-0" aria-hidden="true" />
                    <span className="truncate text-foreground">{profile.email}</span>
                  </span>
                )}
                {profile.address === null || profile.address === '' ? null : (
                  <span className="inline-flex min-w-0 items-center gap-1.5">
                    <LocationIcon className="size-4 shrink-0" aria-hidden="true" />
                    <span className="truncate text-foreground">{profile.address}</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          {can.edit ? (
            <div className="flex shrink-0 items-center gap-2">
              <Button
                tone="outline"
                onClick={() => {
                  setEditing(true);
                }}
              >
                <EditIcon className="size-4" aria-hidden="true" />
                Edit staff
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-none border-b border-border bg-transparent p-0">
          {tabs.map(([value, label]) => (
            <TabsTrigger
              key={value}
              value={value}
              className="rounded-none border-b-2 border-transparent px-4 py-2.5 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none"
            >
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <Overview profile={profile} classNames={classNames} canSeeSalary={can.salary} />
        </TabsContent>

        <TabsContent value="attendance" className="mt-6">
          {can.attendance ? (
            <StaffProfileAttendancePanel staffId={profile.id} staffName={profile.name} />
          ) : (
            <EmptyState
              title="Attendance"
              description="You do not have permission to view staff attendance."
            />
          )}
        </TabsContent>

        {can.salary ? (
          <TabsContent value="salary" className="mt-6">
            <StaffSalaryPanel
              staffId={profile.id}
              staffName={profile.name}
              canPay={can.pay}
              today={today}
            />
          </TabsContent>
        ) : null}
      </Tabs>

      {editing ? (
        <StaffDialog
          editing={profile}
          onClose={() => {
            setEditing(false);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function Overview({
  profile,
  classNames,
  canSeeSalary,
}: {
  profile: StaffProfile;
  classNames: readonly string[];
  canSeeSalary: boolean;
}) {
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Panel title="Personal information">
        <Row label="Full name" value={profile.name} />
        <Row
          label="Gender"
          value={
            profile.gender === null
              ? null
              : profile.gender.charAt(0) + profile.gender.slice(1).toLowerCase()
          }
        />
        <Row label="CNIC" value={profile.cnic} mono />
        <Row
          label="Phone"
          value={profile.phone === null || profile.phone === '' ? null : displayPhone(profile.phone)}
        />
        <Row label="Email" value={profile.email} />
        <Row label="Address" value={profile.address} />
      </Panel>

      <Panel title="Employment">
        <Row label="Role" value={STAFF_ROLE_LABELS[profile.role]} />
        <Row label="Employee ID" value={profile.employeeNo} mono />
        <Row label="Designation" value={profile.designation} />
        <Row
          label="Joined"
          value={profile.joinedOn === null ? null : <DateDisplay value={profile.joinedOn} />}
        />
        <Row label="Portal access" value={portalAccessLabel(profile)} />
        {canSeeSalary ? (
          <Row
            label="Basic salary"
            value={<Money valueMinor={minorUnits(profile.basicSalaryMinor)} withSymbol dashOnZero />}
          />
        ) : null}
        <Row
          label="Leave allowance"
          value={`${String(profile.casualLeaves)} casual · ${String(profile.sickLeaves)} sick`}
        />
        {profile.role === 'TEACHER' ? (
          <Row
            label="Classes"
            value={classNames.length === 0 ? 'None assigned — sees no class yet' : classNames.join(', ')}
          />
        ) : null}
      </Panel>

      <Panel title="Documents" className="xl:col-span-2">
        {profile.cvUrl === null || profile.cvUrl === '' ? (
          <p className="px-6 py-3 text-sm text-muted-foreground">No CV on file.</p>
        ) : (
          <div className="px-6 py-3 text-sm">
            <a
              href={profile.cvUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-primary underline"
            >
              <ExportIcon className="size-4" aria-hidden="true" />
              View CV
            </a>
          </div>
        )}
      </Panel>
    </div>
  );
}

function Panel({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader className="border-b border-border">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <dl className="divide-y divide-border">{children}</dl>
      </CardContent>
    </Card>
  );
}

function Row({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 px-6 py-2.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={mono ? 'text-end font-mono font-medium tabular-nums' : 'text-end font-medium text-foreground'}>
        {value === null || value === '' ? '—' : value}
      </dd>
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
