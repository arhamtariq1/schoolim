import {
  cancelVoucherSchema,
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
   * Cancel, not delete.
   *
   * `DELETE` is the verb the trash icon sends and the one a reader expects, but
   * nothing is removed: CLAUDE.md R4 makes financial records append-only, so
   * the row stays with a status and a reason. A reason is required, which is
   * why this carries a body at all.
   */
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
