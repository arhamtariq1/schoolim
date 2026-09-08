import { API_PREFIX, ERROR_CODES } from '@ilm/contracts';
import { BRAND } from '@ilm/utils';
import { type NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/**
 * Interactive API documentation at `/docs`.
 *
 * ## Why it is not enabled in production
 *
 * The document is a complete map of every endpoint in the product, and this API
 * is multi-tenant and internet-facing. Publishing it invites nobody useful and
 * saves an attacker the reconnaissance. It is on in development, and off in
 * production unless somebody deliberately sets `ENABLE_API_DOCS=true` — an
 * explicit act, not a default.
 *
 * ## What is deliberately missing
 *
 * Request and response **schemas are not generated per endpoint**. Every
 * payload in this product is validated by a zod schema in `@ilm/contracts`, and
 * `@nestjs/swagger` derives its schemas from decorated classes — a shape this
 * codebase does not have and should not grow, because a second definition of
 * "what a valid student looks like" is a second thing to keep in step with the
 * first.
 *
 * So this documents the **surface**: every route, its method, what it is for,
 * and how authentication works. The exact body shape lives in the contracts
 * package, which is the one place it can be trusted, and the description below
 * says so rather than leaving a reader to wonder.
 *
 * Wiring `nestjs-zod` to emit real schemas from the existing contracts is the
 * right next step and is a piece of work in its own right; doing it badly would
 * mean hand-written duplicates of forty schemas, which is worse than none.
 */
export function setupOpenApi(app: NestFastifyApplication, isProduction: boolean): string | null {
  const explicitlyEnabled = process.env['ENABLE_API_DOCS'] === 'true';

  if (isProduction && !explicitlyEnabled) {
    return null;
  }

  const config = new DocumentBuilder()
    .setTitle(`${BRAND.name} API`)
    .setDescription(
      [
        'Multi-tenant school management API.',
        '',
        '### Tenancy',
        '',
        'Every request resolves to exactly one school. In a browser that comes from the',
        'hostname (`{slug}.<domain>`); server-to-server it comes from the `x-school-slug`',
        'header. The header selects a *namespace*, never an authorisation — it must agree',
        'with the tenant claim inside the session token or the request is rejected.',
        '',
        '### Authentication',
        '',
        'Sign in at `POST /api/v1/auth/login`. Tokens are returned as **httpOnly cookies**,',
        'never in the body, so there is nothing here for a script to read. The access token',
        'lasts 15 minutes and is renewed automatically against a 30-day refresh token.',
        '',
        '### Request and response bodies',
        '',
        'Validated by shared zod schemas in `@ilm/contracts`, which the API, the portal',
        'forms and the tests all use. That package is the authoritative definition of every',
        'payload — these pages document the surface, not the schemas, precisely so the two',
        'cannot drift apart.',
        '',
        '### Errors',
        '',
        'RFC 9457 `application/problem+json`, always. Switch on the stable `code`, never on',
        `\`title\` or \`detail\` — the latter is written for the person reading it. Codes: ${ERROR_CODES.slice(0, 12).join(', ')}, and others.`,
        '',
        '### Lists',
        '',
        'Offset-paged. `limit` defaults to 50 and is capped at 200 — asking for more is a',
        '400 rather than a silent clamp, because a silent clamp makes a client believe it',
        'fetched everything. Unknown query parameters are rejected, so a typo in a filter',
        'fails loudly instead of quietly returning an unfiltered list.',
      ].join('\n'),
    )
    .setVersion('1.0')
    .addCookieAuth('ilm_at', { type: 'apiKey', in: 'cookie', name: 'ilm_at' }, 'session')
    .addGlobalParameters({
      name: 'x-school-slug',
      in: 'header',
      required: false,
      description:
        'Which school this request is for. Set by the ingress from the hostname for browser traffic; supply it explicitly server-to-server.',
      schema: { type: 'string' },
    })
    .addServer(API_PREFIX.replace(`/${API_PREFIX.split('/')[2] ?? ''}`, ''), 'This server')
    .build();

  const document = SwaggerModule.createDocument(app, config);

  SwaggerModule.setup('docs', app, document, {
    jsonDocumentUrl: 'docs/json',
    swaggerOptions: {
      // Alphabetical, so a reader can find an endpoint without knowing which
      // module it lives in.
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
      persistAuthorization: true,
    },
  });

  return '/docs';
}
