# ADR-0003 — Own the authentication layer; do not use Supabase Auth

**Status:** Accepted · **Date:** 2026-08-21

## Context
Phase 0 uses Supabase's free tier for hosted PostgreSQL. The stated plan is to migrate to plain
PostgreSQL (Railway or similar) once there is a paying customer. Supabase Auth is available and
would save roughly a week of work.

## Decision
Implement authentication inside NestJS: argon2id password hashing, short-lived JWT access tokens in
httpOnly cookies, opaque rotating refresh tokens stored hashed, with reuse detection. Supabase is
used **only** as PostgreSQL and object storage — no Auth, no client SDK, no Realtime, no PostgREST,
no Edge Functions.

## Consequences
- The Supabase → PostgreSQL migration becomes a `pg_dump`/`pg_restore` with no user impact, rather
  than forcing every user at every school to re-authenticate.
- Full control over the session model: tenant-scoped users, `token_version` for instant revocation,
  impersonation tokens, per-school email uniqueness.
- RBAC and tenant enforcement live in one place — the API — instead of being split between
  application guards and RLS evaluated from the browser.
- Cost: about one week of work, plus permanent ownership of a security-critical surface. Mitigated
  by using vetted primitives (`jose`, `@node-rs/argon2`) and by an external review before launch.

## Alternatives
- **Supabase Auth** — rejected. It is the single hardest component to migrate away from, and
  migrating away is an explicit project goal.
- **better-auth / Auth.js** — reasonable, but both are frontend-first while this product's auth is
  API-first with tenant-scoped users and impersonation. The impedance mismatch exceeds the savings.
- **Clerk / Auth0** — good products, but per-MAU pricing is wrong when 500 students per school are
  all users, and the lock-in is exactly what this ADR exists to avoid.
