import { ROUTES, uploadSchoolLogoSchema, type SchoolLogoInfo } from '@ilm/contracts';
import { Body, Controller, Delete, Get, Module, Put, Req, Res } from '@nestjs/common';
import { type FastifyReply, type FastifyRequest } from 'fastify';

import { RequirePermission } from '../../shared/rbac/rbac.guard';

import { SchoolLogoService } from './school-logo.service';

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
    const logo = await this.logos.read();

    // A logo appears on every page and changes about once a year. Without a
    // conditional request that is one image download per navigation, on a
    // connection where that is the slowest thing the page does.
    if (request.headers['if-none-match'] === `"${logo.etag}"`) {
      await reply.code(304).send();
      return;
    }

    await reply
      .header('content-type', logo.mimeType)
      .header('etag', `"${logo.etag}"`)
      // Private: it is one school's mark, behind a session, and it must not sit
      // in a shared proxy where another tenant could be served it.
      .header('cache-control', 'private, max-age=300, must-revalidate')
      .header('content-length', String(logo.bytes.byteLength))
      // The bytes are attacker-supplied in the sense that a school uploaded
      // them. Refusing to let a browser second-guess the content type is what
      // stops a crafted file being sniffed into something executable.
      .header('x-content-type-options', 'nosniff')
      .send(logo.bytes);
  }

  @Get(ROUTES.schoolLogo.info)
  @RequirePermission('dashboard.workspace.read')
  async info(): Promise<{ data: SchoolLogoInfo }> {
    return { data: await this.logos.info() };
  }

  @Put(ROUTES.schoolLogo.image)
  @RequirePermission('settings.school.configure')
  async upload(@Body() body: unknown): Promise<{ data: SchoolLogoInfo }> {
    return { data: await this.logos.replace(uploadSchoolLogoSchema.parse(body)) };
  }

  @Delete(ROUTES.schoolLogo.image)
  @RequirePermission('settings.school.configure')
  async remove(): Promise<{ data: { removed: true } }> {
    await this.logos.remove();
    return { data: { removed: true } };
  }
}

@Module({
  controllers: [SchoolLogoController],
  providers: [SchoolLogoService],
  exports: [SchoolLogoService],
})
export class SchoolsModule {}
