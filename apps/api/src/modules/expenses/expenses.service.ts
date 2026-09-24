import {
  type CreateExpense,
  type CreateExpenseCategory,
  type Expense,
  type ExpenseCategory,
  type ExpenseListQuery,
  type ExpenseTotals,
  type UpdateExpense,
  type UpdateExpenseCategory,
} from '@ilm/contracts';
import { fromDecimalString, minorUnits, toDecimalString } from '@ilm/utils';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { BusinessRuleError, ConflictError, NotFoundError } from '../../shared/errors/domain-error';

/**
 * Expenses and the categories they are booked against.
 *
 * ## Two things this service is careful about
 *
 * **Totals are summed by the database over the filtered set**, never added up
 * from the page. "Total expenses: 89,150" has to mean everything matching the
 * filters; a figure that changes when you turn the page is worse than no figure
 * at all.
 *
 * **Nothing money has been booked against is deleted.** A category with
 * expenses against it would take that spending out of every total that already
 * reported it, so the service refuses with a sentence rather than letting the
 * foreign key raise a 500.
 */
@Injectable()
export class ExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  // --- Categories -----------------------------------------------------------

  async listCategories(): Promise<ExpenseCategory[]> {
    return this.prisma.tenant(async (tx) => {
      const rows = await tx.expenseCategory.findMany({
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: {
          id: true,
          name: true,
          glCode: true,
          isActive: true,
          sortOrder: true,
          _count: { select: { expenses: true } },
        },
      });

      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        glCode: row.glCode,
        isActive: row.isActive,
        sortOrder: row.sortOrder,
        expenseCount: row._count.expenses,
      }));
    });
  }

  async createCategory(input: CreateExpenseCategory): Promise<ExpenseCategory> {
    return this.prisma
      .tenant(async (tx) => {
        const sortOrder =
          input.sortOrder ??
          ((await tx.expenseCategory.aggregate({ _max: { sortOrder: true } }))._max.sortOrder ??
            -1) + 1;

        const created = await tx.expenseCategory.create({
          data: {
            name: input.name,
            sortOrder,
            ...(input.glCode === undefined ? {} : { glCode: input.glCode }),
          } as never,
          select: { id: true, name: true, glCode: true, isActive: true, sortOrder: true },
        });

        return { ...created, expenseCount: 0 };
      })
      .catch((error: unknown) => {
        if (isUniqueViolation(error)) {
          throw new ConflictError(`A category called "${input.name}" already exists.`);
        }
        throw error;
      });
  }

  async updateCategory(id: string, input: UpdateExpenseCategory): Promise<ExpenseCategory> {
    return this.prisma
      .tenant(async (tx) => {
        const existing = await tx.expenseCategory.findUnique({
          where: { id },
          select: { id: true },
        });
        if (existing === null) {
          throw new NotFoundError('category');
        }

        const updated = await tx.expenseCategory.update({
          where: { id },
          data: {
            ...(input.name === undefined ? {} : { name: input.name }),
            ...(input.glCode === undefined ? {} : { glCode: input.glCode }),
            ...(input.sortOrder === undefined ? {} : { sortOrder: input.sortOrder }),
            ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
          },
          select: {
            id: true,
            name: true,
            glCode: true,
            isActive: true,
            sortOrder: true,
            _count: { select: { expenses: true } },
          },
        });

        return {
          id: updated.id,
          name: updated.name,
          glCode: updated.glCode,
          isActive: updated.isActive,
          sortOrder: updated.sortOrder,
          expenseCount: updated._count.expenses,
        };
      })
      .catch((error: unknown) => {
        if (isUniqueViolation(error)) {
          throw new ConflictError('A category with that name already exists.');
        }
        throw error;
      });
  }

  /**
   * Delete a category nobody has booked against.
   *
   * Unlike a fee head, this one genuinely refuses. Deleting a fee removes a
   * charge from a student's structure, which is recoverable by re-adding it;
   * deleting a category would take real spending out of totals that have
   * already been reported, and there is no way to put that back.
   */
  async deleteCategory(id: string): Promise<void> {
    await this.prisma.tenant(async (tx) => {
      const category = await tx.expenseCategory.findUnique({
        where: { id },
        select: { name: true, _count: { select: { expenses: true } } },
      });

      if (category === null) {
        throw new NotFoundError('category');
      }

      if (category._count.expenses > 0) {
        throw new BusinessRuleError(
          'BUSINESS_RULE_VIOLATION',
          `${String(category._count.expenses)} expenses are booked against "${category.name}", so it cannot be deleted — the spending would vanish from every total that already reported it. Turn it off instead: existing entries keep their category and it stops appearing on new ones.`,
        );
      }

      await tx.expenseCategory.delete({ where: { id } });
    });
  }

  // --- Expenses -------------------------------------------------------------

  async list(
    query: ExpenseListQuery,
  ): Promise<{ items: Expense[]; total: number; totals: ExpenseTotals }> {
    return this.prisma.tenant(async (tx) => {
      const sessionId =
        query.sessionId ??
        (await tx.academicSession.findFirst({ where: { isCurrent: true }, select: { id: true } }))
          ?.id;

      const where = {
        ...(sessionId === undefined ? {} : { sessionId }),
        ...(query.categoryId === undefined ? {} : { categoryId: query.categoryId }),
        ...(query.method === undefined ? {} : { method: query.method }),
        ...(query.from === undefined && query.to === undefined
          ? {}
          : {
              paidOn: {
                ...(query.from === undefined ? {} : { gte: new Date(query.from) }),
                // Inclusive: "1st to 31st" means the 31st to everybody except a
                // programmer. `@db.Date` has no time component, so `lte` on the
                // day itself is already the whole day.
                ...(query.to === undefined ? {} : { lte: new Date(query.to) }),
              },
            }),
        ...(query.q === undefined || query.q === ''
          ? {}
          : {
              OR: [
                { description: { contains: query.q, mode: 'insensitive' as const } },
                { payee: { contains: query.q, mode: 'insensitive' as const } },
                { voucherNo: { contains: query.q } },
              ],
            }),
      };

      // Three queries, one predicate. The rows, the count for paging, and the
      // sum over everything that matched — the last is why "total expenses" can
      // be shown honestly next to a paged list.
      const [rows, total, sum] = await Promise.all([
        tx.expense.findMany({
          where,
          orderBy: orderFor(query.sort, query.order),
          skip: query.offset,
          take: query.limit,
          select: {
            id: true,
            voucherNo: true,
            sessionId: true,
            categoryId: true,
            description: true,
            payee: true,
            amount: true,
            method: true,
            paidOn: true,
            reference: true,
            session: { select: { name: true } },
            category: { select: { name: true } },
          },
        }),
        tx.expense.count({ where }),
        tx.expense.aggregate({ where, _sum: { amount: true } }),
      ]);

      return {
        total,
        totals: {
          totalMinor:
            sum._sum.amount === null
              ? minorUnits(0)
              : fromDecimalString(sum._sum.amount.toFixed(2)),
          count: total,
        },
        items: rows.map((row) => ({
          id: row.id,
          voucherNo: row.voucherNo,
          sessionId: row.sessionId,
          sessionName: row.session.name,
          categoryId: row.categoryId,
          categoryName: row.category.name,
          description: row.description,
          payee: row.payee,
          amountMinor: fromDecimalString(row.amount.toFixed(2)),
          method: row.method,
          paidOn: row.paidOn.toISOString().slice(0, 10),
          reference: row.reference,
        })),
      };
    });
  }

  async create(input: CreateExpense, createdBy: string | undefined): Promise<Expense> {
    return this.prisma.tenant(async (tx) => {
      const [session, category] = await Promise.all([
        tx.academicSession.findUnique({
          where: { id: input.sessionId },
          select: { id: true, name: true },
        }),
        tx.expenseCategory.findUnique({
          where: { id: input.categoryId },
          select: { id: true, name: true, isActive: true },
        }),
      ]);

      if (session === null) {
        throw new NotFoundError('session');
      }
      if (category === null) {
        throw new NotFoundError('category');
      }
      if (!category.isActive) {
        throw new BusinessRuleError(
          'BUSINESS_RULE_VIOLATION',
          `"${category.name}" has been turned off. Pick another category, or turn it back on first.`,
        );
      }

      const voucherNo = await nextVoucherNo(tx);

      const created = await tx.expense.create({
        data: {
          voucherNo,
          sessionId: input.sessionId,
          categoryId: input.categoryId,
          description: input.description,
          amount: toDecimalString(minorUnits(input.amountMinor)),
          method: input.method,
          paidOn: new Date(input.paidOn),
          ...(createdBy === undefined ? {} : { createdBy }),
          ...(input.payee === undefined ? {} : { payee: input.payee }),
          ...(input.reference === undefined ? {} : { reference: input.reference }),
        } as never,
        select: {
          id: true,
          voucherNo: true,
          sessionId: true,
          categoryId: true,
          description: true,
          payee: true,
          amount: true,
          method: true,
          paidOn: true,
          reference: true,
          session: { select: { name: true } },
          category: { select: { name: true } },
        },
      });

      return toExpense(created);
    });
  }

  async update(id: string, input: UpdateExpense): Promise<Expense> {
    return this.prisma.tenant(async (tx) => {
      const existing = await tx.expense.findUnique({ where: { id }, select: { id: true } });
      if (existing === null) {
        throw new NotFoundError('expense');
      }

      const updated = await tx.expense.update({
        where: { id },
        data: {
          ...(input.sessionId === undefined ? {} : { sessionId: input.sessionId }),
          ...(input.categoryId === undefined ? {} : { categoryId: input.categoryId }),
          ...(input.description === undefined ? {} : { description: input.description }),
          ...(input.payee === undefined ? {} : { payee: input.payee }),
          ...(input.amountMinor === undefined
            ? {}
            : { amount: toDecimalString(minorUnits(input.amountMinor)) }),
          ...(input.method === undefined ? {} : { method: input.method }),
          ...(input.paidOn === undefined ? {} : { paidOn: new Date(input.paidOn) }),
          ...(input.reference === undefined ? {} : { reference: input.reference }),
        },
        select: {
          id: true,
          voucherNo: true,
          sessionId: true,
          categoryId: true,
          description: true,
          payee: true,
          amount: true,
          method: true,
          paidOn: true,
          reference: true,
          session: { select: { name: true } },
          category: { select: { name: true } },
        },
      });

      return toExpense(updated);
    });
  }

  async remove(id: string): Promise<void> {
    await this.prisma.tenant(async (tx) => {
      const existing = await tx.expense.findUnique({ where: { id }, select: { id: true } });
      if (existing === null) {
        throw new NotFoundError('expense');
      }
      await tx.expense.delete({ where: { id } });
    });
  }
}

/**
 * The next voucher number, from a per-school counter under a row lock.
 *
 * Same mechanism as GR and employee numbers, and for the same reason:
 * `count(*) + 1` hands two people entering expenses at once the same number,
 * and a duplicate voucher number is exactly what an auditor notices.
 */
async function nextVoucherNo(tx: {
  $queryRawUnsafe: <T>(q: string, ...v: unknown[]) => Promise<T>;
}): Promise<string> {
  const rows = await tx.$queryRawUnsafe<{ next: number }[]>(
    `INSERT INTO number_sequences (id, school_id, kind, next_value, updated_at)
     VALUES (gen_random_uuid(), current_school_id(), 'expense', 2, now())
     ON CONFLICT (school_id, kind)
     DO UPDATE SET next_value = number_sequences.next_value + 1, updated_at = now()
     RETURNING next_value - 1 AS next`,
  );

  const value = rows[0]?.next;
  if (value === undefined) {
    throw new BusinessRuleError(
      'INTERNAL_ERROR',
      'Could not allocate a voucher number. Nothing was saved.',
    );
  }

  return `EXP-${String(value).padStart(5, '0')}`;
}

function toExpense(row: {
  id: string;
  voucherNo: string;
  sessionId: string;
  categoryId: string;
  description: string;
  payee: string | null;
  amount: { toFixed: (digits: number) => string };
  method: Expense['method'];
  paidOn: Date;
  reference: string | null;
  session: { name: string };
  category: { name: string };
}): Expense {
  return {
    id: row.id,
    voucherNo: row.voucherNo,
    sessionId: row.sessionId,
    sessionName: row.session.name,
    categoryId: row.categoryId,
    categoryName: row.category.name,
    description: row.description,
    payee: row.payee,
    amountMinor: fromDecimalString(row.amount.toFixed(2)),
    method: row.method,
    paidOn: row.paidOn.toISOString().slice(0, 10),
    reference: row.reference,
  };
}

function orderFor(sort: string, order: 'asc' | 'desc') {
  switch (sort) {
    case 'amount':
      return { amount: order } as const;
    case 'voucherNo':
      return { voucherNo: order } as const;
    case 'createdAt':
      return { createdAt: order } as const;
    default:
      // Newest spending first by default — the list is read that way.
      return { paidOn: order === 'asc' ? ('asc' as const) : ('desc' as const) } as const;
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002'
  );
}
