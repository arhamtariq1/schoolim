# ADR-0006 — Run the API as an always-on process, not on serverless

**Status:** Proposed — blocked on open decision D1 · **Date:** 2026-08-21

## Context

The original plan was to deploy NestJS to Vercel alongside the frontends to keep costs at zero.
Verified constraints:

- Vercel deploys a NestJS app as a single function on Fluid compute. It works, but every function
  limitation applies.
- The Hobby plan permits cron **at most once per day**, with timing guaranteed only within the hour
  — and it forbids commercial use entirely.
- No persistent background workers or queues are possible on serverless.
- Monthly voucher generation for 1,000 students, bulk PDF rendering and bulk messaging are all
  long-running batch operations.
- Prisma connection management under per-request function instances requires a pooler and care.

## Decision

Deploy `apps/api` as a long-running process on a small always-on host — a ~€4/month VPS, or Oracle
Cloud Always Free if the budget is strictly zero. Keep both Next.js applications on Vercel, where
they are an excellent fit.

Until that host exists, background work runs through an authenticated, chunked
`POST /internal/jobs/{name}` endpoint driven by an external scheduler (GitHub Actions or
cron-job.org) — which doubles as the keep-alive ping preventing Supabase's free project from
auto-pausing after seven idle days.

## Consequences

- Real cron, real queues (BullMQ), no cold starts, predictable memory for PDF generation.
- Connection pooling is straightforward: one process, one pool.
- Cost: roughly $5/month plus basic server responsibility (updates, monitoring, TLS). Mitigated by a
  process manager, Caddy for TLS, and a written runbook.
- Deployment is slightly more involved than a push to Vercel.

## Alternatives

- **Everything on Vercel** — simplest, and viable through Phase 1. Rejected as the long-term shape
  because Phase 2's batch engine is fundamentally at odds with the serverless model, and migrating
  under deadline pressure is worse than choosing correctly now.
- **Railway from day one** — the eventual target and a good product; deferred only to keep Phase 0
  free.
