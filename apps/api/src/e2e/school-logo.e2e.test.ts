import { MAX_LOGO_BYTES, ROUTES, type SchoolLogoInfo } from '@ilm/contracts';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../app.module';
import { createAdminClient, type PrismaClient } from '../prisma';
import { PasswordService } from '../shared/auth/password.service';

/**
 * A school's logo.
 *
 * Most of this is about what the endpoint refuses. The file is uploaded by a
 * school and then served back, with its content type, to every person who opens
 * that school's portal — so "is this actually a PNG" is not a tidiness question.
 * An SVG named `.png` and served as `image/png` is a script the browser is told
 * to trust, on a page that already holds a session.
 */

const SCHOOL_A = '33333333-3333-4333-8333-3333333333ab';
const SCHOOL_B = '33333333-3333-4333-8333-3333333333ac';
const USER_A = '44444444-4444-4444-8444-4444444444ab';
const USER_B = '44444444-4444-4444-8444-4444444444ac';

const HOST_A = 'logo-a-e2e.localhost';
const HOST_B = 'logo-b-e2e.localhost';
const PASSWORD = 'correct-horse-battery-staple';

let app: NestFastifyApplication;
let admin: PrismaClient;
let jarA = '';
let jarB = '';

/** A one-pixel PNG, header and all. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/** A JPEG's start-of-image marker, which is all the sniffer looks at. */
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 0x20)]);

/** RIFF….WEBP. */
const WEBP = Buffer.concat([
  Buffer.from('RIFF', 'ascii'),
  Buffer.from([0x24, 0x00, 0x00, 0x00]),
  Buffer.from('WEBP', 'ascii'),
  Buffer.alloc(32, 0x00),
]);

/** The thing this all exists to keep out. */
const SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
  'utf8',
);

async function wipe(): Promise<void> {
  for (const school of [SCHOOL_A, SCHOOL_B]) {
    for (const table of ['school_logos', 'sessions', 'audit_logs', 'user_roles', 'users']) {
      await admin.$executeRawUnsafe(`DELETE FROM ${table} WHERE school_id = $1::uuid`, school);
    }
  }
  await admin.$executeRaw`DELETE FROM schools WHERE id IN (${SCHOOL_A}::uuid, ${SCHOOL_B}::uuid)`;
}

beforeAll(async () => {
  admin = createAdminClient({ url: process.env['DATABASE_ADMIN_URL'] ?? '' });
  await wipe();

  await admin.$executeRaw`
    INSERT INTO schools (id, name, slug, created_at, updated_at) VALUES
      (${SCHOOL_A}::uuid, 'Logo E2E A', 'logo-a-e2e', now(), now()),
      (${SCHOOL_B}::uuid, 'Logo E2E B', 'logo-b-e2e', now(), now())
  `;

  const hash = await new PasswordService().hash(PASSWORD);
  for (const [user, school, email] of [
    [USER_A, SCHOOL_A, 'head@logo-a-e2e.test'],
    [USER_B, SCHOOL_B, 'head@logo-b-e2e.test'],
  ] as const) {
    await admin.$executeRawUnsafe(
      `INSERT INTO users (id, school_id, email, name, password_hash, status, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3, 'Head', $4, 'ACTIVE', now(), now())`,
      user,
      school,
      email,
      hash,
    );
    await admin.$executeRawUnsafe(
      `INSERT INTO user_roles (id, school_id, user_id, role, created_at)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, 'OWNER', now())`,
      school,
      user,
    );
  }

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  const { default: cookie } = await import('@fastify/cookie');
  await app.register(cookie);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  jarA = await signIn(HOST_A, 'head@logo-a-e2e.test');
  jarB = await signIn(HOST_B, 'head@logo-b-e2e.test');
}, 90_000);

async function signIn(host: string, identifier: string): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: ROUTES.auth.login,
    headers: { host },
    payload: { identifier, password: PASSWORD },
  });
  const raw = response.headers['set-cookie'];
  const cookies = Array.isArray(raw) ? raw : [String(raw)];
  return cookies
    .map((entry) => entry.split(';')[0] ?? '')
    .filter((pair) => !pair.endsWith('='))
    .join('; ');
}

beforeEach(async () => {
  await admin.$executeRaw`DELETE FROM school_logos`;
});

afterAll(async () => {
  await app?.close();
  await wipe();
  await admin.$disconnect();
});

async function upload(
  bytes: Buffer,
  mimeType: string,
  host = HOST_A,
  jar = jarA,
): Promise<{ status: number; raw: string; data: SchoolLogoInfo }> {
  const response = await app.inject({
    method: 'PUT',
    url: ROUTES.schoolLogo.image,
    headers: { host, cookie: jar },
    payload: { mimeType, dataBase64: bytes.toString('base64') },
  });
  return {
    status: response.statusCode,
    raw: response.body,
    data: response.json<{ data: SchoolLogoInfo }>().data,
  };
}

async function info(host = HOST_A, jar = jarA): Promise<SchoolLogoInfo> {
  const response = await app.inject({
    method: 'GET',
    url: ROUTES.schoolLogo.info,
    headers: { host, cookie: jar },
  });
  return response.json<{ data: SchoolLogoInfo }>().data;
}

describe('uploading', () => {
  it('accepts a PNG and reports it back', async () => {
    const { status, data } = await upload(PNG, 'image/png');

    expect(status).toBe(200);
    expect(data.present).toBe(true);
    expect(data.mimeType).toBe('image/png');
    expect(data.byteSize).toBe(PNG.byteLength);
    expect(data.version).not.toBeNull();
  });

  it('accepts a JPEG and a WebP', async () => {
    expect((await upload(JPEG, 'image/jpeg')).data.mimeType).toBe('image/jpeg');
    expect((await upload(WEBP, 'image/webp')).data.mimeType).toBe('image/webp');
  });

  it('replaces rather than accumulating', async () => {
    await upload(PNG, 'image/png');
    await upload(JPEG, 'image/jpeg');

    const rows = await admin.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*) AS n FROM school_logos WHERE school_id = $1::uuid`,
      SCHOOL_A,
    );
    expect(Number(rows[0]?.n)).toBe(1);
    expect((await info()).mimeType).toBe('image/jpeg');
  });

  it('gives a replacement a new version, so a cached copy is not shown', async () => {
    const first = await upload(PNG, 'image/png');
    const second = await upload(JPEG, 'image/jpeg');

    expect(second.data.version).not.toBe(first.data.version);
  });

  it('gives the identical file the same version, so nothing is re-fetched for nothing', async () => {
    const first = await upload(PNG, 'image/png');
    const again = await upload(PNG, 'image/png');

    expect(again.data.version).toBe(first.data.version);
  });
});

describe('what it refuses', () => {
  it('refuses an SVG, whatever it claims to be', async () => {
    // The one that matters. An SVG served as image/png is a script the browser
    // has been told to trust, on a page holding a session.
    // 400 rather than 422: the request is malformed, not a business rule
    // being declined. "This is not an image" is a fact about the bytes.
    const asSvg = await upload(SVG, 'image/png');
    expect(asSvg.status).toBe(400);
    expect(asSvg.raw).toContain('not a PNG, JPEG or WebP');

    // And it cannot be smuggled in by declaring the type honestly either: the
    // contract's enum does not contain it.
    const honest = await app.inject({
      method: 'PUT',
      url: ROUTES.schoolLogo.image,
      headers: { host: HOST_A, cookie: jarA },
      payload: { mimeType: 'image/svg+xml', dataBase64: SVG.toString('base64') },
    });
    expect(honest.statusCode).toBe(400);
  });

  it('refuses a file whose bytes disagree with its declared type', async () => {
    const { status, raw } = await upload(PNG, 'image/jpeg');

    expect(status).toBe(400);
    expect(raw).toContain('is a PNG, not a JPEG');
  });

  it('refuses anything over the size limit', async () => {
    const huge = Buffer.concat([PNG, Buffer.alloc(MAX_LOGO_BYTES, 0x00)]);
    const { status } = await upload(huge, 'image/png');

    // Refused by the schema on the encoded length before the bytes are even
    // decoded, which is the point of checking there as well.
    expect(status).toBe(400);
  });

  it('refuses an empty body and one that is not base64 at all', async () => {
    const empty = await app.inject({
      method: 'PUT',
      url: ROUTES.schoolLogo.image,
      headers: { host: HOST_A, cookie: jarA },
      payload: { mimeType: 'image/png', dataBase64: '' },
    });
    expect(empty.statusCode).toBe(400);

    const rubbish = await app.inject({
      method: 'PUT',
      url: ROUTES.schoolLogo.image,
      headers: { host: HOST_A, cookie: jarA },
      payload: { mimeType: 'image/png', dataBase64: '!!!!' },
    });
    expect(rubbish.statusCode).toBe(400);
  });
});

describe('serving it', () => {
  it('answers with the image itself, not an envelope around it', async () => {
    await upload(PNG, 'image/png');

    const response = await app.inject({
      method: 'GET',
      url: ROUTES.schoolLogo.image,
      headers: { host: HOST_A, cookie: jarA },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('image/png');
    expect(response.rawPayload.equals(PNG)).toBe(true);
  });

  it('tells the browser not to guess the type', async () => {
    await upload(PNG, 'image/png');
    const response = await app.inject({
      method: 'GET',
      url: ROUTES.schoolLogo.image,
      headers: { host: HOST_A, cookie: jarA },
    });

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    // Private: one school's mark, behind a session. A shared cache holding it
    // is a cache that can hand it to another tenant.
    expect(String(response.headers['cache-control'])).toContain('private');
  });

  it('answers 304 when the browser already has it', async () => {
    const { data } = await upload(PNG, 'image/png');

    const response = await app.inject({
      method: 'GET',
      url: ROUTES.schoolLogo.image,
      headers: { host: HOST_A, cookie: jarA, 'if-none-match': `"${data.version ?? ''}"` },
    });

    expect(response.statusCode).toBe(304);
  });

  it('is a 404 when the school has no logo, not a broken image', async () => {
    const response = await app.inject({
      method: 'GET',
      url: ROUTES.schoolLogo.image,
      headers: { host: HOST_A, cookie: jarA },
    });

    expect(response.statusCode).toBe(404);
  });
});

describe('removing it', () => {
  it('removes it, and says so even when there was none', async () => {
    await upload(PNG, 'image/png');

    const first = await app.inject({
      method: 'DELETE',
      url: ROUTES.schoolLogo.image,
      headers: { host: HOST_A, cookie: jarA },
    });
    expect(first.statusCode).toBe(200);
    expect((await info()).present).toBe(false);

    // Idempotent: "make sure there is no logo" succeeds when there is none.
    const again = await app.inject({
      method: 'DELETE',
      url: ROUTES.schoolLogo.image,
      headers: { host: HOST_A, cookie: jarA },
    });
    expect(again.statusCode).toBe(200);
  });
});

describe('one school never sees another’s', () => {
  it('keeps the logos apart', async () => {
    await upload(PNG, 'image/png', HOST_A, jarA);
    await upload(JPEG, 'image/jpeg', HOST_B, jarB);

    expect((await info(HOST_A, jarA)).mimeType).toBe('image/png');
    expect((await info(HOST_B, jarB)).mimeType).toBe('image/jpeg');
  });

  it('does not serve B’s logo to A when A has none', async () => {
    await upload(WEBP, 'image/webp', HOST_B, jarB);

    const response = await app.inject({
      method: 'GET',
      url: ROUTES.schoolLogo.image,
      headers: { host: HOST_A, cookie: jarA },
    });

    expect(response.statusCode).toBe(404);
  });
});
