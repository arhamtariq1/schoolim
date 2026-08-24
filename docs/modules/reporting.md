# Module — Reporting, Lists & Exports (engine built in Phase 1)

> Build this **once**, in Phase 1, before there are twelve list screens. Every module then gets
> filtering, sorting, column control, saved views, bulk actions and exports for free.
>
> The old portal almost certainly re-implemented a table per screen. That is where most of the code
> and most of the inconsistency lives.

---

## 1. The `DataTable` contract

One component, driven by a column definition and a query hook.

```tsx
<DataTable
  entity="students"
  columns={studentColumns}
  query={useStudents}
  filters={studentFilters}
  bulkActions={[assignFeePlan, changeSection, sendMessage, markLeft]}
  rowAction={(s) => `/students/${s.id}`}
  savedViews
  exportable
/>
```

Provides, uniformly, everywhere:

| Capability | Behaviour |
|---|---|
| Server-side pagination | Cursor-based for large sets, offset where a page number is needed |
| Sorting | Multi-column, server-side, persisted in the URL |
| Filtering | Typed filter descriptors → query params → zod-validated on the API |
| Search | Debounced, trigram-backed |
| Column control | Show/hide/reorder/pin, persisted per user per entity |
| Density | Comfortable / compact toggle — accountants want compact |
| Row selection | Page-wise and "select all N matching the filter" (the important one) |
| Bulk actions | Confirmation showing the exact count, progress, per-row result report |
| Saved views | Name a filter+column set, keep it private or share with the school |
| Export | XLSX / CSV / PDF of **the current filtered view**, server-generated |
| URL state | Every filter lives in the URL, so a link is shareable and the back button works |
| Empty states | Distinct copy for "nothing yet" vs "nothing matches your filters" + a clear action |
| Loading | Skeleton rows, `keepPreviousData` so the grid never flashes empty on a filter change |
| Errors | Inline retry, never a blank screen |

**Rule: no module writes its own table.** If `DataTable` cannot do it, extend `DataTable`.

---

## 2. Filter descriptors

Filters are declared as data so the same descriptor drives the UI control, the URL codec, the API
zod schema and the export.

```ts
export const studentFilters = [
  { key: 'sessionId',    type: 'select',     label: 'Session',  source: 'sessions', default: 'current' },
  { key: 'classLevelId', type: 'select',     label: 'Class',    source: 'classLevels' },
  { key: 'sectionId',    type: 'select',     label: 'Section',  dependsOn: 'classLevelId' },
  { key: 'status',       type: 'multiselect',label: 'Status',   options: STUDENT_STATUSES },
  { key: 'hasDues',      type: 'boolean',    label: 'Has outstanding dues' },
  { key: 'admittedAt',   type: 'daterange',  label: 'Admitted between' },
] as const satisfies FilterDescriptor[];
```

---

## 3. Export pipeline

Exports are **server-generated**, never built from what the browser happens to have loaded — the
client only holds one page, and a client-side export silently exports the wrong data.

```
POST /exports  { entity, filters, columns, format }
  → creates an export_jobs row, returns { jobId }
  → small sets (<5k rows) render synchronously and return a signed URL
  → large sets queue, the user gets a notification and a download link when ready
  → files expire after 7 days
```

Every export is permission-checked against the same scope rules as the list, and audited — you must
be able to answer "who exported the entire student database, and when".

---

## 4. Standard reports per module

Every one of these is the `DataTable` engine plus a print layout, not bespoke code.

**Students:** enrolment by class/section · admissions by month and source · left students with reasons · students missing required fields · birthday list · ID card batch

**Fees:** collection summary (expected vs collected vs outstanding) · defaulter ageing · head-wise collection · discount and waiver register · daily collection (day-book) · payment method breakdown · security deposit register

**Attendance:** daily register · monthly grid · class comparison · chronic absentees · staff summary

**Finance:** day-book · monthly income vs expense · expense by category · bank reconciliation status

**Exams:** result sheet · position list · subject analysis · failing list · report card batch

---

## 5. Dashboards

Dashboards are composed from **metric definitions**, so a number shown on the principal's dashboard
and the same number in a report come from the same query. Divergent numbers between two screens is
the fastest way to lose a school's trust in the software.

```ts
export const metrics = {
  'fees.collected.period':   { sql: …, params: ['schoolId','periodId'], format: 'money' },
  'fees.outstanding.total':  { … },
  'attendance.rate.today':   { … },
  'students.active.count':   { … },
};
```

Cached with a short TTL (60 s) per school; invalidated by the relevant domain events.

---

## 6. Print

School staff print constantly. Treat print as a first-class output, not an afterthought.

- A dedicated print stylesheet plus server-rendered PDF for anything with a fixed layout
  (vouchers, receipts, report cards, registers, TCs).
- Every printable carries the school header, the generation timestamp, the generating user, and a
  page count. A printed page with no provenance causes arguments.
- Batch print produces one PDF, correctly ordered and page-broken per student/section.

---

## 7. Custom report builder (v2)

Once the metric and filter descriptors exist, a builder that lets a school pick an entity, filters,
columns and a grouping is a modest addition — and it is the answer to "can you add a report for us"
that keeps you out of the services business permanently. Design toward it; do not build it in v1.
