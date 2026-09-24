import { ROUTES, type SchoolSettings } from '@ilm/contracts';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../app.module';
import { createAdminClient, type PrismaClient } from '../prisma';
import { PasswordService } from '../shared/auth/password.service';

/**
 * A school's own details.
 *
 * Two things are being proved here, and only one of them is "the form saves".
 *
 * The first is that the endpoint cannot be talked into writing a column it was
 * never meant to: the slug the school is reached at, the currency its recorded
 * money is denominated in, the status that says whether it has paid. Those are
 * refused by the schema, and refused again by a column-level grant in
 * `20260925000000_school_settings_grant` — so this suite checks the value on
 * the row afterwards rather than trusting the status code.
 *
 * The second is that none of it crosses a tenant. School B's owner editing
 * their own school must leave School A's row untouched, and RLS is what
 * guarantees that even if the `where` clause were wrong.
 */

const SCHOOL_A = '33333333-3333-4333-8333-3333333333ba';
const SCHOOL_B = '33333333-3333-4333-8333-3333333333bb';
const OWNER_A = '44444444-4444-4444-8444-4444444444ba';
const OWNER_B = '44444444-4444-4444-8444-4444444444bb';
/** A teacher: may read the letterhead, may not rewrite it. */
const TEACHER_A = '44444444-4444-4444-8444-4444444444bc';

const HOST_A = 'settings-a-e2e.localhost';
const HOST_B = 'settings-b-e2e.localhost';
const PASSWORD = 'correct-horse-battery-staple';

/** What school A is reset to before each test, so every case starts equal. */
const BASELINE = {
  name: 'Settings E2E A',
  legalName: 'Settings E2E A (Pvt) Ltd',
  address: '14-A Gulberg III',
  city: 'Lahore',
  phone: '+924235771400',
  email: 'office@settings-a.test',
  timezone: 'Asia/Karachi',
  locale: 'en',
} as const;

/** A complete, valid body. Individual tests override one field of it. */
const VALID = {
  name: 'Renamed Public School',
  legalName: 'Renamed Public School (Pvt) Ltd',
  address: 'Plot 22, Block 6, PECHS',
  city: 'Karachi',
  phone: '+922134528800',
  email: 'office@renamed.test',
  timezone: 'Asia/Dubai',
  locale: 'en',
} as const;

let app: NestFastifyApplication;
let admin: PrismaClient;
let ownerA = '';
let ownerB = '';
let teacherA = '';

async function wipe(): Promise<void> {
  for (const school of [SCHOOL_A, SCHOOL_B]) {
    for (const table of ['sessions', 'audit_logs', 'user_roles', 'users']) {
      await admin.$executeRawUnsafe(`DELETE FROM ${table} WHERE school_id = $1::uuid`, school);
    }
  }
  await admin.$executeRaw`DELETE FROM schools WHERE id IN (${SCHOOL_A}::uuid, ${SCHOOL_B}::uuid)`;
}

beforeAll(async () => {
  admin = createAdminClient({ url: process.env['DATABASE_ADMIN_URL'] ?? '' });
  await wipe();

  await admin.$executeRaw`
    INSERT INTO schools (id, name, slug, currency, country, created_at, updated_at) VALUES
      (${SCHOOL_A}::uuid, 'Settings E2E A', 'settings-a-e2e', 'PKR', 'PK', now(), now()),
      (${SCHOOL_B}::uuid, 'Settings E2E B', 'settings-b-e2e', 'PKR', 'PK', now(), now())
  `;

  const hash = await new PasswordService().hash(PASSWORD);
  for (const [user, school, email, role] of [
    [OWNER_A, SCHOOL_A, 'head@settings-a.test', 'OWNER'],
    [OWNER_B, SCHOOL_B, 'head@settings-b.test', 'OWNER'],
    [TEACHER_A, SCHOOL_A, 'teacher@settings-a.test', 'TEACHER'],
  ] as const) {
    await admin.$executeRawUnsafe(
      `INSERT INTO users (id, school_id, email, name, password_hash, status, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3, 'Staff', $4, 'ACTIVE', now(), now())`,
      user,
      school,
      email,
      hash,
    );
    await admin.$executeRawUnsafe(
      `INSERT INTO user_roles (id, school_id, user_id, role, created_at)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::school_role, now())`,
      school,
      user,
      role,
    );
  }

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  const { default: cookie } = await import('@fastify/cookie');
  await app.register(cookie);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  ownerA = await signIn(HOST_A, 'head@settings-a.test');
  ownerB = await signIn(HOST_B, 'head@settings-b.test');
  teacherA = await signIn(HOST_A, 'teacher@settings-a.test');
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
  await admin.$executeRaw`
    UPDATE schools SET
      name = ${BASELINE.name},
      slug = 'settings-a-e2e',
      legal_name = ${BASELINE.legalName},
      address = ${BASELINE.address},
      city = ${BASELINE.city},
      phone = ${BASELINE.phone},
      email = ${BASELINE.email},
      timezone = ${BASELINE.timezone},
      locale = ${BASELINE.locale},
      currency = 'PKR',
      country = 'PK',
      status = 'ACTIVE'
    WHERE id = ${SCHOOL_A}::uuid
  `;
  await admin.$executeRaw`DELETE FROM audit_logs WHERE school_id = ${SCHOOL_A}::uuid`;
});

afterAll(async () => {
  await app?.close();
  await wipe();
  await admin.$disconnect();
});

async function read(jar = ownerA, host = HOST_A) {
  const response = await app.inject({
    method: 'GET',
    url: ROUTES.school.settings,
    headers: { host, cookie: jar },
  });
  return { status: response.statusCode, data: response.json<{ data: SchoolSettings }>().data };
}

async function write(body: Record<string, unknown>, jar = ownerA, host = HOST_A) {
  const response = await app.inject({
    method: 'PUT',
    url: ROUTES.school.settings,
    headers: { host, cookie: jar },
    payload: body,
  });
  return { status: response.statusCode, body: response.body };
}

/** The row as the database actually holds it, bypassing the endpoint entirely. */
async function row(schoolId: string): Promise<Record<string, unknown>> {
  const rows = await admin.$queryRawUnsafe<Record<string, unknown>[]>(
    `SELECT name, slug, legal_name, address, city, phone, email, timezone, locale,
            currency, country, status
       FROM schools WHERE id = $1::uuid`,
    schoolId,
  );
  return rows[0] ?? {};
}

describe('reading', () => {
  it('returns the school the caller is signed in to', async () => {
    const { status, data } = await read();

    expect(status).toBe(200);
    expect(data.name).toBe(BASELINE.name);
    expect(data.slug).toBe('settings-a-e2e');
    expect(data.address).toBe(BASELINE.address);
    expect(data.currency).toBe('PKR');
  });

  it('never returns another school, whichever host is asked', async () => {
    // B's cookie against B's host: B's own row, not A's.
    const { data } = await read(ownerB, HOST_B);
    expect(data.name).toBe('Settings E2E B');
  });

  it('lets a teacher read it — the address is on the letterhead', async () => {
    const { status, data } = await read(teacherA);

    expect(status).toBe(200);
    expect(data.phone).toBe(BASELINE.phone);
  });

  it('refuses a signed-out caller', async () => {
    const response = await app.inject({
      method: 'GET',
      url: ROUTES.school.settings,
      headers: { host: HOST_A },
    });
    expect(response.statusCode).toBe(401);
  });
});

describe('writing', () => {
  it('saves every editable field and reports them back', async () => {
    const { status } = await write(VALID);
    expect(status).toBe(200);

    const after = await row(SCHOOL_A);
    expect(after['name']).toBe(VALID.name);
    expect(after['legal_name']).toBe(VALID.legalName);
    expect(after['address']).toBe(VALID.address);
    expect(after['city']).toBe(VALID.city);
    expect(after['phone']).toBe(VALID.phone);
    expect(after['email']).toBe(VALID.email);
    expect(after['timezone']).toBe(VALID.timezone);
  });

  it('stores a cleared optional field as null rather than an empty string', async () => {
    const { status } = await write({ ...VALID, legalName: '', address: '' });
    expect(status).toBe(200);

    const after = await row(SCHOOL_A);
    expect(after['legal_name']).toBeNull();
    expect(after['address']).toBeNull();
  });

  it('writes an audit row carrying both the before and the after', async () => {
    await write({ ...VALID, name: 'Audited Name' });

    const entries = await admin.$queryRawUnsafe<{ before: unknown; after: unknown }[]>(
      `SELECT before, after FROM audit_logs
        WHERE school_id = $1::uuid AND action = 'school.settings.update'`,
      SCHOOL_A,
    );

    expect(entries).toHaveLength(1);
    expect((entries[0]?.before as { name: string }).name).toBe(BASELINE.name);
    expect((entries[0]?.after as { name: string }).name).toBe('Audited Name');
  });

  it('refuses a teacher, and changes nothing', async () => {
    const { status } = await write(VALID, teacherA);

    expect(status).toBe(403);
    expect((await row(SCHOOL_A))['name']).toBe(BASELINE.name);
  });
});

describe('what it will not write', () => {
  it('rejects a slug smuggled into the body', async () => {
    const { status } = await write({ ...VALID, slug: 'stolen' });

    // `.strict()` — an unknown key is a 400, not a silently ignored field. A
    // caller who thinks they renamed the school must be told they did not.
    expect(status).toBe(400);
    expect((await row(SCHOOL_A))['slug']).toBe('settings-a-e2e');
  });

  it('rejects currency and country', async () => {
    expect((await write({ ...VALID, currency: 'USD' })).status).toBe(400);
    expect((await write({ ...VALID, country: 'AE' })).status).toBe(400);

    const after = await row(SCHOOL_A);
    expect(after['currency']).toBe('PKR');
    expect(after['country']).toBe('PK');
  });

  it('rejects a status change — a suspended school cannot unsuspend itself', async () => {
    const { status } = await write({ ...VALID, status: 'ACTIVE' });

    expect(status).toBe(400);
    expect((await row(SCHOOL_A))['status']).toBe('ACTIVE');
  });
});

describe('validation', () => {
  it('rejects a time zone the platform cannot resolve', async () => {
    // Not a tidiness check: every date this product renders is formatted in
    // this zone, so an unresolvable one is a `RangeError` inside a page render
    // weeks later rather than a 400 now.
    const { status } = await write({ ...VALID, timezone: 'Mars/Olympus_Mons' });

    expect(status).toBe(400);
    expect((await row(SCHOOL_A))['timezone']).toBe(BASELINE.timezone);
  });

  it('rejects a phone number that is not E.164', async () => {
    expect((await write({ ...VALID, phone: '0300-1234567' })).status).toBe(400);
  });

  it('rejects a blank name — it is the top line of every challan', async () => {
    expect((await write({ ...VALID, name: '   ' })).status).toBe(400);
    expect((await row(SCHOOL_A))['name']).toBe(BASELINE.name);
  });

  it('rejects an over-long address rather than truncating it', async () => {
    expect((await write({ ...VALID, address: 'x'.repeat(241) })).status).toBe(400);
  });
});

describe('tenant isolation', () => {
  it("B's owner editing B leaves A's row untouched", async () => {
    const { status } = await write({ ...VALID, name: 'B Was Here' }, ownerB, HOST_B);
    expect(status).toBe(200);

    expect((await row(SCHOOL_B))['name']).toBe('B Was Here');
    expect((await row(SCHOOL_A))['name']).toBe(BASELINE.name);
  });

  it("refuses B's cookie presented against A's host", async () => {
    // The token names school B; the host resolves to school A. Either alone
    // would be enough to pick a tenant if the other were not checked.
    const { status } = await write(VALID, ownerB, HOST_A);

    expect(status).toBe(401);
    expect((await row(SCHOOL_A))['name']).toBe(BASELINE.name);
  });
});
