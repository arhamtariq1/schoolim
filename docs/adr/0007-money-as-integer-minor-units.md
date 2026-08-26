# ADR-0007 — Money as integer minor units in application code

**Status:** Accepted · **Date:** 2026-08-21

## Context

The product's core function is billing. Percentage discounts, proportional allocation of one payment
across several vouchers, and pro-rata fees all produce fractions. IEEE-754 doubles cannot represent
`0.1` exactly, and JavaScript has no decimal type.

## Decision

- **PostgreSQL:** `numeric(14,2)` — exact decimal, sortable, aggregatable in SQL.
- **Application code:** integers representing **paisa** (minor units). Every money field carries a
  `Minor` suffix: `netPayableMinor`, `amountMinor`.
- **The wire:** integers. The API never sends a formatted money string; the UI formats.
- All arithmetic goes through `@ilm/utils/money`, which rounds explicitly — banker's rounding for
  proportional splits, with a documented remainder-allocation rule so parts always sum exactly to
  the whole.

## Consequences

- No accumulated floating-point drift. A total is always the exact sum of its parts.
- Percentage discounts round once, at a defined point, in a documented direction.
- Splitting a payment across vouchers never loses or invents a paisa.
- Cost: every developer must remember the `Minor` convention. Enforced by the naming rule, by an
  ESLint rule banning bare arithmetic on money-named identifiers, and by branded types.

## Alternatives

- **`decimal.js` / `big.js` objects** — correct, but they serialise awkwardly, are easy to coerce to
  a number by accident, and add weight to every payload.
- **Prisma `Decimal`** — used only at the boundary where Prisma returns it, converted to minor units
  in the mapper layer so `Decimal` never escapes the data layer.
