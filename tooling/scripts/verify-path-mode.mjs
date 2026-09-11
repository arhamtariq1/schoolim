#!/usr/bin/env node
/**
 * Drive single-host path mode end to end, the way a person would.
 *
 * Only meaningful when BOTH sides are in path mode:
 *
 *   PORTAL_TENANT_MODE=path             on the API
 *   NEXT_PUBLIC_PORTAL_TENANT_MODE=path on the portal, AT BUILD TIME
 *
 * Run: node tooling/scripts/verify-path-mode.mjs
 *      PORTAL_PORT=3100 API_PORT=4100 node tooling/scripts/verify-path-mode.mjs
 *
 * See docs/SINGLE-HOST-MODE.md.
 *
 * Not "the pages return 200". The things that actually break when the school
 * moves from the hostname into the path: sign-in landing on the marketing page,
 * the sidebar linking to unprefixed paths that 404, one school's URL serving
 * another school's data, and a signed-out session leaving the school cookie
 * behind so the next person is dropped back into it.
 */
import { request as httpRequest } from 'node:http';

import 'dotenv/config';

const PORTAL = Number(process.env.PORTAL_PORT ?? 3000);
const API = Number(process.env.API_PORT ?? 4000);
const HOST = 'localhost:' + PORTAL;

function req(port, path, { method = 'GET', body, cookie, host, headers: extra } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const headers = { host: host ?? HOST, ...extra };
    if (payload !== undefined) {
      headers['content-type'] = 'application/json';
      headers['content-length'] = Buffer.byteLength(payload);
    }
    if (cookie) headers.cookie = cookie;
    const r = httpRequest({ host: '127.0.0.1', port, path, method, headers }, (res) => {
      let d = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (d += c));
      res.on('end', () =>
        resolve({
          status: res.statusCode,
          body: d,
          location: res.headers.location,
          setCookie: res.headers['set-cookie'] || [],
        }),
      );
    });
    r.on('error', reject);
    if (payload !== undefined) r.write(payload);
    r.end();
  });
}

const results = [];
function check(label, ok, detail = '') {
  results.push({ label, ok });
  console.log(
    `${ok ? '\x1b[32m  ok  \x1b[0m' : '\x1b[31m FAIL \x1b[0m'}${label}${detail ? `  \x1b[2m${detail}\x1b[0m` : ''}`,
  );
}

function jar(cookies) {
  return cookies.map((c) => c.split(';')[0]).filter((c) => !/=$/.test(c)).join('; ');
}

const SLUG = 'beacon';
const PAGES = [
  '',
  '/students',
  '/students/new',
  '/fees/vouchers',
  '/fees/generate',
  '/attendance/mark/students',
  '/attendance/mark/teachers',
  '/attendance/reports/students',
  '/attendance/reports/teachers',
  '/academics',
  '/academics/sessions',
  '/academics/holidays',
  '/staff',
  '/finance/expenses',
  '/finance/expense-types',
  '/settings',
  '/settings/fees',
  '/requests',
];

(async () => {
  console.log('\n\x1b[1mThe apex still belongs to nobody\x1b[0m');

  const landing = await req(PORTAL, '/');
  check(
    'the bare host is the marketing page, not a school',
    landing.status === 200 && /Run the whole school/.test(landing.body),
    `${landing.status}`,
  );

  const login = await req(PORTAL, '/login');
  check('sign-in is reachable unprefixed', login.status === 200, `${login.status}`);

  console.log('\n\x1b[1mSigning in\x1b[0m');

  // Straight at the API, the way the portal's own proxy does it.
  const auth = await req(API, '/api/v1/auth/login', {
    method: 'POST',
    host: 'localhost',
    body: { identifier: `owner@${SLUG}.test`, password: 'demo-password-1234', rememberDevice: false },
  });
  const payload = JSON.parse(auth.body).data;
  // { kind: 'handoff', choices: [{ slug, continueUrl }] } — one entry when the
  // account belongs to a single school.
  const continueUrl = payload?.choices?.[0]?.continueUrl ?? payload?.continueUrl;

  check(
    'the API hands back a handoff URL with the school in the PATH',
    typeof continueUrl === 'string' && continueUrl.includes(`/${SLUG}/auth/continue`),
    continueUrl ?? JSON.stringify(payload).slice(0, 140),
  );

  const handoffPath = new URL(continueUrl).pathname + new URL(continueUrl).search;
  const handoff = await req(PORTAL, handoffPath);

  check(
    'the handoff lands inside the school, not on the marketing page',
    handoff.status === 303 && handoff.location === `/${SLUG}`,
    `${handoff.status} → ${handoff.location}`,
  );

  const schoolCookie = handoff.setCookie.find((c) => c.startsWith('ilm_school='));
  check(
    'it writes the school cookie the API proxy needs',
    schoolCookie !== undefined && schoolCookie.includes(`ilm_school=${SLUG}`),
    schoolCookie ? schoolCookie.split(';')[0] : 'absent',
  );
  check(
    'and marks it HttpOnly',
    schoolCookie !== undefined && /HttpOnly/i.test(schoolCookie),
  );

  const cookie = jar(handoff.setCookie);

  console.log('\n\x1b[1mEvery page, under /' + SLUG + '\x1b[0m');

  let bad = 0;
  for (const page of PAGES) {
    const url = `/${SLUG}${page}`;
    const r = await req(PORTAL, url, { cookie });

    const problems = [];
    if (r.status >= 400) problems.push(`status ${r.status}`);
    if (/Functions cannot be passed directly/.test(r.body)) problems.push('function-prop');
    if (/Application error: a (server|client)-side exception/.test(r.body))
      problems.push('client-exception');
    // The failure that matters most: a nav link with no school in it 404s.
    if (r.status === 200 && !/href="\/beacon\//.test(r.body) && page !== '')
      problems.push('NO-PREFIXED-LINKS');

    if (problems.length > 0) bad += 1;
    console.log(
      `${problems.length === 0 ? '\x1b[32m  ok  \x1b[0m' : '\x1b[31m FAIL \x1b[0m'}${url.padEnd(38)} ${String(r.status).padStart(3)}  ${problems.join(' ') || '—'}`,
    );
  }
  check(`all ${String(PAGES.length)} pages render with prefixed links`, bad === 0, `${bad} bad`);

  console.log('\n\x1b[1mThe edges\x1b[0m');

  // A page path with no school, while signed in: recovered from the cookie
  // rather than bounced to sign-in.
  const unprefixed = await req(PORTAL, '/students', { cookie });
  check(
    'an unprefixed app path is redirected into your school, not to /login',
    unprefixed.status === 307 && unprefixed.location === `/${SLUG}/students`,
    `${unprefixed.status} → ${unprefixed.location}`,
  );

  // Another school's URL while holding this school's session.
  const other = await req(PORTAL, '/demo/students', { cookie });
  check(
    "another school's URL is sent back to the one your session is for",
    other.status === 307 && other.location === `/${SLUG}/students`,
    `${other.status} → ${other.location}`,
  );

  // A school-shaped first segment that is really one of our routes.
  const marketingInsideSchool = await req(PORTAL, `/${SLUG}/welcome`, { cookie });
  check(
    'the marketing page does not exist inside a school',
    marketingInsideSchool.status === 307 && marketingInsideSchool.location === `/${SLUG}`,
    `${marketingInsideSchool.status} → ${marketingInsideSchool.location}`,
  );

  // Query strings must survive the rewrite.
  const withQuery = await req(PORTAL, `/${SLUG}/attendance/mark/students?date=2026-09-07`, {
    cookie,
  });
  check(
    'a query string survives the rewrite',
    withQuery.status === 200 && withQuery.body.includes('07/09/2026'),
    `${withQuery.status}`,
  );

  // API calls carry the school from the cookie.
  const api = await req(PORTAL, '/api/v1/students?limit=5&offset=0', { cookie });
  check(
    'the API proxy resolves the school from the cookie',
    api.status === 200,
    `${api.status} ${api.status !== 200 ? api.body.slice(0, 120) : ''}`,
  );

  // No session at all.
  const anonymous = await req(PORTAL, `/${SLUG}/students`);
  check(
    'a signed-out visitor is sent to sign in',
    anonymous.status === 307 && (anonymous.location ?? '').startsWith('/login'),
    `${anonymous.status} → ${anonymous.location}`,
  );

  // Signing out must not leave the school cookie behind.
  const out = await req(PORTAL, '/api/v1/auth/logout', { method: 'POST', cookie });
  const cleared = out.setCookie.find((c) => c.startsWith('ilm_school='));
  check(
    'sign-out clears the school cookie',
    cleared !== undefined && /Max-Age=0/i.test(cleared),
    cleared ? cleared.split(';').slice(0, 2).join(';') : 'not cleared',
  );

  const failed = results.filter((r) => !r.ok);
  console.log(
    `\n\x1b[1m${results.length - failed.length}/${results.length} checks passed\x1b[0m`,
  );
  process.exit(failed.length === 0 ? 0 : 1);
})().catch((e) => {
  console.error(e.stack || e.message);
  process.exit(1);
});
