import {
  STAFF_ROLE_TO_SCHOOL_ROLE,
  staffRoleCanSignIn,
  type CreateStaff,
  type StaffListItem,
  type StaffListQuery,
  type StaffRole,
  type UpdateStaff,
} from '@ilm/contracts';
import { fromDecimalString, minorUnits, toDecimalString } from '@ilm/utils';
import { Inject, Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { BusinessRuleError, ConflictError, NotFoundError } from '../../shared/errors/domain-error';
import { CLOCK, type Clock } from '../../shared/time/clock.provider';

import { StaffInviteService } from './staff-invite.service';

/**
 * Staff — employment records, and the portal accounts some of them carry.
 *
 * ## The two-sided write
 *
 * Almost every method here touches `staff` and may touch `users`, and they must
 * agree. A staff row with a login that no longer works, or a live account whose
 * employee left in March, are both worse than either problem alone — so every
 * pairing happens in one transaction and the rules are stated once, here:
 *
 * - a role that cannot sign in never gets an account, not even a disabled one;
 * - ending employment disables the account in the same breath;
 * - deleting is soft, because "who worked here in 2026" outlives the person.
 */
/**
 * The columns a staff row needs to become a `StaffListItem`.
 *
 * One constant rather than the same object written out three times, which is
 * three chances for a new field to reach the list from one path and not the
 * others.
 */
const LIST_SELECTION = {
  id: true,
  employeeNo: true,
  name: true,
  email: true,
  phone: true,
  gender: true,
  role: true,
  status: true,
  casualLeaves: true,
  sickLeaves: true,
  basicSalary: true,
  userId: true,
  joinedOn: true,
  // The account's own state, for `invitePending`. An invited account exists
  // and cannot be used; the list has to be able to say so.
  user: { select: { status: true } },
} as const;

@Injectable()
export class StaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invites: StaffInviteService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async list(query: StaffListQuery): Promise<{ items: StaffListItem[]; total: number }> {
    return this.prisma.tenant(async (tx) => {
      const where = {
        deletedAt: null,
        ...(query.status === undefined ? {} : { status: query.status }),
        ...(query.role === undefined ? {} : { role: query.role }),
        ...(query.q === undefined || query.q === ''
          ? {}
          : {
              OR: [
                { name: { contains: query.q, mode: 'insensitive' as const } },
                { email: { contains: query.q, mode: 'insensitive' as const } },
                { employeeNo: { contains: query.q } },
              ],
            }),
      };

      const [rows, total] = await Promise.all([
        tx.staff.findMany({
          where,
          orderBy: orderFor(query.sort, query.order),
          skip: query.offset,
          take: query.limit,
          select: LIST_SELECTION,
        }),
        tx.staff.count({ where }),
      ]);

      return {
        total,
        items: rows.map((row) => ({
          id: row.id,
          employeeNo: row.employeeNo,
          name: row.name,
          email: row.email,
          phone: row.phone,
          gender: row.gender,
          role: row.role,
          status: row.status,
          casualLeaves: row.casualLeaves,
          sickLeaves: row.sickLeaves,
          basicSalaryMinor: fromDecimalString(row.basicSalary.toFixed(2)),
          joinedOn: row.joinedOn === null ? null : row.joinedOn.toISOString().slice(0, 10),
          hasLogin: row.userId !== null,
          invitePending: row.user?.status === 'INVITED',
        })),
      };
    });
  }

  /**
   * Add somebody to the payroll, and invite them if the role uses the portal.
   *
   * ## Why the invitation is not a second step
   *
   * It was: add them, then press Invite on the staff list. Which meant the
   * normal outcome of adding a teacher was a teacher who could not sign in, and
   * nobody found out until the teacher tried — days later, usually on the
   * morning they were supposed to take a register.
   *
   * So the two are one write, in one transaction, the same way an admission
   * saves the child, the enrolment and the fee structure together: a record
   * whose second half failed is worse than no record, because it looks finished
   * on every screen.
   *
   * ## Why the mail is sent after the transaction
   *
   * A mail server is slow and outside the database's control. Sending inside
   * the transaction would hold row locks for however long a third party takes
   * to answer — and a failure to deliver is not a reason to refuse to employ
   * somebody. The invitation exists; `sent: false` reaches the screen, and
   * Re-send is one press away.
   */
  async create(input: CreateStaff): Promise<StaffListItem> {
    const { id, invitation } = await this.prisma
      .tenant(async (tx) => {
        const employeeNo = await this.nextEmployeeNo(tx);

        // The account first, so that if it collides on email the staff row is
        // never written — the two are one fact and must succeed together.

        const created = await tx.staff.create({
          data: {
            employeeNo,
            name: input.name,
            role: input.role,
            casualLeaves: input.casualLeaves,
            sickLeaves: input.sickLeaves,
            basicSalary: toDecimalString(minorUnits(input.basicSalaryMinor)),
            ...(input.email === undefined ? {} : { email: input.email }),
            ...(input.phone === undefined ? {} : { phone: input.phone }),
            ...(input.gender === undefined ? {} : { gender: input.gender }),
            ...(input.joinedOn === undefined ? {} : { joinedOn: new Date(input.joinedOn) }),
            ...(input.cnic === undefined ? {} : { cnic: input.cnic }),
            ...(input.designation === undefined ? {} : { designation: input.designation }),
          } as never,
          select: LIST_SELECTION,
        });

        // Only for the roles that use the portal, and only with somewhere to
        // send it. The contract already refuses a portal role with no email, so
        // the second half of this condition is for a caller that is not our
        // form.
        const invitation =
          staffRoleCanSignIn(input.role) && input.email !== undefined
            ? await this.invites.issue(tx, created.id, this.clock.now())
            : undefined;

        return { id: created.id, invitation };
      })
      .catch((error: unknown) => {
        if (isUniqueViolation(error)) {
          throw new ConflictError(
            `Somebody at this school already uses ${input.email ?? 'that email address'}.`,
          );
        }
        throw error;
      });

    if (invitation !== undefined) {
      await this.invites.deliver(invitation);
    }

    // Re-read rather than patching the row in memory: `issue` created the
    // account and wrote `user_id` back, and the list item has to say so or the
    // screen shows "no login" beside somebody who has just been invited.
    return this.detail(id);
  }

  /** One row, as the list shows it. */
  private async detail(id: string): Promise<StaffListItem> {
    return this.prisma.tenant(async (tx) => {
      const row = await tx.staff.findFirst({
        where: { id, deletedAt: null },
        select: LIST_SELECTION,
      });

      if (row === null) {
        throw new NotFoundError('staff member');
      }

      return toListItem(row);
    });
  }

  async update(id: string, input: UpdateStaff): Promise<StaffListItem> {
    return this.prisma
      .tenant(async (tx) => {
        const existing = await tx.staff.findFirst({
          where: { id, deletedAt: null },
          select: { id: true, userId: true, email: true, phone: true, role: true },
        });
        if (existing === null) {
          throw new NotFoundError('staff member');
        }

        const nextRole = input.role ?? existing.role;
        const nextEmail = input.email ?? existing.email ?? undefined;
        const userId = existing.userId;

        // A role change can take somebody's portal access away, and leaving a
        // live account behind for a janitor is the whole reason the roles are
        // separate. Disabled rather than deleted: the audit trail points at it.
        if (userId !== null && !staffRoleCanSignIn(nextRole)) {
          await tx.user.update({ where: { id: userId }, data: { status: 'DISABLED' } });
        }

        // Phone, and an email for anyone who signs in, checked against the row
        // as it will be **after** this merge. The contract cannot do it: a
        // PATCH carrying only a salary says nothing about either field, and one
        // carrying only a role changes whether an email is needed at all.
        const nextPhone = input.phone ?? existing.phone ?? undefined;

        if (nextPhone === undefined || nextPhone === '') {
          throw new BusinessRuleError(
            'BUSINESS_RULE_VIOLATION',
            'A phone number is required. This is a payroll record before it is a login.',
          );
        }

        if (staffRoleCanSignIn(nextRole) && (nextEmail === undefined || nextEmail === '')) {
          throw new BusinessRuleError(
            'BUSINESS_RULE_VIOLATION',
            'This role uses the portal, so an email address is needed to invite them.',
          );
        }

        if (userId !== null) {
          // Keep the account's own fields in step with the employment record,
          // or the person signs in with an address the staff list says they no
          // longer use.
          if (input.email !== undefined || input.name !== undefined) {
            const addressChanged = input.email !== undefined && input.email !== existing.email;

            await tx.user.update({
              where: { id: userId },
              data: {
                ...(input.email === undefined ? {} : { email: input.email }),
                ...(input.name === undefined ? {} : { name: input.name }),
                // ADR-0012: the confirmation was about the old address. Keeping
                // the stamp would leave a password reset deliverable to an
                // address nobody has shown they can read — which is the whole
                // thing email verification exists to prevent.
                ...(addressChanged ? { emailVerifiedAt: null } : {}),
              },
            });
          }

          // Permissions follow the role, and this is **not** nested inside the
          // block above any more.
          //
          // It was, which meant a role change only took effect if the same
          // request happened to also change a name or an email. Promoting
          // somebody left them without the access their new role implies —
          // annoying — and demoting somebody left them with the access their
          // old one did, which is the same account still holding PRINCIPAL
          // while every screen says "Teacher". Nobody looking at the staff list
          // could tell.
          if (input.role !== undefined && staffRoleCanSignIn(nextRole)) {
            await tx.userRole.deleteMany({ where: { userId } });
            await tx.userRole.create({
              data: { userId, role: schoolRoleFor(nextRole) } as never,
            });

            // Coming back from a non-portal role, the account was disabled on
            // the way out. Re-enable it only if it has a password — an account
            // still waiting on its invitation must stay unable to sign in.
            await tx.user.updateMany({
              where: { id: userId, status: 'DISABLED', passwordHash: { not: null } },
              data: { status: 'ACTIVE' },
            });
          }
        }

        const updated = await tx.staff.update({
          where: { id },
          data: {
            ...(input.name === undefined ? {} : { name: input.name }),
            ...(input.email === undefined ? {} : { email: input.email }),
            ...(input.phone === undefined ? {} : { phone: input.phone }),
            ...(input.gender === undefined ? {} : { gender: input.gender }),
            ...(input.role === undefined ? {} : { role: input.role }),
            ...(input.casualLeaves === undefined ? {} : { casualLeaves: input.casualLeaves }),
            ...(input.sickLeaves === undefined ? {} : { sickLeaves: input.sickLeaves }),
            ...(input.basicSalaryMinor === undefined
              ? {}
              : { basicSalary: toDecimalString(minorUnits(input.basicSalaryMinor)) }),
            ...(input.joinedOn === undefined ? {} : { joinedOn: new Date(input.joinedOn) }),
            ...(input.cnic === undefined ? {} : { cnic: input.cnic }),
            ...(input.designation === undefined ? {} : { designation: input.designation }),
            ...(userId === existing.userId ? {} : { userId }),
          },
          select: LIST_SELECTION,
        });

        return toListItem(updated);
      })
      .catch((error: unknown) => {
        if (isUniqueViolation(error)) {
          throw new ConflictError('Somebody at this school already uses that email address.');
        }
        throw error;
      });
  }

  /**
   * Soft-delete, and revoke access in the same breath.
   *
   * The record stays because "who worked here in 2026" is a question payroll
   * and any inspection will ask. The **account** must not: an employee who has
   * left and can still sign in is the worst of both outcomes, and it is exactly
   * the case people forget when delete only touches one table.
   */
  async remove(id: string, reason: string): Promise<void> {
    await this.prisma.tenant(async (tx) => {
      const existing = await tx.staff.findFirst({
        where: { id, deletedAt: null },
        select: { id: true, userId: true },
      });
      if (existing === null) {
        throw new NotFoundError('staff member');
      }

      const now = this.clock.now();

      if (existing.userId !== null) {
        await tx.user.update({
          where: { id: existing.userId },
          data: {
            status: 'DISABLED',
            // Bumping this invalidates every access token already issued, so
            // access ends now rather than whenever the current one expires.
            tokenVersion: { increment: 1 },
          },
        });
        await tx.session.updateMany({
          where: { userId: existing.userId, revokedAt: null },
          data: { revokedAt: now, revokedReason: 'staff-removed' },
        });
      }

      await tx.staff.update({
        where: { id },
        data: { deletedAt: now, status: 'LEFT', leftOn: now, designation: reason.slice(0, 80) },
      });
    });
  }

  /**
   * The next employee number, from a per-school counter under a row lock.
   *
   * The same mechanism as GR numbers, and for the same reason: `count(*) + 1`
   * hands two people adding staff at the same moment the same number.
   */
  private async nextEmployeeNo(tx: {
    $queryRawUnsafe: <T>(q: string, ...v: unknown[]) => Promise<T>;
  }): Promise<string> {
    const rows = await tx.$queryRawUnsafe<{ next: number }[]>(
      `INSERT INTO number_sequences (id, school_id, kind, next_value, updated_at)
       VALUES (gen_random_uuid(), current_school_id(), 'staff', 2, now())
       ON CONFLICT (school_id, kind)
       DO UPDATE SET next_value = number_sequences.next_value + 1, updated_at = now()
       RETURNING next_value - 1 AS next`,
    );

    const value = rows[0]?.next;
    if (value === undefined) {
      throw new BusinessRuleError(
        'INTERNAL_ERROR',
        'Could not allocate an employee number. Nothing was saved.',
      );
    }

    return String(value).padStart(4, '0');
  }
}

function schoolRoleFor(role: StaffRole): string {
  const mapped = (STAFF_ROLE_TO_SCHOOL_ROLE as Record<string, string>)[role];
  if (mapped === undefined) {
    throw new BusinessRuleError(
      'BUSINESS_RULE_VIOLATION',
      'This role does not use the portal, so it cannot have a login.',
    );
  }
  return mapped;
}

function toListItem(row: {
  id: string;
  employeeNo: string;
  name: string;
  email: string | null;
  phone: string | null;
  gender: StaffListItem['gender'];
  role: StaffRole;
  status: StaffListItem['status'];
  casualLeaves: number;
  sickLeaves: number;
  basicSalary: { toFixed: (digits: number) => string };
  joinedOn: Date | null;
  userId: string | null;
  user?: { status: string } | null;
}): StaffListItem {
  return {
    id: row.id,
    employeeNo: row.employeeNo,
    name: row.name,
    email: row.email,
    phone: row.phone,
    gender: row.gender,
    role: row.role,
    status: row.status,
    casualLeaves: row.casualLeaves,
    sickLeaves: row.sickLeaves,
    basicSalaryMinor: fromDecimalString(row.basicSalary.toFixed(2)),
    joinedOn: row.joinedOn === null ? null : row.joinedOn.toISOString().slice(0, 10),
    hasLogin: row.userId !== null,
    invitePending: row.user?.status === 'INVITED',
  };
}

function orderFor(sort: string, order: 'asc' | 'desc') {
  switch (sort) {
    case 'employeeNo':
      return { employeeNo: order } as const;
    case 'role':
      return { role: order } as const;
    case 'createdAt':
      return { createdAt: order } as const;
    default:
      return { name: order } as const;
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002'
  );
}
