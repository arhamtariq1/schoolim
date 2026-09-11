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
import { PasswordService } from '../../shared/auth/password.service';
import { BusinessRuleError, ConflictError, NotFoundError } from '../../shared/errors/domain-error';
import { CLOCK, type Clock } from '../../shared/time/clock.provider';

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
@Injectable()
export class StaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
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
          select: {
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
            joinedOn: true,
            userId: true,
          },
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
        })),
      };
    });
  }

  async create(input: CreateStaff): Promise<StaffListItem> {
    return this.prisma
      .tenant(async (tx) => {
        const employeeNo = await this.nextEmployeeNo(tx);

        // The account first, so that if it collides on email the staff row is
        // never written — the two are one fact and must succeed together.
        const userId = await this.createLoginIfWanted(tx, input);

        const created = await tx.staff.create({
          data: {
            employeeNo,
            name: input.name,
            role: input.role,
            casualLeaves: input.casualLeaves,
            sickLeaves: input.sickLeaves,
            basicSalary: toDecimalString(minorUnits(input.basicSalaryMinor)),
            ...(userId === undefined ? {} : { userId }),
            ...(input.email === undefined ? {} : { email: input.email }),
            ...(input.phone === undefined ? {} : { phone: input.phone }),
            ...(input.gender === undefined ? {} : { gender: input.gender }),
            ...(input.joinedOn === undefined ? {} : { joinedOn: new Date(input.joinedOn) }),
            ...(input.cnic === undefined ? {} : { cnic: input.cnic }),
            ...(input.designation === undefined ? {} : { designation: input.designation }),
          } as never,
          select: {
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
            joinedOn: true,
            userId: true,
          },
        });

        return toListItem(created);
      })
      .catch((error: unknown) => {
        if (isUniqueViolation(error)) {
          throw new ConflictError(
            `Somebody at this school already uses ${input.email ?? 'that email address'}.`,
          );
        }
        throw error;
      });
  }

  async update(id: string, input: UpdateStaff): Promise<StaffListItem> {
    return this.prisma
      .tenant(async (tx) => {
        const existing = await tx.staff.findFirst({
          where: { id, deletedAt: null },
          select: { id: true, userId: true, email: true, role: true },
        });
        if (existing === null) {
          throw new NotFoundError('Staff member');
        }

        const nextRole = input.role ?? existing.role;
        const nextEmail = input.email ?? existing.email ?? undefined;
        let userId = existing.userId;

        // A role change can take somebody's portal access away, and leaving a
        // live account behind for a janitor is the whole reason the roles are
        // separate. Disabled rather than deleted: the audit trail points at it.
        if (userId !== null && !staffRoleCanSignIn(nextRole)) {
          await tx.user.update({ where: { id: userId }, data: { status: 'DISABLED' } });
        }

        if (input.password !== undefined) {
          if (!staffRoleCanSignIn(nextRole)) {
            throw new BusinessRuleError(
              'BUSINESS_RULE_VIOLATION',
              'This role does not use the portal, so it cannot have a password.',
            );
          }
          if (nextEmail === undefined) {
            throw new BusinessRuleError(
              'BUSINESS_RULE_VIOLATION',
              'An email address is needed to create a login.',
            );
          }

          const passwordHash = await this.passwords.hash(input.password);

          if (userId === null) {
            // Setting a password on somebody who had no account creates one.
            const user = await tx.user.create({
              data: {
                email: nextEmail,
                name: input.name ?? nextEmail,
                passwordHash,
                status: 'ACTIVE',
                mustChangePassword: true,
              } as never,
              select: { id: true },
            });
            userId = user.id;
            await tx.userRole.create({
              data: { userId: user.id, role: schoolRoleFor(nextRole) } as never,
            });
          } else {
            await tx.user.update({
              where: { id: userId },
              data: {
                passwordHash,
                status: 'ACTIVE',
                mustChangePassword: true,
                // Every existing session dies. A password set by an
                // administrator is usually a password being taken back.
                tokenVersion: { increment: 1 },
              },
            });
          }
        }

        // Keep the account's own fields in step with the employment record, or
        // the person signs in with an address the staff list says they no
        // longer use.
        if (userId !== null && (input.email !== undefined || input.name !== undefined)) {
          await tx.user.update({
            where: { id: userId },
            data: {
              ...(input.email === undefined ? {} : { email: input.email }),
              ...(input.name === undefined ? {} : { name: input.name }),
            },
          });

          if (input.role !== undefined && staffRoleCanSignIn(nextRole)) {
            await tx.userRole.deleteMany({ where: { userId } });
            await tx.userRole.create({
              data: { userId, role: schoolRoleFor(nextRole) } as never,
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
          select: {
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
            joinedOn: true,
            userId: true,
          },
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
        throw new NotFoundError('Staff member');
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

  /** Create the portal account, when the role has one and a password was given. */
  private async createLoginIfWanted(
    tx: Parameters<Parameters<PrismaService['tenant']>[0]>[0],
    input: CreateStaff,
  ): Promise<string | undefined> {
    if (input.password === undefined || input.email === undefined) {
      return undefined;
    }
    if (!staffRoleCanSignIn(input.role)) {
      // The contract refuses this too; repeated because a future caller that is
      // not our form would otherwise create a login for a janitor.
      throw new BusinessRuleError(
        'BUSINESS_RULE_VIOLATION',
        'This role does not use the portal, so it cannot have a password.',
      );
    }

    const user = await tx.user.create({
      data: {
        email: input.email,
        name: input.name,
        passwordHash: await this.passwords.hash(input.password),
        status: 'ACTIVE',
        // Somebody else chose this password and it was handed over out of band.
        mustChangePassword: true,
      } as never,
      select: { id: true },
    });

    await tx.userRole.create({
      data: { userId: user.id, role: schoolRoleFor(input.role) } as never,
    });

    return user.id;
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
