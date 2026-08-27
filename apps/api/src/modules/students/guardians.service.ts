import { type LinkGuardian, type StudentGuardian, type UpsertGuardian } from '@ilm/contracts';
import { type TransactionClient } from '@ilm/db';
import { Injectable } from '@nestjs/common';

import { BusinessRuleError, NotFoundError } from '../../shared/errors/domain-error';
import { PrismaService } from '../../shared/prisma/prisma.service';

/**
 * Guardians, and the family structure they carry.
 *
 * A guardian is a **person**, not a field on a student. That distinction is the
 * whole reason this is its own service: three siblings share one father, and
 * the moment he is stored three times the school has three phone numbers to
 * keep in step, three fee vouchers where there should be one, and no way to
 * calculate a sibling discount at all.
 *
 * So the product always offers "link an existing guardian" before "create a new
 * one", and `siblings` on the read side falls out of the link rather than being
 * guessed from a surname — Pakistani families share surnames across unrelated
 * households far too often for that to be safe.
 */
@Injectable()
export class GuardiansService {
  constructor(private readonly prisma: PrismaService) {}

  /** Guardians for one student, each with that guardian's other children. */
  async forStudent(studentId: string): Promise<StudentGuardian[]> {
    return this.prisma.tenant(async (tx) => {
      const links = await tx.studentGuardian.findMany({
        where: { studentId },
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        select: {
          isPrimary: true,
          isFeePayer: true,
          guardian: {
            select: {
              id: true,
              name: true,
              relation: true,
              phone: true,
              email: true,
              cnic: true,
              occupation: true,
              students: {
                // The other children, not this one.
                where: { studentId: { not: studentId }, student: { deletedAt: null } },
                select: {
                  student: {
                    select: {
                      id: true,
                      grNo: true,
                      firstName: true,
                      lastName: true,
                      enrollments: {
                        where: { status: 'ENROLLED' },
                        take: 1,
                        select: { classLevel: { select: { name: true } } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });

      return links.map((link) => ({
        id: link.guardian.id,
        name: link.guardian.name,
        relation: link.guardian.relation,
        phone: link.guardian.phone,
        email: link.guardian.email,
        cnic: link.guardian.cnic,
        occupation: link.guardian.occupation,
        isPrimary: link.isPrimary,
        isFeePayer: link.isFeePayer,
        siblings: link.guardian.students.map((entry) => ({
          id: entry.student.id,
          name: `${entry.student.firstName} ${entry.student.lastName}`,
          grNo: entry.student.grNo,
          className: entry.student.enrollments[0]?.classLevel.name ?? null,
        })),
      }));
    });
  }

  /**
   * Find guardians already on file, so a sibling can be linked.
   *
   * Matches on phone as well as name because the phone is what a receptionist
   * actually has in front of them, and because two people called "Muhammad
   * Ali" are common while two sharing a mobile number are the same household.
   */
  async search(
    term: string,
  ): Promise<{ id: string; name: string; phone: string | null; childCount: number }[]> {
    const trimmed = term.trim();
    if (trimmed.length < 2) {
      // Refusing a one-character search is not pedantry: it would return the
      // school's entire parent list to anyone who typed a letter.
      return [];
    }

    return this.prisma.tenant(async (tx) => {
      const found = await tx.guardian.findMany({
        where: {
          OR: [
            { name: { contains: trimmed, mode: 'insensitive' } },
            { phone: { contains: trimmed } },
            { cnic: { contains: trimmed } },
          ],
        },
        take: 10,
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          phone: true,
          _count: { select: { students: true } },
        },
      });

      return found.map((guardian) => ({
        id: guardian.id,
        name: guardian.name,
        phone: guardian.phone,
        childCount: guardian._count.students,
      }));
    });
  }

  /** Create a guardian and attach them to this student. */
  async add(studentId: string, input: UpsertGuardian): Promise<void> {
    await this.prisma.tenant(async (tx) => {
      const guardian = await tx.guardian.create({
        data: {
          name: input.name,
          relation: input.relation,
          ...(input.phone === undefined ? {} : { phone: input.phone }),
          ...(input.email === undefined ? {} : { email: input.email }),
          ...(input.cnic === undefined ? {} : { cnic: input.cnic }),
          ...(input.occupation === undefined ? {} : { occupation: input.occupation }),
        } as never,
        select: { id: true },
      });

      await this.attach(tx, studentId, guardian.id, input.isPrimary, input.isFeePayer);
    });
  }

  /** Attach a guardian who already exists. The sibling path. */
  async link(studentId: string, input: LinkGuardian): Promise<void> {
    await this.prisma.tenant(async (tx) => {
      const existing = await tx.studentGuardian.findFirst({
        where: { studentId, guardianId: input.guardianId },
        select: { studentId: true },
      });

      if (existing !== null) {
        throw new BusinessRuleError(
          'CONFLICT',
          'That guardian is already attached to this student.',
        );
      }

      await this.attach(tx, studentId, input.guardianId, input.isPrimary, input.isFeePayer);
    });
  }

  async update(studentId: string, guardianId: string, input: UpsertGuardian): Promise<void> {
    await this.prisma.tenant(async (tx) => {
      const link = await tx.studentGuardian.findFirst({
        where: { studentId, guardianId },
        select: { studentId: true },
      });
      if (link === null) {
        throw new NotFoundError('guardian');
      }

      await tx.guardian.update({
        where: { id: guardianId },
        data: {
          name: input.name,
          relation: input.relation,
          phone: input.phone ?? null,
          email: input.email ?? null,
          cnic: input.cnic ?? null,
          occupation: input.occupation ?? null,
        },
      });

      if (input.isPrimary === true || input.isFeePayer === true) {
        await this.attach(tx, studentId, guardianId, input.isPrimary, input.isFeePayer);
      }
    });
  }

  /**
   * Detach a guardian from one student.
   *
   * The guardian row survives — they are still the parent of their other
   * children. Deleting the person because one link was removed is how a
   * sibling's contact details disappear.
   *
   * The last guardian cannot be detached: a student with nobody to telephone is
   * not a record a school can act on, and the failure only shows up when
   * somebody needs to be called about a sick child.
   */
  async detach(studentId: string, guardianId: string): Promise<void> {
    await this.prisma.tenant(async (tx) => {
      const links = await tx.studentGuardian.findMany({
        where: { studentId },
        select: { guardianId: true, isPrimary: true, isFeePayer: true },
      });

      const target = links.find((link) => link.guardianId === guardianId);
      if (target === undefined) {
        throw new NotFoundError('guardian');
      }

      if (links.length === 1) {
        throw new BusinessRuleError(
          'BUSINESS_RULE_VIOLATION',
          'A student must keep at least one guardian. Add another before removing this one.',
        );
      }

      await tx.studentGuardian.deleteMany({ where: { studentId, guardianId } });

      // Someone must still be primary and someone must still receive the
      // voucher. Leaving both unset produces a student nobody is billed for.
      if (target.isPrimary || target.isFeePayer) {
        const next = links.find((link) => link.guardianId !== guardianId);
        if (next !== undefined) {
          await tx.studentGuardian.updateMany({
            where: { studentId, guardianId: next.guardianId },
            data: {
              ...(target.isPrimary ? { isPrimary: true } : {}),
              ...(target.isFeePayer ? { isFeePayer: true } : {}),
            },
          });
        }
      }
    });
  }

  /**
   * Create or update the link, enforcing "exactly one primary, one fee payer".
   *
   * Both flags are demoted across every other guardian **first**, in the same
   * transaction. Setting the new one before clearing the old leaves a window
   * where two guardians are the fee payer, and a voucher run in that window
   * bills a family twice.
   */
  private async attach(
    tx: TransactionClient,
    studentId: string,
    guardianId: string,
    isPrimary: boolean | undefined,
    isFeePayer: boolean | undefined,
  ): Promise<void> {
    // The first guardian is primary and fee payer whether or not anyone said
    // so. Otherwise the first admission produces a student with a guardian and
    // nobody to bill, which nothing surfaces until a voucher run skips them.
    const existing = await tx.studentGuardian.findMany({
      where: { studentId },
      select: { guardianId: true },
    });
    const isFirst = existing.length === 0;
    const primary = isPrimary ?? isFirst;
    const feePayer = isFeePayer ?? isFirst;

    if (primary) {
      await tx.studentGuardian.updateMany({ where: { studentId }, data: { isPrimary: false } });
    }
    if (feePayer) {
      await tx.studentGuardian.updateMany({ where: { studentId }, data: { isFeePayer: false } });
    }

    // findMany-then-branch rather than `upsert`: the unique key is
    // (school_id, student_id, guardian_id), and naming `schoolId` in a `where`
    // is exactly what the tenant rule forbids — scope arrives on the client.
    if (existing.some((link) => link.guardianId === guardianId)) {
      await tx.studentGuardian.updateMany({
        where: { studentId, guardianId },
        data: { isPrimary: primary, isFeePayer: feePayer },
      });
    } else {
      await tx.studentGuardian.create({
        data: { studentId, guardianId, isPrimary: primary, isFeePayer: feePayer } as never,
      });
    }
  }
}
