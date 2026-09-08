'use client';

import {
  createStaffSchema,
  ROUTES,
  STAFF_ROLE_LABELS,
  STAFF_ROLES,
  staffRoleCanSignIn,
  type StaffListItem,
  type StaffRole,
} from '@ilm/contracts';
import {
  Button,
  ConfirmDialog,
  DataTable,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  Input,
  Money,
  Pagination,
  SimpleSelect,
  StatusBadge,
  useToast,
  type Column,
} from '@ilm/ui';
import { CreateIcon, DeleteIcon, EditIcon, ICON_SIZE, SearchIcon } from '@ilm/ui/icons';
import { minorUnits } from '@ilm/utils';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition, type FormEvent } from 'react';

import { mutate } from '@/lib/mutate';

/**
 * Staff — everybody the school employs.
 *
 * ## Roles here are jobs, not permissions
 *
 * A janitor and a security guard are on the payroll and have no reason to sign
 * in; a head and an admin need both. The form reflects that directly: choosing
 * a role that does not use the portal removes the password field rather than
 * leaving it there to be filled in and quietly ignored.
 */

const ROLE_OPTIONS = STAFF_ROLES.map((value) => ({ value, label: STAFF_ROLE_LABELS[value] }));

const GENDER_OPTIONS = [
  { value: 'MALE', label: 'Male' },
  { value: 'FEMALE', label: 'Female' },
  { value: 'OTHER', label: 'Other' },
];

export interface StaffTableProps {
  rows: StaffListItem[];
  total: number;
  limit: number;
  offset: number;
  error?: string | undefined;
  search: string;
  role: string;
  canManage: boolean;
}

export function StaffTable({
  rows,
  total,
  limit,
  offset,
  error,
  search,
  role,
  canManage,
}: StaffTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const toast = useToast();
  const [, startTransition] = useTransition();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<StaffListItem | undefined>(undefined);
  const [deleting, setDeleting] = useState<StaffListItem | undefined>(undefined);

  // Filters live in the URL: a filtered view is then a link someone can send,
  // it survives a refresh, and Back does what it should.
  function apply(next: Record<string, string>) {
    const query = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value === '') {
        query.delete(key);
      } else {
        query.set(key, value);
      }
    }

    // Changing a filter returns to the first page — see the same note in the
    // students table. Paging is exempt or it would undo itself.
    if (!Object.hasOwn(next, 'offset')) {
      query.delete('offset');
    }

    startTransition(() => {
      router.push(`${pathname}?${query.toString()}`);
    });
  }

  async function confirmDelete() {
    if (deleting === undefined) {
      return;
    }

    const result = await mutate(ROUTES.staff.remove(deleting.id), 'DELETE', {
      reason: 'Removed from the staff list',
    });

    if (!result.ok) {
      toast.error(result.message);
      setDeleting(undefined);
      return;
    }

    toast.success(
      `${deleting.name} removed`,
      deleting.hasLogin ? 'Their portal access was revoked immediately.' : undefined,
    );
    setDeleting(undefined);
    router.refresh();
  }

  const columns: Column<StaffListItem>[] = [
    {
      key: 'employeeNo',
      header: 'ID',
      render: (row) => <span className="font-mono text-xs select-all">{row.employeeNo}</span>,
    },
    {
      key: 'name',
      header: 'Name',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{row.name}</p>
          {row.email === null ? null : (
            <p className="truncate text-xs text-muted-foreground">{row.email}</p>
          )}
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      render: (row) => (
        <div className="flex flex-wrap items-center gap-1.5">
          <span>{STAFF_ROLE_LABELS[row.role]}</span>
          {/* Worth surfacing: it is the difference between somebody who can
              open the portal and somebody who cannot. */}
          {row.hasLogin ? <StatusBadge tone="neutral">Login</StatusBadge> : null}
        </div>
      ),
    },
    {
      key: 'gender',
      header: 'Gender',
      hideOnMobile: true,
      render: (row) =>
        row.gender === null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span>{row.gender.charAt(0) + row.gender.slice(1).toLowerCase()}</span>
        ),
    },
    {
      key: 'casual',
      header: 'Casual',
      align: 'end',
      hideOnMobile: true,
      render: (row) => <span className="font-mono text-sm tabular-nums">{row.casualLeaves}</span>,
    },
    {
      key: 'sick',
      header: 'Sick',
      align: 'end',
      hideOnMobile: true,
      render: (row) => <span className="font-mono text-sm tabular-nums">{row.sickLeaves}</span>,
    },
    {
      key: 'salary',
      header: 'Salary',
      align: 'end',
      render: (row) => <Money valueMinor={minorUnits(row.basicSalaryMinor)} dashOnZero />,
    },
    {
      key: 'actions',
      header: '',
      align: 'end',
      render: (row) =>
        !canManage ? null : (
          <div className="flex items-center justify-end gap-1">
            <Button
              tone="ghost"
              size="sm"
              onClick={() => {
                setEditing(row);
                setDialogOpen(true);
              }}
            >
              <EditIcon className={ICON_SIZE.inline} aria-hidden />
              Edit
            </Button>
            <Button
              tone="ghost"
              size="sm"
              aria-label={`Remove ${row.name}`}
              onClick={() => {
                setDeleting(row);
              }}
            >
              <DeleteIcon className={`${ICON_SIZE.inline} text-danger`} aria-hidden />
            </Button>
          </div>
        ),
    },
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Staff</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {total} {total === 1 ? 'person' : 'people'} on the payroll
          </p>
        </div>

        {canManage ? (
          <Button
            onClick={() => {
              setEditing(undefined);
              setDialogOpen(true);
            }}
          >
            <CreateIcon className={ICON_SIZE.inline} aria-hidden />
            Add staff
          </Button>
        ) : null}
      </header>

      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          const value = new FormData(event.currentTarget).get('q');
          apply({ q: typeof value === 'string' ? value : '' });
        }}
      >
        <div className="relative min-w-56 flex-1">
          <SearchIcon
            className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            name="q"
            defaultValue={search}
            placeholder="Name, email or ID"
            aria-label="Search staff"
            className="ps-9"
          />
        </div>

        <div className="w-44">
          <SimpleSelect
            value={role}
            onValueChange={(next) => {
              apply({ role: next });
            }}
            options={ROLE_OPTIONS}
            ariaLabel="Filter by role"
            emptyOption={{ value: '', label: 'Any role' }}
          />
        </div>

        <Button type="submit" tone="outline">
          Search
        </Button>
      </form>

      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(row) => row.id}
        error={error}
        isFiltered={search !== '' || role !== ''}
        onClearFilters={() => {
          apply({ q: '', role: '' });
        }}
        caption="Staff"
        empty={{
          title: 'Nobody on the staff list yet',
          description:
            'Add the people who work here — teachers, office staff, and anyone else on the payroll. Only some roles need a portal login.',
          action: canManage ? (
            <Button
              onClick={() => {
                setEditing(undefined);
                setDialogOpen(true);
              }}
            >
              <CreateIcon className={ICON_SIZE.inline} aria-hidden />
              Add the first person
            </Button>
          ) : undefined,
        }}
      />

      {total === 0 ? null : (
        <Pagination
          total={total}
          limit={limit}
          offset={offset}
          label="staff"
          onChange={(next) => {
            apply({ offset: next === 0 ? '' : String(next) });
          }}
        />
      )}

      <StaffDialog
        open={dialogOpen}
        editing={editing}
        onClose={() => {
          setDialogOpen(false);
          setEditing(undefined);
        }}
      />

      <ConfirmDialog
        open={deleting !== undefined}
        onOpenChange={(open) => {
          if (!open) {
            setDeleting(undefined);
          }
        }}
        title={`Remove ${deleting?.name ?? ''}?`}
        description={
          deleting?.hasLogin === true
            ? 'Their employment record is kept — payroll and any inspection will ask who worked here — but their portal access ends immediately.'
            : 'Their employment record is kept, so the payroll history stays intact. They stop appearing on the staff list.'
        }
        confirmLabel="Remove"
        tone="danger"
        onConfirm={confirmDelete}
      />
    </div>
  );
}

function StaffDialog({
  open,
  editing,
  onClose,
}: {
  open: boolean;
  editing: StaffListItem | undefined;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [gender, setGender] = useState('');
  const [role, setRole] = useState<StaffRole>('TEACHER');
  const [casual, setCasual] = useState('0');
  const [sick, setSick] = useState('0');
  const [salary, setSalary] = useState('0');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | undefined>(undefined);
  const [isPending, setIsPending] = useState(false);

  // The dialog is mounted once and reused, so fields are reset when it opens
  // rather than relying on a remount that never happens.
  function reset() {
    setName(editing?.name ?? '');
    setEmail(editing?.email ?? '');
    setPhone(editing?.phone ?? '');
    setPassword('');
    setGender(editing?.gender ?? '');
    setRole(editing?.role ?? 'TEACHER');
    setCasual(String(editing?.casualLeaves ?? 0));
    setSick(String(editing?.sickLeaves ?? 0));
    setSalary(editing === undefined ? '0' : (editing.basicSalaryMinor / 100).toFixed(2));
    setFieldErrors({});
    setFormError(undefined);
  }

  const canSignIn = staffRoleCanSignIn(role);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldErrors({});
    setFormError(undefined);

    const rupees = Number(salary);
    if (!Number.isFinite(rupees) || rupees < 0) {
      setFieldErrors({ basicSalaryMinor: 'Enter an amount, for example 40000.' });
      return;
    }

    const payload = {
      name,
      role,
      casualLeaves: Number(casual) || 0,
      sickLeaves: Number(sick) || 0,
      // Rounded here rather than trusted: a fractional paisa would be rejected
      // by the schema with a message about a field nobody typed.
      basicSalaryMinor: Math.trunc(rupees * 100 + 0.5),
      ...(email.trim() === '' ? {} : { email }),
      ...(phone.trim() === '' ? {} : { phone: toE164(phone) }),
      ...(gender === '' ? {} : { gender }),
      // Never sent for a role that cannot sign in, even if the field was filled
      // in before the role was changed.
      ...(password.trim() === '' || !canSignIn ? {} : { password }),
    };

    if (editing === undefined) {
      const parsed = createStaffSchema.safeParse(payload);
      if (!parsed.success) {
        const next: Record<string, string> = {};
        for (const issue of parsed.error.issues) {
          next[issue.path.join('.')] = issue.message;
        }
        setFieldErrors(next);
        setFormError('Check the highlighted fields.');
        return;
      }
    }

    setIsPending(true);
    const result =
      editing === undefined
        ? await mutate(ROUTES.staff.create, 'POST', payload)
        : await mutate(ROUTES.staff.update(editing.id), 'PATCH', payload);
    setIsPending(false);

    if (!result.ok) {
      setFormError(result.message);
      setFieldErrors(result.fieldErrors);
      return;
    }

    toast.success(editing === undefined ? `${name} added` : `${name} saved`);
    onClose();
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          reset();
        } else {
          onClose();
        }
      }}
    >
      <DialogContent>
        <form
          onSubmit={(event) => {
            void submit(event);
          }}
          noValidate
        >
          <DialogHeader>
            <DialogTitle>
              {editing === undefined ? 'Add staff' : `Edit ${editing.name}`}
            </DialogTitle>
            <DialogDescription>
              Roles that use the portal can be given a login. Security guards and janitors are on
              the payroll without one.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-4">
            {formError === undefined ? null : (
              <div
                role="alert"
                className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
              >
                {formError}
              </div>
            )}

            <Field label="Name" error={fieldErrors['name']} required>
              <Input
                value={name}
                autoFocus
                onChange={(event) => {
                  setName(event.target.value);
                }}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Role" error={fieldErrors['role']} required>
                <SimpleSelect
                  value={role}
                  onValueChange={(next) => {
                    setRole(next as StaffRole);
                    if (!staffRoleCanSignIn(next as StaffRole)) {
                      setPassword('');
                    }
                  }}
                  options={ROLE_OPTIONS}
                  ariaLabel="Role"
                />
              </Field>
              <Field label="Gender" error={fieldErrors['gender']}>
                <SimpleSelect
                  value={gender}
                  onValueChange={setGender}
                  options={GENDER_OPTIONS}
                  ariaLabel="Gender"
                  emptyOption={{ value: '', label: 'Not recorded' }}
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Email" error={fieldErrors['email']}>
                <Input
                  type="email"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                  }}
                />
              </Field>
              <Field
                label="Phone"
                error={fieldErrors['phone']}
                hint="Start with 0 and we will add +92."
              >
                <Input
                  type="tel"
                  inputMode="tel"
                  placeholder="0300 1234567"
                  value={phone}
                  onChange={(event) => {
                    setPhone(event.target.value);
                  }}
                />
              </Field>
            </div>

            {/* Removed entirely rather than disabled: a field that is present
                but ignored is a password somebody believes they set. */}
            {canSignIn ? (
              <Field
                label={editing === undefined ? 'Password' : 'New password'}
                error={fieldErrors['password']}
                hint={
                  editing === undefined
                    ? 'Optional. Leave blank to add them now and set up their login later.'
                    : 'Leave blank to keep the current one. Setting it signs them out everywhere.'
                }
              >
                <Input
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                  }}
                />
              </Field>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Casual leaves" error={fieldErrors['casualLeaves']}>
                <Input
                  value={casual}
                  inputMode="numeric"
                  className="text-right font-mono tabular-nums"
                  onChange={(event) => {
                    setCasual(event.target.value);
                  }}
                />
              </Field>
              <Field label="Sick leaves" error={fieldErrors['sickLeaves']}>
                <Input
                  value={sick}
                  inputMode="numeric"
                  className="text-right font-mono tabular-nums"
                  onChange={(event) => {
                    setSick(event.target.value);
                  }}
                />
              </Field>
              <Field label="Salary (PKR)" error={fieldErrors['basicSalaryMinor']}>
                <Input
                  value={salary}
                  inputMode="decimal"
                  className="text-right font-mono tabular-nums"
                  onChange={(event) => {
                    setSalary(event.target.value);
                  }}
                />
              </Field>
            </div>
          </DialogBody>

          <DialogFooter>
            <Button type="button" tone="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" isPending={isPending}>
              {editing === undefined ? 'Add staff' : 'Save changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Input assistance, not validation.
 *
 * Pakistani numbers are written `0300 1234567` everywhere, and `phoneSchema`
 * wants E.164. Rejecting the form people know is a bad first impression.
 */
function toE164(input: string): string {
  const digits = input.replace(/[\s()-]/g, '');
  if (digits.startsWith('+')) {
    return digits;
  }
  if (digits.startsWith('0')) {
    return `+92${digits.slice(1)}`;
  }
  return digits;
}
