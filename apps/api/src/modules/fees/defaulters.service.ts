import {
  type DefaulterList,
  type DefaulterListQuery,
  type DefaulterRow,
  type DefaulterVoucher,
} from '@ilm/contracts';
import { DEFAULT_TIMEZONE, fromDecimalString, minorUnits, systemClock, today as todayIn } from '@ilm/utils';
import { Injectable } from '@nestjs/common';

import { type TransactionClient } from '../../prisma';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Who has not paid, and for how long.
 *
 * ## What "defaulter" means here
 *
 * A student with at least one voucher whose **due date has already passed** and
 * which still has a balance. The due date is the whole point: "unpaid" is not
 * the same thing as "late", and a list that calls a voucher issued yesterday a
 * default is a list the office stops believing on its first morning.
 *
 * `WAIVED` and `CANCELLED` never appear. Those are decisions the school has
 * already made, and chasing them is chasing its own paperwork.
 *
 * ## The cost of a page
 *
 * Three queries, whatever the page size: the school's timezone, the rows, the
 * totals. Not one per row and not one per expanded row.
 *
 * The obvious version of this screen is an N+1 in disguise — find the
 * defaulters, then fetch each one's overdue vouchers to fill the expanding row.
 * On a page of fifty that is fifty-one queries, and the months column needs a
 * fifty-second. Both come back aggregated in the row query instead, so
 * expanding a row costs nothing at all: the vouchers are already on the client.
 *
 * The driving index is `(school_id, status, due_date)`, which exists on
 * `fee_vouchers` already, so the overdue set is an index range scan rather than
 * a walk of every voucher the school has ever issued.
 *
 * ## Why the balance is `net_payable - paid_amount`
 *
 * The same expression the voucher list and the payment path use. A late fee is
 * deliberately *outside* `net_payable` until a payment crystallises it, so
 * adding it here would show a figure on this screen that no receipt agrees
 * with. Consistency across the three places a parent's balance appears matters
 * more here than theoretical precision about a surcharge nobody has charged yet.
 */
@Injectable()
export class DefaultersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: DefaulterListQuery): Promise<DefaulterList> {
    return this.prisma.tenant(async (tx) => {
      const asOf = await schoolToday(tx);

      const params: unknown[] = [];
      const bind = (value: unknown): string => {
        params.push(value);
        return `$${String(params.length)}`;
      };

      // --- The overdue set ----------------------------------------------------
      //
      // Bound before anything joins to it, so the aggregate below runs over the
      // smallest set Postgres can find with the index rather than over every
      // voucher in the school.
      const overdueWhere: string[] = [
        `v.status IN ('UNPAID', 'PARTIALLY_PAID')`,
        `v.due_date < ${bind(asOf)}::date`,
        // A fully-settled voucher whose status was never advanced would
        // otherwise show as a default owing nothing.
        `v.net_payable > v.paid_amount`,
      ];

      if (query.sessionId !== undefined) {
        overdueWhere.push(`v.session_id = ${bind(query.sessionId)}::uuid`);
      }
      // `from`/`to` bound the due dates being chased, not the issue dates:
      // "what went unpaid last term" is a question about when money was owed.
      if (query.from !== undefined) {
        overdueWhere.push(`v.due_date >= ${bind(query.from)}::date`);
      }
      if (query.to !== undefined) {
        overdueWhere.push(`v.due_date <= ${bind(query.to)}::date`);
      }

      // --- Student-side filters ----------------------------------------------
      const where: string[] = ['s.deleted_at IS NULL'];

      if (query.status !== undefined) {
        where.push(`s.status = ${bind(query.status)}::student_status`);
      }
      if (query.gender !== undefined) {
        where.push(`s.gender = ${bind(query.gender)}::gender`);
      }
      if (query.classLevelId !== undefined) {
        where.push(`e.class_level_id = ${bind(query.classLevelId)}::uuid`);
      }
      if (query.sectionId !== undefined) {
        where.push(`e.section_id = ${bind(query.sectionId)}::uuid`);
      }
      if (query.q !== undefined) {
        const term = bind(`%${query.q}%`);
        where.push(
          `((s.first_name || ' ' || s.last_name) ILIKE ${term}
             OR s.student_code ILIKE ${term}
             OR s.gr_no ILIKE ${term})`,
        );
      }
      if (query.months !== undefined) {
        where.push(`agg.months_owed >= ${bind(query.months)}`);
      }

      const overdueCte = `
        overdue AS (
          SELECT v.id, v.student_id, v.voucher_no, v.bill_months,
                 v.issue_date, v.due_date, v.valid_till,
                 v.status::text AS status,
                 v.net_payable, v.paid_amount,
                 (v.net_payable - v.paid_amount) AS balance
            FROM fee_vouchers v
           WHERE ${overdueWhere.join(' AND ')}
        ),
        agg AS (
          SELECT o.student_id,
                 SUM(o.balance) AS total_owed,
                 -- Distinct months across every overdue voucher. A term voucher
                 -- bills three, and two vouchers can both bill the same month
                 -- when one carries the other's arrears, so counting rows here
                 -- would overstate how far behind a family is.
                 COALESCE(
                   (SELECT count(DISTINCT m)
                      FROM overdue o2, unnest(o2.bill_months) AS m
                     WHERE o2.student_id = o.student_id), 0) AS months_owed
            FROM overdue o
           GROUP BY o.student_id
        )`;

      // The live enrolment only — a child who left last week must not still
      // read "Grade 1", and must not come back when the list is filtered by
      // that section.
      const sessionExpr =
        query.sessionId === undefined
          ? '(SELECT id FROM academic_sessions WHERE is_current LIMIT 1)'
          : `${bind(query.sessionId)}::uuid`;

      const from = `
        FROM students s
        JOIN agg ON agg.student_id = s.id
        LEFT JOIN enrollments e
          ON e.student_id = s.id
         AND e.status = 'ENROLLED'
         AND e.session_id = COALESCE(${sessionExpr}, e.session_id)
        LEFT JOIN class_levels cl ON cl.id = e.class_level_id
        LEFT JOIN sections sec ON sec.id = e.section_id
        WHERE ${where.join(' AND ')}
      `;

      const ORDER: Record<DefaulterListQuery['sort'], string> = {
        amount: 'agg.total_owed',
        months: 'agg.months_owed',
        name: 's.last_name, s.first_name',
        grNo: 's.gr_no',
        className: 'cl.numeric_order, sec.name',
      };
      const direction = query.order === 'desc' ? 'DESC' : 'ASC';

      const rows = await tx.$queryRawUnsafe<DefaulterSqlRow[]>(
        `WITH ${overdueCte}
         SELECT s.id AS student_id, s.gr_no, s.student_code,
                s.first_name, s.last_name,
                s.status::text AS status, s.gender::text AS gender,
                cl.name AS class_name, sec.name AS section_name,
                -- Scalar subqueries, not joins.
                --
                -- A child can have several guardians, so joining them would fan
                -- one student into several rows: LIMIT would cut the page
                -- mid-student and the SUM in the totals query would count the
                -- same debt twice. "count(DISTINCT …)" would still report the
                -- right total while the money was wrong, which is what makes
                -- that bug so unpleasant to find.
                (SELECT gf.name
                   FROM student_guardians sgf
                   JOIN guardians gf ON gf.id = sgf.guardian_id
                  WHERE sgf.student_id = s.id AND gf.relation = 'FATHER'
                  LIMIT 1) AS father_name,
                -- The number the office will actually dial: the father's, or
                -- the primary guardian's when there is no father on file.
                (SELECT gc.phone
                   FROM student_guardians sgc
                   JOIN guardians gc ON gc.id = sgc.guardian_id
                  WHERE sgc.student_id = s.id AND gc.phone IS NOT NULL
                  ORDER BY (gc.relation = 'FATHER') DESC, sgc.is_primary DESC
                  LIMIT 1) AS guardian_phone,
                agg.total_owed::text AS total_owed,
                agg.months_owed::int AS months_owed,
                -- Oldest first: the months column reads as a history, and the
                -- first one is the one the phone call is about.
                (SELECT COALESCE(array_agg(DISTINCT m ORDER BY m), ARRAY[]::date[])
                   FROM overdue o2, unnest(o2.bill_months) AS m
                  WHERE o2.student_id = s.id) AS months,
                -- The expanded row, fetched with the row that expands. Only the
                -- page's own students are aggregated, because this is
                -- correlated and evaluated per returned row.
                (SELECT COALESCE(json_agg(json_build_object(
                          'voucherId', o3.id,
                          'voucherNo', o3.voucher_no,
                          'billMonths', o3.bill_months,
                          'issueDate', o3.issue_date,
                          'dueDate', o3.due_date,
                          'validTill', o3.valid_till,
                          'status', o3.status,
                          'balanceMinor', o3.balance::text,
                          'netPayableMinor', o3.net_payable::text,
                          'paidMinor', o3.paid_amount::text
                        ) ORDER BY o3.due_date), '[]'::json)
                   FROM overdue o3
                  WHERE o3.student_id = s.id) AS vouchers
         ${from}
         ORDER BY ${ORDER[query.sort]} ${direction}
         LIMIT ${bind(query.limit)} OFFSET ${bind(query.offset)}`,
        ...params,
      );

      // The totals re-run the same predicate so they can never disagree with
      // the rows. `total_owed` here spans the whole filter, not the page: a
      // school reads that figure to decide what to do about it, and a total
      // that quietly meant "these fifty rows" would be worse than none.
      const totalParams = params.slice(0, params.length - 2);
      const totals = await tx.$queryRawUnsafe<{ total: bigint; owed: string | null }[]>(
        // The sum is taken over one row per student, not over the join.
        //
        // `SELECT DISTINCT s.id, agg.total_owed` collapses any fan-out the
        // enrolment join could produce before the money is added up. Summing
        // the join directly would count a debt once per duplicate row, and the
        // figure at the top of the screen would quietly exceed the sum of the
        // rows beneath it.
        `WITH ${overdueCte}
         SELECT count(*) AS total,
                COALESCE(SUM(d.total_owed), 0)::text AS owed
           FROM (SELECT DISTINCT s.id, agg.total_owed ${from}) d`,
        ...totalParams,
      );

      return {
        rows: rows.map(toRow),
        total: Number(totals[0]?.total ?? 0),
        totalOwedMinor: minorUnits(fromDecimalString(totals[0]?.owed ?? '0')),
        asOf,
      };
    });
  }
}

interface DefaulterSqlRow {
  student_id: string;
  gr_no: string;
  student_code: string;
  first_name: string;
  last_name: string;
  status: string;
  gender: string | null;
  class_name: string | null;
  section_name: string | null;
  guardian_phone: string | null;
  father_name: string | null;
  total_owed: string;
  months_owed: number;
  months: Date[];
  vouchers: SqlVoucher[];
}

interface SqlVoucher {
  voucherId: string;
  voucherNo: string;
  billMonths: string[];
  issueDate: string;
  dueDate: string;
  validTill: string;
  status: string;
  balanceMinor: string;
  netPayableMinor: string;
  paidMinor: string;
}

function toRow(row: DefaulterSqlRow): DefaulterRow {
  return {
    studentId: row.student_id,
    grNo: row.gr_no,
    studentCode: row.student_code,
    name: `${row.first_name} ${row.last_name}`.trim(),
    fatherName: row.father_name,
    gender: row.gender as DefaulterRow['gender'],
    className: row.class_name,
    sectionName: row.section_name,
    contact: row.guardian_phone,
    status: row.status as DefaulterRow['status'],
    totalOwedMinor: minorUnits(fromDecimalString(row.total_owed)),
    monthsOwed: row.months_owed,
    months: row.months.map(monthKey),
    vouchers: row.vouchers.map(toVoucher),
  };
}

function toVoucher(voucher: SqlVoucher): DefaulterVoucher {
  return {
    voucherId: voucher.voucherId,
    voucherNo: voucher.voucherNo,
    billMonths: voucher.billMonths.map((month) => month.slice(0, 7)),
    issueDate: voucher.issueDate.slice(0, 10),
    dueDate: voucher.dueDate.slice(0, 10),
    validTill: voucher.validTill.slice(0, 10),
    status: voucher.status as DefaulterVoucher['status'],
    balanceMinor: minorUnits(fromDecimalString(voucher.balanceMinor)),
    netPayableMinor: minorUnits(fromDecimalString(voucher.netPayableMinor)),
    paidMinor: minorUnits(fromDecimalString(voucher.paidMinor)),
  };
}

/**
 * A `@db.Date` comes back as a Date at UTC midnight. Sliced, never converted:
 * anything timezone-aware would shift a month boundary by a day and file
 * October's arrears under September for half the world.
 */
function monthKey(value: Date): string {
  return value.toISOString().slice(0, 7);
}

/**
 * The school's own date, not the server's.
 *
 * "Overdue" is decided by a calendar on a wall in Karachi. A school opening
 * this screen at 02:00 is still on yesterday in UTC, and a voucher due today
 * would appear as already late for those two hours — the office would start
 * phoning families who are not late at all.
 */
async function schoolToday(tx: TransactionClient): Promise<string> {
  const school = await tx.school.findFirst({ select: { timezone: true } });
  return todayIn(systemClock, school?.timezone ?? DEFAULT_TIMEZONE);
}
