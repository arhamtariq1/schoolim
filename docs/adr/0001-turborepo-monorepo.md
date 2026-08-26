# ADR-0001 — Turborepo + pnpm monorepo

**Status:** Accepted · **Date:** 2026-08-21

## Context

Three deployable applications (school portal, super-admin console, API) plus shared types, a design
system and a database schema. A small team. Type safety across the API boundary is the highest-value
maintainability lever available.

## Decision

A single repository managed by Turborepo with pnpm workspaces: `apps/{api,web,admin}` and
`packages/{contracts,db,ui,utils,email,config}`.

pnpm specifically, not npm or yarn: its strict, non-flat `node_modules` prevents a package from
importing a dependency it never declared. In a monorepo, phantom dependencies are how packages
silently become coupled.

## Consequences

- One PR changes the schema, the contract, the API and the UI together, and CI verifies the whole
  chain.
- Renaming a field breaks the build at the call site rather than at runtime in production.
- Shared tooling config means one place to change lint or TypeScript settings.
- Cost: longer initial setup, and CI must be scoped with `turbo --filter` to stay fast.
- Cost: a single lockfile means a dependency upgrade affects everything at once. Mitigated by
  upgrading only at phase boundaries.

## Alternatives

- **Separate repositories** — rejected. Type sharing degrades into a published package with version
  skew, and a two-repo change becomes a two-PR dance.
- **Nx** — more capable (generators, module-boundary enforcement built in) but materially more
  configuration than a three-app repo justifies. Revisit only past roughly ten apps.
