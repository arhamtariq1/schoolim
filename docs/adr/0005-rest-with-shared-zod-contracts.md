# ADR-0005 — REST + shared zod contracts, not tRPC or GraphQL

**Status:** Accepted · **Date:** 2026-08-21

## Context

Two Next.js apps consume the API today. Coming later: a parent PWA, inbound payment-provider
webhooks, outbound webhooks for schools, and integration requests from school IT staff. End-to-end
type safety is a hard requirement.

## Decision

A versioned REST API (`/api/v1/...`) whose request and response shapes are defined once as zod
schemas in `@ilm/contracts`. NestJS validates against them via `nestjs-zod`; the frontend derives
types with `z.infer` and parses responses against the same schemas in development. OpenAPI 3.1 is
generated from those schemas and diffed in CI.

## Consequences

- Type safety comparable to tRPC without coupling the wire format to a TypeScript client.
- A single contract source: no interface written twice, no drift.
- Webhooks, a future mobile client and third-party integrations are all natural.
- An unintended breaking change fails the build via the spec diff.
- Cost: slightly more ceremony than tRPC — an explicit route, schema and client call. In exchange
  the boundary is visible and documented, which matters more in a system where every boundary
  crossing is a permission and tenancy checkpoint.

## Alternatives

- **tRPC** — rejected. Superb DX for a TypeScript-only client, but it is not a public API and this
  product needs one.
- **GraphQL** — rejected. N+1 management, per-field authorisation complexity and schema overhead,
  with no consumer that benefits.
