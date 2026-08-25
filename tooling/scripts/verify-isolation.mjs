#!/usr/bin/env node
/**
 * Prove tenant isolation **through the running API**, with real seeded data.
 *
 * The isolation suite in `@ilm/db` proves it at the database layer. This proves
 * it end to end: sign in as each school's owner and confirm the API returns
 * that school's students and none of anyone else's — over HTTP, through the
 * whole guard chain, exactly as a browser would.
 *
 * The two are not redundant. A database can be perfectly isolated while a
 * controller leaks by trusting an id from the path, and this is the layer where
 * that shows up.
 *
 * Uses `node:http` rather than `fetch` for one specific reason: the tenant comes
 * from the Host header, and `Host` is a forbidden header in the Fetch spec —
 * undici strips it silently. Putting the subdomain in the URL instead does not
 * work either, because Node resolves `*.localhost` through the OS, which on
 * Windows does not map it. `node:http` lets the header be set explicitly while
 * still connecting to 127.0.0.1.
 *
 * Run: node tooling/scripts/verify-isolation.mjs   (the API must be running)
 */

import { request as httpRequest } from 'node:http';

import 'dotenv/config';

const PORT = Number(process.env.API_PORT ?? 4000);
const PASSWORD = 'demo-password-1234';

const SCHOOLS = [
  { slug: 'demo', email: 'owner@demo.test' },
  { slug: 'beacon', email: 'owner@beacon.test' },
  { slug: 'city', email: 'owner@city.test' },
];

/** One request, with the Host header we actually want. */
function call(slug, path, { method = 'GET', body, cookie } = {}) {
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
        resolve({
          status: res.statusCode ?? 0,
          headers: res.headers,
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

async function signIn(slug, email) {
  const response = await call(slug, '/api/v1/auth/login', {
    method: 'POST',
    body: { identifier: email, password: PASSWORD },
  });
  if (response.status !== 201 && response.status !== 200) {
    throw new Error(`sign-in failed for ${slug}: HTTP ${String(response.status)}`);
  }
  const raw = response.headers['set-cookie'] ?? [];
  const token = /ilm_at=([^;]+)/.exec(Array.isArray(raw) ? raw.join(';') : String(raw))?.[1];
  if (token === undefined) {
    throw new Error(`no access cookie for ${slug}`);
  }
  return token;
}

const sessions = new Map();

for (const school of SCHOOLS) {
  const token = await signIn(school.slug, school.email);
  const response = await call(school.slug, '/api/v1/students?limit=200', {
    cookie: `ilm_at=${token}`,
  });
  const body = response.json();
  sessions.set(school.slug, {
    token,
    ids: (body?.data ?? []).map((student) => student.id),
    names: (body?.data ?? []).map((student) => `${student.firstName} ${student.lastName}`),
  });
}

// --- 1. Each school sees its own students ----------------------------------
for (const [slug, data] of sessions) {
  check(
    `${slug} sees its own students`,
    data.ids.length > 0,
    `${String(data.ids.length)}: ${data.names.slice(0, 3).join(', ')}…`,
  );
}

// --- 2. No student is visible to two schools -------------------------------
// The strongest single assertion here: a shared id means one school is reading
// another's rows.
const owners = new Map();
let overlaps = 0;
for (const [slug, data] of sessions) {
  for (const id of data.ids) {
    const existing = owners.get(id);
    if (existing !== undefined && existing !== slug) {
      overlaps += 1;
      console.error(`  LEAK: student ${id} visible to both ${existing} and ${slug}`);
    }
    owners.set(id, slug);
  }
}
check('no student is visible to two schools', overlaps === 0, `${String(owners.size)} distinct`);

// --- 3. A token from one school is rejected on another's host --------------
// This is what makes a stolen token useless anywhere but its own school.
for (const [slug, data] of sessions) {
  for (const other of SCHOOLS) {
    if (other.slug === slug) {
      continue;
    }
    const response = await call(other.slug, '/api/v1/students', {
      cookie: `ilm_at=${data.token}`,
    });
    check(
      `${slug} token rejected on ${other.slug}`,
      response.status === 401,
      `HTTP ${String(response.status)}`,
    );
  }
}

// --- 4. Another school's student by id is 404, never 403 -------------------
// A 403 would confirm the record exists, which is itself a leak.
const entries = [...sessions.entries()];
for (const [slug, data] of entries) {
  const other = entries.find(([otherSlug]) => otherSlug !== slug);
  const foreignId = other?.[1].ids[0];
  if (foreignId === undefined) {
    continue;
  }
  const response = await call(slug, `/api/v1/students/${foreignId}`, {
    cookie: `ilm_at=${data.token}`,
  });
  check(
    `${slug} gets 404 (not 403) for ${String(other?.[0])}'s student`,
    response.status === 404,
    `HTTP ${String(response.status)}`,
  );
}

// --- 5. No session, no data ------------------------------------------------
const anonymous = await call('demo', '/api/v1/students');
check(
  'unauthenticated request is rejected',
  anonymous.status === 401,
  `HTTP ${String(anonymous.status)}`,
);

// --- 6. A forged token is rejected -----------------------------------------
const forged = await call('demo', '/api/v1/students', { cookie: 'ilm_at=not.a.real.token' });
check('forged token is rejected', forged.status === 401, `HTTP ${String(forged.status)}`);

const failed = checks.filter((entry) => !entry.passed);
console.error(`\n${String(checks.length - failed.length)}/${String(checks.length)} checks passed`);

if (failed.length > 0) {
  console.error('\nTENANT ISOLATION IS BROKEN. Do not deploy.');
  process.exit(1);
}
