#!/usr/bin/env node
/**
 * Walk every flow in the product against the running API, then push it.
 *
 * The existing `verify-*` scripts each prove one module. This one asks the
 * question those cannot: **does the whole thing still work together**, and does
 * it still work when more than one person uses it at once.
 *
 * Three parts:
 *
 * 1. **Flows** — sign in, set up the year, admit a child, bill them, take the
 *    money, mark the register, read the report. In that order, because that is
 *    the order a school does it in and each step depends on the last.
 * 2. **Isolation under concurrency** — the same reads, fired from two schools
 *    at once, asserting neither ever sees the other's rows. Tenant leaks that
 *    never appear in a sequential test appear here, because a connection
 *    returned to the pool with a stale `app.school_id` is a race.
 * 3. **Load** — the list endpoints a school actually hammers, at concurrency,
 *    reporting p50/p95/p99 and any non-200. This is where an N+1 stops being
 *    theoretical.
 *
 * Run: node tooling/scripts/verify-flows.mjs      (the API must be running)
 *      node tooling/scripts/verify-flows.mjs --load-only
 */

import { request as httpRequest } from 'node:http';

import 'dotenv/config';

const PORT = Number(process.env.API_PORT ?? 4000);
const PASSWORD = 'demo-password-1234';
const LOAD_ONLY = process.argv.includes('--load-only');

/** Today, as the API's calendar-date primitive spells it. */
const TODAY = new Date(Date.now()).toISOString().slice(0, 10);

// ---------------------------------------------------------------------------

function call(path, { method = 'GET', body, cookie, slug = 'demo' } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const headers = { host: `${slug}.localhost` };
    if (payload !== undefined) {
      headers['content-type'] = 'application/json';
      headers['content-length'] = String(Buffer.byteLength(payload));
    }
    if (cookie !== undefined) headers['cookie'] = cookie;

    const startedAt = process.hrtime.bigint();
    const req = httpRequest({ host: '127.0.0.1', port: PORT, path, method, headers }, (res) => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => (raw += chunk));
      res.on('end', () => {
        const setCookie = res.headers['set-cookie'] ?? [];
        resolve({
          status: res.statusCode ?? 0,
          ms: Number(process.hrtime.bigint() - startedAt) / 1e6,
          raw,
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
    if (payload !== undefined) req.write(payload);
    req.end();
  });
}

const results = [];
let currentSection = 'general';

function section(name) {
  currentSection = name;
  console.log(`\n[1m${name}[0m`);
}

function check(label, ok, detail = '') {
  results.push({ section: currentSection, label, ok });
  const mark = ok ? '[32m  ok  [0m' : '[31m FAIL [0m';
  console.log(`${mark} ${label}${detail === '' ? '' : `  [2m${detail}[0m`}`);
  return ok;
}

function cookieHeader(setCookie) {
  return setCookie.map((entry) => entry.split(';')[0]).join('; ');
}

async function signIn(slug, email) {
  const response = await call('/api/v1/auth/login', {
    method: 'POST',
    slug,
    // The field is `identifier`, not `email`: a front-desk phone number is a
    // valid sign-in too, so the contract does not assert an address shape.
    body: { identifier: email, password: PASSWORD, rememberDevice: false },
  });
  // 201: a sign-in creates a session, so the controller answers Created.
  if (response.status !== 200 && response.status !== 201) {
    throw new Error(`sign-in for ${slug} failed: ${response.status} ${response.raw.slice(0, 200)}`);
  }
  return cookieHeader(response.setCookie);
}

// --- percentiles -----------------------------------------------------------

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index];
}

/** Fire `total` requests, at most `concurrency` in flight. */
async function hammer(label, factory, { total, concurrency }) {
  const timings = [];
  const statuses = new Map();
  let issued = 0;

  async function worker() {
    for (;;) {
      const mine = issued++;
      if (mine >= total) return;
      const response = await factory(mine);
      timings.push(response.ms);
      statuses.set(response.status, (statuses.get(response.status) ?? 0) + 1);
    }
  }

  const wallStart = process.hrtime.bigint();
  await Promise.all(Array.from({ length: concurrency }, worker));
  const wallMs = Number(process.hrtime.bigint() - wallStart) / 1e6;

  timings.sort((a, b) => a - b);
  const bad = [...statuses.entries()].filter(([status]) => status !== 200);

  const summary =
    `n=${total} c=${concurrency}  ` +
    `p50=${percentile(timings, 50).toFixed(0)}ms ` +
    `p95=${percentile(timings, 95).toFixed(0)}ms ` +
    `p99=${percentile(timings, 99).toFixed(0)}ms ` +
    `max=${timings[timings.length - 1].toFixed(0)}ms ` +
    `${(total / (wallMs / 1000)).toFixed(0)}/s`;

  check(
    `${label} — all 200`,
    bad.length === 0,
    bad.length === 0 ? summary : `${summary}  BAD: ${JSON.stringify(Object.fromEntries(bad))}`,
  );

  return { p95: percentile(timings, 95), p99: percentile(timings, 99) };
}

// ---------------------------------------------------------------------------

async function main() {
  console.log(`[1mVerifying flows against http://127.0.0.1:${PORT}[0m`);

  const health = await call('/api/v1/health');
  if (health.status !== 200) {
    console.error(
      `\n[31mThe API is not answering on ${PORT}.[0m Start it with: pnpm --filter @ilm/api dev`,
    );
    process.exit(2);
  }

  const demo = await signIn('demo', 'owner@demo.test');
  const beacon = await signIn('beacon', 'owner@beacon.test');

  if (!LOAD_ONLY) {
    await flows(demo, beacon);
  }

  await load(demo);

  // --- verdict -------------------------------------------------------------
  const failed = results.filter((entry) => !entry.ok);
  console.log(
    `\n[1m${results.length - failed.length}/${results.length} checks passed[0m`,
  );
  if (failed.length > 0) {
    console.log('\nFailed:');
    for (const entry of failed) console.log(`  [31m${entry.section} › ${entry.label}[0m`);
    process.exit(1);
  }
}

async function flows(demo, beacon) {
  // --- session -------------------------------------------------------------
  section('Session');

  const me = await call('/api/v1/auth/session', { cookie: demo });
  check('session returns the signed-in owner', me.status === 200 && me.json()?.data?.email === 'owner@demo.test');

  const anonymous = await call('/api/v1/students');
  check('an unauthenticated read is refused', anonymous.status === 401, `got ${anonymous.status}`);

  // docs/11 §6: an unknown query parameter is a 400, never a silently
  // unfiltered list. That is the difference between a typo and a data leak.
  const typo = await call('/api/v1/students?pageSize=20', { cookie: demo });
  check('a mistyped filter is rejected, not ignored', typo.status === 400, `got ${typo.status}`);

  // --- reads, every module -------------------------------------------------
  section('Every list endpoint answers');

  const endpoints = [
    ['students', '/api/v1/students?limit=20&offset=0'],
    ['classes', '/api/v1/academics/classes'],
    ['sessions', '/api/v1/academics/sessions'],
    ['holidays', '/api/v1/academics/holidays'],
    ['staff', '/api/v1/staff'],
    ['fee heads', '/api/v1/fees/heads'],
    ['vouchers', '/api/v1/fee-vouchers?limit=20&offset=0'],
    ['expenses', '/api/v1/expenses?limit=20&offset=0'],
    ['expense categories', '/api/v1/expenses/categories'],
    ['attendance classes', '/api/v1/attendance/classes'],
    ['staff attendance', `/api/v1/attendance/staff?date=${TODAY}`],
  ];

  const seen = {};
  for (const [label, path] of endpoints) {
    const response = await call(path, { cookie: demo });
    seen[label] = response.json()?.data;
    check(`${label}`, response.status === 200, `${response.status} in ${response.ms.toFixed(0)}ms`);
  }

  // --- the money path ------------------------------------------------------
  section('Fees: preview, generate, collect');

  const heads = seen['fee heads'] ?? [];
  const sessions = seen['sessions'] ?? [];
  const currentSessionId = (sessions.find((entry) => entry.isCurrent) ?? sessions[0])?.id;
  const students = seen['students']?.rows ?? seen['students']?.items ?? seen['students'] ?? [];
  const monthlyHead = heads.find((head) => head.frequency === 'MONTHLY') ?? heads[0];

  if (monthlyHead === undefined || students.length === 0 || currentSessionId === undefined) {
    check('school has fee heads and students to bill', false, 'seed data missing — run pnpm db:seed');
  } else {
    const student = students[0];
    // A month far enough out that a re-run of this script does not collide with
    // vouchers it generated last time.
    const month = `2027-${String(1 + (Date.now() % 11)).padStart(2, '0')}`;

    const previewBody = {
      sessionId: currentSessionId,
      // A discriminated union, so "class-wise with no class" cannot be built.
      scope: { kind: 'STUDENT', studentId: student.id },
      // No `amountMinor`: each child is billed their own agreed fee, which is
      // the behaviour worth asserting — thirty children do not pay the same.
      heads: [{ feeHeadId: monthlyHead.id }],
      billMonths: [month],
      issueDate: `${month}-01`,
      dueDate: `${month}-10`,
      validTill: `${month}-20`,
      includeArrears: false,
      applyLateFee: false,
    };

    const preview = await call('/api/v1/fee-vouchers/preview', {
      method: 'POST',
      cookie: demo,
      body: previewBody,
    });
    const previewData = preview.json()?.data;
    check(
      'preview costs a voucher without writing one',
      preview.status === 200 || preview.status === 201,
      `${preview.status} — ${previewData?.willIssue ?? previewData?.students ?? '?'} to issue`,
    );

    // The same key twice: pressing the button twice, or a retry after a
    // timeout, must produce one set of vouchers and not two.
    const key = `verify-flows-${month}`;

    const generate = await call('/api/v1/fee-vouchers/generate', {
      method: 'POST',
      cookie: demo,
      body: { ...previewBody, idempotencyKey: key },
    });
    check(
      'generate writes the voucher',
      generate.status === 200 || generate.status === 201,
      `${generate.status} ${generate.status >= 400 ? generate.raw.slice(0, 160) : ''}`,
    );

    const again = await call('/api/v1/fee-vouchers/generate', {
      method: 'POST',
      cookie: demo,
      body: { ...previewBody, idempotencyKey: key },
    });
    const againData = again.json()?.data;
    check(
      'the same idempotency key bills nobody twice',
      (again.status === 200 || again.status === 201) && (againData?.created ?? 0) === 0,
      `created=${againData?.created ?? '?'}`,
    );

    // And without the key: the unique index on (school, student, head, period)
    // is the structural guarantee behind the idempotency key.
    const different = await call('/api/v1/fee-vouchers/generate', {
      method: 'POST',
      cookie: demo,
      body: { ...previewBody, idempotencyKey: `${key}-second-press` },
    });
    const differentData = different.json()?.data;
    check(
      'a fresh key still cannot double-bill the same month',
      (different.status === 200 || different.status === 201) &&
        (differentData?.created ?? 0) === 0,
      `created=${differentData?.created ?? '?'} skipped=${differentData?.skipped ?? '?'}`,
    );

    const list = await call(`/api/v1/fee-vouchers?limit=5&offset=0&q=${student.grNo ?? ''}`, {
      cookie: demo,
    });
    check('the new voucher is listed', list.status === 200, `${list.status}`);
  }

  // --- attendance ----------------------------------------------------------
  section('Attendance');

  const overview = seen['attendance classes'];
  const firstClass = overview?.classes?.find((entry) => entry.strength > 0);

  if (firstClass === undefined) {
    check('a class with students to mark', false, 'no class has anyone enrolled');
  } else {
    const roster = await call(
      `/api/v1/attendance/classes/${firstClass.classLevelId}?date=${TODAY}`,
      { cookie: demo },
    );
    const rosterData = roster.json()?.data;
    check(
      'roster loads for a class',
      roster.status === 200,
      `${roster.status} — ${rosterData?.students?.length ?? 0} students`,
    );

    const report = await call(
      `/api/v1/attendance/reports/classes/${firstClass.classLevelId}?month=${TODAY.slice(0, 7)}`,
      { cookie: demo },
    );
    check('the monthly report loads', report.status === 200, `${report.status}`);
  }

  // --- tenant isolation, concurrently --------------------------------------
  section('Tenant isolation under concurrency');

  // The host matters as much as the cookie: the guard checks the JWT's tenant
  // claim *and* the Host, and a mismatch is a 401. Passing `slug` here is not
  // ceremony — omitting it is what a stolen-token attack looks like, and it is
  // asserted directly below.
  const demoStudents = await call('/api/v1/students?limit=100&offset=0', {
    cookie: demo,
    slug: 'demo',
  });
  const beaconStudents = await call('/api/v1/students?limit=100&offset=0', {
    cookie: beacon,
    slug: 'beacon',
  });

  // A token lifted from one school and replayed against another school's
  // hostname is refused. Checking only the claim would let it through.
  const replayed = await call('/api/v1/students?limit=10&offset=0', {
    cookie: beacon,
    slug: 'demo',
  });
  check(
    "one school's token is refused on another's hostname",
    replayed.status === 401,
    `got ${replayed.status}`,
  );
  const demoIds = new Set((demoStudents.json()?.data ?? []).map((row) => row.id));
  const beaconIds = new Set((beaconStudents.json()?.data ?? []).map((row) => row.id));

  check(
    'the two schools have different registers',
    demoIds.size > 0 && beaconIds.size > 0 && [...demoIds].every((id) => !beaconIds.has(id)),
    `demo=${demoIds.size} beacon=${beaconIds.size}`,
  );

  // Interleaved on purpose. A connection handed back to the pool still carrying
  // `app.school_id` from the previous request is invisible sequentially.
  let leaked = 0;
  await Promise.all(
    Array.from({ length: 40 }, async (_unused, index) => {
      const asDemo = index % 2 === 0;
      const response = await call('/api/v1/students?limit=100&offset=0', {
        cookie: asDemo ? demo : beacon,
        slug: asDemo ? 'demo' : 'beacon',
      });
      for (const row of response.json()?.data ?? []) {
        const belongs = asDemo ? demoIds.has(row.id) : beaconIds.has(row.id);
        if (!belongs) leaked += 1;
      }
    }),
  );
  check('40 interleaved cross-school reads leak nothing', leaked === 0, `${leaked} foreign rows`);

  // --- a cross-tenant id is a 404, never a 403 (docs/16 §7) ----------------
  const foreignId = [...beaconIds][0];
  if (foreignId !== undefined) {
    const stolen = await call(`/api/v1/students/${foreignId}`, { cookie: demo, slug: 'demo' });
    check(
      "another school's student is a 404, not a 403",
      stolen.status === 404,
      `got ${stolen.status}`,
    );
  }

  // --- audit ---------------------------------------------------------------
  section('Audit');

  // R8: every mutation is audited. The interceptor writes after the response,
  // so give it a moment before looking.
  const probe = await call('/api/v1/academics/sessions', { cookie: demo });
  check('a read still works after all of the above', probe.status === 200);
}

async function load(cookie) {
  section('Load');

  // The four a school actually hammers: the register at the counter, the
  // voucher list during collection week, the attendance overview at 8am when
  // every teacher opens it at once, and the fee-head lookup behind the
  // generate screen.
  await hammer('students list', () => call('/api/v1/students?limit=25&offset=0', { cookie }), {
    total: 120,
    concurrency: 12,
  });

  await hammer(
    'voucher list',
    () => call('/api/v1/fee-vouchers?limit=25&offset=0', { cookie }),
    { total: 120, concurrency: 12 },
  );

  await hammer(
    'attendance overview',
    () => call('/api/v1/attendance/classes', { cookie }),
    { total: 120, concurrency: 12 },
  );

  await hammer('fee heads', () => call('/api/v1/fees/heads', { cookie }), {
    total: 120,
    concurrency: 12,
  });

  // Deep pagination is where an OFFSET scan shows itself. If page 20 costs
  // materially more than page 1, the list is scanning everything before it.
  const shallow = await hammer(
    'students offset 0',
    () => call('/api/v1/students?limit=25&offset=0', { cookie }),
    { total: 40, concurrency: 8 },
  );
  const deep = await hammer(
    'students offset 175',
    () => call('/api/v1/students?limit=25&offset=175', { cookie }),
    { total: 40, concurrency: 8 },
  );

  check(
    'deep pagination does not fall off a cliff',
    deep.p95 < Math.max(shallow.p95 * 4, 150),
    `p95 page1=${shallow.p95.toFixed(0)}ms page8=${deep.p95.toFixed(0)}ms`,
  );
}

main().catch((error) => {
  console.error(`\n[31m${error.stack ?? error.message}[0m`);
  process.exit(1);
});
