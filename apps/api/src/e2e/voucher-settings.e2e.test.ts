import { DEFAULT_KUICKPAY_CHANNELS, ROUTES, type VoucherSettings } from '@ilm/contracts';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../app.module';
import { createAdminClient, type PrismaClient } from '../prisma';
import { PasswordService } from '../shared/auth/password.service';

/**
 * How a school's fee challan is laid out, and what a parent pays it with.
 *
 * Three things are being proved, and "the form saves" is the least of them.
 *
 * The first is that **absent means default**: a school that has never opened
 * this screen gets the product's challan rather than a 404, because that is what
 * lets the renderer have no branch for the majority case.
 *
 * The second is that the cross-field rules hold at the boundary. A Kuickpay
 * switch with no prefix behind it, or a 1LINK switch with no Kuickpay under it,
 * is a challan a parent cannot pay — discovered at a bank counter, by them. The
 * schema refuses it and so does a check constraint; this suite asserts the row
 * afterwards rather than trusting the status code.
 *
 * The third is tenant isolation. These are payment identifiers: one school's
 * prefix appearing on another's challan would send a family's fees to a
 * stranger's account.
 */

const SCHOOL_A = '33333333-3333-4333-8333-3333333333ca';
const SCHOOL_B = '33333333-3333-4333-8333-3333333333cb';
const OWNER_A = '44444444-4444-4444-8444-4444444444ca';
const OWNER_B = '44444444-4444-4444-8444-4444444444cb';
/** Reads vouchers, so reads the challan layout; configures nothing. */
const ACCOUNTANT_A = '44444444-4444-4444-8444-4444444444cc';
/** Holds neither permission: a teacher has no business with the challan. */
const TEACHER_A = '44444444-4444-4444-8444-4444444444cd';

const HOST_A = 'challan-a-e2e.localhost';
const HOST_B = 'challan-b-e2e.localhost';
const PASSWORD = 'correct-horse-battery-staple';

/** A complete, valid body. Individual tests override one field of it. */
const VALID = {
  copyCount: 3,
  bankName: 'Meezan Bank Ltd.',
  showLogo: true,
  footerNote: 'Fees paid after the due date attract a surcharge.',
  copyLabels: ['School Copy', 'Bank Copy', 'Student Copy'],
  kuickpayEnabled: true,
  kuickpayPrefix: '1514',
  kuickpayChannels: ['Meezan Bank', 'JazzCash'],
  onelinkEnabled: true,
  onelinkInstitutionId: '100047',
} as const;

/** The same body with both channels off — the shape most schools save. */
const PLAIN = {
  ...VALID,
  kuickpayEnabled: false,
  kuickpayPrefix: null,
  onelinkEnabled: false,
  onelinkInstitutionId: null,
} as const;

let app: NestFastifyApplication;
let admin: PrismaClient;
let ownerA = '';
let ownerB = '';
let accountantA = '';
let teacherA = '';

async function wipe(): Promise<void> {
  for (const school of [SCHOOL_A, SCHOOL_B]) {
    for (const table of [
      'school_voucher_settings',
      'school_logos',
      'sessions',
      'audit_logs',
      'user_roles',
      'users',
    ]) {
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
      (${SCHOOL_A}::uuid, 'Challan E2E A', 'challan-a-e2e', 'PKR', 'PK', now(), now()),
      (${SCHOOL_B}::uuid, 'Challan E2E B', 'challan-b-e2e', 'PKR', 'PK', now(), now())
  `;

  const hash = await new PasswordService().hash(PASSWORD);
  for (const [user, school, email, role] of [
    [OWNER_A, SCHOOL_A, 'head@challan-a.test', 'OWNER'],
    [OWNER_B, SCHOOL_B, 'head@challan-b.test', 'OWNER'],
    [ACCOUNTANT_A, SCHOOL_A, 'accounts@challan-a.test', 'ACCOUNTANT'],
    [TEACHER_A, SCHOOL_A, 'teacher@challan-a.test', 'TEACHER'],
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

  ownerA = await signIn(HOST_A, 'head@challan-a.test');
  ownerB = await signIn(HOST_B, 'head@challan-b.test');
  accountantA = await signIn(HOST_A, 'accounts@challan-a.test');
  teacherA = await signIn(HOST_A, 'teacher@challan-a.test');
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
  // Every case starts from "never configured", which is the state most schools
  // on the product are in and the one the defaults have to cover.
  await admin.$executeRaw`DELETE FROM school_voucher_settings`;
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
    url: ROUTES.school.voucherSettings,
    headers: { host, cookie: jar },
  });
  return {
    status: response.statusCode,
    data: response.statusCode === 200 ? response.json<{ data: VoucherSettings }>().data : undefined,
  };
}

async function write(body: Record<string, unknown>, jar = ownerA, host = HOST_A) {
  const response = await app.inject({
    method: 'PUT',
    url: ROUTES.school.voucherSettings,
    headers: { host, cookie: jar },
    payload: body,
  });
  return { status: response.statusCode, body: response.body };
}

/** The row as the database holds it, bypassing the endpoint entirely. */
async function row(schoolId: string): Promise<Record<string, unknown> | undefined> {
  const rows = await admin.$queryRawUnsafe<Record<string, unknown>[]>(
    `SELECT show_logo, footer_note, copy_count, copy_labels, bank_name, kuickpay_enabled,
            kuickpay_prefix, kuickpay_channels, onelink_enabled, onelink_institution_id
       FROM school_voucher_settings WHERE school_id = $1::uuid`,
    schoolId,
  );
  return rows[0];
}

describe('a school that has never configured a challan', () => {
  it('gets the product’s defaults, not a 404', async () => {
    const { status, data } = await read();

    expect(status).toBe(200);
    expect(data?.showLogo).toBe(true);
    expect(data?.copyLabels).toEqual(['School Copy', 'Bank Copy', 'Student Copy']);
    expect(data?.kuickpayEnabled).toBe(false);
    expect(data?.onelinkEnabled).toBe(false);
    expect(data?.footerNote).toBeNull();
    // The list a school starts with, so the Kuickpay screen is not empty the
    // first time it is opened.
    expect(data?.kuickpayChannels).toEqual([...DEFAULT_KUICKPAY_CHANNELS]);
  });

  it('has written no row just by being read', async () => {
    await read();
    expect(await row(SCHOOL_A)).toBeUndefined();
  });
});

describe('saving', () => {
  it('creates the row on the first save and returns what it stored', async () => {
    const { status } = await write(VALID);
    expect(status).toBe(200);

    const after = await row(SCHOOL_A);
    expect(after?.['kuickpay_prefix']).toBe('1514');
    expect(after?.['onelink_institution_id']).toBe('100047');
    expect(after?.['copy_labels']).toEqual(['School Copy', 'Bank Copy', 'Student Copy']);
    expect((await read()).data?.kuickpayChannels).toEqual(['Meezan Bank', 'JazzCash']);
  });

  it('updates the same row on the second save rather than adding another', async () => {
    await write(VALID);
    await write({ ...VALID, kuickpayPrefix: '2020' });

    const rows = await admin.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*) AS n FROM school_voucher_settings WHERE school_id = $1::uuid`,
      SCHOOL_A,
    );
    expect(Number(rows[0]?.n)).toBe(1);
    expect((await row(SCHOOL_A))?.['kuickpay_prefix']).toBe('2020');
  });

  it('clears a prefix when its channel is turned off', async () => {
    await write(VALID);
    // The switch goes off but the prefix is still in the body, as it would be
    // from a form that simply unticked a box. A prefix left behind is a number
    // waiting to reappear the day somebody turns the channel back on without
    // re-reading it.
    const { status } = await write({ ...VALID, kuickpayEnabled: false, onelinkEnabled: false });

    expect(status).toBe(200);
    const after = await row(SCHOOL_A);
    expect(after?.['kuickpay_prefix']).toBeNull();
    expect(after?.['onelink_institution_id']).toBeNull();
  });

  it('stores a blank note as null, so "no note" has one spelling', async () => {
    await write({ ...PLAIN, footerNote: '   ' });
    expect((await row(SCHOOL_A))?.['footer_note']).toBeNull();
  });

  it('accepts an empty channel list — a school may print the ID and no outlets', async () => {
    const { status } = await write({ ...VALID, kuickpayChannels: [] });

    expect(status).toBe(200);
    expect((await row(SCHOOL_A))?.['kuickpay_channels']).toEqual([]);
  });

  it('writes an audit row carrying the defaults as the before-image', async () => {
    await write({ ...PLAIN, footerNote: 'Audited note' });

    const entries = await admin.$queryRawUnsafe<{ before: unknown; after: unknown }[]>(
      `SELECT before, after FROM audit_logs
        WHERE school_id = $1::uuid AND action = 'school.voucherSettings.update'`,
      SCHOOL_A,
    );

    expect(entries).toHaveLength(1);
    // Not "{} became everything": the log has to say what changed, and before
    // the first save the school was printing the defaults.
    expect((entries[0]?.before as { footerNote: string | null }).footerNote).toBeNull();
    expect((entries[0]?.after as { footerNote: string }).footerNote).toBe('Audited note');
  });
});

describe('the rules that keep a challan payable', () => {
  it('refuses Kuickpay with no prefix behind it', async () => {
    const { status } = await write({
      ...VALID,
      kuickpayPrefix: null,
      onelinkEnabled: false,
      onelinkInstitutionId: null,
    });

    expect(status).toBe(400);
    expect(await row(SCHOOL_A)).toBeUndefined();
  });

  it('refuses 1LINK with no Kuickpay under it', async () => {
    const { status } = await write({ ...VALID, kuickpayEnabled: false, kuickpayPrefix: null });

    expect(status).toBe(400);
    expect(await row(SCHOOL_A)).toBeUndefined();
  });

  it('refuses 1LINK with no institution id', async () => {
    expect((await write({ ...VALID, onelinkInstitutionId: null })).status).toBe(400);
  });

  it('refuses a prefix that is not digits', async () => {
    for (const bad of ['15 14', '1514A', '+1514', '1', '', '15-14']) {
      expect((await write({ ...VALID, kuickpayPrefix: bad })).status).toBe(400);
    }
    expect(await row(SCHOOL_A)).toBeUndefined();
  });

  it('insists on one copy name per copy', async () => {
    expect((await write({ ...PLAIN, copyLabels: ['One', 'Two'] })).status).toBe(400);
    expect((await write({ ...PLAIN, copyLabels: ['A', 'B', 'C', 'D'] })).status).toBe(400);
    expect((await write({ ...PLAIN, copyLabels: ['A', '   ', 'C'] })).status).toBe(400);
    // Four copies needs four names, and the names go with the count.
    expect((await write({ ...PLAIN, copyCount: 4 })).status).toBe(400);
  });

  it('accepts four copies with four names', async () => {
    const { status } = await write({
      ...PLAIN,
      copyCount: 4,
      copyLabels: ['School Copy', 'Bank Copy', 'Student Copy', 'Office Copy'],
    });

    expect(status).toBe(200);
    const after = await row(SCHOOL_A);
    expect(after?.['copy_count']).toBe(4);
    expect(after?.['copy_labels']).toHaveLength(4);
  });

  it('accepts only the two layouts that fit on a sheet', async () => {
    for (const bad of [1, 2, 5, 0, -3]) {
      expect((await write({ ...PLAIN, copyCount: bad })).status).toBe(400);
    }
    expect(await row(SCHOOL_A)).toBeUndefined();
  });

  it('rejects an unknown field rather than ignoring it', async () => {
    // `.strict()`. A school that thinks it enabled Easypaisa must be told it
    // did not, rather than discovering it on a printed challan.
    expect((await write({ ...PLAIN, easypaisaEnabled: true })).status).toBe(400);
  });

  it('rejects a note longer than the box it prints in', async () => {
    expect((await write({ ...PLAIN, footerNote: 'x'.repeat(401) })).status).toBe(400);
  });
});

describe('who may do what', () => {
  it('lets an accountant read it — they print the challans', async () => {
    const { status, data } = await read(accountantA);

    expect(status).toBe(200);
    expect(data?.copyLabels).toHaveLength(3);
  });

  it('refuses an accountant writing it, and changes nothing', async () => {
    const { status } = await write(VALID, accountantA);

    expect(status).toBe(403);
    expect(await row(SCHOOL_A)).toBeUndefined();
  });

  it('refuses a teacher entirely', async () => {
    expect((await read(teacherA)).status).toBe(403);
    expect((await write(VALID, teacherA)).status).toBe(403);
  });

  it('refuses a signed-out caller', async () => {
    const response = await app.inject({
      method: 'GET',
      url: ROUTES.school.voucherSettings,
      headers: { host: HOST_A },
    });
    expect(response.statusCode).toBe(401);
  });
});

/**
 * The bank's mark.
 *
 * The same table, the same sniffing and the same limits as the school's own
 * logo, with a `kind` telling them apart. What is worth proving is that they
 * *are* apart: uploading one must not overwrite the other, which is exactly
 * what the old one-row-per-school unique constraint would have done.
 */
describe('the bank logo', () => {
  // A one-pixel PNG. The endpoint sniffs the bytes, so this cannot be a stub.
  const PNG =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  async function upload(route: string, jar = ownerA, host = HOST_A) {
    const response = await app.inject({
      method: 'PUT',
      url: route,
      headers: { host, cookie: jar },
      payload: { dataBase64: PNG, mimeType: 'image/png' },
    });
    return { status: response.statusCode };
  }

  async function info(route: string, jar = ownerA, host = HOST_A) {
    const response = await app.inject({
      method: 'GET',
      url: route,
      headers: { host, cookie: jar },
    });
    return {
      status: response.statusCode,
      data:
        response.statusCode === 200
          ? response.json<{ data: { present: boolean } }>().data
          : undefined,
    };
  }

  beforeEach(async () => {
    await admin.$executeRaw`DELETE FROM school_logos WHERE school_id = ${SCHOOL_A}::uuid`;
  });

  it('starts absent, which is what makes the challan leave the space out', async () => {
    expect((await info(ROUTES.bankLogo.info)).data?.present).toBe(false);
  });

  it('is stored and read back', async () => {
    expect((await upload(ROUTES.bankLogo.image)).status).toBe(200);
    expect((await info(ROUTES.bankLogo.info)).data?.present).toBe(true);
  });

  it('does not overwrite the school’s own mark', async () => {
    // The whole reason for the `kind` column. One row per school — which is
    // what the constraint used to say — means uploading a bank logo silently
    // replaced the letterhead.
    await upload(ROUTES.schoolLogo.image);
    await upload(ROUTES.bankLogo.image);

    expect((await info(ROUTES.schoolLogo.info)).data?.present).toBe(true);
    expect((await info(ROUTES.bankLogo.info)).data?.present).toBe(true);

    const rows = await admin.$queryRawUnsafe<{ kind: string }[]>(
      // Cast to text: an enum orders by the order its values were declared,
      // which would make this assertion a statement about the migration.
      `SELECT kind FROM school_logos WHERE school_id = $1::uuid ORDER BY kind::text`,
      SCHOOL_A,
    );
    expect(rows.map((entry) => entry.kind)).toEqual(['BANK', 'SCHOOL']);
  });

  it('removes one without touching the other', async () => {
    await upload(ROUTES.schoolLogo.image);
    await upload(ROUTES.bankLogo.image);

    await app.inject({
      method: 'DELETE',
      url: ROUTES.bankLogo.image,
      headers: { host: HOST_A, cookie: ownerA },
    });

    expect((await info(ROUTES.bankLogo.info)).data?.present).toBe(false);
    expect((await info(ROUTES.schoolLogo.info)).data?.present).toBe(true);
  });

  it('refuses an accountant writing it, and a teacher reading it', async () => {
    expect((await upload(ROUTES.bankLogo.image, accountantA)).status).toBe(403);
    expect((await info(ROUTES.bankLogo.info, teacherA)).status).toBe(403);
  });

  it('does not reach another school', async () => {
    await upload(ROUTES.bankLogo.image);
    expect((await info(ROUTES.bankLogo.info, ownerB, HOST_B)).data?.present).toBe(false);
  });
});

describe('tenant isolation', () => {
  it('does not show one school the other’s payment identifiers', async () => {
    await write(VALID);

    // B has configured nothing, so B gets the defaults — not A's prefix.
    const { data } = await read(ownerB, HOST_B);
    expect(data?.kuickpayEnabled).toBe(false);
    expect(data?.kuickpayPrefix).toBeNull();
  });

  it('leaves A’s row untouched when B saves its own', async () => {
    await write(VALID);
    const { status } = await write({ ...VALID, kuickpayPrefix: '9999' }, ownerB, HOST_B);

    expect(status).toBe(200);
    expect((await row(SCHOOL_B))?.['kuickpay_prefix']).toBe('9999');
    expect((await row(SCHOOL_A))?.['kuickpay_prefix']).toBe('1514');
  });

  it('refuses B’s cookie presented against A’s host', async () => {
    // The token names school B; the host resolves to school A. Either alone
    // would be enough to pick a tenant if the other were not checked.
    const { status } = await write(VALID, ownerB, HOST_A);

    expect(status).toBe(401);
    expect(await row(SCHOOL_A)).toBeUndefined();
  });
});
