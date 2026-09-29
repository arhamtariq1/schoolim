import {
  DEFAULT_VOUCHER_SETTINGS,
  type UpdateVoucherSettings,
  type VoucherSettings,
} from '@ilm/contracts';
import { Inject, Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { NotFoundError } from '../../shared/errors/domain-error';
import { TenantContextService } from '../../shared/tenancy/tenant-context.service';
import { CLOCK, type Clock } from '../../shared/time/clock.provider';

/**
 * How a school's fee challan is laid out, and what it prints to pay it with.
 *
 * ## Absent means default
 *
 * A school that has never opened this screen has no row, and `get` answers with
 * the product's defaults rather than a 404. That is what makes the challan
 * renderer simple: it always has settings, so it never has a branch for a
 * school that has not configured anything — which is most of them, most of the
 * time.
 *
 * ## Why saving is an upsert
 *
 * There is nothing to create separately. The first save is the row coming into
 * existence, and a "create settings" step before "edit settings" would be a
 * second screen for a distinction nobody outside this file can see.
 */
@Injectable()
export class VoucherSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: TenantContextService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async get(): Promise<VoucherSettings> {
    return this.prisma.tenant(async (tx) => {
      const row = await tx.schoolVoucherSettings.findFirst({ select: SELECTION });
      return row === null ? DEFAULT_VOUCHER_SETTINGS : toSettings(row);
    });
  }

  async set(input: UpdateVoucherSettings): Promise<VoucherSettings> {
    const now = this.clock.now();

    return this.prisma.tenant(async (tx) => {
      const school = await tx.school.findFirst({ select: { id: true } });
      if (school === null) {
        throw new NotFoundError('school');
      }

      const before = await tx.schoolVoucherSettings.findFirst({ select: SELECTION });

      const data = {
        showLogo: input.showLogo,
        footerNote: input.footerNote,
        copyLabels: input.copyLabels,
        kuickpayEnabled: input.kuickpayEnabled,
        // Cleared together with the switch. A prefix left behind on a school
        // that turned Kuickpay off is a number waiting to reappear on a challan
        // the day somebody turns it back on without re-reading it.
        kuickpayPrefix: input.kuickpayEnabled ? input.kuickpayPrefix : null,
        kuickpayChannels: input.kuickpayChannels,
        onelinkEnabled: input.onelinkEnabled,
        onelinkInstitutionId: input.onelinkEnabled ? input.onelinkInstitutionId : null,
      };

      const after = await tx.schoolVoucherSettings.upsert({
        where: { schoolId: school.id },
        create: { schoolId: school.id, ...data } as never,
        update: data,
        select: SELECTION,
      });

      await tx.auditLog.create({
        data: {
          schoolId: this.context.schoolId,
          action: 'school.voucherSettings.update',
          entityType: 'School',
          entityId: school.id,
          actorType: 'USER',
          actorUserId: this.context.userId ?? null,
          // Defaults as the before-image when there was no row, so the log says
          // what changed rather than "{} became everything".
          before: before === null ? DEFAULT_VOUCHER_SETTINGS : toSettings(before),
          after: toSettings(after),
          at: now,
        },
      });

      return toSettings(after);
    });
  }
}

const SELECTION = {
  showLogo: true,
  footerNote: true,
  copyLabels: true,
  kuickpayEnabled: true,
  kuickpayPrefix: true,
  kuickpayChannels: true,
  onelinkEnabled: true,
  onelinkInstitutionId: true,
} as const;

function toSettings(row: {
  showLogo: boolean;
  footerNote: string | null;
  copyLabels: string[];
  kuickpayEnabled: boolean;
  kuickpayPrefix: string | null;
  kuickpayChannels: string[];
  onelinkEnabled: boolean;
  onelinkInstitutionId: string | null;
}): VoucherSettings {
  return { ...row };
}
