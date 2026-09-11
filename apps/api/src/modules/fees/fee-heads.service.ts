import { type CreateFeeHead, type FeeHead, type UpdateFeeHead } from '@ilm/contracts';
import { fromDecimalString, minorUnits, toDecimalString, type MinorUnits } from '@ilm/utils';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { ConflictError, NotFoundError } from '../../shared/errors/domain-error';

/**
 * The fee catalogue — docs/modules/fees-and-finance.md §2.
 *
 * ## Where rupees become paisa
 *
 * This file and `StudentsService` are the only two places in the product where
 * both representations exist at once. The database column is
 * `numeric(14,2)` in rupees (CLAUDE.md); everything above this boundary is
 * integer paisa in a field ending `Minor`. The conversion runs through
 * `fromDecimalString`/`toDecimalString` rather than `* 100`, because
 * `24.99 * 100` is `2498.9999999999995` and a fee that is one paisa short every
 * time is a reconciliation bug nobody finds for a year.
 *
 * Prisma hands back a `Decimal`; `.toFixed(2)` on it is exact, so the string
 * that reaches `fromDecimalString` is the stored value and not a float's idea
 * of it.
 */
@Injectable()
export class FeeHeadsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The catalogue, in the order a school arranged it.
   *
   * Inactive heads are included: a school needs to see what it retired in order
   * to reactivate it, and hiding them makes "why can I not create Lab Fee
   * again?" a support call. The list carries `studentCount` so the table can
   * decide whether Delete is even offered without N+1 queries.
   */
  async list(): Promise<FeeHead[]> {
    return this.prisma.tenant(async (tx) => {
      const rows = await tx.feeHead.findMany({
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: {
          id: true,
          type: true,
          name: true,
          defaultAmount: true,
          sortOrder: true,
          frequency: true,
          isActive: true,
          _count: { select: { studentFees: true } },
        },
      });

      return rows.map((row) => ({
        id: row.id,
        type: row.type,
        name: row.name,
        defaultAmountMinor: fromDecimalString(row.defaultAmount.toFixed(2)),
        sortOrder: row.sortOrder,
        frequency: row.frequency,
        isActive: row.isActive,
        studentCount: row._count.studentFees,
      }));
    });
  }

  async create(input: CreateFeeHead): Promise<FeeHead> {
    return this.prisma
      .tenant(async (tx) => {
        // Appended to the end unless the caller says otherwise, so a school
        // adding its sixth head does not have to think about ordering at all.
        const sortOrder =
          input.sortOrder ??
          ((await tx.feeHead.aggregate({ _max: { sortOrder: true } }))._max.sortOrder ?? -1) + 1;

        const created = await tx.feeHead.create({
          data: {
            type: input.type,
            name: input.name,
            defaultAmount: toDecimalString(minorUnits(input.defaultAmountMinor)),
            sortOrder,
            // `schoolId` is stamped by the Prisma tenant extension, so it is
            // absent here on purpose — writing it would be R2 (tenant scope is
            // never a parameter). The cast is the codebase's standing shape for
            // that gap between the generated type and the extension.
          } as never,
          select: {
            id: true,
            type: true,
            name: true,
            defaultAmount: true,
            sortOrder: true,
            frequency: true,
            isActive: true,
          },
        });

        return {
          ...created,
          defaultAmountMinor: fromDecimalString(created.defaultAmount.toFixed(2)),
          studentCount: 0,
        };
      })
      .catch((error: unknown) => {
        if (isUniqueViolation(error)) {
          throw new ConflictError(`A fee called "${input.name}" already exists.`);
        }
        throw error;
      });
  }

  /**
   * Change a head.
   *
   * **Changing the amount changes what the next admission starts from, and
   * nothing else.** Every child already admitted keeps the amount copied onto
   * their own row, which is the module's founding rule (§1) and the reason this
   * needs no "apply from when?" prompt. Say so in the UI; a school that thinks
   * this rewrites history will not touch it.
   */
  async update(id: string, input: UpdateFeeHead): Promise<FeeHead> {
    return this.prisma
      .tenant(async (tx) => {
        const existing = await tx.feeHead.findUnique({ where: { id }, select: { id: true } });
        if (existing === null) {
          throw new NotFoundError('Fee');
        }

        const updated = await tx.feeHead.update({
          where: { id },
          data: {
            ...(input.type === undefined ? {} : { type: input.type }),
            ...(input.name === undefined ? {} : { name: input.name }),
            ...(input.defaultAmountMinor === undefined
              ? {}
              : { defaultAmount: toDecimalString(minorUnits(input.defaultAmountMinor)) }),
            ...(input.sortOrder === undefined ? {} : { sortOrder: input.sortOrder }),
            ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
          },
          select: {
            id: true,
            type: true,
            name: true,
            defaultAmount: true,
            sortOrder: true,
            frequency: true,
            isActive: true,
            _count: { select: { studentFees: true } },
          },
        });

        return {
          id: updated.id,
          type: updated.type,
          name: updated.name,
          defaultAmountMinor: fromDecimalString(updated.defaultAmount.toFixed(2)),
          sortOrder: updated.sortOrder,
          frequency: updated.frequency,
          isActive: updated.isActive,
          studentCount: updated._count.studentFees,
        };
      })
      .catch((error: unknown) => {
        if (isUniqueViolation(error)) {
          throw new ConflictError(`A fee called "${input.name ?? ''}" already exists.`);
        }
        throw error;
      });
  }

  /**
   * Remove a head, and every student charge that referred to it.
   *
   * ## This deliberately departs from the module spec
   *
   * docs/modules/fees-and-finance.md §2 says "a head in use cannot be deleted,
   * only deactivated", and this refused with that sentence. The product owner
   * asked for deletion at any time, which is their call to make — a school that
   * typed "Tution Fee" and billed nine children against it should not live with
   * the typo forever, and "turn it off" leaves it on every one of those
   * children's fee structures.
   *
   * What is *not* negotiable is leaving the data inconsistent. The child rows
   * go in the same transaction, so a deleted head never leaves a student
   * carrying a charge that points at nothing. The foreign key stays `RESTRICT`
   * as the backstop: if this ever forgets, the database refuses rather than
   * silently orphaning a row.
   *
   * Returns how many student charges went with it, so the caller can say so.
   */
  async remove(id: string): Promise<{ removedStudentCharges: number }> {
    return this.prisma.tenant(async (tx) => {
      const head = await tx.feeHead.findUnique({
        where: { id },
        select: { id: true, _count: { select: { studentFees: true } } },
      });

      if (head === null) {
        throw new NotFoundError('Fee');
      }

      const removedStudentCharges = head._count.studentFees;

      // Children first, then the parent. The order is the whole point.
      await tx.studentFee.deleteMany({ where: { feeHeadId: id } });
      await tx.feeHead.delete({ where: { id } });

      return { removedStudentCharges };
    });
  }

  /**
   * The active catalogue as fee lines, for a fresh admission form.
   *
   * Lives here rather than in `StudentsService` so that "what a new student
   * starts from" has exactly one definition. The form renders these; the server
   * falls back to them when an admission arrives with no `fees` at all.
   */
  async defaultLines(): Promise<
    { feeHeadId: string; name: string; type: FeeHead['type']; amountMinor: MinorUnits }[]
  > {
    return this.prisma.tenant(async (tx) => {
      const rows = await tx.feeHead.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: { id: true, name: true, type: true, defaultAmount: true },
      });

      return rows.map((row) => ({
        feeHeadId: row.id,
        name: row.name,
        type: row.type,
        amountMinor: fromDecimalString(row.defaultAmount.toFixed(2)),
      }));
    });
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
