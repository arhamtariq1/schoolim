# ADR-0024: The landing page — dark bands, white body, real photography

**Status:** Accepted · 2026-10-25 · supersedes the visual direction of ADR-0022

## Context

The client found the previous landing page hard to read and visually empty. The product owner asked
for a modern page in the spirit of a reference SaaS site they liked, with real images, mixing dark
and white sections. The reference's copy, illustrations and code are not used.

## Decision

- **Mixed ground.** Dark `.marketing-ink` bands for the moments that sell — hero, closing call and
  footer. White for the moments that explain — comparison, features, portals, modules, steps,
  pricing, FAQ.
- **Plain, bold headings.** Every section opens with a teal eyebrow, a bold title with a few teal
  words, and a one-sentence lead (`SectionHeading`). No word-by-word reveals on section titles.
- **Real photography.** Four photos under the free Unsplash License, saved in
  `public/marketing/`:
  - `classroom-uniforms.jpg` — Sushanta Rokka
  - `teacher-lesson.jpg` — Vitaly Gariev
  - `parent-phone.jpg` — Vitaly Gariev
  - `office-desk.jpg` — Fajar Herlambang STUDIO

  Photos sit under or beside product screens, never alone, so every image still argues for the
  product. Text over a photo always sits on an ink scrim.
- **One file per section** in `components/marketing/sections/`; `app/welcome/page.tsx` only
  composes them.

The honesty rules of ADR-0019 are unchanged: sample data is labelled, no testimonials, no logos, no
usage figures. None of the photos depict a customer school.

## Consequences

Replacing a photo is a file swap in `public/marketing/` (keep the name, or update the import). If
the company later commissions photos of real partner schools, they replace these one for one.
