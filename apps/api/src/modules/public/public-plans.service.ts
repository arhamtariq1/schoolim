import { type PublicPlan } from '@ilm/contracts';
import { fromDecimalString } from '@ilm/utils';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';

/**
 * The plans the public landing page shows.
 *
 * Only plans an operator has marked public and has not archived, and only the
 * fields a visitor needs: no ids, no timestamps. Platform data, so it is read
 * on the admin connection; the public module has no other path to it.
 */
@Injectable()
export class PublicPlansService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<PublicPlan[]> {
    const rows = await this.prisma.admin.plan.findMany({
      where: { isPublic: true, archivedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: {
        code: true,
        name: true,
        tagline: true,
        price: true,
        billingCycle: true,
        studentCap: true,
        features: true,
        isRecommended: true,
      },
    });

    return rows.map((row) => ({
      code: row.code,
      name: row.name,
      tagline: row.tagline,
      priceMinor: fromDecimalString(row.price.toFixed(2)),
      billingCycle: row.billingCycle,
      studentCap: row.studentCap,
      features: row.features,
      isRecommended: row.isRecommended,
    }));
  }
}
