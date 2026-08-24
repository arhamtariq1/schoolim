# Runbooks

Operational procedures, indexed in `../18-incident-response-and-operations.md` §3.

**Every runbook carries a `Last rehearsed:` date in its header. A stale date is a finding at the
phase review — a runbook that has never been executed is fiction.**

Each is written for *someone who is not you*: no undocumented steps, no "obviously then you…".
The test is whether a competent developer with repo access could execute it cold (`18` §8).

| # | File | Status |
|---|---|---|
| RB-01 | Database restore from backup | Not written — due P0 |
| RB-02 | Enable/disable read-only mode | Not written — due P0 |
| RB-03 | Roll back a deploy | Not written — due P0 |
| RB-04 | Voucher generation failed or partial | Not written — due P2 |
| RB-05 | Suspected cross-tenant leak | Not written — due P5 |
| RB-06 | Credential rotation | Not written — due P0 |
| RB-07 | Supabase → Railway migration | Not written — dry-run due P1 |
| RB-08 | Tenant offboarding / hard delete | Not written — due P5 |
| RB-09 | Restore a single school | Not written — due P5 |
