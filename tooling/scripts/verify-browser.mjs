#!/usr/bin/env node
/**
 * Prove the product works **the way a browser uses it**.
 *
 * `verify-isolation.mjs` talks straight to the API on its own port. That is the
 * right test for the guard chain, and it passed while sign-in was completely
 * broken in Chrome: the form posted to a relative path that resolved to the
 * portal, which answered 404, and a correct password rendered as "could not
 * sign you in". Every test hit a wire the browser never touches.
 *
 * So this one touches only the wires the browser does — port 3000, the school's
 * own hostname, cookies carried the way a browser carries them, and the HTML
 * that actually comes back.
 *
 * Run: node tooling/scripts/verify-browser.mjs   (API and portal both running)
 */

import { request as httpRequest } from 'node:http';

import './lib/load-env.mjs';

const PORT = Number(process.env.PORTAL_PORT ?? 3000);
const PASSWORD = 'demo-password-1234';

/**
 * `node:http` rather than `fetch`, for the same reason as verify-isolation:
 * `Host` is forbidden in the Fetch spec and undici strips it, and Node cannot
 * resolve `*.localhost` on Windows. Here it matters twice over, because the
 * Host header is the entire tenant signal on this path.
 */
function call(host, path, { method = 'GET', body, cookie } = {}) {
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

    const req = httpRequest({ host: '127.0.0.1', port: PORT, path, method, headers }, (res) => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => (raw += chunk));
      res.on('end', () => {
        const setCookie = res.headers['set-cookie'] ?? [];
        resolve({
          status: res.statusCode ?? 0,
          headers: res.headers,
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

const demoHost = `demo.localhost:${String(PORT)}`;
const beaconHost = `beacon.localhost:${String(PORT)}`;
const apexHost = `localhost:${String(PORT)}`;

// --- 1. The sign-in page renders a form on a school host -------------------
const loginPage = await call(demoHost, '/login');
check(
  'login page renders on a school host',
  loginPage.status === 200 && loginPage.text.includes('Sign in to demo'),
  `HTTP ${String(loginPage.status)}`,
);

// --- 2. The apex sign-in page asks for two things, and names no school ------
// It offers the same form as a school host (ADR-0009) — what it must never do
// is enumerate tenants, which is what a picker before the password would be.
const apexPage = await call(apexHost, '/login');
const namesAnyone = ['demo', 'beacon', 'city'].filter(
  (slug) => apexPage.text.includes(`>${slug}<`) || apexPage.text.includes(`"${slug}"`),
);
check(
  'apex login page does not enumerate schools',
  apexPage.status === 200 && namesAnyone.length === 0,
  namesAnyone.length === 0 ? 'no slugs in HTML' : `leaked: ${namesAnyone.join(', ')}`,
);
check(
  'apex login page asks for a password, not a school name',
  apexPage.text.includes('name="password"') && !apexPage.text.includes('Know your school'),
  'email + password only',
);

// --- 2b. The apex is a public website, the school host is not ---------------
const landing = await call(apexHost, '/');
check(
  'apex / renders the landing page with packages',
  landing.status === 200 && landing.text.includes('Packages'),
  `HTTP ${String(landing.status)}`,
);

const signupPage = await call(apexHost, '/signup');
check(
  'apex /signup renders the school setup form',
  signupPage.status === 200 && signupPage.text.includes('Set up your school'),
  `HTTP ${String(signupPage.status)}`,
);

const signupOnSchoolHost = await call(demoHost, '/signup');
check(
  'a school host has no signup form',
  signupOnSchoolHost.status >= 300 && signupOnSchoolHost.status < 400,
  `HTTP ${String(signupOnSchoolHost.status)} → ${String(signupOnSchoolHost.headers.location)}`,
);

// --- 3. Sign-in works from the browser's own origin ------------------------
// The one this whole file exists for.
const signIn = await call(demoHost, '/api/v1/auth/login', {
  method: 'POST',
  body: { identifier: 'owner@demo.test', password: PASSWORD, rememberDevice: false },
});
check(
  'sign-in succeeds through the portal origin',
  signIn.status === 200 || signIn.status === 201,
  `HTTP ${String(signIn.status)}${signIn.status === 404 ? ' — the browser has nothing to post to' : ''}`,
);

// --- 4. Both cookies survive the hop ---------------------------------------
// One joined `set-cookie` header silently loses the refresh token, and the
// symptom is a session that dies fifteen minutes later.
const cookieNames = signIn.setCookie.map((entry) => String(entry).split('=')[0]);
check(
  'access and refresh cookies are both set',
  cookieNames.includes('ilm_at') && cookieNames.includes('ilm_rt'),
  cookieNames.join(', ') || 'none',
);

// --- 5. The session cookie is host-only ------------------------------------
// A `Domain=` attribute would share one school's token with every other
// school's hostname. Host-only means Beacon's browser never receives it.
const withDomain = signIn.setCookie.filter((entry) => /;\s*domain=/i.test(String(entry)));
check(
  'session cookies are host-only (no Domain attribute)',
  withDomain.length === 0,
  withDomain.length === 0 ? 'scoped to demo.localhost' : withDomain.join(' | '),
);

const accessToken = /ilm_at=([^;]+)/.exec(signIn.setCookie.join(';'))?.[1];
const jar = accessToken === undefined ? undefined : `ilm_at=${accessToken}`;

// --- 6. A signed-in page renders that school's real rows -------------------
const students = await call(demoHost, '/students', { cookie: jar });
check(
  'students page renders real rows',
  students.status === 200 && students.text.includes('2026-0001'),
  `HTTP ${String(students.status)}`,
);

// --- 7. …and none of another school's -------------------------------------
// Seeded surnames are disjoint per school precisely so this is checkable.
const foreign = ['Qureshi', 'Siddiqui', 'Ansari', 'Rizvi', 'Abbasi', 'Gilani', 'Kayani'].filter(
  (name) => students.text.includes(name),
);
check(
  "students page shows no other school's families",
  foreign.length === 0,
  foreign.length === 0 ? 'clean' : `LEAKED: ${foreign.join(', ')}`,
);

// --- 8. The same cookie is worthless on another school's host --------------
// The browser would not send it there at all; this proves that even if it did,
// the answer is still no.
const crossTenant = await call(beaconHost, '/api/v1/auth/session', { cookie: jar });
check(
  "demo's cookie is rejected on beacon's host",
  crossTenant.status === 401,
  `HTTP ${String(crossTenant.status)}`,
);

// --- 9. A wrong password fails, and leaves nothing behind ------------------
const wrong = await call(demoHost, '/api/v1/auth/login', {
  method: 'POST',
  body: { identifier: 'owner@demo.test', password: 'not-the-password', rememberDevice: false },
});
check(
  'a wrong password is rejected with no cookie',
  wrong.status === 401 && !wrong.setCookie.join(';').includes('ilm_at='),
  `HTTP ${String(wrong.status)}`,
);

// --- 10. A real password on the apex host resolves the school --------------
// ADR-0009. No school in the address, so the school comes out of the
// credentials — and the answer is a handoff, never a session, because a cookie
// set here would be a cookie for the wrong host.
const apexLogin = await call(apexHost, '/api/v1/auth/login', {
  method: 'POST',
  body: { identifier: 'owner@demo.test', password: PASSWORD, rememberDevice: false },
});
const apexOutcome = apexLogin.json()?.data;
check(
  'a valid password at the apex resolves the school',
  (apexLogin.status === 200 || apexLogin.status === 201) &&
    apexOutcome?.kind === 'handoff' &&
    apexOutcome.choices?.length === 1 &&
    String(apexOutcome.choices[0].continueUrl).includes('demo.localhost'),
  apexOutcome?.kind === 'handoff'
    ? String(apexOutcome.choices?.[0]?.slug)
    : `HTTP ${String(apexLogin.status)}`,
);
check(
  'the apex sets no session cookie',
  !apexLogin.setCookie.join(';').includes('ilm_at='),
  apexLogin.setCookie.length === 0 ? 'none' : apexLogin.setCookie.join(' | '),
);

// --- 10b. A wrong password at the apex says nothing about who exists --------
const apexWrong = await call(apexHost, '/api/v1/auth/login', {
  method: 'POST',
  body: { identifier: 'owner@demo.test', password: 'not-the-password', rememberDevice: false },
});
const apexStranger = await call(apexHost, '/api/v1/auth/login', {
  method: 'POST',
  body: { identifier: 'nobody@nowhere.test', password: 'not-the-password', rememberDevice: false },
});
check(
  'a registered and an unregistered address fail identically at the apex',
  apexWrong.status === apexStranger.status &&
    apexWrong.json()?.detail === apexStranger.json()?.detail,
  `both HTTP ${String(apexWrong.status)}`,
);

// --- 10c. The handoff completes on the school's own host --------------------
// The half of ADR-0009 that only a browser exercises: follow the URL, land on
// demo.localhost, and come away with the cookies the apex could not set.
const handoffPath = new URL(String(apexOutcome?.choices?.[0]?.continueUrl ?? 'http://x/')).pathname;
const handoffQuery = new URL(String(apexOutcome?.choices?.[0]?.continueUrl ?? 'http://x/')).search;
const continued = await call(demoHost, `${handoffPath}${handoffQuery}`);
check(
  'the handoff issues cookies on the school host and redirects in',
  continued.status === 303 &&
    continued.headers.location === '/' &&
    continued.setCookie.join(';').includes('ilm_at='),
  `HTTP ${String(continued.status)} → ${String(continued.headers.location)}`,
);

// --- 10e. The confirmation link is a route, not a session -------------------
// ADR-0012. A bad token must land back on the portal with a result, never on a
// stack trace, and it must not leak into the next page's referrer.
const badVerify = await call(demoHost, '/verify-email?t=not-a-real-token');
check(
  'a bad confirmation link redirects with a result, and no referrer',
  badVerify.status === 303 &&
    String(badVerify.headers.location).includes('verify=failed') &&
    badVerify.headers['referrer-policy'] === 'no-referrer',
  `HTTP ${String(badVerify.status)} → ${String(badVerify.headers.location)}`,
);

// --- 10d. …and only once ----------------------------------------------------
const replayed = await call(demoHost, `${handoffPath}${handoffQuery}`);
check(
  'the same handoff link cannot be used twice',
  replayed.status === 303 && String(replayed.headers.location).includes('/login'),
  `HTTP ${String(replayed.status)} → ${String(replayed.headers.location)}`,
);

// --- 11. The proxy ignores a caller-supplied tenant hint -------------------
// `x-school-slug` is trusted by the API. It must be derived from the Host, not
// copied from whatever the caller sent.
const smuggled = await call(demoHost, '/api/v1/auth/session', {
  cookie: jar,
  method: 'GET',
});
const smuggledDirect = await new Promise((resolve, reject) => {
  const req = httpRequest(
    {
      host: '127.0.0.1',
      port: PORT,
      path: '/api/v1/auth/session',
      method: 'GET',
      headers: { host: beaconHost, cookie: jar ?? '', 'x-school-slug': 'demo' },
    },
    (res) => {
      res.resume();
      res.on('end', () => resolve({ status: res.statusCode ?? 0 }));
    },
  );
  req.on('error', reject);
  req.end();
});
check(
  'a spoofed x-school-slug header is ignored',
  smuggled.status === 200 && smuggledDirect.status === 401,
  `own host ${String(smuggled.status)}, spoofed ${String(smuggledDirect.status)}`,
);

const failed = checks.filter((entry) => !entry.passed);
console.error(`\n${String(checks.length - failed.length)}/${String(checks.length)} checks passed`);

if (failed.length > 0) {
  console.error('\nThe browser path is broken. Signing in will not work in Chrome.');
  process.exit(1);
}
