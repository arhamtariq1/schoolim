# 16 — UI Principles & Implementation Rules

**This file is binding on every piece of UI work in this repository.** Read it before writing a
component, and check the §14 checklist before opening a PR.

Its relationship to the other UI document:

| Document | Answers |
|---|---|
| `10-ux-and-design-system.md` | *What* the product looks and behaves like — navigation model, screen archetypes, tokens, mobile, accessibility, performance budget |
| **`16-ui-principles.md`** (this file) | *How* it is built — which library, which component, which prop, what is banned |

---

## 1. The operating procedure

Before writing a single line of UI, in this order:

1. **Does `@ilm/ui` already have it?** Use it. Do not fork it for one screen.
2. **Does shadcn/ui have it?** `pnpm dlx shadcn@latest add <component>` into `packages/ui`, then
   adapt it to our tokens. Never install it per-app.
3. **Can it be composed from what exists?** Compose. Two existing primitives beat one new one.
4. **Only now, write something new** — and if a second screen will ever need it, it goes into
   `@ilm/ui`, not into the feature folder.

The one question that settles most arguments: *"Will a second screen need this?"* Yes → `@ilm/ui`.
No → `apps/portal/features/<domain>/components/`.

---

## 2. The locked library set

Do not introduce an alternative to anything in this table without an ADR. "I prefer X" is not a
reason; a second component library is how design systems die.

| Concern | Library | Why it and not the others |
|---|---|---|
| **Components** | **shadcn/ui** on **Radix UI** primitives | Copy-in, not a dependency — we own the code and can shape it into a real design system. Radix gives correct ARIA, focus traps and keyboard behaviour for free. Rejected: MUI/AntD (fighting their design language costs more than owning components), Chakra (runtime CSS-in-JS), Headless UI (smaller primitive set) |
| **Styling** | **Tailwind CSS v4** | CSS-first config means per-school branding is a runtime CSS-variable swap, not a rebuild |
| **Icons** | **lucide-react** — the *only* icon library | shadcn's native pairing, 1,500+ icons, one consistent 24×24 grid and stroke weight, tree-shaken per icon. A second icon set makes every screen look assembled rather than designed |
| **Tables** | **TanStack Table v9** (headless) | One `<DataTable>` solves sorting, filtering, pagination, column visibility, row selection and export once, for all ~40 lists |
| **Forms** | **React Hook Form** + `@hookform/resolvers/zod` | Uncontrolled inputs are what make a 500-row marks-entry grid usable |
| **Server state** | **TanStack Query v5** | Cache, background refetch, optimistic mutations, infinite lists |
| **Client state** | **Zustand** | Only for genuine UI state — sidebar, command palette, bulk selection |
| **Toasts** | **sonner** | |
| **Command palette** | **cmdk** | |
| **Charts** | **Recharts** | Revisit at Phase 4 only if dashboards get dense |
| **Drag & drop** | **dnd-kit** | Timetable builder, fee-plan ordering |
| **Dates** | **date-fns** v4 + `@date-fns/tz` | Tree-shakeable, explicit timezones |
| **Motion** | CSS transitions; **Motion** (`motion/react`) only where CSS genuinely cannot | Every animation library is a bundle-size decision |
| **Variants** | **cva** + **tailwind-merge** via a single `cn()` | |

**Banned outright:** a second component library · a second icon set · emoji used as an icon ·
CSS-in-JS runtimes (styled-components, emotion) · `!important` · inline `style={{}}` except for a
genuinely computed value (a progress width, a chart dimension) · global CSS outside
`packages/ui/src/styles` · `any` on a component prop.

---

## 3. Icons

**One library: `lucide-react`.** Import named, never the whole set.

```tsx
import { Plus, Search, Trash2 } from 'lucide-react';   // ✅
import * as Icons from 'lucide-react';                  // ❌ kills tree-shaking
```

**Size scale — four sizes, no others.** Lucide's default stroke width of `2` is kept everywhere;
varying stroke weight across a screen is the fastest way to look amateur.

| Size | Use |
|---|---|
| `size-4` (16px) | Inline in text, inside buttons, table row actions, form field adornments |
| `size-5` (20px) | Sidebar navigation, toolbars, tabs |
| `size-6` (24px) | Section headings, card headers, dialog titles |
| `size-10` (40px) | Empty states and onboarding illustrations only |

**Rules**

1. **An icon is never the only label** on a primary or destructive action. Icon + text.
   Icon-only is allowed only in a dense toolbar or a table row, and then it **must** have a
   `<Tooltip>` and an `aria-label`.
2. **Icons are decorative by default:** `aria-hidden="true"` when a text label sits beside them.
   Screen readers should not announce "plus, Add student".
3. **One meaning, one icon, product-wide.** `Trash2` is delete everywhere; `Pencil` is edit
   everywhere. The mapping lives in `@ilm/ui/icons.ts` as named exports — feature code imports
   `EditIcon`, not `Pencil`, so the mapping can change in one place:
   ```ts
   // packages/ui/src/icons.ts
   export { Pencil as EditIcon, Trash2 as DeleteIcon, Plus as CreateIcon,
            Download as ExportIcon, Printer as PrintIcon, Check as ApproveIcon } from 'lucide-react';
   ```
4. **Colour carries no meaning alone.** A red icon must sit beside red text or a labelled badge —
   this product is printed in black and white constantly, and 8% of men are colour-blind.
5. **No emoji as UI.** Emoji render differently per OS and cannot be recoloured or sized reliably.
6. Currency, status and money are **never** expressed as an icon. `PKR 12,500.00`, not a bag glyph.

---

## 4. Component authoring rules

```tsx
// packages/ui/src/components/status-badge.tsx
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/utils';

const badge = cva('inline-flex items-center gap-1.5 rounded-full font-medium', {
  variants: {
    tone: {
      neutral: 'bg-muted text-muted-foreground',
      success: 'bg-success/10 text-success',
      warning: 'bg-warning/10 text-warning',
      danger:  'bg-danger/10  text-danger',
    },
    size: { sm: 'px-2 py-0.5 text-xs', md: 'px-2.5 py-1 text-sm' },
  },
  defaultVariants: { tone: 'neutral', size: 'sm' },
});

export interface StatusBadgeProps
  extends React.ComponentProps<'span'>, VariantProps<typeof badge> {}

export function StatusBadge({ className, tone, size, ...props }: StatusBadgeProps) {
  return <span className={cn(badge({ tone, size }), className)} {...props} />;
}
```

1. **Every component takes `className` and merges it with `cn()`.** No exceptions — this is what
   makes the design system usable instead of a cage.
2. **Variants are `cva`, never a chain of ternaries** in the JSX.
3. **Spread the rest of the native props.** A `<Button>` that cannot take `type="submit"` is broken.
4. **Named exports only.** No default exports in `@ilm/ui`.
5. **Props are the domain's language, not CSS.** `tone="danger"`, not `color="#D93025"`;
   `density="compact"`, not `padding={4}`.
6. **No component reads global state or fetches.** `@ilm/ui` is pure presentation — it may not
   import `@ilm/contracts`, TanStack Query, or anything app-specific. A `<VoucherTable>` lives in
   `apps/portal/features/fees`, a `<DataTable>` lives in `@ilm/ui`.
7. **Server Components by default.** `'use client'` only where interactivity, hooks or browser APIs
   genuinely require it, and as deep in the tree as possible.
8. **No arbitrary Tailwind values** (`w-[437px]`, `text-[#1a1a1a]`). Use the scale or add a token.

---

## 5. Spacing, sizing, typography

- **4px base unit.** Only `0 1 2 3 4 6 8 12 16 24` from the Tailwind scale. Nothing else.
- **Four type sizes in app chrome:** `text-xs` meta · `text-sm` body and tables · `text-base` form
  inputs · `text-lg`/`text-xl` page and section headings. Restricting the scale is what makes an app
  look designed rather than assembled.
- **Radius:** `rounded-md` controls · `rounded-xl` cards · `rounded-full` badges and avatars.
- **Touch targets ≥ 44px** on anything a teacher taps on a phone.
- **Container width:** forms max `max-w-2xl`; tables full width. A 1,600px-wide form is unreadable.
- **Density:** comfortable by default, with a compact toggle. Accountants live in compact; the
  toggle is a `data-density` attribute on the shell, not a second set of components.

---

## 6. Colour and theming

- **Never a raw hex or a Tailwind palette colour in a component.** Only semantic tokens:
  `bg-background`, `text-foreground`, `bg-muted`, `border-border`, `text-primary`,
  `bg-success/10`, `text-danger`.
- The whole palette is CSS variables so a school's `primary_color` is a **runtime swap** — no
  rebuild, no per-tenant bundle.
- **Dark mode from day one** via those tokens. Cheap now, a rewrite later.
- **Status is a colour *and* a label**, always. Never colour alone.
- Contrast ≥ 4.5:1, verified in CI.

---

## 7. The states every screen must implement

A screen is not "done" until all of these exist. This is the single most common gap in the previous
portal.

| State | Requirement |
|---|---|
| **Loading** | Skeleton matching the real layout, never a centred spinner. On a filter change, keep the previous data visible and dim it |
| **Empty (first use)** | Explain what belongs here **and** offer the action that fills it: *"No fee plans yet. A fee plan defines what each class pays. [Create your first plan]"* |
| **Empty (no results)** | Different copy from first-use, with a [Clear filters] action |
| **Error** | What failed, in plain language, and what to do: *"Cannot generate: 12 students have no fee plan → [Assign now]"*. Never a raw code, never a silent failure |
| **Partial / degraded** | A failed widget shows an inline retry; it does not take the page down |
| **Permission denied** | The control is hidden, not disabled-with-a-shrug. Cross-tenant is a 404, never a 403 |
| **Offline** | Attendance marking must work offline and sync. Everything else shows a banner |
| **Saving / pending** | The submit button is disabled with a spinner and the form is locked |
| **Success** | A toast with the specifics, and an **Undo** where the action is reversible |

---

## 8. Forms

- **The zod schema comes from `@ilm/contracts`.** Never redeclare validation in the component —
  that is how the client and server drift apart.
- **React Hook Form + `zodResolver`**, uncontrolled inputs.
- Every input has a `<Label>` with `htmlFor`; errors are linked with `aria-describedby`.
- **Errors appear on blur and on submit**, never on every keystroke of a field never touched.
- **A sticky save bar** on any form longer than a screen, showing dirty state.
- **A dirty-state guard** on navigation. Never lose typed data — autosave drafts on long forms.
- **Server errors map to fields** by the RFC 9457 `errors[].path` from the API, not to a generic toast.
- The submit button says what it does — **"Generate 482 vouchers"**, not "Submit".

---

## 9. Tables and lists

Every list in this product is one `<DataTable>` with column definitions. Building a bespoke table is
a review rejection.

- Server-side pagination, sorting and filtering. Never fetch 5,000 rows and filter in the browser.
- **Bulk actions on every list.** Anything a school does for one student, they need for 500.
- **Select-all means all rows matching the filter**, not the visible page — and the count is shown:
  *"All 482 students matching this filter are selected."*
- Column visibility, saved views, and CSV/XLSX export on every list.
- **Row click opens the detail; it never mutates.** Destructive actions live in an explicit menu.
- Sticky header, sticky first column on wide tables, and horizontal scroll **inside** the table —
  the page body never scrolls sideways.
- Below 768px a table becomes a card list. Never a horizontally-scrolling table on a phone.
- Render 100 rows in under 100ms; virtualise beyond ~200.

---

## 10. Money, dates, numbers, names

Non-negotiable, because getting these wrong is what makes software look untrustworthy to an
accountant.

- **Money** renders only through `<Money valueMinor={…} />` from `@ilm/ui`: monospace,
  right-aligned, currency symbol, thousands separators, exactly two decimals, never truncated.
  Negative in red **and** parentheses. The component takes **minor units** — a raw number formatted
  by hand in a component is a review rejection.
- **Dates** render only through `<DateDisplay />`, in the school's timezone and locale, with the
  absolute date in a tooltip whenever a relative one is shown.
- **Counts and percentages** are right-aligned; percentages carry one decimal at most.
- **Names** are `text-balance`, never truncated with an ellipsis in a table without a title attribute,
  and always accept Urdu text (UTF-8 end to end, correct font stack).
- **IDs, admission numbers and voucher numbers** are monospace and selectable.

---

## 11. Feedback: which one, when

| Situation | Use |
|---|---|
| Reversible action succeeded | Toast **with Undo** |
| Non-reversible, low stakes | Toast |
| Destructive or financial | `<AlertDialog>` naming the specifics: *"Cancel 42 vouchers totalling PKR 210,000 for Grade 5-A, September 2026?"* — never "Are you sure?" |
| A batch that changes many rows | A **wizard with a preview step**. Nothing is written until the preview is accepted |
| Validation problem | Inline, at the field |
| Long-running work | Progress with a count, resumable, and a link to where the result will land |

**Optimistic updates** on toggles and quick edits, rolled back visibly on failure. Never optimistic
on anything financial.

---

## 12. Motion

- Purposeful only: 150–200ms for state changes, 200–300ms for entrances. Nothing over 400ms.
- `ease-out` entering, `ease-in` leaving.
- Animate `transform` and `opacity` only. Never `width`, `height` or `top` in a loop.
- **Respect `prefers-reduced-motion`** — this is a rule, not a nicety.
- No animation on data that updates frequently; a table that shimmers on every refetch is noise.

---

## 13. Keyboard and accessibility

WCAG 2.2 AA is the baseline, not the aspiration.

- **Every screen is fully keyboard operable.** `/` focuses search, `n` creates, `Esc` closes,
  arrows move between rows, `⌘K` opens the palette.
- **The two high-frequency screens — fee collection and marks entry — must be completable without a
  mouse**, end to end. This is a functional requirement, not an accessibility bonus.
- Visible focus rings. Never `outline: none` without a replacement.
- Logical tab order; focus moves into a dialog and returns to the trigger on close (Radix does this
  — which is a reason we use it).
- Axe checks run in the Playwright suite on every critical flow.

---

## 14. The UI pre-merge checklist

- [ ] Uses `@ilm/ui` / shadcn primitives — no new bespoke component that a second screen would need
- [ ] Icons from `lucide-react` only, via `@ilm/ui/icons`, at one of the four sizes
- [ ] No raw hex, no arbitrary Tailwind values, no inline styles, no `!important`
- [ ] Loading, empty (first-use **and** no-results), error and permission-denied states implemented
- [ ] Bulk action available if the operation could ever apply to many rows
- [ ] Money through `<Money>`, dates through `<DateDisplay>` — no hand formatting
- [ ] Destructive/financial actions confirm with the specifics; reversible ones offer Undo
- [ ] Form validation comes from the shared `@ilm/contracts` zod schema
- [ ] Keyboard-operable; focus visible; labels and `aria-describedby` present
- [ ] Works at 360px wide; touch targets ≥ 44px; no horizontal page scroll
- [ ] Light **and** dark mode checked
- [ ] Strings externalised through `next-intl`; logical properties (`ms-`/`me-`) not `ml-`/`mr-`
- [ ] Print layout considered if the screen is one a school prints
- [ ] Route JS under budget (< 200KB gz)

---

## 15. What "next level" actually means here

Not gradients and glassmorphism. It means:

1. **A person sees only what they can use** — nav generated from permissions.
2. **The most frequent task is the fastest** — fee collection in under 20 seconds, keyboard only.
3. **Every number is drillable** to the rows that produced it.
4. **Nothing destructive happens without a preview** showing exactly what will change.
5. **Provenance is visible** — who changed this amount, and when, on hover.
6. **It works on a PKR 25,000 Android phone on 4G**, because that is what teachers own.

A screen that is beautiful and fails any of these six is a failed screen.
