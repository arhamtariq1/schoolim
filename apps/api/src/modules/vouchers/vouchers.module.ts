import {
  bulkDeleteVouchersSchema,
  MAX_BULK_VOUCHERS,
  cancelVoucherSchema,
  challanBatchSchema,
  generateVouchersSchema,
  previewVouchersSchema,
  recordPaymentSchema,
  ROUTES,
  studentLookupQuerySchema,
  updateVoucherSchema,
  voucherListQuerySchema,
  waiveVoucherSchema,
  type GenerationResult,
  type StudentLookupResult,
  type BulkDeleteResult,
  type Challan,
  type VoucherIds,
  type VoucherDetail,
  type VoucherPreview,
  type VoucherSummary,
  type VoucherTotals,
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

import { VoucherGenerationService } from './voucher-generation.service';
import { VouchersService } from './vouchers.service';

/**
 * Voucher endpoints.
 *
 * ## Route order matters
 *
 * `/fee-vouchers/preview`, `/generate` and `/student-lookup` are declared
 * **before** `/fee-vouchers/:id`. Fastify matches in registration order, so the
 * other way round every one of them would arrive as a voucher lookup for an id
 * of "preview".
 */
@Controller()
export class VouchersController {
  constructor(
    private readonly vouchers: VouchersService,
    private readonly generation: VoucherGenerationService,
  ) {}

  @Get(ROUTES.vouchers.studentLookup)
  @RequirePermission('fees.voucher.read')
  async lookup(@Query() rawQuery: unknown): Promise<{ data: StudentLookupResult[] }> {
    return { data: await this.vouchers.lookupStudents(studentLookupQuerySchema.parse(rawQuery)) };
  }

  /**
   * What generation would do. Same code path as generating, so the numbers on
   * this screen are the numbers that will be written — docs §5 calls a preview
   * computed a second way worse than none.
   */
  @Post(ROUTES.vouchers.preview)
  @RequirePermission('fees.voucher.generate')
  async preview(@Body() body: unknown): Promise<{ data: VoucherPreview }> {
    return { data: await this.generation.preview(previewVouchersSchema.parse(body)) };
  }

  @Post(ROUTES.vouchers.generate)
  @RequirePermission('fees.voucher.generate')
  async generate(
    @Body() body: unknown,
    @Req() request: FastifyRequest,
  ): Promise<{ data: GenerationResult }> {
    const input = generateVouchersSchema.parse(body);
    return { data: await this.generation.generate(input, request.claims?.sub) };
  }

  @Get(ROUTES.vouchers.list)
  @RequirePermission('fees.voucher.read')
  async list(
    @Query() rawQuery: unknown,
    @Req() request: FastifyRequest,
  ): Promise<{
    data: VoucherSummary[];
    meta: {
      requestId: string;
      page: { total: number; limit: number; offset: number };
      totals: VoucherTotals;
    };
  }> {
    const query = voucherListQuerySchema.parse(rawQuery);
    const { items, total, totals } = await this.vouchers.list(query);

    return {
      data: items,
      meta: {
        requestId: request.id,
        page: { total, limit: query.limit, offset: query.offset },
        totals,
      },
    };
  }

  @Get('/api/v1/fee-vouchers/:id')
  @RequirePermission('fees.voucher.read')
  async detail(@Param('id') id: string): Promise<{ data: VoucherDetail }> {
    return { data: await this.vouchers.detail(id) };
  }

  @Patch('/api/v1/fee-vouchers/:id')
  @RequirePermission('fees.voucher.generate')
  async update(@Param('id') id: string, @Body() body: unknown): Promise<{ data: VoucherDetail }> {
    return { data: await this.vouchers.update(id, updateVoucherSchema.parse(body)) };
  }

  /**
   * Delete an unpaid voucher.
   *
   * `DELETE` is what the trash icon sends. Unpaid vouchers (nothing received)
   * are removed so they leave the list and the months can be billed again. A
   * reason is required for the audit trail of who removed it and why. Paid
   * vouchers cannot be deleted — reverse the payment first.
   */
  /**
   * Remove a selection in one go.
   *
   * A POST rather than a DELETE with a body: a request body on DELETE is
   * allowed by the spec and dropped by enough proxies to be a bad bet for a
   * financial action, and this is a named operation rather than the removal of
   * the resource at this URL.
   *
   * Placed **above** the `:id` routes on purpose. Nest matches in declaration
   * order, so registering it after them would let `/fee-vouchers/bulk-delete`
   * be read as a voucher whose id is "bulk-delete".
   */
  /**
   * The ids behind the current filters, for "select all matching".
   *
   * Above the `:id` routes, like the two below it: Nest matches in declaration
   * order, and registering it later would let `/fee-vouchers/ids` be read as a
   * voucher whose id is "ids".
   */
  @Get(ROUTES.vouchers.ids)
  @RequirePermission('fees.voucher.read')
  async ids(@Query() query: unknown): Promise<{ data: VoucherIds }> {
    const parsed = voucherListQuerySchema.parse(query);
    return { data: await this.vouchers.ids(parsed, MAX_BULK_VOUCHERS) };
  }

  @Post(ROUTES.vouchers.bulkDelete)
  @RequirePermission('fees.voucher.cancel')
  async bulkDelete(@Body() body: unknown): Promise<{ data: BulkDeleteResult }> {
    const input = bulkDeleteVouchersSchema.parse(body);
    return { data: await this.vouchers.deleteMany(input.ids) };
  }

  /**
   * The challans behind a selection, for printing a stack.
   *
   * A POST because the selection is a list of ids that does not fit in a URL —
   * five hundred of them is thirty-odd kilobytes, well past what proxies and
   * servers accept on a request line. It reads and writes nothing.
   */
  @Post(ROUTES.vouchers.challans)
  @RequirePermission('fees.voucher.read')
  async challans(@Body() body: unknown): Promise<{ data: Challan[] }> {
    const input = challanBatchSchema.parse(body);
    return { data: await this.vouchers.challans(input.ids) };
  }

  @Delete('/api/v1/fee-vouchers/:id')
  @RequirePermission('fees.voucher.cancel')
  async cancel(@Param('id') id: string, @Body() body: unknown): Promise<{ data: { ok: true } }> {
    await this.vouchers.cancel(id, cancelVoucherSchema.parse(body));
    return { data: { ok: true } };
  }

  @Post('/api/v1/fee-vouchers/:id/payments')
  @RequirePermission('fees.payment.create')
  async pay(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
  ): Promise<{ data: VoucherDetail }> {
    const input = recordPaymentSchema.parse(body);
    return { data: await this.vouchers.pay(id, input, request.claims?.sub) };
  }

  @Post('/api/v1/fee-vouchers/:id/waive')
  @RequirePermission('fees.waiver.create')
  async waive(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
  ): Promise<{ data: VoucherDetail }> {
    const input = waiveVoucherSchema.parse(body);
    return { data: await this.vouchers.waive(id, input, request.claims?.sub) };
  }
}

@Module({
  controllers: [VouchersController],
  providers: [VouchersService, VoucherGenerationService],
})
export class VouchersModule {}
