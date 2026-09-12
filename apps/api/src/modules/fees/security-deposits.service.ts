import {
  type RecordSecurityDeposit,
  type RefundSecurityDeposit,
  type SecurityDepositList,
  type SecurityDepositListQuery,
  type SecurityDepositRow,
  type SecurityRefund,
} from '@ilm/contracts';
import { formatMoney, fromDecimalString, minorUnits, toDecimalString } from '@ilm/utils';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { BusinessRuleError, NotFoundError } from '../../shared/errors/domain-error';
import { TenantContextService } from '../../shared/tenancy/tenant-context.service';

/**
 * Money the school is holding, and giving back.
 *
 * ## A deposit is not income
 *
 * A fee is earned the moment it is collected. A deposit is somebody else's
 * money sitting in the school's account, owed back less whatever the child
 * breaks. Adding the two together overstates a year's collection by the whole
 * float — the kind of error an accountant finds once and never quite forgets —
 * so deposits live in their own table and never touch the fee ledger.
 *
 * ## Refunding in pieces
 *
 * A child deposits 5,000 and breaks a window worth 2,000. The school returns
 * 3,000 and keeps the rest, so the deposit is not "refunded" or "not refunded":
 *
 *     left = deposited - sum(refunds)
 *
 * Every repayment is its own append-only row (R4). A running balance column on
 * the deposit would be an in-place edit of a money field, and it would lose the
 * only thing anybody ever asks afterwards: who returned what, when, and why.
 * The database enforces this rather than trusting the code to — `ilm_app` holds
 * `SELECT, INSERT` on the refunds table and no `UPDATE` or `DELETE` at all.
 */
@Injectable()
export class SecurityDepositsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: TenantContextService,
  ) {}

  /**
   * The list, with what is left on every row.
   *
   * Two queries: the rows, and the totals across the whole filter. The refunds
   * behind each row come back with it, so the eye icon opens on data the client
   * already holds instead of costing a request per row opened.
   */
  async list(query: SecurityDepositListQuery): Promise<SecurityDepositList> {
    return this.prisma.tenant(async (tx) => {
      const params: unknown[] = [];
      const bind = (value: unknown): string => {
        params.push(value);
        return `$${String(params.length)}`;
      };

      const where: string[] = ['s.deleted_at IS NULL'];

      if (query.status !== undefined) {
        where.push(`s.status = ${bind(query.status)}::student_status`);
      }
      if (query.classLevelId !== undefined) {
        where.push(`e.class_level_id = ${bind(query.classLevelId)}::uuid`);
      }
      if (query.q !== undefined) {
        const term = bind(`%${query.q}%`);
        where.push(
          `((s.first_name || ' ' || s.last_name) ILIKE ${term}
             OR s.student_code ILIKE ${term}
             OR s.gr_no ILIKE ${term})`,
        );
      }
      // `held` is the working list — anything still owed back. `settled` is the
      // record of deposits fully returned, which a school looks at only when
      // somebody disputes one.
      if (query.state === 'held') {
        where.push(`(d.amount - COALESCE(r.refunded, 0)) > 0`);
      }
      if (query.state === 'settled') {
        where.push(`(d.amount - COALESCE(r.refunded, 0)) <= 0`);
      }

      const sessionExpr =
        query.sessionId === undefined
          ? '(SELECT id FROM academic_sessions WHERE is_current LIMIT 1)'
          : `${bind(query.sessionId)}::uuid`;

      // One row per deposit. Guardians are reached by scalar subquery rather
      // than joined, because a child with two guardians would otherwise appear
      // twice — and the totals below would count the same deposit twice with it.
      const from = `
        FROM security_deposits d
        JOIN students s ON s.id = d.student_id
        LEFT JOIN (
          SELECT deposit_id, SUM(amount) AS refunded
            FROM security_deposit_refunds
           GROUP BY deposit_id
        ) r ON r.deposit_id = d.id
        LEFT JOIN fee_vouchers v ON v.id = d.voucher_id
        LEFT JOIN enrollments e
          ON e.student_id = s.id
         AND e.status = 'ENROLLED'
         AND e.session_id = COALESCE(${sessionExpr}, e.session_id)
        LEFT JOIN class_levels cl ON cl.id = e.class_level_id
        WHERE ${where.join(' AND ')}
      `;

      const ORDER: Record<SecurityDepositListQuery['sort'], string> = {
        receivedOn: 'd.received_on',
        name: 's.last_name, s.first_name',
        grNo: 's.gr_no',
        deposited: 'd.amount',
        left: '(d.amount - COALESCE(r.refunded, 0))',
      };
      const direction = query.order === 'desc' ? 'DESC' : 'ASC';

      const rows = await tx.$queryRawUnsafe<DepositSqlRow[]>(
        `SELECT d.id, d.student_id, d.received_on, d.note,
                d.voucher_id, v.voucher_no,
                d.amount::text AS deposited,
                COALESCE(r.refunded, 0)::text AS refunded,
                (d.amount - COALESCE(r.refunded, 0))::text AS remaining,
                s.gr_no, s.student_code, s.first_name, s.last_name,
                s.status::text AS status,
                cl.name AS class_name,
                (SELECT gf.name
                   FROM student_guardians sgf
                   JOIN guardians gf ON gf.id = sgf.guardian_id
                  WHERE sgf.student_id = s.id AND gf.relation = 'FATHER'
                  LIMIT 1) AS father_name,
                (SELECT gc.phone
                   FROM student_guardians sgc
                   JOIN guardians gc ON gc.id = sgc.guardian_id
                  WHERE sgc.student_id = s.id AND gc.phone IS NOT NULL
                  ORDER BY (gc.relation = 'FATHER') DESC, sgc.is_primary DESC
                  LIMIT 1) AS guardian_phone,
                (SELECT COALESCE(json_agg(json_build_object(
                          'id', f.id,
                          'amountMinor', f.amount::text,
                          'reason', f.reason,
                          'refundedOn', f.refunded_on
                        ) ORDER BY f.refunded_on, f.created_at), '[]'::json)
                   FROM security_deposit_refunds f
                  WHERE f.deposit_id = d.id) AS refunds
         ${from}
         ORDER BY ${ORDER[query.sort]} ${direction}
         LIMIT ${bind(query.limit)} OFFSET ${bind(query.offset)}`,
        ...params,
      );

      const totalParams = params.slice(0, params.length - 2);
      const totals = await tx.$queryRawUnsafe<
        { total: bigint; deposited: string | null; remaining: string | null }[]
      >(
        // Summed over one row per deposit, so a fan-out cannot inflate the
        // figures on the cards above the table.
        `SELECT count(*) AS total,
                COALESCE(SUM(t.deposited), 0)::text AS deposited,
                COALESCE(SUM(t.remaining), 0)::text AS remaining
           FROM (SELECT DISTINCT d.id,
                        d.amount AS deposited,
                        (d.amount - COALESCE(r.refunded, 0)) AS remaining
                 ${from}) t`,
        ...totalParams,
      );

      return {
        rows: rows.map(toRow),
        total: Number(totals[0]?.total ?? 0),
        totalDepositedMinor: minorUnits(fromDecimalString(totals[0]?.deposited ?? '0')),
        totalLeftMinor: minorUnits(fromDecimalString(totals[0]?.remaining ?? '0')),
      };
    });
  }

  /** Recording a deposit taken at the counter or collected on a voucher. */
  async create(input: RecordSecurityDeposit): Promise<{ id: string }> {
    const actorId = this.context.userId;

    return this.prisma.tenant(async (tx) => {
      const student = await tx.student.findFirst({
        where: { id: input.studentId, deletedAt: null },
        select: { id: true },
      });
      if (student === null) {
        throw new NotFoundError('That student does not exist.');
      }

      if (input.voucherId !== undefined) {
        const voucher = await tx.feeVoucher.findFirst({
          where: { id: input.voucherId },
          select: { id: true },
        });
        if (voucher === null) {
          throw new NotFoundError('That voucher does not exist.');
        }
      }

      try {
        const created = await tx.securityDeposit.create({
          data: {
            studentId: input.studentId,
            amount: toDecimalString(minorUnits(input.amountMinor)),
            receivedOn: asDate(input.receivedOn),
            ...(input.voucherId === undefined ? {} : { voucherId: input.voucherId }),
            ...(input.note === undefined ? {} : { note: input.note }),
            ...(actorId === undefined ? {} : { createdBy: actorId }),
          } as never,
          select: { id: true },
        });
        return { id: created.id };
      } catch (error) {
        // One deposit per voucher, by unique index: a retried payment must not
        // book the float twice.
        if (isUniqueViolation(error)) {
          throw new BusinessRuleError(
            'FEES_DEPOSIT_ALREADY_RECORDED',
            'A security deposit has already been recorded against that voucher.',
          );
        }
        throw error;
      }
    });
  }

  /**
   * Giving some of it back.
   *
   * ## Why the row is locked
   *
   * Two clerks refunding 3,000 each from the same 5,000 deposit, in the same
   * second, both read "3,000 left", both pass the check, and 6,000 leaves the
   * building against a 5,000 deposit. `FOR UPDATE` on the deposit makes the
   * second wait for the first to commit, so it re-reads a balance that already
   * includes the first refund and is correctly refused.
   *
   * The check therefore has to happen *inside* the transaction and *after* the
   * lock. A balance read before the lock is a balance that was true a moment ago.
   */
  async refund(depositId: string, input: RefundSecurityDeposit): Promise<{ id: string }> {
    const actorId = this.context.userId;

    return this.prisma.tenant(async (tx) => {
      // Replay, not silence (R5): a double-clicked Confirm returns the first
      // refund rather than issuing a second one, and says so.
      const prior = await tx.jobRun.findFirst({
        where: { kind: REFUND_JOB_KIND, idempotencyKey: input.idempotencyKey },
        select: { status: true, result: true },
      });
      if (prior !== null && prior.status === 'COMPLETED') {
        return prior.result as unknown as { id: string };
      }

      // Locks the deposit, and only the deposit. RLS still applies to the raw
      // statement, so this cannot reach another school's row.
      const locked = await tx.$queryRawUnsafe<{ id: string; amount: string }[]>(
        `SELECT id, amount::text AS amount
           FROM security_deposits
          WHERE id = $1::uuid
          FOR UPDATE`,
        depositId,
      );

      const deposit = locked[0];
      if (deposit === undefined) {
        throw new NotFoundError('That deposit does not exist.');
      }

      const refundedSoFar = await tx.$queryRawUnsafe<{ total: string }[]>(
        `SELECT COALESCE(SUM(amount), 0)::text AS total
           FROM security_deposit_refunds
          WHERE deposit_id = $1::uuid`,
        depositId,
      );

      const depositedMinor = fromDecimalString(deposit.amount);
      const alreadyMinor = fromDecimalString(refundedSoFar[0]?.total ?? '0');
      const leftMinor = depositedMinor - alreadyMinor;

      if (input.amountMinor > leftMinor) {
        throw new BusinessRuleError(
          'FEES_REFUND_EXCEEDS_DEPOSIT',
          leftMinor <= 0
            ? 'That deposit has already been refunded in full.'
            : `Only ${formatMoney(minorUnits(leftMinor))} is left of that deposit, so no more than that can be refunded.`,
        );
      }

      const refund = await tx.securityDepositRefund.create({
        data: {
          depositId,
          amount: toDecimalString(minorUnits(input.amountMinor)),
          reason: input.reason,
          refundedOn: asDate(input.refundedOn),
          ...(actorId === undefined ? {} : { createdBy: actorId }),
        } as never,
        select: { id: true },
      });

      const result = { id: refund.id };

      await tx.jobRun.create({
        data: {
          kind: REFUND_JOB_KIND,
          idempotencyKey: input.idempotencyKey,
          params: { depositId, ...input } as never,
          status: 'COMPLETED',
          result: result as never,
          ...(actorId === undefined ? {} : { createdBy: actorId }),
        } as never,
        select: { id: true },
      });

      return result;
    });
  }
}

const REFUND_JOB_KIND = 'security_deposit_refund';

interface DepositSqlRow {
  id: string;
  student_id: string;
  received_on: Date;
  note: string | null;
  voucher_id: string | null;
  voucher_no: string | null;
  deposited: string;
  refunded: string;
  remaining: string;
  gr_no: string;
  student_code: string;
  first_name: string;
  last_name: string;
  status: string;
  class_name: string | null;
  father_name: string | null;
  guardian_phone: string | null;
  refunds: { id: string; amountMinor: string; reason: string; refundedOn: string }[];
}

function toRow(row: DepositSqlRow): SecurityDepositRow {
  return {
    id: row.id,
    studentId: row.student_id,
    grNo: row.gr_no,
    studentCode: row.student_code,
    name: `${row.first_name} ${row.last_name}`.trim(),
    fatherName: row.father_name,
    className: row.class_name,
    contact: row.guardian_phone,
    status: row.status as SecurityDepositRow['status'],
    month: isoDate(row.received_on).slice(0, 7),
    receivedOn: isoDate(row.received_on),
    voucherId: row.voucher_id,
    voucherNo: row.voucher_no,
    depositedMinor: minorUnits(fromDecimalString(row.deposited)),
    refundedMinor: minorUnits(fromDecimalString(row.refunded)),
    // Clamped, so a row can never read a negative remainder even if a refund
    // were somehow written past the deposit. The refund path refuses that, and
    // this makes sure a bug there cannot become a nonsense figure on screen.
    leftMinor: minorUnits(Math.max(0, fromDecimalString(row.remaining))),
    note: row.note,
    refunds: row.refunds.map(toRefund),
  };
}

function toRefund(refund: DepositSqlRow['refunds'][number]): SecurityRefund {
  return {
    id: refund.id,
    amountMinor: minorUnits(fromDecimalString(refund.amountMinor)),
    reason: refund.reason,
    refundedOn: refund.refundedOn.slice(0, 10),
  };
}

/**
 * A calendar date as the `date` column wants it.
 *
 * Midnight UTC, deliberately: a `@db.Date` has no time and no zone, and
 * building it from a local time would file a deposit taken on the 1st under the
 * 31st for every school east of Greenwich.
 */
function asDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/** The inverse: a `date` column back to `YYYY-MM-DD`, sliced, never converted. */
function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002'
  );
}
