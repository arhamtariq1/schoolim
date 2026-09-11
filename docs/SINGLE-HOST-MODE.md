# Single-host mode — and how to switch back

**Status:** temporary. Turned on because no domain was available, and it should be turned off the
day one is.

This document is written to be handed to an AI assistant on its own. It says what the mode is, why
it exists, exactly how to leave it, and how to prove the exit worked.

---

## 1. What to do if you are an assistant reading this

If the person who gave you this file has bought a domain and wants the product back on subdomains:

> **Go to §5, "Switching back". It is two environment variables and a DNS record. Do not delete any
> code — the mode is inert when the variable is unset, and removing it would leave the product with
> no way to run on a host without wildcard DNS.**

If they want the mode _removed_ from the codebase entirely, §6 lists every file. Read §2 first so
you know what you are deleting.

---

## 2. What the mode is

The product resolves a tenant from the **hostname**:

```
https://beacon.example.pk/students     ← Beacon's portal
https://demo.example.pk/students       ← Demo's portal
```

That is not cosmetic. Each school gets its own **origin**, so each gets its own **cookie jar** —
Beacon's browser physically never holds Demo's session token. `docs/04` calls this layer 1 of three,
and `apps/api/src/shared/tenancy/tenant.guard.ts` says it plainly: the JWT claim and the request
host are both checked, because _"both, or neither is worth anything"_.

Subdomains need a wildcard DNS record (`*.example.pk`) and a wildcard TLS certificate. Both need a
domain you own. **`*.vercel.app`, `*.netlify.app`, `*.pages.dev` and `*.onrender.com` cannot give
you either** — you cannot create `demo.yourproject.vercel.app`, and no free host will issue a
wildcard certificate for a domain it controls.

So `PORTAL_TENANT_MODE=path` moves the school out of the hostname and into the first path segment:

```
https://schoolim-portal.vercel.app/beacon/students
```

### What it costs

| | subdomain | path |
| --- | --- | --- |
| School named in the URL | yes | yes |
| Links shareable | yes | yes |
| Separate cookie jar per school | **yes** | no |
| Two schools open at once | **yes** | no — one session, the second replaces the first |
| Wildcard DNS + TLS required | yes | **no** |

The isolation itself does **not** weaken. `TenantGuard` still requires the resolved slug to equal
the `sid` claim inside the signed access token, so a hand-edited URL or cookie is a 401, not a
crossing. What is lost is the structural guarantee that made that check belt-and-braces rather than
the only belt — and the ability to be in two schools at once.

**Do not run paying schools in path mode.** It is for a demo on a host you do not control.

---

## 3. The design, in one paragraph

`subdomain` is the default everywhere. Every mode-dependent decision reads one variable, and the
route tree is **identical in both modes** — `app/students/page.tsx` serves `/students`, always. In
path mode the proxy rewrites `/beacon/students` onto it and links are prefixed on the way out. That
is why switching back is configuration and not a file move.

```
                    subdomain                     path
request        beacon.example.pk/students    host/beacon/students
proxy          slug ← Host                   slug ← first path segment, rewrite → /students
route          app/students/page.tsx         app/students/page.tsx        (same file)
links          /students                     /beacon/students             (withTenantPrefix)
API tenant     x-school-slug ← Host          x-school-slug ← ilm_school cookie
```

Anything other than the exact string `path` means `subdomain`. A typo fails toward the mode with
the stronger isolation, never away from it — `apps/portal/src/lib/tenant-mode.test.ts` pins that.

---

## 4. Environment variables

Two, and **they must agree**. The portal builds links; the API builds the absolute URLs it mails.

| Variable | Where | Path mode | Subdomain mode |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_PORTAL_TENANT_MODE` | portal | `path` | _unset_ |
| `PORTAL_TENANT_MODE` | API | `path` | _unset_ |
| `APP_DOMAIN` | both | ignored in path mode | `yourdomain.com` |
| `WEB_URL` | API | `https://your-portal-host` | `https://yourdomain.com` |

`NEXT_PUBLIC_` is **inlined at build time**. Changing it requires a redeploy, not just a restart —
editing it in the Vercel dashboard and not redeploying changes nothing.

---

## 5. Switching back to subdomains

### 5.1 DNS and TLS

1. Point a wildcard at your host:

   ```
   *.yourdomain.com   CNAME   cname.vercel-dns.com.
   yourdomain.com     A       76.76.21.21
   ```

   (Confirm the exact targets in your host's dashboard; these are Vercel's at time of writing.)

2. Add **both** `yourdomain.com` and `*.yourdomain.com` to the portal project, and wait for the
   certificate to issue. Wildcard domains need a paid plan on Vercel — check yours.

3. Point `api.yourdomain.com` at the API host.

### 5.2 Environment

Portal:

```bash
# Delete this variable entirely. Do not set it to "subdomain" — deleting it is
# the same thing and leaves nothing to be wrong later.
# NEXT_PUBLIC_PORTAL_TENANT_MODE

APP_DOMAIN=yourdomain.com
NEXT_PUBLIC_APP_DOMAIN=yourdomain.com
API_URL=https://api.yourdomain.com
```

API:

```bash
# PORTAL_TENANT_MODE            ← delete
APP_DOMAIN=yourdomain.com
WEB_URL=https://yourdomain.com
```

### 5.3 Redeploy both

The portal **must** be rebuilt, not just restarted — see the `NEXT_PUBLIC_` note above.

### 5.4 Tell people to sign in again

Existing sessions were issued as host-only cookies on the old shared host. They do not transfer to
`beacon.yourdomain.com` and there is no migration — signing in again is the whole of it. The stale
`ilm_school` cookie on the old host is then ignored by every code path, because nothing reads it in
subdomain mode.

### 5.5 Prove it

```bash
# The apex is the marketing site, and names no school.
curl -sI https://yourdomain.com/            | head -1     # 200
curl -s  https://yourdomain.com/ | grep -o '<h1[^>]*>[^<]*'   # the landing headline

# A school is its own host, and the path has no slug in it.
curl -sI https://beacon.yourdomain.com/login | head -1    # 200

# The path form is gone: `beacon` is not a route, so this is a redirect to the apex.
curl -sI https://yourdomain.com/beacon       | head -1    # 307 → /
```

Then sign in and confirm the URL bar reads `https://beacon.yourdomain.com/students` with **no**
`/beacon` in the path, and that the sidebar links match.

Locally, the same thing:

```bash
pnpm dev
# http://demo.localhost:3000  — works
# http://localhost:3000       — landing page
```

---

## 6. Removing the mode from the code

Only if you want it gone permanently. It costs nothing to leave in, and leaving it in means the next
host without wildcard DNS is an env var rather than a re-implementation.

### Files that exist only for this mode — delete

| File | What it is |
| --- | --- |
| `apps/portal/src/lib/tenant-mode.ts` | the mode, the slug parsing, the prefix helpers |
| `apps/portal/src/lib/tenant-mode.test.ts` | its tests |
| `apps/portal/src/lib/use-tenant-href.ts` | `useTenantHref`, `useTenantSlug`, `useCanonicalPathname` |
| `apps/portal/src/lib/tenant-server.ts` | `tenantHref` / `tenantPrefix` for Server Components |
| `docs/SINGLE-HOST-MODE.md` | this file |

### Files with mode-dependent branches — revert the branch, keep the file

Search for `TENANT_MODE`, `PORTAL_TENANT_MODE`, `tenantHref`, `useTenantHref`,
`useCanonicalPathname`, `tenantSlugFromPathname`, `withTenantPrefix`, `withoutTenantPrefix`,
`TENANT_PREFIX_HEADER` and `COOKIES.school`.

**Portal**

- `src/proxy.ts` — the slug becomes `schoolSlugFromHost(...)` unconditionally; `proceed()` collapses
  back to `NextResponse.next()`; delete `prefixed()`, `tenantPrefixFor()` and `TENANT_PREFIX_HEADER`
- `src/app/api/v1/[...path]/route.ts` — slug from Host only; delete the sign-out cookie clear
- `src/app/auth/continue/route.ts` — slug from Host; `location: '/'`; delete the `ilm_school` write
- `src/app/verify-email/route.ts` — slug from Host; redirect targets lose `withTenantPrefix`
- `src/lib/api.ts` — slug from Host only
- `src/components/app-shell.tsx`, `src/components/tab-links.tsx` — `usePathname()` instead of
  `useCanonicalPathname()`, `href={item.href}` instead of `href={tenantHref(item.href)}`
- Ten components where `tenantHref(...)` wraps a link or a `router.push`:
  `admission-form`, `attendance-class-grid`, `attendance-month-grid`, `attendance-roster`,
  `generate-fee`, `holidays-manager`, `staff-attendance-roster`, `student-profile-view`,
  `students-table`, `vouchers-view`
- `src/app/attendance/page.tsx`, `src/app/finance/page.tsx` — `redirect('/…')`, and the functions
  become synchronous again
- `src/app/students/new/page.tsx` — `href="/students"`, drop `studentsHref` from the `Promise.all`

**API**

- `src/config/env.ts` — delete `PORTAL_TENANT_MODE`
- `src/shared/tenancy/school-origin.ts` — delete the `mode` parameter and its branch
- `src/shared/tenancy/school-origin.test.ts` — delete the "path mode" describe block
- Four call sites drop the fourth argument: `modules/auth/auth.service.ts`,
  `modules/auth/email-verification.service.ts`, `modules/platform/schools.service.ts`,
  `modules/public/signup.service.ts`

**Contracts**

- `packages/contracts/src/routes.ts` — delete `COOKIES.school`

### Then

```bash
pnpm turbo run typecheck lint test build
```

TypeScript catches every missed call site, because `schoolOrigin`'s fourth parameter and
`COOKIES.school` both disappear from the types.

---

## 7. The edge cases this mode already handles

Listed so a future change does not quietly undo one. All are covered by
`apps/portal/src/lib/tenant-mode.test.ts` and the manual checks in §8.

| Case | Behaviour |
| --- | --- |
| `/students` — a route name that could be a slug | Read as the route, never as a school. `APP_ROUTE_SEGMENTS` in `tenant-mode.ts` — **keep it in step with the top-level directories under `app/`** |
| `/` inside a school | Prefixes to `/beacon`, the dashboard — not the marketing page |
| `/login`, `/signup`, `/welcome` | Never prefixed. Sign-in happens before a school is known (ADR-0009) |
| `/beacon/welcome` | Redirects to `/beacon`. The marketing site does not exist inside a school |
| `/students` while signed in | Redirected to `/beacon/students` from the `ilm_school` cookie, not bounced to sign-in |
| `/demo/students` holding a Beacon session | Redirected to `/beacon/students`. Without this every API call 401s and the app looks broken |
| Query strings and fragments | Preserved through both the rewrite and the prefixing |
| Double prefixing | `withTenantPrefix` is idempotent — `/beacon/beacon/students` cannot be produced |
| Sign-out | Clears `ilm_school`, so the next person is not dropped into the last school |
| A tampered `ilm_school` | 401 from `TenantGuard`: the cookie is a name, the token is the authority |
| `NEXT_PUBLIC_PORTAL_TENANT_MODE=Path` (wrong case) | Falls back to `subdomain` |

---

## 8. Verifying either mode

The scripts under `tooling/scripts/` are mode-agnostic and should pass in both:

```bash
pnpm verify:flows     # sign-in → billing → collection → register → report, and tenant isolation
```

For path mode specifically there is a dedicated script. It signs in through the real handoff, walks
every page asserting the sidebar's links carry the school, and exercises the edge cases in §7:

```bash
pnpm verify:path-mode                                    # against :3000 / :4000
PORTAL_PORT=3100 API_PORT=4100 pnpm verify:path-mode     # against a test pair
```

Or by hand, with the portal and API both set to `path`:

```bash
curl -sI  http://localhost:3100/                     | head -1   # 200, marketing
curl -sI  http://localhost:3100/login                | head -1   # 200
curl -sI  http://localhost:3100/students             | head -1   # 307 → /beacon/students (signed in)
curl -sI  http://localhost:3100/beacon/welcome       | head -1   # 307 → /beacon
```

And after signing in, confirm the sidebar's links contain `/beacon/` — that is the failure that
looks fine on the server and 404s on the first click:

```bash
curl -s http://localhost:3100/beacon/students -b "…" | grep -o 'href="/beacon/[a-z/]*"' | sort -u
```

---

## 9. History

Added 2026-09-08, with the product deployed to `schoolim-portal.vercel.app` and no domain purchased
yet. The alternative considered and rejected was one Vercel project per school pinned with a
`SCHOOL_SLUG` — better isolation, but it cannot serve a school created by self-serve signup, and
needs a slug→URL map for every email the API sends.

`docs/13-infrastructure-and-deployment.md` §2 has the hosting plan this is a detour from.
