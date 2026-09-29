import {
  ROUTES,
  type AssetKind,
  updateSchoolAppearanceSchema,
  updateSchoolSettingsSchema,
  updateVoucherSettingsSchema,
  uploadSchoolLogoSchema,
  type SchoolAppearance,
  type SchoolLogoInfo,
  type SchoolSettings,
  type VoucherSettings,
} from '@ilm/contracts';
import { Body, Controller, Delete, Get, Module, Put, Req, Res } from '@nestjs/common';
import { type FastifyReply, type FastifyRequest } from 'fastify';

import { RequirePermission } from '../../shared/rbac/rbac.guard';
import { clockProvider } from '../../shared/time/clock.provider';

import { SchoolLogoService } from './school-logo.service';
import { SchoolAppearanceService, SchoolSettingsService } from './school-settings.service';
import { VoucherSettingsService } from './voucher-settings.service';

/**
 * The school's own settings — for now, its logo.
 *
 * ## Why the image endpoint is not JSON
 *
 * `GET /schools/logo` returns the bytes with their content type, so it can be
 * the `src` of an `<img>`. That is the only way a logo is ever used: wrapping
 * it in an envelope would mean every screen that shows one has to fetch JSON,
 * decode base64 and build a data URL before the browser can paint — turning a
 * cacheable image request into work on the main thread of every page.
 *
 * It is the one endpoint in this API that answers with something other than the
 * standard envelope, and it earns the exception by being an image.
 */
/**
 * Serve one of a school's images, wherever its bytes turned out to be.
 *
 * Shared by both image endpoints because the caching contract is the same and
 * getting it subtly different on one of them is how a replaced logo keeps
 * showing the old one for an afternoon.
 *
 * ## Why a redirect is safe here
 *
 * A CDN-backed asset answers `302` to the delivery URL. The permission check
 * has already happened — the redirect is only issued to someone allowed to see
 * the image — and the target is a `public` asset by the catalogue's own
 * declaration, which is what makes it eligible for a CDN at all. A `private`
 * asset never reaches this branch: the router keeps it in Postgres, and it is
 * streamed from here behind the session like everything else.
 */
async function serveAsset(
  logos: SchoolLogoService,
  kind: AssetKind,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const asset = await logos.locate(kind);

  // An image appears on every page and changes about once a year. Without a
  // conditional request that is one download per navigation, on a connection
  // where it is the slowest thing the page does.
  if (request.headers['if-none-match'] === `"${asset.etag}"`) {
    await reply.code(304).send();
    return;
  }

  if (asset.kind === 'redirect') {
    await reply
      // 302, not 301: the delivery URL changes when the image is replaced, and
      // a permanent redirect is one browsers refuse to forget.
      .code(302)
      .header('location', asset.url)
      .header('cache-control', 'private, max-age=300, must-revalidate')
      .send();
    return;
  }

  await reply
    .header('content-type', asset.mimeType)
    .header('etag', `"${asset.etag}"`)
    // Private: it is one school's mark, behind a session, and it must not sit
    // in a shared proxy where another tenant could be served it.
    .header('cache-control', 'private, max-age=300, must-revalidate')
    .header('content-length', String(asset.bytes.byteLength))
    // The bytes are attacker-supplied in the sense that a school uploaded them.
    // Refusing to let a browser second-guess the content type is what stops a
    // crafted file being sniffed into something executable.
    .header('x-content-type-options', 'nosniff')
    .send(asset.bytes);
}

@Controller()
export class SchoolLogoController {
  constructor(private readonly logos: SchoolLogoService) {}

  /**
   * The image.
   *
   * Readable by anyone signed in to the school: it is on the letterhead, the
   * challan and the portal header, so gating it behind a settings permission
   * would mean a teacher sees a broken image on every page.
   */
  @Get(ROUTES.schoolLogo.image)
  @RequirePermission('dashboard.workspace.read')
  async image(
    @Req() request: FastifyRequest,
    @Res({ passthrough: false }) reply: FastifyReply,
  ): Promise<void> {
    await serveAsset(this.logos, 'SCHOOL_LOGO', request, reply);
  }

  @Get(ROUTES.schoolLogo.info)
  @RequirePermission('dashboard.workspace.read')
  async info(): Promise<{ data: SchoolLogoInfo }> {
    return { data: await this.logos.info('SCHOOL_LOGO') };
  }

  @Put(ROUTES.schoolLogo.image)
  @RequirePermission('settings.school.configure')
  async upload(@Body() body: unknown): Promise<{ data: SchoolLogoInfo }> {
    return { data: await this.logos.replace('SCHOOL_LOGO', uploadSchoolLogoSchema.parse(body)) };
  }

  @Delete(ROUTES.schoolLogo.image)
  @RequirePermission('settings.school.configure')
  async remove(): Promise<{ data: { removed: true } }> {
    await this.logos.remove('SCHOOL_LOGO');
    return { data: { removed: true } };
  }
}

/**
 * The bank's mark, printed at the foot of a challan.
 *
 * The same four endpoints as the school's own logo, against the same table and
 * the same validation, differing only in which row they address. Reading is
 * open to anyone who may see a voucher — the renderer needs it on every print
 * run, including a receptionist's.
 */
@Controller()
export class BankLogoController {
  constructor(private readonly logos: SchoolLogoService) {}

  @Get(ROUTES.bankLogo.image)
  @RequirePermission('fees.voucher.read')
  async image(
    @Req() request: FastifyRequest,
    @Res({ passthrough: false }) reply: FastifyReply,
  ): Promise<void> {
    await serveAsset(this.logos, 'BANK_LOGO', request, reply);
  }

  @Get(ROUTES.bankLogo.info)
  @RequirePermission('fees.voucher.read')
  async info(): Promise<{ data: SchoolLogoInfo }> {
    return { data: await this.logos.info('BANK_LOGO') };
  }

  @Put(ROUTES.bankLogo.image)
  @RequirePermission('settings.school.configure')
  async upload(@Body() body: unknown): Promise<{ data: SchoolLogoInfo }> {
    return { data: await this.logos.replace('BANK_LOGO', uploadSchoolLogoSchema.parse(body)) };
  }

  @Delete(ROUTES.bankLogo.image)
  @RequirePermission('settings.school.configure')
  async remove(): Promise<{ data: { removed: true } }> {
    await this.logos.remove('BANK_LOGO');
    return { data: { removed: true } };
  }
}

/**
 * The school's own details.
 *
 * Reading is open to anyone signed in — the name, address and phone are on the
 * letterhead every member of staff prints, and a receptionist who cannot read
 * the school's own address cannot check a challan against it. Writing needs
 * `settings.school.configure`, which is the owner and the principal.
 */
@Controller()
export class SchoolSettingsController {
  constructor(private readonly settings: SchoolSettingsService) {}

  @Get(ROUTES.school.settings)
  @RequirePermission('dashboard.workspace.read')
  async get(): Promise<{ data: SchoolSettings }> {
    return { data: await this.settings.get() };
  }

  @Put(ROUTES.school.settings)
  @RequirePermission('settings.school.configure')
  async update(@Body() body: unknown): Promise<{ data: SchoolSettings }> {
    return { data: await this.settings.update(updateSchoolSettingsSchema.parse(body)) };
  }
}

/**
 * The school’s own colour.
 *
 * Reading is open to anyone signed in, and has to be: the portal paints itself
 * in this on every page, so gating it behind a settings permission would mean a
 * teacher sees the product’s colours while the office sees the school’s.
 */
@Controller()
export class SchoolAppearanceController {
  constructor(private readonly appearance: SchoolAppearanceService) {}

  @Get(ROUTES.school.appearance)
  @RequirePermission('dashboard.workspace.read')
  async get(): Promise<{ data: SchoolAppearance }> {
    return { data: await this.appearance.get() };
  }

  @Put(ROUTES.school.appearance)
  @RequirePermission('settings.school.configure')
  async set(@Body() body: unknown): Promise<{ data: SchoolAppearance }> {
    return { data: await this.appearance.set(updateSchoolAppearanceSchema.parse(body)) };
  }
}

/**
 * How this school's fee challan is laid out.
 *
 * Reading is open to anyone who may see a voucher, because the challan renderer
 * needs it on every print run — including the one a receptionist does. Writing
 * is `settings.school.configure`: the payment IDs on here are what a parent
 * quotes at a bank counter, and a wrong one is a fee nobody can pay.
 */
@Controller()
export class VoucherSettingsController {
  constructor(private readonly settings: VoucherSettingsService) {}

  @Get(ROUTES.school.voucherSettings)
  @RequirePermission('fees.voucher.read')
  async get(): Promise<{ data: VoucherSettings }> {
    return { data: await this.settings.get() };
  }

  @Put(ROUTES.school.voucherSettings)
  @RequirePermission('settings.school.configure')
  async set(@Body() body: unknown): Promise<{ data: VoucherSettings }> {
    return { data: await this.settings.set(updateVoucherSettingsSchema.parse(body)) };
  }
}

@Module({
  controllers: [
    SchoolLogoController,
    BankLogoController,
    SchoolSettingsController,
    SchoolAppearanceController,
    VoucherSettingsController,
  ],
  providers: [
    clockProvider,
    SchoolLogoService,
    SchoolSettingsService,
    SchoolAppearanceService,
    VoucherSettingsService,
  ],
  exports: [SchoolLogoService],
})
export class SchoolsModule {}
