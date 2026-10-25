import { type RevenueListQuery, type RevenueRow, type RevenueTotals } from '@ilm/contracts';
import { fromDecimalString, minorUnits } from '@ilm/utils';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';

import { PAYMENT_DEPOSIT_CTE } from './payment-deposits';

/**
 * Finance › Revenue — every fee receipt, and what of it was earned.
 *
 * Read-only: a receipt is written by the Pay button (`VouchersService`) and is
 * append-only after that. This only reports it.
 *
 * Two queries, as on every list here: the page, and the totals over the whole
 * filter. Both share the same `FROM … WHERE`, so a total can never describe a
 * different set of rows from the ones on screen.
 */
@Injectable()
export class RevenueService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    query: RevenueListQuery,
  ): Promise<{ items: RevenueRow[]; total: number; totals: RevenueTotals }> {
    return this.prisma.tenant(async (tx) => {
      const params: unknown[] = [];
      const bind = (value: unknown): string => {
        params.push(value);
        return `$${String(params.length)}`;
      };

      // Reversed payments are not money the school holds. A reversal, when the
      // endpoint exists, is its own row and never a deletion (R4).
      const where: string[] = [`p.status = 'CONFIRMED'`];

      if (query.from !== undefined) {
        where.push(`p.paid_on >= ${bind(query.from)}::date`);
      }
      if (query.to !== undefined) {
        where.push(`p.paid_on <= ${bind(query.to)}::date`);
      }
      if (query.method !== undefined) {
        where.push(`p.method = ${bind(query.method)}::payment_method`);
      }
      if (query.classLevelId !== undefined) {
        where.push(`e.class_level_id = ${bind(query.classLevelId)}::uuid`);
      }
      if (query.q !== undefined) {
        const term = bind(`%${query.q}%`);
        where.push(
          `((s.first_name || ' ' || s.last_name) ILIKE ${term}
             OR s.gr_no ILIKE ${term}
             OR p.receipt_no ILIKE ${term}
             OR p.reference ILIKE ${term})`,
        );
      }

      // No `deleted_at` filter on the student: money received from a family
      // whose record was later removed was still received.
      const from = `
        FROM fee_payments p
        JOIN students s ON s.id = p.student_id
        LEFT JOIN payment_deposit pd ON pd.payment_id = p.id
        -- The class the child is in now, one row at most.
        LEFT JOIN LATERAL (
          SELECT en.class_level_id FROM enrollments en
           WHERE en.student_id = s.id AND en.status = 'ENROLLED'
           ORDER BY en.created_at DESC
           LIMIT 1
        ) e ON true
        LEFT JOIN class_levels cl ON cl.id = e.class_level_id
        WHERE ${where.join(' AND ')}
      `;

      const ORDER: Record<RevenueListQuery['sort'], string> = {
        paidOn: 'p.paid_on',
        amount: 'p.amount',
        receiptNo: 'p.receipt_no',
        name: 's.first_name, s.last_name',
      };
      const direction = query.order === 'desc' ? 'DESC' : 'ASC';
      // A day holds many receipts: the receipt number breaks the tie so paging
      // is stable and a row never shows on two pages.
      const orderBy = `${ORDER[query.sort]} ${direction}, p.receipt_no ${direction}`;

      const rows = await tx.$queryRawUnsafe<RevenueSqlRow[]>(
        `WITH ${PAYMENT_DEPOSIT_CTE}
         SELECT p.id, p.receipt_no, p.paid_on, p.method::text AS method, p.reference,
                p.amount::text AS received,
                COALESCE(pd.deposit, 0)::text AS deposit,
                s.id AS student_id, s.first_name, s.last_name, s.gr_no,
                cl.name AS class_name,
                (SELECT COALESCE(array_agg(v.voucher_no ORDER BY v.due_date, v.voucher_no), '{}')
                   FROM fee_payment_allocations a
                   JOIN fee_vouchers v ON v.id = a.voucher_id
                  WHERE a.payment_id = p.id) AS voucher_nos
         ${from}
         ORDER BY ${orderBy}
         LIMIT ${bind(query.limit)} OFFSET ${bind(query.offset)}`,
        ...params,
      );

      const totalParams = params.slice(0, params.length - 2);
      const totals = await tx.$queryRawUnsafe<
        { count: bigint; received: string; deposit: string }[]
      >(
        `WITH ${PAYMENT_DEPOSIT_CTE}
         SELECT count(*) AS count,
                COALESCE(SUM(p.amount), 0)::text AS received,
                COALESCE(SUM(pd.deposit), 0)::text AS deposit
         ${from}`,
        ...totalParams,
      );

      const receivedMinor = fromDecimalString(totals[0]?.received ?? '0');
      const depositMinor = fromDecimalString(totals[0]?.deposit ?? '0');

      return {
        items: rows.map(toRow),
        total: Number(totals[0]?.count ?? 0),
        totals: {
          count: Number(totals[0]?.count ?? 0),
          receivedMinor: minorUnits(receivedMinor),
          depositMinor: minorUnits(depositMinor),
          revenueMinor: receivedMinor - depositMinor,
        },
      };
    });
  }
}

interface RevenueSqlRow {
  id: string;
  receipt_no: string;
  paid_on: Date;
  method: string;
  reference: string | null;
  received: string;
  deposit: string;
  student_id: string;
  first_name: string;
  last_name: string;
  gr_no: string;
  class_name: string | null;
  voucher_nos: string[];
}

function toRow(row: RevenueSqlRow): RevenueRow {
  const receivedMinor = fromDecimalString(row.received);
  const depositMinor = fromDecimalString(row.deposit);
  return {
    id: row.id,
    receiptNo: row.receipt_no,
    // A `date` column: sliced, never converted, so no zone can move the day.
    paidOn: row.paid_on.toISOString().slice(0, 10),
    method: row.method as RevenueRow['method'],
    reference: row.reference,
    studentId: row.student_id,
    studentName: `${row.first_name} ${row.last_name}`.trim(),
    grNo: row.gr_no,
    className: row.class_name,
    voucherNos: row.voucher_nos,
    receivedMinor: minorUnits(receivedMinor),
    depositMinor: minorUnits(depositMinor),
    revenueMinor: receivedMinor - depositMinor,
  };
}
