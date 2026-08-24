# 13 — Infrastructure & Deployment

Your stated plan: NestJS + Supabase, both frontend and backend on Vercel, no paid hosting until
there is a client, then migrate to Railway with plain PostgreSQL.

That plan is **mostly right**, and there are three specific facts that will bite you if you do not
plan around them now. This document states them plainly and then gives the path.

---

## 1. Three facts that change the plan

### Fact 1 — Vercel's Hobby plan forbids commercial use
The Hobby plan is explicitly non-commercial. The moment a school pays you — even one school, even by
bank transfer — you are outside its terms, and Vercel does enforce this. Vercel Pro is $20/month.

**Consequence:** Vercel Hobby is fine for **development and demos**. Budget $20/month from the first
paying customer. That is not a problem — it is a line item you plan for, not a surprise that takes
your product offline during a sales call.

### Fact 2 — Supabase Free pauses a project after 7 days without database requests, and gives 500 MB
Also: 500 MB storage, 500 MB shared RAM, 60 direct connections / 200 pooler connections, 5 GB egress.

**Consequence:**
- 500 MB is genuinely enough for several schools of data — attendance and vouchers are small rows.
  You will hit it eventually, not soon.
- **The auto-pause is disqualifying for a live school.** A paused project means the portal is down
  and nobody can collect a fee. A keep-alive ping avoids it, but running a paying customer on a
  tier that pauses on a technicality is not a decision you want to defend at 9 a.m. on a Monday.
- Supabase Pro is $25/month and removes the pause.

**Consequence:** Supabase Free is a **development database**. The first paying school triggers the
upgrade — or the move to Railway/Neon, which was the plan anyway.

### Fact 3 — NestJS on Vercel works, but it is the wrong shape for this product
Vercel deploys a NestJS app as a single serverless function on Fluid compute. It works. But:

| Need | On Vercel serverless |
|---|---|
| Monthly voucher generation for 1,000 students | Must be chunked across many invocations; cannot be one job |
| Cron | Hobby: **once per day minimum**, timing only guaranteed within the hour |
| Background queues (BullMQ workers) | Not possible — no persistent process |
| Prisma connection pooling | Every invocation risks a new connection; needs a pooler and careful config |
| Cold starts | First request after idle is slow; a school opening at 7:50 a.m. feels it |
| PDF generation at volume | Bundle size and memory pressure |

**Consequence:** the API wants an **always-on process**. This is the single most consequential
infrastructure decision in the document, and the good news is that it is cheap.

---

## 2. Recommended path

### Phase 0–1 — Development (target: $0)

| Component | Where | Notes |
|---|---|---|
| `apps/portal`, `apps/admin` | **Vercel Hobby** | Perfect fit. Preview deploys per PR. |
| `apps/api` | **Local + one always-on free host** | See the options table below |
| Database | **Supabase Free** | Used as plain Postgres only — no Auth, no client SDK, no Realtime |
| Object storage | **Supabase Storage** | 1 GB free |
| Email | **Resend** | 3k/month free |
| Cron | **GitHub Actions** or cron-job.org hitting `/internal/jobs/*` with a secret | Also serves as the Supabase keep-alive ping |
| Errors | **Sentry** free | |
| Analytics | **PostHog** free | |

**Free always-on host options for the API, ranked:**

| Option | Free? | Verdict |
|---|---|---|
| **Oracle Cloud Always Free** (ARM VM, 4 OCPU / 24 GB) | Genuinely free, indefinitely | **Best free option by a wide margin.** Runs the API, Redis and a Postgres if you want. Sign-up can be fiddly and capacity is region-dependent. |
| **Fly.io** | Small free allowance | Good DX, scales to zero (cold starts), simple deploys |
| **Render** free web service | Free | **Spins down after 15 min idle** — 50 s cold start. Fine for dev, not for a demo |
| **Koyeb / Railway trial** | Limited | Usable for a few weeks |
| **Vercel** (NestJS as a function) | Free | Works, but inherits every limitation in Fact 3 |

> **My recommendation:** do not spend the first month of the project fighting free-tier ergonomics.
> A **Hetzner CX22 at roughly €4/month** (2 vCPU, 4 GB, 40 GB) runs the API, Postgres, Redis and a
> reverse proxy comfortably, with no cold starts, no pausing, real cron and real queues. That is
> under $5/month to eliminate an entire category of problem. If $5/month is genuinely not available
> right now, take Oracle Always Free and keep Supabase for the database.

### Phase 2–5 — Pilot / first paying schools (~$45–70/month)

| Component | Where | Cost |
|---|---|---|
| Frontends | Vercel **Pro** | $20/mo — required once you are commercial |
| API | Railway or Hetzner VPS | $5–20/mo |
| Database | Railway Postgres / Neon / Supabase Pro | $10–25/mo, **with PITR backups** |
| Redis | Upstash free → paid | $0–10/mo |
| Object storage | Cloudflare R2 | ~$0 (no egress fees — this matters when parents download vouchers) |
| Domain + wildcard TLS | — | ~$15/yr |
| Email/SMS/WhatsApp | Resend + local aggregator | usage-based |

At PKR 15,000–25,000/month per school, one school covers this several times over.

### Phase 6+ — Scale (100+ schools)
Managed Postgres with a read replica · API on 2+ instances behind a load balancer · a separate
worker process for queues · CDN for static assets · a metrics stack (Grafana/Prometheus or a hosted
equivalent) · nightly backup verification. Still not microservices.

---

## 3. The Supabase → PostgreSQL migration (plan it now, execute at Phase 5)

Because Supabase is used **only as PostgreSQL and object storage**, this migration is a data move,
not a rewrite. That is the entire reason for the "own your auth" decision in `04` §4.

**Preconditions, all satisfied by the architecture in this repo:**
- No Supabase Auth → no user re-authentication
- No Supabase client SDK in the frontend → no code change in the apps
- No Realtime, no Edge Functions, no PostgREST → nothing proprietary to reimplement
- Storage sits behind a `StoragePort` → swapping to R2 is one adapter

**Runbook (target downtime: under 30 minutes, on a Sunday morning):**
1. Provision the target Postgres 17; apply all migrations; verify the schema matches.
2. Dry-run `pg_dump | pg_restore` against a staging copy; measure and record the duration.
3. Announce a maintenance window to all schools 72 hours ahead.
4. Put the API into read-only mode (a feature flag that rejects mutations with a clear message).
5. Final `pg_dump`, restore, verify row counts per table and re-run the financial invariant checks.
6. Swap `DATABASE_URL`, redeploy, smoke-test the critical flows.
7. Migrate storage objects in the background; serve from the old bucket until the copy completes.
8. Keep Supabase running, read-only, for 7 days as a rollback path.

**Do this migration before you have 10 schools, not after.**

---

## 4. CI/CD

```yaml
# .github/workflows/ci.yml — on every PR
jobs:
  quality:   pnpm install --frozen-lockfile → turbo lint typecheck
  test:      services: postgres:17 → prisma migrate deploy → turbo test
             (includes tenant-isolation, RBAC matrix, financial invariants)
  e2e:       playwright against a built preview
  security:  pnpm audit, gitleaks secret scan, RLS-policy checklist on migration diffs
  budget:    bundle size check against the budgets in doc 10
```

- `develop` → auto-deploy to staging.
- `main` → **manual approval** → production. This product moves money; a one-click accidental deploy
  is not a risk worth taking to save ten seconds.
- Database migrations run as a separate, explicitly-approved step, never automatically on deploy.
- Every production deploy is tagged and has a written rollback path.

---

## 5. Observability

| Signal | Tool | Alert on |
|---|---|---|
| Errors | Sentry (both apps + API, tagged with `schoolId`) | Any new error type; error rate spike |
| Logs | pino → hosted log store | Auth failures, tenant mismatches, job failures |
| Metrics | `/health` + a lightweight metrics endpoint | p95 > 1 s, error rate > 1%, DB connections > 80% |
| Jobs | `job_runs` + BullMQ dashboard | **Any failed voucher generation — page yourself** |
| Uptime | Better Stack / UptimeRobot | API and both apps, from a Pakistani region |
| Business | PostHog + a weekly digest | Schools with zero logins in 7 days (churn signal) |

**The one alert that must always wake you:** a voucher generation run that failed or completed
partially. Everything else can wait until morning.

> Signals are only half of it. **What you do when one fires** — severity levels, the first ten
> minutes, the runbook index, post-incident reviews and the status page — is
> `18-incident-response-and-operations.md`.

---

## 6. Backups & disaster recovery

- Managed PITR once on paid Postgres (7 days minimum, 30 preferred).
- **An additional nightly logical dump to a different provider**, encrypted. Do not keep your only
  backup with your only host.
- **Quarterly restore drill**, timed and documented. An untested backup is not a backup.
- Per-school export (ZIP of Excel + PDFs), self-serve, at any time.
- Documented RTO 4 hours / RPO 1 hour targets, with the runbook written before you need it.
- **Restoring one school** is harder than restoring everything, and is the case you will actually
  hit. It has its own runbook (RB-09 in `18` §3).

---

## 7. Environment variables (`.env.example`)

```bash
NODE_ENV=
APP_URL=                 # https://ilm.pk
ADMIN_URL=
API_URL=

DATABASE_URL=            # pooled, RLS-enforcing app role
DATABASE_ADMIN_URL=      # direct, BYPASSRLS — migrations + platform routes only
DIRECT_URL=              # prisma migrate

JWT_SECRET=              # 32+ bytes, rotated per environment
JWT_ACCESS_TTL=15m
REFRESH_TTL=30d
COOKIE_DOMAIN=

STORAGE_DRIVER=          # supabase | r2
STORAGE_BUCKET=
STORAGE_KEY=
STORAGE_SECRET=

MAIL_DRIVER=resend
RESEND_API_KEY=
MAIL_FROM=

WHATSAPP_PROVIDER=
WHATSAPP_TOKEN=
SMS_PROVIDER=
SMS_API_KEY=

REDIS_URL=
INTERNAL_JOB_SECRET=     # for the external cron caller

SENTRY_DSN=
POSTHOG_KEY=
```

Validated by a zod schema at boot. **The process refuses to start if anything required is missing or
malformed** — a misconfigured production start is far worse than a failed one.

**Sources:** [Vercel Hobby plan terms](https://vercel.com/docs/plans/hobby) · [Vercel cron usage & pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing) · [NestJS on Vercel](https://vercel.com/docs/frameworks/backend/nestjs) · [Vercel function limits](https://vercel.com/docs/functions/limitations) · [Supabase free-tier limits](https://uibakery.io/blog/supabase-pricing)
