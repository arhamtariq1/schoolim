import { Injectable } from '@nestjs/common';

import { type Prisma } from '../../prisma/generated/client';

export interface PlatformActor {
  readonly id: string;
  readonly ip?: string | undefined;
}

/**
 * The platform audit trail: actor, action, entity, before, after.
 *
 * Takes the caller's transaction on purpose. The audit row commits with the
 * change it describes or not at all, so there is never a change without a
 * record or a record of a change that rolled back (rule 8).
 */
@Injectable()
export class PlatformAuditService {
  async record(
    tx: Prisma.TransactionClient,
    actor: PlatformActor,
    entry: {
      action: string;
      entityType: string;
      entityId: string;
      before?: Prisma.InputJsonValue | undefined;
      after?: Prisma.InputJsonValue | undefined;
    },
  ): Promise<void> {
    await tx.platformAuditLog.create({
      data: {
        actorPlatformUserId: actor.id,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        ...(entry.before === undefined ? {} : { before: entry.before }),
        ...(entry.after === undefined ? {} : { after: entry.after }),
        ip: actor.ip ?? null,
      },
    });
  }
}
