import { type LateFeePolicy, type UpdateLateFeePolicy } from '@ilm/contracts';
import { fromDecimalString, minorUnits, toDecimalString } from '@ilm/utils';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { NotFoundError } from '../../shared/errors/domain-error';

/**
 * The surcharge a school adds once a challan's due date has passed.
 *
 * ## Why it lives on the school and not in the fee catalogue
 *
 * A fee head is something a student is assigned and then billed for. A late fee
 * is assigned to nobody: it is a consequence of a date passing, computed per
 * voucher, and it is owed only by whoever happens to pay late. As a head it
 * could be added to a child's permanent fee structure and billed every month
 * regardless of when that family paid — the exact opposite of what it is.
 *
 * So it is one row's worth of policy per school, and it reaches a voucher as a
 * `LATE_FEE` line rather than as a charge anybody can assign.
 *
 * ## Why changing it does not re-rate anything
 *
 * A voucher stores the late fee it was issued with. A parent holding a printed
 * challan that says "6,300 after 15 September" must be charged 6,300, whatever
 * the school decides next week — so this changes what the *next* voucher is
 * rated at, and leaves every issued one alone. Re-rating on read is how a
 * printed figure and a screen figure come to disagree with nobody able to say
 * which is right.
 */
@Injectable()
export class LateFeePolicyService {
  constructor(private readonly prisma: PrismaService) {}

  async get(): Promise<LateFeePolicy> {
    return this.prisma.tenant(async (tx) => {
      const school = await tx.school.findFirst({
        select: { lateFeePercent: true, lateFeeFlat: true, lateFeeGraceDays: true },
      });
      if (school === null) {
        throw new NotFoundError('school');
      }

      const heads = await tx.feeHead.findMany({
        where: { lateFeeApplies: true },
        select: { id: true },
        orderBy: { sortOrder: 'asc' },
      });

      return {
        // `5.00` in the column is 5%, which is 500 basis points. Routed through
        // `fromDecimalString` rather than `Number()` so the conversion never
        // touches a float.
        percentBasisPoints: fromDecimalString(school.lateFeePercent.toFixed(2)),
        flatMinor: minorUnits(fromDecimalString(school.lateFeeFlat.toFixed(2))),
        graceDays: school.lateFeeGraceDays,
        feeHeadIds: heads.map((head) => head.id),
      };
    });
  }

  async set(input: UpdateLateFeePolicy): Promise<LateFeePolicy> {
    await this.prisma.tenant(async (tx) => {
      const school = await tx.school.findFirst({ select: { id: true } });
      if (school === null) {
        throw new NotFoundError('school');
      }

      await tx.school.update({
        where: { id: school.id },
        data: {
          // Back the other way: 500 basis points is `5.00` in a `numeric(5,2)`.
          lateFeePercent: toDecimalString(minorUnits(input.percentBasisPoints)),
          lateFeeFlat: toDecimalString(minorUnits(input.flatMinor)),
          lateFeeGraceDays: input.graceDays,
        },
      });

      // Row-level security scopes both statements to this school, so the ids
      // another school's Admin sent can never flip a head that is not ours.
      const chosen = [...new Set(input.feeHeadIds)];
      const found = await tx.feeHead.count({ where: { id: { in: chosen } } });
      if (found !== chosen.length) {
        throw new NotFoundError('fee');
      }
      await tx.feeHead.updateMany({
        where: { id: { in: chosen }, lateFeeApplies: false },
        data: { lateFeeApplies: true },
      });
      await tx.feeHead.updateMany({
        where: { id: { notIn: chosen }, lateFeeApplies: true },
        data: { lateFeeApplies: false },
      });
    });

    return this.get();
  }
}
