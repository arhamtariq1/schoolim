import {
  createExpenseCategorySchema,
  createExpenseSchema,
  expenseListQuerySchema,
  ROUTES,
  updateExpenseCategorySchema,
  updateExpenseSchema,
  type Expense,
  type ExpenseCategory,
  type ExpenseTotals,
} from '@ilm/contracts';
import {
  Body,
  Controller,
  Delete,
  Get,
  Module,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { type FastifyRequest } from 'fastify';

import { RequirePermission } from '../../shared/rbac/rbac.guard';

import { ExpensesService } from './expenses.service';

/**
 * Expense endpoints.
 *
 * ## Route order matters here
 *
 * `/expenses/categories` is declared **before** `/expenses/:id`. Fastify
 * matches in registration order, so the other way round the literal path would
 * be swallowed by the parameter route and every category request would arrive
 * as an expense lookup for an id of "categories".
 */
@Controller()
export class ExpensesController {
  constructor(private readonly expenses: ExpensesService) {}

  @Get(ROUTES.expenses.categories)
  @RequirePermission('finance.expense.read')
  async listCategories(): Promise<{ data: ExpenseCategory[] }> {
    return { data: await this.expenses.listCategories() };
  }

  @Post(ROUTES.expenses.categories)
  @RequirePermission('finance.expense.create')
  async createCategory(@Body() body: unknown): Promise<{ data: ExpenseCategory }> {
    return { data: await this.expenses.createCategory(createExpenseCategorySchema.parse(body)) };
  }

  @Patch('/api/v1/expenses/categories/:id')
  @RequirePermission('finance.expense.create')
  async updateCategory(
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<{ data: ExpenseCategory }> {
    return {
      data: await this.expenses.updateCategory(id, updateExpenseCategorySchema.parse(body)),
    };
  }

  @Delete('/api/v1/expenses/categories/:id')
  @RequirePermission('finance.expense.create')
  async deleteCategory(@Param('id') id: string): Promise<{ data: { ok: true } }> {
    await this.expenses.deleteCategory(id);
    return { data: { ok: true } };
  }

  /**
   * The expense list.
   *
   * `meta.totals` is the sum over **everything matching the filters**, not this
   * page — a total that changed when you turned the page would be worse than
   * showing none.
   */
  @Get(ROUTES.expenses.list)
  @RequirePermission('finance.expense.read')
  async list(
    @Query() rawQuery: unknown,
    @Req() request: FastifyRequest,
  ): Promise<{
    data: Expense[];
    meta: {
      requestId: string;
      page: { total: number; limit: number; offset: number };
      totals: ExpenseTotals;
    };
  }> {
    const query = expenseListQuerySchema.parse(rawQuery);
    const { items, total, totals } = await this.expenses.list(query);

    return {
      data: items,
      meta: {
        requestId: request.id,
        page: { total, limit: query.limit, offset: query.offset },
        totals,
      },
    };
  }

  @Post(ROUTES.expenses.create)
  @RequirePermission('finance.expense.create')
  async create(@Body() body: unknown, @Req() request: FastifyRequest): Promise<{ data: Expense }> {
    const input = createExpenseSchema.parse(body);
    return { data: await this.expenses.create(input, request.claims?.sub) };
  }

  @Patch('/api/v1/expenses/:id')
  @RequirePermission('finance.expense.create')
  async update(@Param('id') id: string, @Body() body: unknown): Promise<{ data: Expense }> {
    return { data: await this.expenses.update(id, updateExpenseSchema.parse(body)) };
  }

  @Delete('/api/v1/expenses/:id')
  @RequirePermission('finance.expense.create')
  async remove(@Param('id') id: string): Promise<{ data: { ok: true } }> {
    await this.expenses.remove(id);
    return { data: { ok: true } };
  }
}

@Module({
  controllers: [ExpensesController],
  providers: [ExpensesService],
})
export class ExpensesModule {}
