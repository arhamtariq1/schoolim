import { ROUTES, type StaffInviteResult, type StaffListItem } from '@ilm/contracts';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../app.module';
import { createAdminClient, type PrismaClient } from '../prisma';
import { PasswordService } from '../shared/auth/password.service';

/**
 * Inviting staff to the portal.
 *
 * This replaced an administrator typing somebody else's password into a form,
 * so the assertions that matter are about the window between the two: from the
 * moment an account exists until the moment its owner chooses a password, it
 * must grant nothing at all.
 *
 * The token is the authentication for a `@Public` endpoint, which makes this
 * the most exposed surface added in a while. Single-use, expiring, scoped to
 * one school, superseded on re-send — each of those is a test below, because
 * each of them is a way in if it is wrong.
 */

const SCHOOL_A = '33333333-3333-4333-8333-3333333333da';
const SCHOOL_B = '33333333-3333-4333-8333-3333333333db';
const OWNER_A = '44444444-4444-4444-8444-4444444444da';
const OWNER_B = '44444444-4444-4444-8444-4444444444db';

const HOST_A = 'invite-a-e2e.localhost';
const HOST_B = 'invite-b-e2e.localhost';
const PASSWORD = 'correct-horse-battery-staple';
const CHOSEN = 'The1-I-Picked-Myself!';

let app: NestFastifyApplication;
let admin: PrismaClient;
let ownerA = '';
let ownerB = '';

async function wipe(): Promise<void> {
  for (const table of [
    'invitations',
    'staff',
    'sessions',
    'audit_logs',
    'user_roles',
    'number_sequences',
    'users',
  ]) {
    await admin.$executeRawUnsafe(`DELETE FROM ${table} WHERE school_id = ANY($1::uuid[])`, [
      SCHOOL_A,
      SCHOOL_B,
    ]);
  }
  await admin.$executeRaw`DELETE FROM schools WHERE id IN (${SCHOOL_A}::uuid, ${SCHOOL_B}::uuid)`;
}

beforeAll(async () => {
  admin = createAdminClient({ url: process.env['DATABASE_ADMIN_URL'] ?? '' });
  await wipe();

  await admin.$executeRaw`
    INSERT INTO schools (id, name, slug, created_at, updated_at) VALUES
      (${SCHOOL_A}::uuid, 'Invite E2E A', 'invite-a-e2e', now(), now()),
      (${SCHOOL_B}::uuid, 'Invite E2E B', 'invite-b-e2e', now(), now())
  `;

  const hash = await new PasswordService().hash(PASSWORD);
  for (const [user, school, email] of [
    [OWNER_A, SCHOOL_A, 'head@invite-a.test'],
    [OWNER_B, SCHOOL_B, 'head@invite-b.test'],
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

  ownerA = await signIn(HOST_A, 'head@invite-a.test', PASSWORD);
  ownerB = await signIn(HOST_B, 'head@invite-b.test', PASSWORD);
}, 90_000);

async function signIn(host: string, identifier: string, password: string): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: ROUTES.auth.login,
    headers: { host },
    payload: { identifier, password },
  });
  const raw = response.headers['set-cookie'];
  const cookies = Array.isArray(raw) ? raw : [String(raw)];
  return cookies
    .map((entry) => entry.split(';')[0] ?? '')
    .filter((pair) => !pair.endsWith('='))
    .join('; ');
}

beforeEach(async () => {
  for (const table of ['invitations', 'staff']) {
    await admin.$executeRawUnsafe(`DELETE FROM ${table} WHERE school_id = ANY($1::uuid[])`, [
      SCHOOL_A,
      SCHOOL_B,
    ]);
  }
  // Everybody except the two owners, so each test starts with one account per
  // school and can assert on "the account that was just created".
  await admin.$executeRaw`
    DELETE FROM users
     WHERE school_id = ANY(ARRAY[${SCHOOL_A}::uuid, ${SCHOOL_B}::uuid])
       AND id <> ${OWNER_A}::uuid AND id <> ${OWNER_B}::uuid
  `;
});

afterAll(async () => {
  await app?.close();
  await wipe();
  await admin.$disconnect();
});

/** A complete, valid member of staff. Individual tests override one part. */
const TEACHER = {
  name: 'Ayesha Khan',
  email: 'ayesha@invite-a.test',
  phone: '+923001234567',
  role: 'TEACHER',
} as const;

async function addStaff(body: Record<string, unknown>, jar = ownerA, host = HOST_A) {
  const response = await app.inject({
    method: 'POST',
    url: ROUTES.staff.create,
    headers: { host, cookie: jar },
    payload: body,
  });
  return {
    status: response.statusCode,
    body: response.body,
    data: () => response.json<{ data: StaffListItem }>().data,
  };
}

async function invite(staffId: string, jar = ownerA, host = HOST_A) {
  const response = await app.inject({
    method: 'POST',
    url: ROUTES.staff.invite(staffId),
    headers: { host, cookie: jar },
  });
  return {
    status: response.statusCode,
    body: response.body,
    data: () => response.json<{ data: StaffInviteResult }>().data,
  };
}

/**
 * The token as it was mailed.
 *
 * Read from the database rather than from the response, because the response
 * deliberately does not contain it — and a test that asserted on a token the
 * API handed back would be asserting the opposite of what is wanted.
 *
 * Only the SHA-256 hash is stored, so the test cannot recover the original. It
 * plants a known one instead, which is also how the expiry and cross-tenant
 * cases below are set up.
 */
async function plantToken(userId: string, token: string, expiresAt: Date): Promise<void> {
  const { createHash } = await import('node:crypto');
  await admin.$executeRawUnsafe(
    `UPDATE invitations SET token_hash = $1, expires_at = $2 WHERE user_id = $3::uuid`,
    createHash('sha256').update(token).digest('hex'),
    expiresAt,
    userId,
  );
}

async function userOf(staffId: string): Promise<Record<string, unknown>> {
  const rows = await admin.$queryRawUnsafe<Record<string, unknown>[]>(
    `SELECT u.id, u.email, u.status::text AS status, u.password_hash,
            u.email_verified_at, u.must_change_password
       FROM staff s JOIN users u ON u.id = s.user_id
      WHERE s.id = $1::uuid`,
    staffId,
  );
  return rows[0] ?? {};
}

async function checkInvite(token: string, host = HOST_A) {
  const response = await app.inject({
    method: 'POST',
    url: ROUTES.auth.inviteCheck,
    headers: { host },
    payload: { token },
  });
  return { status: response.statusCode, body: response.body };
}

async function acceptInvite(token: string, password = CHOSEN, host = HOST_A) {
  const response = await app.inject({
    method: 'POST',
    url: ROUTES.auth.acceptInvite,
    headers: { host },
    payload: { token, password },
  });
  return { status: response.statusCode, body: response.body };
}

describe('what the staff form now requires', () => {
  it('refuses a member of staff with no phone number', async () => {
    const { phone: _phone, ...withoutPhone } = TEACHER;
    expect((await addStaff(withoutPhone)).status).toBe(400);
  });

  it('refuses a teacher with no email — there is nowhere to invite them', async () => {
    const { email: _email, ...withoutEmail } = TEACHER;
    expect((await addStaff(withoutEmail)).status).toBe(400);
  });

  it('accepts a janitor with no email, because they never sign in', async () => {
    const result = await addStaff({
      name: 'Rafiq',
      phone: '+923009876543',
      role: 'JANITOR',
    });

    expect(result.status).toBe(201);
    expect(result.data().hasLogin).toBe(false);
  });

  it('refuses a janitor with no phone, same as everybody else', async () => {
    expect((await addStaff({ name: 'Rafiq', role: 'JANITOR' })).status).toBe(400);
  });

  it('refuses a password, whoever sends it', async () => {
    // The field is gone from the contract. A caller that is not our form must
    // not be able to set somebody else's password by remembering the old shape.
    expect((await addStaff({ ...TEACHER, password: 'hunter2hunter2' })).status).toBe(400);
  });

  it('creates no account for a role that does not use the portal', async () => {
    const janitor = (
      await addStaff({ name: 'Rafiq', phone: '+923009876543', role: 'JANITOR' })
    ).data();

    expect(janitor.hasLogin).toBe(false);
    expect(janitor.invitePending).toBe(false);
    expect(await userOf(janitor.id)).toEqual({});
  });
});

describe('sending the invitation', () => {
  it('creates the account with no password and no way in', async () => {
    const staff = (await addStaff(TEACHER)).data();
    expect((await invite(staff.id)).status).toBe(201);

    const user = await userOf(staff.id);
    expect(user['status']).toBe('INVITED');
    expect(user['password_hash']).toBeNull();
  });

  it('leaves that account unable to sign in', async () => {
    const staff = (await addStaff(TEACHER)).data();
    await invite(staff.id);

    // Every password, including the right one, because there is no right one.
    const response = await app.inject({
      method: 'POST',
      url: ROUTES.auth.login,
      headers: { host: HOST_A },
      payload: { identifier: TEACHER.email, password: CHOSEN },
    });

    expect(response.statusCode).toBeGreaterThanOrEqual(400);
  });

  it('never returns the token', async () => {
    const staff = (await addStaff(TEACHER)).data();
    const result = await invite(staff.id);

    // It goes to a mailbox and nowhere else. A token in an API response is a
    // token in a browser's network tab, a proxy log and a screenshot.
    const rows = await admin.$queryRawUnsafe<{ token_hash: string }[]>(
      `SELECT token_hash FROM invitations WHERE school_id = $1::uuid`,
      SCHOOL_A,
    );
    expect(rows).toHaveLength(1);
    expect(result.body).not.toContain(rows[0]?.token_hash);
  });

  it('refuses a janitor — there is nothing to invite them to', async () => {
    const staff = (
      await addStaff({ name: 'Rafiq', phone: '+923009876543', role: 'JANITOR' })
    ).data();

    expect((await invite(staff.id)).status).toBeGreaterThanOrEqual(400);
  });

  it('refuses another school’s staff member', async () => {
    const staff = (await addStaff(TEACHER)).data();

    expect((await invite(staff.id, ownerB, HOST_B)).status).toBe(404);
  });

  it('supersedes the previous link when it is sent again', async () => {
    const staff = (await addStaff(TEACHER)).data();
    await invite(staff.id);

    const user = await userOf(staff.id);
    const userId = String(user['id']);
    await plantToken(userId, 'first-link', new Date(Date.now() + 3_600_000));

    await invite(staff.id);

    // The old one is gone, not merely one of two. A re-send is usually a
    // response to the first link having gone somewhere it should not.
    expect((await acceptInvite('first-link')).status).toBeGreaterThanOrEqual(400);

    const rows = await admin.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*) AS n FROM invitations WHERE user_id = $1::uuid AND accepted_at IS NULL`,
      userId,
    );
    expect(Number(rows[0]?.n ?? 0)).toBe(1);
  });
});

describe('reading the invitation', () => {
  async function invited(): Promise<{ staffId: string; userId: string }> {
    const staff = (await addStaff(TEACHER)).data();
    await invite(staff.id);
    const user = await userOf(staff.id);
    await plantToken(String(user['id']), 'a-known-token', new Date(Date.now() + 3_600_000));
    return { staffId: staff.id, userId: String(user['id']) };
  }

  it('says who it is for and which school, so a three-day-old link is recognisable', async () => {
    await invited();
    const result = await checkInvite('a-known-token');

    expect(result.status).toBe(201);
    expect(result.body).toContain('Ayesha Khan');
    expect(result.body).toContain('Invite E2E A');
    expect(result.body).toContain('Teacher');
  });

  it('does not spend it', async () => {
    const { userId } = await invited();
    await checkInvite('a-known-token');

    const rows = await admin.$queryRawUnsafe<{ accepted_at: Date | null }[]>(
      `SELECT accepted_at FROM invitations WHERE user_id = $1::uuid`,
      userId,
    );
    expect(rows[0]?.accepted_at).toBeNull();
  });

  it('answers the same way for expired, invented and foreign tokens', async () => {
    const { userId } = await invited();

    const invented = await checkInvite('no-such-token');

    await plantToken(userId, 'a-known-token', new Date(Date.now() - 1_000));
    const expired = await checkInvite('a-known-token');

    await plantToken(userId, 'a-known-token', new Date(Date.now() + 3_600_000));
    const foreign = await checkInvite('a-known-token', HOST_B);

    // Three different reasons, one answer. Telling them apart is how somebody
    // learns which tokens are real — and the `detail` is what a person sees,
    // so it is the string that has to match, not just the status.
    const said = (raw: string): { status: number; code?: string; detail?: string } =>
      JSON.parse(raw) as { status: number; code?: string; detail?: string };

    expect([invented.status, expired.status, foreign.status]).toEqual([
      invented.status,
      invented.status,
      invented.status,
    ]);
    expect(said(expired.body).detail).toBe(said(invented.body).detail);
    expect(said(foreign.body).detail).toBe(said(invented.body).detail);
    expect(said(foreign.body).code).toBe(said(invented.body).code);
  });
});

describe('accepting it', () => {
  async function invited(): Promise<string> {
    const staff = (await addStaff(TEACHER)).data();
    await invite(staff.id);
    const user = await userOf(staff.id);
    await plantToken(String(user['id']), 'a-known-token', new Date(Date.now() + 3_600_000));
    return staff.id;
  }

  it('sets the password and brings the account to life', async () => {
    const staffId = await invited();

    expect((await acceptInvite('a-known-token')).status).toBe(201);

    const user = await userOf(staffId);
    expect(user['status']).toBe('ACTIVE');
    expect(user['password_hash']).not.toBeNull();
    expect(user['must_change_password']).toBe(false);
    // Following the link is the same proof `verify-email` asks for, so asking
    // again would be asking them to confirm what they just did.
    expect(user['email_verified_at']).not.toBeNull();
  });

  it('lets them sign in with the password they chose, and only that one', async () => {
    await invited();
    await acceptInvite('a-known-token');

    const good = await app.inject({
      method: 'POST',
      url: ROUTES.auth.login,
      headers: { host: HOST_A },
      payload: { identifier: TEACHER.email, password: CHOSEN },
    });
    expect(good.statusCode).toBe(201);

    const bad = await app.inject({
      method: 'POST',
      url: ROUTES.auth.login,
      headers: { host: HOST_A },
      payload: { identifier: TEACHER.email, password: PASSWORD },
    });
    expect(bad.statusCode).toBeGreaterThanOrEqual(400);
  });

  it('works once', async () => {
    await invited();
    expect((await acceptInvite('a-known-token')).status).toBe(201);

    // A second submit, a double-clicked button, a mail client prefetching the
    // URL — none of them may set a second password.
    expect((await acceptInvite('a-known-token', 'A-Different-Password9!')).status).toBeGreaterThanOrEqual(400);

    const good = await app.inject({
      method: 'POST',
      url: ROUTES.auth.login,
      headers: { host: HOST_A },
      payload: { identifier: TEACHER.email, password: CHOSEN },
    });
    expect(good.statusCode).toBe(201);
  });

  it('refuses an expired token', async () => {
    const staffId = await invited();
    const user = await userOf(staffId);
    await plantToken(String(user['id']), 'a-known-token', new Date(Date.now() - 1_000));

    expect((await acceptInvite('a-known-token')).status).toBeGreaterThanOrEqual(400);
    expect((await userOf(staffId))['password_hash']).toBeNull();
  });

  it('refuses a token presented against another school', async () => {
    const staffId = await invited();

    expect((await acceptInvite('a-known-token', CHOSEN, HOST_B)).status).toBeGreaterThanOrEqual(400);
    expect((await userOf(staffId))['status']).toBe('INVITED');
  });

  it('refuses a password too weak to be one', async () => {
    const staffId = await invited();

    expect((await acceptInvite('a-known-token', 'short')).status).toBe(400);
    expect((await userOf(staffId))['status']).toBe('INVITED');
  });
});

/**
 * Editing somebody after they are on the payroll.
 *
 * The invite flow above is the new code; this is the code it sits next to, and
 * it had no coverage at all. A role is not a label — it is what the portal
 * lets somebody do — so every one of these is about whether changing the word
 * on the staff list actually changes what the account can reach.
 */
describe('changing a role', () => {
  async function activeTeacher(): Promise<{ staffId: string; userId: string }> {
    const staff = (await addStaff(TEACHER)).data();
    await invite(staff.id);
    const user = await userOf(staff.id);
    await plantToken(String(user['id']), 'a-known-token', new Date(Date.now() + 3_600_000));
    await acceptInvite('a-known-token');
    return { staffId: staff.id, userId: String(user['id']) };
  }

  async function rolesOf(userId: string): Promise<string[]> {
    const rows = await admin.$queryRawUnsafe<{ role: string }[]>(
      `SELECT role::text AS role FROM user_roles WHERE user_id = $1::uuid ORDER BY role`,
      userId,
    );
    return rows.map((row) => row.role);
  }

  async function patch(staffId: string, body: Record<string, unknown>) {
    const response = await app.inject({
      method: 'PATCH',
      url: ROUTES.staff.update(staffId),
      headers: { host: HOST_A, cookie: ownerA },
      payload: body,
    });
    return { status: response.statusCode, body: response.body };
  }

  it('grants the new role’s permissions when only the role changes', async () => {
    const { staffId, userId } = await activeTeacher();
    expect(await rolesOf(userId)).toEqual(['TEACHER']);

    expect((await patch(staffId, { role: 'ADMIN' })).status).toBe(200);

    expect(await rolesOf(userId)).toEqual(['ADMIN']);
  });

  it('takes the old role’s permissions away when somebody is demoted', async () => {
    // The one that matters. A head demoted to a teacher who keeps PRINCIPAL on
    // their account is still a head as far as every permission check goes, and
    // the staff list says otherwise — so nobody looking at the screen can tell.
    const { staffId, userId } = await activeTeacher();
    await patch(staffId, { role: 'HEAD' });
    expect(await rolesOf(userId)).toEqual(['PRINCIPAL']);

    expect((await patch(staffId, { role: 'TEACHER' })).status).toBe(200);

    expect(await rolesOf(userId)).toEqual(['TEACHER']);
  });

  it('disables the account when somebody moves to a role with no portal', async () => {
    const { staffId, userId } = await activeTeacher();

    expect((await patch(staffId, { role: 'JANITOR' })).status).toBe(200);

    const rows = await admin.$queryRawUnsafe<{ status: string }[]>(
      `SELECT status::text AS status FROM users WHERE id = $1::uuid`,
      userId,
    );
    expect(rows[0]?.status).toBe('DISABLED');
  });

  it('refuses to promote somebody who has no email to invite', async () => {
    const janitor = (
      await addStaff({ name: 'Rafiq', phone: '+923009876543', role: 'JANITOR' })
    ).data();

    const result = await patch(janitor.id, { role: 'TEACHER' });

    expect(result.status).toBeGreaterThanOrEqual(400);
    expect(result.body).toContain('email');
  });

  it('promotes when the email arrives with the role', async () => {
    const janitor = (
      await addStaff({ name: 'Rafiq', phone: '+923009876543', role: 'JANITOR' })
    ).data();

    expect((await patch(janitor.id, { role: 'TEACHER', email: 'rafiq@invite-a.test' })).status).toBe(
      200,
    );
  });
});

describe('editing the fields the rules are about', () => {
  async function patch(staffId: string, body: Record<string, unknown>) {
    const response = await app.inject({
      method: 'PATCH',
      url: ROUTES.staff.update(staffId),
      headers: { host: HOST_A, cookie: ownerA },
      payload: body,
    });
    return { status: response.statusCode, body: response.body };
  }

  it('refuses to clear a phone number', async () => {
    const staff = (await addStaff(TEACHER)).data();

    const result = await patch(staff.id, { phone: '' });

    expect(result.status).toBeGreaterThanOrEqual(400);
  });

  it('leaves a salary edit alone — a PATCH says nothing about fields it omits', async () => {
    const staff = (await addStaff(TEACHER)).data();

    expect((await patch(staff.id, { basicSalaryMinor: 5_000_000 })).status).toBe(200);
  });

  it('un-verifies the address when it changes after they accepted', async () => {
    const staff = (await addStaff(TEACHER)).data();
    await invite(staff.id);
    const user = await userOf(staff.id);
    await plantToken(String(user['id']), 'a-known-token', new Date(Date.now() + 3_600_000));
    await acceptInvite('a-known-token');

    expect((await userOf(staff.id))['email_verified_at']).not.toBeNull();

    await patch(staff.id, { email: 'ayesha.khan@invite-a.test' });

    // ADR-0012: the proof was about the old address. Keeping the stamp would
    // mean a password reset could be sent to an address nobody has confirmed
    // anyone can read.
    const after = await userOf(staff.id);
    expect(after['email']).toBe('ayesha.khan@invite-a.test');
    expect(after['email_verified_at']).toBeNull();
  });

  it('says so, clearly, when an edit moves somebody onto a taken address', async () => {
    // Creating two people on one address is refused outright now, because
    // adding somebody issues their invitation in the same write. This is the
    // way round that is still reachable: a janitor, who needed no address, is
    // promoted onto one that a teacher already holds.
    await addStaff(TEACHER);

    const janitor = (
      await addStaff({ name: 'Rafiq', phone: '+923009876543', role: 'JANITOR' })
    ).data();

    expect((await patch(janitor.id, { role: 'TEACHER', email: TEACHER.email })).status).toBe(200);

    const result = await invite(janitor.id);

    // A unique violation on (school, email) reaching the client as a 500 tells
    // an office that the system is broken about a typo they could fix in five
    // seconds. It is a conflict, and the message names the address.
    expect(result.status).toBe(409);
    expect(result.body).toContain(TEACHER.email);
  });
});

/**
 * Adding a teacher invites them, in the same breath.
 *
 * It used to be two steps, and the normal outcome of the first without the
 * second was a teacher who could not sign in — discovered days later, usually
 * on the morning they were supposed to take a register.
 */
describe('adding somebody invites them', () => {
  it('issues the invitation as part of creating them', async () => {
    const staff = (await addStaff(TEACHER)).data();

    expect(staff.hasLogin).toBe(true);
    expect(staff.invitePending).toBe(true);

    const rows = await admin.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*) AS n FROM invitations WHERE school_id = $1::uuid AND accepted_at IS NULL`,
      SCHOOL_A,
    );
    expect(Number(rows[0]?.n ?? 0)).toBe(1);
  });

  it('leaves that account with no password and no way in', async () => {
    const staff = (await addStaff(TEACHER)).data();

    const user = await userOf(staff.id);
    expect(user['status']).toBe('INVITED');
    expect(user['password_hash']).toBeNull();

    const login = await app.inject({
      method: 'POST',
      url: ROUTES.auth.login,
      headers: { host: HOST_A },
      payload: { identifier: TEACHER.email, password: CHOSEN },
    });
    expect(login.statusCode).toBeGreaterThanOrEqual(400);
  });

  it('stops saying "invited" once they have chosen a password', async () => {
    const staff = (await addStaff(TEACHER)).data();
    const user = await userOf(staff.id);
    await plantToken(String(user['id']), 'a-known-token', new Date(Date.now() + 3_600_000));
    await acceptInvite('a-known-token');

    const listed = await app.inject({
      method: 'GET',
      url: `${ROUTES.staff.list}?limit=50`,
      headers: { host: HOST_A, cookie: ownerA },
    });
    const row = listed
      .json<{ data: StaffListItem[] }>()
      .data.find((entry) => entry.id === staff.id);

    // The office chases the first state and not the second, so the list has to
    // tell them apart.
    expect(row?.hasLogin).toBe(true);
    expect(row?.invitePending).toBe(false);
  });

  it('refuses the whole thing when the address is already somebody else’s', async () => {
    await addStaff(TEACHER);

    const second = await addStaff({
      ...TEACHER,
      name: 'Someone Else',
      phone: '+923005556666',
    });

    // Not a teacher saved with a broken login: the two are one write, so a
    // clash means nothing is written and the school is told which address.
    expect(second.status).toBe(409);

    const rows = await admin.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*) AS n FROM staff WHERE school_id = $1::uuid`,
      SCHOOL_A,
    );
    expect(Number(rows[0]?.n ?? 0)).toBe(1);
  });

  it('still adds a janitor without inviting anybody', async () => {
    const result = await addStaff({ name: 'Rafiq', phone: '+923009876543', role: 'JANITOR' });

    expect(result.status).toBe(201);

    const rows = await admin.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*) AS n FROM invitations WHERE school_id = $1::uuid`,
      SCHOOL_A,
    );
    expect(Number(rows[0]?.n ?? 0)).toBe(0);
  });
});
