import { type CreatePlan, type Plan, type UpdatePlan } from '@ilm/contracts';
import { fromDecimalString, minorUnits, toDecimalString } from '@ilm/utils';
import { Injectable } from '@nestjs/common';

import { type Plan as PlanRow, type Prisma } from '../../prisma/generated/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ConflictError, NotFoundError } from '../../shared/errors/domain-error';

import { PlatformAuditService, type PlatformActor } from './platform-audit.service';

/**
 * Plans, as edited from the platform console.
 *
 * Plans are archived, never deleted: a subscription sold under a plan must
 * always be able to point back at it. Every write is audited in the same
 * transaction. At most one plan is "recommended"; setting it on one clears it
 * from the others inside the same transaction, and a partial unique index
 * backs that up against a race between two operators.
 */
@Injectable()
export class PlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: PlatformAuditService,
  ) {}

  async list(): Promise<Plan[]> {
    const rows = await this.prisma.admin.plan.findMany({
      orderBy: [
        { archivedAt: { sort: 'asc', nulls: 'first' } },
        { sortOrder: 'asc' },
        { createdAt: 'asc' },
      ],
    });
    return rows.map(toPlan);
  }

  async create(input: CreatePlan, actor: PlatformActor): Promise<Plan> {
    return this.prisma.admin
      .$transaction(async (tx) => {
        if (input.isRecommended) {
          await clearRecommended(tx);
        }
        const created = await tx.plan.create({
          data: { code: input.code, ...toData(input) },
        });
        await this.audit.record(tx, actor, {
          action: 'plan.create',
          entityType: 'plan',
          entityId: created.id,
          after: snapshot(created),
        });
        return toPlan(created);
      })
      .catch((error: unknown) => {
        if (isUniqueViolation(error)) {
          throw new ConflictError(`A plan with the code "${input.code}" already exists.`);
        }
        throw error;
      });
  }

  async update(id: string, input: UpdatePlan, actor: PlatformActor): Promise<Plan> {
    return this.prisma.admin.$transaction(async (tx) => {
      const before = await tx.plan.findUnique({ where: { id } });
      if (before === null) {
        throw new NotFoundError('plan');
      }
      // An archived plan cannot be the highlighted one; restoring it later
      // must not collide with whichever plan took the highlight meanwhile.
      const recommended = input.isRecommended && before.archivedAt === null;
      if (recommended) {
        await clearRecommended(tx, id);
      }
      const updated = await tx.plan.update({
        where: { id },
        data: { ...toData(input), isRecommended: recommended },
      });
      await this.audit.record(tx, actor, {
        action: 'plan.update',
        entityType: 'plan',
        entityId: id,
        before: snapshot(before),
        after: snapshot(updated),
      });
      return toPlan(updated);
    });
  }

  async archive(id: string, now: Date, actor: PlatformActor): Promise<Plan> {
    return this.prisma.admin.$transaction(async (tx) => {
      const before = await tx.plan.findUnique({ where: { id } });
      if (before === null) {
        throw new NotFoundError('plan');
      }
      if (before.archivedAt !== null) {
        return toPlan(before);
      }
      const updated = await tx.plan.update({
        where: { id },
        data: { archivedAt: now, isRecommended: false },
      });
      await this.audit.record(tx, actor, {
        action: 'plan.archive',
        entityType: 'plan',
        entityId: id,
        before: snapshot(before),
        after: snapshot(updated),
      });
      return toPlan(updated);
    });
  }

  async restore(id: string, actor: PlatformActor): Promise<Plan> {
    return this.prisma.admin.$transaction(async (tx) => {
      const before = await tx.plan.findUnique({ where: { id } });
      if (before === null) {
        throw new NotFoundError('plan');
      }
      if (before.archivedAt === null) {
        return toPlan(before);
      }
      const updated = await tx.plan.update({ where: { id }, data: { archivedAt: null } });
      await this.audit.record(tx, actor, {
        action: 'plan.restore',
        entityType: 'plan',
        entityId: id,
        before: snapshot(before),
        after: snapshot(updated),
      });
      return toPlan(updated);
    });
  }
}

async function clearRecommended(tx: Prisma.TransactionClient, exceptId?: string): Promise<void> {
  await tx.plan.updateMany({
    where: { isRecommended: true, ...(exceptId === undefined ? {} : { id: { not: exceptId } }) },
    data: { isRecommended: false },
  });
}

function toData(input: UpdatePlan) {
  return {
    name: input.name,
    tagline: input.tagline,
    price: toDecimalString(minorUnits(input.priceMinor)),
    billingCycle: input.billingCycle,
    studentCap: input.studentCap,
    features: input.features,
    isPublic: input.isPublic,
    isRecommended: input.isRecommended,
    sortOrder: input.sortOrder,
  };
}

export function toPlan(row: PlanRow): Plan {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    tagline: row.tagline,
    priceMinor: fromDecimalString(row.price.toFixed(2)),
    billingCycle: row.billingCycle,
    studentCap: row.studentCap,
    features: row.features,
    isPublic: row.isPublic,
    isRecommended: row.isRecommended,
    sortOrder: row.sortOrder,
    archivedAt: row.archivedAt === null ? null : row.archivedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** The audit payload: the plan as the console sees it, price in minor units. */
function snapshot(row: PlanRow): Prisma.InputJsonValue {
  const { id: _id, createdAt: _created, updatedAt: _updated, ...rest } = toPlan(row);
  return rest;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002'
  );
}
