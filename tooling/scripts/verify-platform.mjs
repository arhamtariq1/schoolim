#!/usr/bin/env node
/**
 * Prove the platform console is genuinely separate from the school portal.
 *
 * The console can see every tenant, so the only thing standing between it and
 * a total isolation failure is the boundary between the two token types. This
 * checks that boundary from both directions rather than trusting that a
 * decorator was remembered:
 *
 *   a school token must not reach a platform route,
 *   a platform token must not reach a school route.
 *
 * Also covers the capability model, because "SUPPORT cannot create a school" is
 * only true if the API says so — hiding the button is not enforcement.
 *
 * Run: node tooling/scripts/verify-platform.mjs   (API and both apps running)
 */

import { request as httpRequest } from 'node:http';

import 'dotenv/config';

const API_PORT = Number(process.env.API_PORT ?? 4000);
const ADMIN_PORT = Number(process.env.ADMIN_PORT ?? 3001);
const PASSWORD = 'demo-password-1234';

function call(port, host, path, { method = 'GET', body, cookie } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const headers = { host };
    if (payload !== undefined) {
      headers['content-type'] = 'application/json';
      headers['content-length'] = String(Buffer.byteLength(payload));
    }
    if (cookie !== undefined) {
      headers['cookie'] = cookie;
    }

    const req = httpRequest({ host: '127.0.0.1', port, path, method, headers }, (res) => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => (raw += chunk));
      res.on('end', () => {
        const setCookie = res.headers['set-cookie'] ?? [];
        resolve({
          status: res.statusCode ?? 0,
          setCookie: Array.isArray(setCookie) ? setCookie : [setCookie],
          text: raw,
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

const adminHost = `localhost:${String(ADMIN_PORT)}`;

// --- 1. Platform sign-in works through the console's own origin ------------
const signIn = await call(ADMIN_PORT, adminHost, '/api/v1/platform/auth/login', {
  method: 'POST',
  body: { email: 'platform@ilm.test', password: PASSWORD },
});
check(
  'platform sign-in succeeds',
  signIn.status === 200 || signIn.status === 201,
  `HTTP ${String(signIn.status)}`,
);

const platformToken = /ilm_pat=([^;]+)/.exec(signIn.setCookie.join(';'))?.[1];
const platformJar = platformToken === undefined ? undefined : `ilm_pat=${platformToken}`;

// --- 2. The console uses its own cookie names -----------------------------
// Sharing `ilm_at` with the portal would mean one browser could present a
// school session where a platform one is expected.
const names = signIn.setCookie.map((entry) => String(entry).split('=')[0]);
check(
  'platform cookies are named separately from school cookies',
  names.includes('ilm_pat') && !names.includes('ilm_at'),
  names.join(', ') || 'none',
);

// --- 3. Listing schools works, and shows every tenant ---------------------
const list = await call(ADMIN_PORT, adminHost, '/api/v1/platform/schools?limit=100', {
  cookie: platformJar,
});
const schools = list.json()?.data ?? [];
check(
  'the console lists every school',
  list.status === 200 && schools.length >= 3,
  `${String(schools.length)} schools`,
);

// --- 4. A school token cannot reach a platform route ----------------------
// The direction that matters most: a compromised school owner must not be able
// to walk into the console.
const schoolLogin = await call(API_PORT, 'demo.localhost', '/api/v1/auth/login', {
  method: 'POST',
  body: { identifier: 'owner@demo.test', password: PASSWORD, rememberDevice: false },
});
const schoolToken = /ilm_at=([^;]+)/.exec(schoolLogin.setCookie.join(';'))?.[1];

const asSchool = await call(API_PORT, adminHost, '/api/v1/platform/schools', {
  cookie: `ilm_at=${schoolToken}; ilm_pat=${schoolToken}`,
});
check(
  "a school owner's token cannot list schools",
  asSchool.status === 401,
  `HTTP ${String(asSchool.status)}`,
);

// --- 5. A platform token cannot reach a school route ---------------------
// The console is not a back door into a tenant's records. Reading a student
// requires impersonation, which is consented and audited.
const asPlatform = await call(API_PORT, 'demo.localhost', '/api/v1/students', {
  cookie: `ilm_at=${platformToken}`,
});
check(
  'a platform token cannot read a school’s students',
  asPlatform.status === 401,
  `HTTP ${String(asPlatform.status)}`,
);

// --- 6. No session, no school list ---------------------------------------
const anonymous = await call(ADMIN_PORT, adminHost, '/api/v1/platform/schools');
check(
  'unauthenticated request is rejected',
  anonymous.status === 401,
  `HTTP ${String(anonymous.status)}`,
);

// --- 7. The console proxy refuses non-platform paths ---------------------
// It exists to reach `/api/v1/platform/*` and nothing else.
const wrongNamespace = await call(ADMIN_PORT, adminHost, '/api/v1/students', {
  cookie: platformJar,
});
check(
  'the console proxy refuses tenant endpoints',
  wrongNamespace.status === 404,
  `HTTP ${String(wrongNamespace.status)}`,
);

// --- 8. Reserved slugs cannot become a school's address ------------------
// `api.<domain>` and `admin.<domain>` are real hostnames here.
const reserved = await call(ADMIN_PORT, adminHost, '/api/v1/platform/schools', {
  method: 'POST',
  cookie: platformJar,
  body: {
    name: 'Reserved Test',
    slug: 'api',
    owner: { name: 'Someone', email: 'reserved@test.invalid' },
  },
});
check('a reserved slug is refused', reserved.status === 409, `HTTP ${String(reserved.status)}`);

// --- 9. A duplicate slug is a 409, not a 500 -----------------------------
const duplicate = await call(ADMIN_PORT, adminHost, '/api/v1/platform/schools', {
  method: 'POST',
  cookie: platformJar,
  body: {
    name: 'Duplicate Demo',
    slug: 'demo',
    owner: { name: 'Someone', email: 'dup@test.invalid' },
  },
});
check(
  'a duplicate slug is a conflict, not a crash',
  duplicate.status === 409,
  `HTTP ${String(duplicate.status)}`,
);

// --- 10. Creating a school produces a working tenant ---------------------
// The end-to-end claim: the owner account created here can actually sign in at
// the address the console printed. Anything less is a school nobody can use.
const slug = `probe-${String(schools.length)}${String(Math.abs(hash(signIn.setCookie.join(''))) % 9973)}`;
const created = await call(ADMIN_PORT, adminHost, '/api/v1/platform/schools', {
  method: 'POST',
  cookie: platformJar,
  body: {
    name: 'Verification Probe School',
    slug,
    city: 'Lahore',
    owner: { name: 'Probe Owner', email: `owner@${slug}.invalid` },
  },
});

const result = created.json()?.data;
check(
  'a school can be created',
  (created.status === 200 || created.status === 201) && result?.school?.slug === slug,
  `HTTP ${String(created.status)} ${result?.school?.slug ?? ''}`,
);

if (result !== undefined) {
  const newOwnerLogin = await call(API_PORT, `${slug}.localhost`, '/api/v1/auth/login', {
    method: 'POST',
    body: {
      identifier: result.owner.email,
      password: result.owner.temporaryPassword,
      rememberDevice: false,
    },
  });
  const body = newOwnerLogin.json()?.data;
  check(
    'the new owner can sign in at the new school',
    (newOwnerLogin.status === 200 || newOwnerLogin.status === 201) && body?.school?.slug === slug,
    `HTTP ${String(newOwnerLogin.status)}`,
  );

  // A temporary password must be replaced, not lived with.
  check(
    'the new owner is required to change the password',
    body?.mustChangePassword === true,
    `mustChangePassword=${String(body?.mustChangePassword)}`,
  );

  // A brand-new tenant must start empty. If it does not, it is seeing someone
  // else's rows, which is the failure this whole product must not have.
  const token = /ilm_at=([^;]+)/.exec(newOwnerLogin.setCookie.join(';'))?.[1];
  const students = await call(API_PORT, `${slug}.localhost`, '/api/v1/students', {
    cookie: `ilm_at=${token}`,
  });
  const rows = students.json()?.data ?? [];
  check(
    'a brand-new school starts with no students',
    students.status === 200 && rows.length === 0,
    `${String(rows.length)} rows`,
  );
}

function hash(text) {
  let value = 0;
  for (const character of text) {
    value = (value * 31 + character.charCodeAt(0)) | 0;
  }
  return value;
}

/**
 * Remove the schools this script created.
 *
 * Without it every run leaves a tenant behind, and after a week the console
 * lists forty of them. Runs on the admin connection because there is
 * deliberately no delete-school endpoint — churning a school is a status
 * change, never a row disappearing (docs/19 §4), and a verification script must
 * not be the reason such an endpoint exists.
 */
async function cleanUp() {
  const url = process.env.DATABASE_ADMIN_URL;
  if (url === undefined || url === '') {
    console.error('\n(skipped cleanup: DATABASE_ADMIN_URL is not set)');
    return;
  }

  const { Client } = await import('pg');
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  try {
    await client.connect();
    const deleted = await client.query("DELETE FROM schools WHERE slug LIKE 'probe-%'");
    console.error(`\nCleaned up ${String(deleted.rowCount ?? 0)} probe school(s).`);
  } catch (error) {
    console.error(`\n(cleanup failed: ${String(error.message)})`);
  } finally {
    await client.end().catch(() => undefined);
  }
}

await cleanUp();

const failed = checks.filter((entry) => !entry.passed);
console.error(`\n${String(checks.length - failed.length)}/${String(checks.length)} checks passed`);

if (failed.length > 0) {
  console.error('\nThe platform boundary is broken. Do not deploy.');
  process.exit(1);
}
