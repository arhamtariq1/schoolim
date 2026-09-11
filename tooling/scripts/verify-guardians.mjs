#!/usr/bin/env node
/**
 * Prove the family structure holds.
 *
 * Guardians are where a school-management product quietly rots. The same father
 * gets typed in three times for three siblings, and from then on the school has
 * three phone numbers to keep in step, three fee vouchers where one family
 * should get one, and no sibling discount anyone can calculate. None of that
 * shows up as an error — it shows up as a parent complaining about a bill.
 *
 * So this checks the invariants that stop it: one primary, one fee payer, a
 * link that is reused rather than duplicated, and a student who can never be
 * left with nobody to telephone.
 *
 * Run: node tooling/scripts/verify-guardians.mjs   (the API must be running)
 */

import { request as httpRequest } from 'node:http';

import './lib/load-env.mjs';

import { pgConfig } from './lib/pg-connection.mjs';

const PORT = Number(process.env.API_PORT ?? 4000);
const PASSWORD = 'demo-password-1234';

function call(path, { method = 'GET', body, cookie } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const headers = { host: 'demo.localhost' };
    if (payload !== undefined) {
      headers['content-type'] = 'application/json';
      headers['content-length'] = String(Buffer.byteLength(payload));
    }
    if (cookie !== undefined) {
      headers['cookie'] = cookie;
    }

    const req = httpRequest({ host: '127.0.0.1', port: PORT, path, method, headers }, (res) => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => (raw += chunk));
      res.on('end', () => {
        const setCookie = res.headers['set-cookie'] ?? [];
        resolve({
          status: res.statusCode ?? 0,
          setCookie: Array.isArray(setCookie) ? setCookie : [setCookie],
          json: () => {
            try {
              return JSON.parse(raw);
            } catch {
              return undefined;
            }
          },
        });
      });
    });

    req.on('error', reject);
    if (payload !== undefined) {
      req.write(payload);
    }
    req.end();
  });
}

const checks = [];
function check(name, passed, detail) {
  checks.push({ name, passed });
  console.error(
    `${passed ? 'PASS' : 'FAIL'}  ${name}${detail === undefined ? '' : ` — ${detail}`}`,
  );
}

const signIn = await call('/api/v1/auth/login', {
  method: 'POST',
  body: { identifier: 'owner@demo.test', password: PASSWORD, rememberDevice: false },
});
const jar = `ilm_at=${/ilm_at=([^;]+)/.exec(signIn.setCookie.join(';'))?.[1]}`;

async function admit(firstName) {
  const response = await call('/api/v1/students', {
    method: 'POST',
    cookie: jar,
    body: { firstName, lastName: 'Guardianprobe' },
  });
  return response.json()?.data;
}

async function profile(id) {
  const response = await call(`/api/v1/students/${id}/profile`, { cookie: jar });
  return { status: response.status, data: response.json()?.data };
}

const elder = await admit('Elder');
const younger = await admit('Younger');

// --- 1. The 360 loads, in one call ------------------------------------------
const initial = await profile(elder.id);
check(
  'the profile returns details, guardians and history together',
  initial.status === 200 &&
    Array.isArray(initial.data?.guardians) &&
    Array.isArray(initial.data?.enrollments) &&
    initial.data?.grNo === elder.grNo,
  `HTTP ${String(initial.status)}`,
);

// --- 2. The first guardian is primary and fee payer without being told ------
// Otherwise the first admission produces a student nobody is billed for, and
// nothing surfaces it until a voucher run silently skips them.
await call(`/api/v1/students/${elder.id}/guardians`, {
  method: 'POST',
  cookie: jar,
  body: { name: 'Probe Father', relation: 'FATHER', phone: '+923009998877' },
});

const withFather = await profile(elder.id);
const father = withFather.data?.guardians?.[0];
check(
  'the first guardian is primary and fee payer by default',
  father?.isPrimary === true && father?.isFeePayer === true,
  `primary=${String(father?.isPrimary)} feePayer=${String(father?.isFeePayer)}`,
);

// --- 3. Search finds them, and a one-character search returns nothing -------
// A search that matches on a single letter is a parent-contact export.
const found = await call(`/api/v1/guardians?q=${encodeURIComponent('Probe Father')}`, {
  cookie: jar,
});
const matches = found.json()?.data ?? [];
check(
  'an existing guardian is findable for linking',
  matches.some((entry) => entry.id === father?.id),
  `${String(matches.length)} matches`,
);

const tooShort = await call('/api/v1/guardians?q=a', { cookie: jar });
check(
  'a one-character search returns nothing',
  (tooShort.json()?.data ?? []).length === 0,
  `${String((tooShort.json()?.data ?? []).length)} matches`,
);

// --- 4. Linking the sibling reuses the person, not a copy -------------------
// The whole point. Two rows for one father is what breaks fees.
await call(`/api/v1/students/${younger.id}/guardians/link`, {
  method: 'POST',
  cookie: jar,
  body: { guardianId: father.id },
});

const siblingProfile = await profile(younger.id);
const sharedFather = siblingProfile.data?.guardians?.[0];
check(
  'a sibling links to the same guardian record',
  sharedFather?.id === father.id,
  sharedFather?.id === father.id ? 'same id' : 'DUPLICATED',
);

check(
  'the guardian reports the other child as a sibling',
  (sharedFather?.siblings ?? []).some((sibling) => sibling.id === elder.id),
  (sharedFather?.siblings ?? []).map((s) => s.name).join(', ') || 'none',
);

// …and it is visible from the elder's side too.
const elderAgain = await profile(elder.id);
check(
  'the sibling link is visible from both children',
  (elderAgain.data?.guardians?.[0]?.siblings ?? []).some((s) => s.id === younger.id),
  (elderAgain.data?.guardians?.[0]?.siblings ?? []).map((s) => s.name).join(', ') || 'none',
);

// --- 5. Linking the same guardian twice is refused -------------------------
const duplicate = await call(`/api/v1/students/${younger.id}/guardians/link`, {
  method: 'POST',
  cookie: jar,
  body: { guardianId: father.id },
});
check(
  'linking the same guardian twice is refused',
  duplicate.status === 409,
  `HTTP ${String(duplicate.status)}`,
);

// --- 6. Exactly one primary and one fee payer ------------------------------
// Two fee payers means a voucher run bills the family twice.
await call(`/api/v1/students/${elder.id}/guardians`, {
  method: 'POST',
  cookie: jar,
  body: { name: 'Probe Mother', relation: 'MOTHER', phone: '+923009998866', isPrimary: true },
});

const twoGuardians = await profile(elder.id);
const list = twoGuardians.data?.guardians ?? [];
check(
  'promoting a new primary demotes the old one',
  list.filter((entry) => entry.isPrimary).length === 1 &&
    list.find((entry) => entry.isPrimary)?.name === 'Probe Mother',
  list.map((entry) => `${entry.name}${entry.isPrimary ? '*' : ''}`).join(', '),
);

check(
  'exactly one guardian receives fee vouchers',
  list.filter((entry) => entry.isFeePayer).length === 1,
  `${String(list.filter((entry) => entry.isFeePayer).length)} fee payers`,
);

// --- 7. Detaching hands the flags on ---------------------------------------
// Otherwise removing the primary leaves a student with nobody flagged, and no
// screen says so.
const mother = list.find((entry) => entry.name === 'Probe Mother');
await call(`/api/v1/students/${elder.id}/guardians/${mother.id}`, {
  method: 'DELETE',
  cookie: jar,
});

const afterDetach = await profile(elder.id);
const remaining = afterDetach.data?.guardians ?? [];
check(
  'removing the primary promotes the one who is left',
  remaining.length === 1 && remaining[0]?.isPrimary === true && remaining[0]?.isFeePayer === true,
  remaining.map((entry) => entry.name).join(', '),
);

// --- 8. The last guardian cannot be removed --------------------------------
// A student nobody can be telephoned about is a record the school cannot act
// on, and the gap only shows up when a child is ill.
const removeLast = await call(`/api/v1/students/${elder.id}/guardians/${remaining[0].id}`, {
  method: 'DELETE',
  cookie: jar,
});
check(
  'the last guardian cannot be removed',
  removeLast.status === 422,
  `HTTP ${String(removeLast.status)}`,
);

// --- 9. Detaching does not delete the person -------------------------------
// They are still the parent of their other child.
const youngerStill = await profile(younger.id);
check(
  'detaching from one child keeps the guardian on the other',
  (youngerStill.data?.guardians ?? []).some((entry) => entry.id === father.id),
  `${String((youngerStill.data?.guardians ?? []).length)} guardians`,
);

await cleanUp();

async function cleanUp() {
  const url = process.env.DATABASE_ADMIN_URL;
  if (url === undefined || url === '') {
    console.error('\n(skipped cleanup: DATABASE_ADMIN_URL is not set)');
    return;
  }
  const { Client } = await import('pg');
  const client = new Client(pgConfig(url));
  try {
    await client.connect();
    const students = await client.query("DELETE FROM students WHERE last_name = 'Guardianprobe'");
    const guardians = await client.query("DELETE FROM guardians WHERE name LIKE 'Probe %'");
    console.error(
      `\nCleaned up ${String(students.rowCount ?? 0)} student(s), ${String(guardians.rowCount ?? 0)} guardian(s).`,
    );
  } catch (error) {
    console.error(`\n(cleanup failed: ${String(error.message)})`);
  } finally {
    await client.end().catch(() => undefined);
  }
}

const failed = checks.filter((entry) => !entry.passed);
console.error(`\n${String(checks.length - failed.length)}/${String(checks.length)} checks passed`);

if (failed.length > 0) {
  process.exit(1);
}
