import { z } from 'zod';

import { listQuery } from './pagination';
import { calendarDateSchema, idSchema, positiveMinorUnitsSchema, textSchema } from './primitives';

/**
 * Expenses — docs/07 §7, docs/modules/fees-and-finance.md.
 *
 * Categories are the old "Expense Type" screen, kept school-configurable rather
 * than a fixed enum: every school groups its spending differently, and a
 * hard-coded list is the school-specific branching CLAUDE.md R1 forbids.
 *
 * Every amount is integer paisa and every field carrying one ends in `Minor`.
 */

export const expenseCategorySchema = z.object({
  id: idSchema,
  name: z.string(),
  glCode: z.string().nullable(),
  isActive: z.boolean(),
  sortOrder: z.int(),
  /** How many expenses reference it — the list needs this to warn before delete. */
  expenseCount: z.int().min(0),
});

export type ExpenseCategory = z.infer<typeof expenseCategorySchema>;

export const createExpenseCategorySchema = z
  .object({
    name: textSchema(80),
    glCode: z.string().trim().max(20).optional(),
    sortOrder: z.int().min(0).max(9999).optional(),
  })
  .strict();

export type CreateExpenseCategory = z.infer<typeof createExpenseCategorySchema>;

export const updateExpenseCategorySchema = createExpenseCategorySchema
  .partial()
  .extend({ isActive: z.boolean().optional() })
  .strict();

export type UpdateExpenseCategory = z.infer<typeof updateExpenseCategorySchema>;

export const PAYMENT_METHODS = ['CASH', 'BANK_TRANSFER', 'CHEQUE', 'CARD', 'OTHER'] as const;
export const paymentMethodSchema = z.enum(PAYMENT_METHODS);
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

export const PAYMENT_METHOD_LABELS: Readonly<Record<PaymentMethod, string>> = {
  CASH: 'Cash',
  BANK_TRANSFER: 'Bank transfer',
  CHEQUE: 'Cheque',
  CARD: 'Card',
  OTHER: 'Other',
};

export const expenseSchema = z.object({
  id: idSchema,
  /** Gapless per-school counter — what a paper voucher would carry. */
  voucherNo: z.string(),
  sessionId: idSchema,
  sessionName: z.string(),
  categoryId: idSchema,
  categoryName: z.string(),
  description: z.string(),
  payee: z.string().nullable(),
  amountMinor: positiveMinorUnitsSchema,
  method: paymentMethodSchema,
  paidOn: calendarDateSchema,
  reference: z.string().nullable(),
});

export type Expense = z.infer<typeof expenseSchema>;

/**
 * The expense list query.
 *
 * `q` searches the description, payee and voucher number — the three things
 * somebody has in front of them when they go looking for a payment.
 *
 * The date range is inclusive at both ends, because "1st to 31st" means the
 * 31st to everybody except a programmer.
 */
export const expenseListQuerySchema = listQuery(
  ['paidOn', 'amount', 'voucherNo', 'createdAt'] as const,
  {
    sessionId: idSchema.optional(),
    categoryId: idSchema.optional(),
    method: paymentMethodSchema.optional(),
    from: calendarDateSchema.optional(),
    to: calendarDateSchema.optional(),
  },
  'paidOn',
);

export type ExpenseListQuery = z.infer<typeof expenseListQuerySchema>;

export const createExpenseSchema = z
  .object({
    sessionId: idSchema,
    categoryId: idSchema,
    description: textSchema(200),
    payee: z.string().trim().max(120).optional(),
    amountMinor: positiveMinorUnitsSchema,
    method: paymentMethodSchema.default('CASH'),
    paidOn: calendarDateSchema,
    reference: z.string().trim().max(80).optional(),
  })
  .strict();

export type CreateExpense = z.infer<typeof createExpenseSchema>;

export const updateExpenseSchema = createExpenseSchema.partial().strict();
export type UpdateExpense = z.infer<typeof updateExpenseSchema>;

/**
 * Totals for the **filtered** set, not the page.
 *
 * "Total expenses: 89,150" has to mean everything matching the filters, or it
 * is a number that changes when you turn the page — which is worse than not
 * showing one. Summed by the database over the same predicate as the rows.
 */
export const expenseTotalsSchema = z.object({
  totalMinor: positiveMinorUnitsSchema,
  count: z.int().min(0),
});

export type ExpenseTotals = z.infer<typeof expenseTotalsSchema>;
