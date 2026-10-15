import {
  type RecordSalaryPayment,
  type StaffSalaryHistory,
  type StaffSalaryRow,
} from '@ilm/contracts';
import { fromDecimalString, minorUnits, toDecimalString } from '@ilm/utils';
import { Inject, Injectable } from '@nestjs/common';

import { type TransactionClient } from '../../prisma';
import { PrismaService } from '../../prisma/prisma.service';
import { BusinessRuleError, ConflictError, NotFoundError } from '../../shared/errors/domain-error';
import { TenantContextService } from '../../shared/tenancy/tenant-context.service';
import { CLOCK, type Clock } from '../../shared/time/clock.provider';

/** Three years of months is more than any payroll question is about. */
const MAX_MONTHS = 36;

/**
 * Salary history — what was paid, month by month.
 *
 * ## Paid and due are different facts
 *
 * A month with a row in `staff_salary_payments` was **paid**, in the amount and
 * on the date recorded. A month without one is **due**, and shows the basic
 * salary because that is what is owed — not because anything was paid. The
 * screen labels the two, so a reader never mistakes an entitlement for a
 * payment.
 *
 * ## Append-only
 *
 * `record` inserts and nothing else exists: no update, no delete (docs/12 R4).
 * The database enforces it too — the app role has no UPDATE or DELETE grant on
 * the table — so this is not a convention a later edit can quietly break.
 */
@Injectable()
export class StaffSalaryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: TenantContextService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async history(staffId: string): Promise<StaffSalaryHistory> {
    return this.prisma.tenant((tx) => this.read(tx, staffId));
  }

  async record(staffId: string, input: RecordSalaryPayment): Promise<StaffSalaryHistory> {
    return this.prisma
      .tenant(async (tx) => {
        const staff = await tx.staff.findFirst({
          where: { id: staffId, deletedAt: null },
          select: { id: true, basicSalary: true, status: true },
        });
        if (staff === null) {
          throw new NotFoundError('staff member');
        }
        if (input.month > this.currentMonth()) {
          throw new BusinessRuleError(
            'BUSINESS_RULE_VIOLATION',
            'That month has not started yet, so there is no salary to record for it.',
          );
        }

        const amountMinor = input.amountMinor ?? fromDecimalString(staff.basicSalary.toFixed(2));
        if (amountMinor <= 0) {
          throw new BusinessRuleError(
            'BUSINESS_RULE_VIOLATION',
            'This person has no basic salary set. Set it on their record, or enter the amount paid.',
          );
        }

        await tx.staffSalaryPayment.create({
          data: {
            staffId,
            month: new Date(`${input.month}-01`),
            amount: toDecimalString(minorUnits(amountMinor)),
            paidOn: new Date(input.paidOn),
            recordedBy: this.context.userId ?? null,
          } as never,
        });

        await tx.auditLog.create({
          data: {
            schoolId: this.context.schoolId,
            action: 'staff.salary.pay',
            entityType: 'Staff',
            entityId: staffId,
            actorType: 'USER',
            actorUserId: this.context.userId ?? null,
            before: {},
            after: { month: input.month, amountMinor, paidOn: input.paidOn },
            at: this.clock.now(),
          },
        });

        return this.read(tx, staffId);
      })
      .catch((error: unknown) => {
        if (isUniqueViolation(error)) {
          throw new ConflictError(
            `Salary for ${input.month} is already recorded for this person. Payments cannot be changed once saved.`,
          );
        }
        throw error;
      });
  }

  private async read(tx: TransactionClient, staffId: string): Promise<StaffSalaryHistory> {
    const staff = await tx.staff.findFirst({
      where: { id: staffId, deletedAt: null },
      select: { basicSalary: true, joinedOn: true, createdAt: true },
    });
    if (staff === null) {
      throw new NotFoundError('staff member');
    }

    const basicSalaryMinor = fromDecimalString(staff.basicSalary.toFixed(2));
    const payments = await tx.staffSalaryPayment.findMany({
      where: { staffId },
      select: { month: true, amount: true, paidOn: true },
    });
    const paid = new Map(payments.map((row) => [row.month.toISOString().slice(0, 7), row]));

    const first = (staff.joinedOn ?? staff.createdAt).toISOString().slice(0, 7);
    const last = this.currentMonth();

    const rows: StaffSalaryRow[] = [];
    for (let month = first; month <= last && rows.length < MAX_MONTHS * 2; month = nextMonth(month)) {
      const payment = paid.get(month);
      rows.push(
        payment === undefined
          ? { month, amountMinor: basicSalaryMinor, status: 'DUE', paidOn: null }
          : {
              month,
              amountMinor: fromDecimalString(payment.amount.toFixed(2)),
              status: 'PAID',
              paidOn: payment.paidOn.toISOString().slice(0, 10),
            },
      );
    }

    // Newest first, capped. A payment older than the cap is still in the table;
    // it just is not the question anyone opens this tab to ask.
    return { basicSalaryMinor, rows: rows.reverse().slice(0, MAX_MONTHS) };
  }

  private currentMonth(): string {
    return this.clock.now().toISOString().slice(0, 7);
  }
}

function nextMonth(month: string): string {
  const year = Number(month.slice(0, 4));
  const index = Number(month.slice(5, 7));
  return index === 12
    ? `${String(year + 1)}-01`
    : `${String(year)}-${String(index + 1).padStart(2, '0')}`;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002'
  );
}
