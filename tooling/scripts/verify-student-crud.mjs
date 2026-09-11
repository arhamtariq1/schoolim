#!/usr/bin/env node
/**
 * Prove the student lifecycle works, end to end, through the running API.
 *
 * Not "the endpoints return 200". The things that actually go wrong with a
 * register: two children handed the same number, a child who left still sitting
 * in a class list, a delete that quietly takes the row out of the register, a
 * validation failure that surfaces as a 500 with no field named.
 *
 * Run: node tooling/scripts/verify-student-crud.mjs   (the API must be running)
 */

import { request as httpRequest } from 'node:http';

import 'dotenv/config';

import { pgConfig, withAdminClient } from './lib/pg-connection.mjs';

const PORT = Number(process.env.API_PORT ?? 4000);
const PASSWORD = 'demo-password-1234';

function call(path, { method = 'GET', body, cookie, slug = 'demo' } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const headers = { host: `${slug}.localhost` };
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

// --- 1. Every existing student has a GR number -----------------------------
const listed = await call('/api/v1/students?limit=200', { cookie: jar });
const rows = listed.json()?.data ?? [];
const missing = rows.filter((row) => typeof row.grNo !== 'string' || row.grNo === '');
check(
  'every student has a GR number',
  rows.length > 0 && missing.length === 0,
  `${rows.length} students`,
);

// --- 2. GR numbers are unique ----------------------------------------------
// The whole point of a register number.
const grSet = new Set(rows.map((row) => row.grNo));
check(
  'GR numbers are unique',
  grSet.size === rows.length,
  `${grSet.size} distinct of ${rows.length}`,
);

// --- 3. The class tree loads ------------------------------------------------
const setup = await call('/api/v1/academics/setup', { cookie: jar });
const setupBody = setup.json()?.data;
check(
  'classes and the current session load',
  setup.status === 200 && (setupBody?.classes ?? []).length > 0 && setupBody?.session !== null,
  `${String((setupBody?.classes ?? []).length)} classes, session ${setupBody?.session?.name ?? 'none'}`,
);

// Classes must be ordered by numeric order, not alphabetically — otherwise
// "Grade 10" sorts before "Grade 2" and a dropdown becomes a puzzle.
const orders = (setupBody?.classes ?? []).map((entry) => entry.numericOrder);
check(
  'classes are in teaching order, not alphabetical',
  orders.every((value, index) => index === 0 || orders[index - 1] <= value),
  orders.join(', '),
);

const firstClass = setupBody?.classes?.[2] ?? setupBody?.classes?.[0];

// --- 4. Validation failures name the field ---------------------------------
// A 500 here means a receptionist sees "something went wrong" with no idea
// which box is wrong.
const invalid = await call('/api/v1/students', {
  method: 'POST',
  cookie: jar,
  body: { firstName: '', lastName: 'Nobody' },
});
const invalidBody = invalid.json();
check(
  'an invalid admission is a 400 naming the field',
  invalid.status === 400 &&
    (invalidBody?.errors ?? []).some((issue) => issue.field === 'firstName'),
  `HTTP ${String(invalid.status)} ${(invalidBody?.errors ?? []).map((e) => e.field).join(',')}`,
);

// --- 5. An unknown field is rejected, not ignored --------------------------
// `.strict()` — a typo'd field silently dropped is how data goes missing.
const unknownField = await call('/api/v1/students', {
  method: 'POST',
  cookie: jar,
  body: {
    firstName: 'Test',
    lastName: 'Student',
    schoolId: '00000000-0000-4000-8000-000000000011',
  },
});
check(
  'a smuggled schoolId is rejected, not ignored',
  unknownField.status === 400,
  `HTTP ${String(unknownField.status)}`,
);

// --- 6. Admission issues both numbers, and places the child ----------------
const admitted = await call('/api/v1/students', {
  method: 'POST',
  cookie: jar,
  body: {
    firstName: 'Crudcheck',
    lastName: 'Probe',
    gender: 'MALE',
    ...(firstClass === undefined
      ? {}
      : {
          enrollment: {
            sessionId: setupBody.session.id,
            classLevelId: firstClass.id,
            ...(firstClass.sections[0] === undefined
              ? {}
              : { sectionId: firstClass.sections[0].id }),
          },
        }),
    guardian: { name: 'Probe Guardian', relation: 'FATHER', phone: '+923001234567' },
  },
});
const created = admitted.json()?.data;
check(
  'admission issues a GR number and an Student ID',
  (admitted.status === 200 || admitted.status === 201) &&
    typeof created?.grNo === 'string' &&
    typeof created?.studentCode === 'string',
  created === undefined
    ? JSON.stringify(admitted.json()).slice(0, 300)
    : `GR ${created.grNo} · ${created.studentCode}`,
);

// The new number must not collide with anything already in the register.
check('the new GR number is not already taken', !grSet.has(created?.grNo), created?.grNo ?? '-');

// --- 7. Concurrent admissions get different numbers ------------------------
// Two receptionists clicking Admit at the same instant. If the counter is not
// locked, they get the same number and one insert fails — or worse, both land.
const concurrent = await Promise.all(
  [1, 2, 3, 4].map((n) =>
    call('/api/v1/students', {
      method: 'POST',
      cookie: jar,
      body: { firstName: `Race${String(n)}`, lastName: 'Probe' },
    }),
  ),
);
const raceIds = concurrent.map((response) => response.json()?.data).filter(Boolean);
const raceGr = new Set(raceIds.map((entry) => entry.grNo));
check(
  'four simultaneous admissions get four different GR numbers',
  raceIds.length === 4 && raceGr.size === 4,
  [...raceGr].join(', '),
);

// --- 8. Edit works, and cannot touch the register numbers ------------------
const edited = await call(`/api/v1/students/${created.id}`, {
  method: 'PATCH',
  cookie: jar,
  body: { firstName: 'Crudchecked' },
});
const editedBody = edited.json()?.data;
check(
  'editing a name works and leaves the GR number alone',
  edited.status === 200 &&
    editedBody?.firstName === 'Crudchecked' &&
    editedBody?.grNo === created.grNo,
  `HTTP ${String(edited.status)}`,
);

const smuggleGr = await call(`/api/v1/students/${created.id}`, {
  method: 'PATCH',
  cookie: jar,
  body: { grNo: '9999' },
});
check('a GR number cannot be edited', smuggleGr.status === 400, `HTTP ${String(smuggleGr.status)}`);

// --- 9. Leaving requires a reason ------------------------------------------
// The register has to say why a child left.
const noReason = await call(`/api/v1/students/${created.id}/status`, {
  method: 'POST',
  cookie: jar,
  body: { status: 'LEFT' },
});
check(
  'marking a student as left demands a reason',
  noReason.status === 400 || noReason.status === 422,
  `HTTP ${String(noReason.status)}`,
);

// --- 10. Leaving ends the enrolment in the same breath ---------------------
// Otherwise the child is still on the class list and still being billed.
const left = await call(`/api/v1/students/${created.id}/status`, {
  method: 'POST',
  cookie: jar,
  body: { status: 'LEFT', reason: 'Family moved city' },
});
const leftBody = left.json()?.data;
check(
  'a student who left is removed from their class',
  (left.status === 200 || left.status === 201) &&
    leftBody?.status === 'LEFT' &&
    leftBody?.className === null,
  `status ${leftBody?.status ?? '-'}, class ${String(leftBody?.className)}`,
);

// --- 11. The same status twice is refused ----------------------------------
const repeat = await call(`/api/v1/students/${created.id}/status`, {
  method: 'POST',
  cookie: jar,
  body: { status: 'LEFT', reason: 'Again' },
});
check(
  'setting the same status twice is refused',
  repeat.status === 422,
  `HTTP ${String(repeat.status)}`,
);

// --- 12. Delete needs a reason, and then hides the row ---------------------
const deleteNoReason = await call(`/api/v1/students/${created.id}`, {
  method: 'DELETE',
  cookie: jar,
  body: {},
});
check(
  'deleting demands a reason',
  deleteNoReason.status === 400,
  `HTTP ${String(deleteNoReason.status)}`,
);

const deleted = await call(`/api/v1/students/${created.id}`, {
  method: 'DELETE',
  cookie: jar,
  body: { reason: 'Created in error by the verification script' },
});
check(
  'deleting works',
  deleted.status === 200 || deleted.status === 201,
  `HTTP ${String(deleted.status)}`,
);

const afterDelete = await call(`/api/v1/students/${created.id}`, { cookie: jar });
check(
  'a deleted student is gone from the API',
  afterDelete.status === 404,
  `HTTP ${String(afterDelete.status)}`,
);

// --- 13. …but the row is still there, soft-deleted -------------------------
// A register that forgets a child ever existed is not a register.
const stillThere = await softDeletedRowExists(created.id);
check(
  'the row is soft-deleted, not erased',
  stillThere === true,
  // A string means the check could not be made, and says why. Reporting a
  // connection failure as "not configured" sends the reader to the one place
  // the problem is not.
  typeof stillThere === 'string' ? stillThere : String(stillThere),
);

function softDeletedRowExists(id) {
  return withAdminClient(async (client) => {
    const found = await client.query(
      'SELECT deleted_at, leaving_reason FROM students WHERE id = $1',
      [id],
    );
    return found.rows[0]?.deleted_at !== null && found.rows[0]?.deleted_at !== undefined;
  });
}

// --- Clean up the probes ----------------------------------------------------
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
    // Enrolments and guardian links cascade from the student row.
    const removed = await client.query("DELETE FROM students WHERE last_name = 'Probe'");
    console.error(`\nCleaned up ${String(removed.rowCount ?? 0)} probe student(s).`);
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
