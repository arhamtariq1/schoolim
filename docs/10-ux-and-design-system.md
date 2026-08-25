# 10 — UX & Design System

## 1. Diagnosis of the current portal

From the screenshot: a single flat sidebar, ~20 top-level items, ~30 total including sub-items, all
visible at once, ordered by database table rather than by task.

| Symptom                                                                    | Cost                                                 |
| -------------------------------------------------------------------------- | ---------------------------------------------------- |
| Every role sees every item                                                 | New staff need training; wrong clicks; support calls |
| Grouped by entity ("Sections", "Sessions", "Holidays")                     | Users must know the data model to find anything      |
| Configuration mixed with daily work ("Fee Settings" next to "Fee Voucher") | Rare, dangerous screens sit next to hourly ones      |
| No search, no shortcuts                                                    | Everything is a 3-click hunt                         |
| Duplicated destinations ("Student list" under Fees, "Students" above)      | Users are unsure which is authoritative              |
| Nothing communicates urgency                                               | A teacher cannot see that attendance is unmarked     |

Every one of these is fixed below.

---

## 2. Navigation model

### 2.1 Three tiers, not one list

```
┌────────────────────────────────────────────────────────────────────┐
│  ⌘K  Search students, vouchers, actions…        🔔 3   Aisha ▾     │  ← Tier 3: command + context
├──────────┬─────────────────────────────────────────────────────────┤
│ Home     │                                                         │
│ Students │   ┌───────────────────────────────────────────────┐     │
│ Fees     │   │  Fees › Vouchers                              │     │  ← Tier 2: in-page tabs
│ Attend.  │   │  [All] [Issued] [Overdue] [Paid] [Cancelled]  │     │
│ Finance  │   │                                               │     │
│ Staff    │   │  filters · table · bulk actions               │     │
│ Reports  │   └───────────────────────────────────────────────┘     │
│ ───────  │                                                         │
│ Settings │                                                         │
└──────────┴─────────────────────────────────────────────────────────┘
   ↑ Tier 1: max 8 items, permission-filtered, role-ordered
```

- **Tier 1 — sidebar: at most 8 items, and only what this role can use.** A teacher sees 5.
  Reception sees 5. The owner sees 8. Nobody sees 20.
- **Tier 2 — in-page tabs and sub-navigation.** "Fee Voucher / Defaulter List / Generate Fee" become
  tabs and actions _inside_ Fees, not four sidebar rows.
- **Tier 3 — the command palette (⌘K/Ctrl+K).** Search across students, staff, vouchers, receipts
  **and actions** ("generate vouchers", "mark attendance for Grade 5-A"). This is how power users
  stop using the sidebar at all.

### 2.2 Settings is a destination, not a menu

Everything configured rarely — fee heads, expense categories, class levels, sections, sessions,
holidays, subjects, roles, templates, branding — lives under **Settings**, organised into Academic /
Fees / People / Communication / System. Roughly half of the old sidebar moves here.

### 2.3 Navigation is generated from permissions

`nav.ts` declares each item with its required permission. The shell filters. Granting a permission
reveals the menu item automatically — there is no second place to update, so the two can never
drift.

---

## 3. Screen archetypes

Five patterns cover the entire product. Every screen is one of them. This is what makes a large app
feel small.

| Archetype        | Used for                                               | Anatomy                                                                |
| ---------------- | ------------------------------------------------------ | ---------------------------------------------------------------------- |
| **List**         | Students, vouchers, payments, expenses, staff          | PageHeader → filter bar → DataTable → bulk bar                         |
| **Detail (360)** | Student, staff, voucher, application                   | Header card with key facts + primary actions → tabs → timeline         |
| **Wizard**       | Admission, fee generation, rollover, import, increment | Stepper, validation per step, **preview before commit**, summary after |
| **Workspace**    | Role dashboards                                        | Metric row → action queue → widgets                                    |
| **Form**         | Settings, create/edit                                  | Sectioned, sticky save bar, inline validation, dirty-state guard       |

Every wizard that changes many rows must show a preview step. Every list must have an empty state
that tells the user what to do next. No exceptions.

---

## 4. Interaction rules

1. **Every list has bulk actions.** Anything a school does for one student, they need for 500.
2. **Select-all means all matching the filter**, not just the visible page — with the count shown.
3. **Destructive and financial actions confirm with the specifics**, not "Are you sure?": _"Cancel
   42 vouchers totalling PKR 210,000 for Grade 5-A, September 2026?"_
4. **Undo where possible, confirm where not.** A toast with Undo beats a modal for reversible
   things.
5. **Optimistic updates** on toggles and quick edits; roll back visibly on failure.
6. **Keyboard first for high-frequency screens.** Fee collection and marks entry must be completable
   without a mouse. `/` focuses search, `n` creates, `Esc` closes, arrows navigate rows.
7. **Never lose typed data.** Autosave drafts on long forms; warn on navigation with unsaved
   changes.
8. **Errors are actionable.** "Cannot generate: 12 students have no fee plan → [Assign now]". Never
   a raw code, never a silent failure.
9. **Loading is skeletons, not spinners**, and filter changes keep the previous data visible.
10. **Every number is drillable.** Clicking "PKR 210,000 outstanding" lands on that filtered list.
11. **Show provenance.** Amounts, statuses and marks display who changed them and when, on hover.
12. **Print is a feature**, designed per screen, not `window.print()` of a web layout.

---

## 5. Visual design

### Tokens (Tailwind v4 CSS variables)

```css
@theme {
  --color-brand-50 … --color-brand-950;   /* per-school, overridden at runtime */
  --color-success / warning / danger / info;
  --radius-card: 0.75rem;
  --font-sans: "Inter", system-ui;
  --font-urdu: "Noto Nastaliq Urdu";
  --font-mono: "JetBrains Mono";          /* all money and IDs */
}
```

- **Per-school branding** is a runtime CSS-variable swap from `schools.primary_color` plus the logo.
  No rebuild, no per-tenant CSS bundle. The green in the current portal becomes one school's brand,
  not the product's.
- **Money is always monospace, right-aligned, with the currency symbol**, and never truncated.
  `PKR 12,500.00`. Negative amounts in red with parentheses.
- **Status is a colour _and_ a label.** Never colour alone — 8% of men are colour-blind and this
  product prints in black and white constantly.
- **Density:** default comfortable, with a compact toggle. Accountants live in compact.
- **Dark mode** from day one via tokens. Cheap now, expensive later.

### Typography scale

Four sizes only in the app chrome: `text-xs` (meta) · `text-sm` (body/tables) · `text-base` (form
input) · `text-lg`/`text-xl` (page and section headings). Restricting the scale is what makes it
look designed rather than assembled.

---

## 6. Mobile

| Role               | Priority     | Approach                                                                             |
| ------------------ | ------------ | ------------------------------------------------------------------------------------ |
| Teacher            | **Critical** | Attendance and marks are designed mobile-first; the desktop layout is the adaptation |
| Parent / Student   | **Critical** | Mobile-only in practice; PWA installable                                             |
| Reception          | Medium       | Tablet at the counter                                                                |
| Accountant / Admin | Low          | Desktop-first; mobile is read-only dashboards                                        |

Rules: 44 px minimum touch targets · bottom navigation on mobile · tables become card lists below
768 px · sticky action bars · never a horizontally-scrolling table on a phone.

---

## 7. Accessibility

WCAG 2.2 AA as the baseline, not an aspiration:

- 4.5:1 contrast, verified in CI with an automated check
- Full keyboard operability; visible focus rings; logical tab order
- Radix primitives give correct ARIA for free — this is a reason `@ilm/ui` is built on them
- Labels on every input; errors linked with `aria-describedby`
- Respect `prefers-reduced-motion`
- Axe checks in the Playwright suite on every critical flow

---

## 8. Performance budget

| Metric                         | Budget           |
| ------------------------------ | ---------------- |
| Initial JS (portal route)      | < 200 KB gzipped |
| LCP on a mid-range Android, 4G | < 2.5 s          |
| Route transition               | < 300 ms         |
| Table of 100 rows, render      | < 100 ms         |
| API p95, list endpoints        | < 300 ms         |

Enforced by a bundle-size check in CI and a Lighthouse run on preview deploys. A budget that is not
enforced is a wish.

---

## 9. Localisation

- `next-intl` wired from Phase 0, all strings externalised even while English-only.
- Urdu + RTL in v2: logical CSS properties (`ms-`/`me-`, not `ml-`/`mr-`) **from the first
  component**. Retrofitting RTL is a rewrite; writing logical properties from the start is free.
- Dates in the school's locale; numbers with the lakh/crore grouping option some schools expect.
- Names, addresses and remarks accept Urdu text everywhere (UTF-8 end to end, correct fonts).

---

## 10. Onboarding & empty states

The first 10 minutes decide whether a school adopts or abandons.

- A **setup checklist** on the admin home for a new school: verify details → confirm session → add
  classes → import students → configure fees → invite staff. Progress bar, dismissible, resumable.
- Every empty state does one job: explain what belongs here and offer the action that fills it. _"No
  fee plans yet. A fee plan defines what each class pays. [Create your first plan] or [Use the
  standard template]."_
- Contextual help: a `?` on complex screens opening a short explanation, not a documentation site.
- **Sample data mode** — a new school can toggle demo data on to explore safely, then wipe it in one
  click. This converts trials.
