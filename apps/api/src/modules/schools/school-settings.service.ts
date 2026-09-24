import { type SchoolSettings, type UpdateSchoolSettings } from '@ilm/contracts';
import { Inject, Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { NotFoundError } from '../../shared/errors/domain-error';
import { TenantContextService } from '../../shared/tenancy/tenant-context.service';
import { CLOCK, type Clock } from '../../shared/time/clock.provider';

/**
 * A school's own details, after onboarding.
 *
 * ## Why this exists separately from onboarding
 *
 * `/me/onboarding` writes these same columns, but it may only ever run once —
 * it is the form that stamps `onboarded_at` and unlocks the portal, and it
 * refuses outright on a school that is already set up. Until now that left the
 * school's name, address and contact details frozen at whatever was typed in
 * the first five minutes of the account's life, on a record that is printed on
 * every challan and every receipt.
 *
 * ## What it will not write
 *
 * The slug, the currency, the country, the status. The reasoning lives on
 * `schoolSettingsSchema` in `@ilm/contracts`; the enforcement is here *and* in
 * the database, where `ilm_app` holds a column-level `UPDATE` grant that does
 * not include them. A future endpoint written by somebody who has not read the
 * contract is refused by Postgres rather than by a code review.
 *
 * ## Tenancy
 *
 * No `schoolId` parameter, by rule (CLAUDE.md §2). The row is reached through
 * `prisma.tenant`, where RLS confines `schools` to `id = current_school_id()` —
 * so the `findFirst` below can only ever see one row, and the `update` can only
 * ever reach the caller's own school even if the `where` were wrong.
 */
@Injectable()
export class SchoolSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: TenantContextService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async get(): Promise<SchoolSettings> {
    return this.prisma.tenant(async (tx) => {
      const school = await tx.school.findFirst({ select: SELECTION });
      if (school === null) {
        throw new NotFoundError('school');
      }
      return school;
    });
  }

  async update(input: UpdateSchoolSettings): Promise<SchoolSettings> {
    const now = this.clock.now();

    return this.prisma.tenant(async (tx) => {
      const before = await tx.school.findFirst({ select: { id: true, ...SELECTION } });
      if (before === null) {
        throw new NotFoundError('school');
      }

      const after = await tx.school.update({
        where: { id: before.id },
        data: {
          name: input.name,
          legalName: input.legalName,
          address: input.address,
          city: input.city,
          phone: input.phone,
          email: input.email,
          timezone: input.timezone,
          locale: input.locale,
        },
        select: SELECTION,
      });

      // Written by hand rather than left to `AuditInterceptor`, which records
      // that a PUT happened but never what it replaced. "Who changed the
      // school's bank-facing name, and to what from what" is the entire
      // question anyone asks about this record months later.
      await tx.auditLog.create({
        data: {
          schoolId: this.context.schoolId,
          action: 'school.settings.update',
          entityType: 'School',
          entityId: before.id,
          actorType: 'USER',
          actorUserId: this.context.userId ?? null,
          before: withoutId(before),
          after,
          at: now,
        },
      });

      return after;
    });
  }
}

/**
 * One selection for read, write and audit.
 *
 * Three hand-written field lists is three chances for the audit row to omit the
 * column that was actually changed.
 */
const SELECTION = {
  name: true,
  legalName: true,
  slug: true,
  address: true,
  city: true,
  phone: true,
  email: true,
  timezone: true,
  locale: true,
  currency: true,
  country: true,
} as const;

function withoutId<T extends { id: string }>(row: T): Omit<T, 'id'> {
  const { id: _id, ...rest } = row;
  return rest;
}
