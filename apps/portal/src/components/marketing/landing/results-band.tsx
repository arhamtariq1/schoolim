import {
  EditIcon,
  ForwardIcon,
  ICON_SIZE,
  PrintIcon,
  SubjectIcon,
  SuccessIcon,
} from '@ilm/ui/icons';
import type { ComponentType } from 'react';

import { Reveal } from '@/components/marketing/marketing-parts';
import { ResultPreview } from '@/components/marketing/marketing-previews';
import {
  SAMPLE_CLASS_RESULTS,
  SAMPLE_SCHOOL,
} from '@/components/marketing/marketing-sample-school';

type IconComponent = ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;

const POINTS: { Icon: IconComponent; title: string; body: string }[] = [
  {
    Icon: PrintIcon,
    title: 'Result cards in one click',
    body: 'Printed from the marks teachers already entered — nobody copies a number twice.',
  },
  {
    Icon: SubjectIcon,
    title: 'Your subjects, your grading',
    body: 'Subjects and assessment types belong to each class, set up the way your school marks.',
  },
  {
    Icon: EditIcon,
    title: 'Keyboard-fast marks entry',
    body: 'A whole class entered without touching the mouse, and checked before it is saved.',
  },
];

/**
 * The class's mid-term at a glance: three figures worked out from the sample
 * rows (never typed in, so they cannot disagree with the table), the ranked
 * class, and one student's result card beside it.
 */
function ClassResultsWindow() {
  const marks = SAMPLE_CLASS_RESULTS.map((row) => row.marks);
  const total = marks.reduce((sum, value) => sum + value, 0);
  // Half-up in integers: these are whole percentages, not money, but ADR-0007
  // keeps `Math.round` out of the codebase all the same.
  const average = Math.floor((2 * total + marks.length) / (2 * marks.length));
  const highest = Math.max(...marks);
  const figures = [
    { label: 'Class average', value: `${String(average)}%` },
    { label: 'Highest', value: `${String(highest)}%` },
    { label: 'Result cards', value: `${String(SAMPLE_CLASS_RESULTS.length)} ready` },
  ];

  return (
    <div className="marketing-paper rounded-tile overflow-hidden border border-border bg-card">
      <div className="flex items-center gap-3 border-b border-border bg-muted px-4 py-3">
        <span className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-border" />
          <span className="size-2.5 rounded-full bg-border" />
          <span className="size-2.5 rounded-full bg-border" />
        </span>
        <span className="mx-auto truncate rounded-full bg-card px-4 py-1 text-xs text-muted-foreground">
          {SAMPLE_SCHOOL.name} — Marks · Grade 5-A
        </span>
      </div>

      <div className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground">Mid-term · {SAMPLE_SCHOOL.session}</p>
            <p className="text-sm font-semibold">Grade 5-A results</p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">
            <PrintIcon className={ICON_SIZE.inline} aria-hidden />
            Print result cards
          </span>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3">
          {figures.map((figure) => (
            <div key={figure.label} className="rounded-xl border border-border bg-background p-3">
              <p className="text-xs text-muted-foreground">{figure.label}</p>
              <p className="tabular mt-1 text-lg font-semibold">{figure.value}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <ol className="space-y-1 rounded-xl border border-border p-3">
            {SAMPLE_CLASS_RESULTS.map((row, position) => (
              <li
                key={row.name}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs sm:gap-3"
              >
                <span className="tabular w-4 text-muted-foreground">{position + 1}</span>
                <span className="w-20 shrink-0 truncate font-medium sm:w-24">{row.name}</span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <span
                    className="block h-full rounded-full bg-primary"
                    style={{ width: `${String(row.marks)}%` }}
                  />
                </span>
                <span className="tabular w-8 text-end font-semibold">{row.marks}%</span>
                <span className="w-6 text-end text-muted-foreground">{row.grade}</span>
              </li>
            ))}
          </ol>
          <ResultPreview />
        </div>
      </div>
    </div>
  );
}

/**
 * The teal band. `marketing-ink` supplies the light-on-dark text tokens; the
 * gradient runs down the brand ramp from `brand-600`, so white body text is at
 * least 4.77:1 at its lightest corner (docs/16 §6). The product sits in a
 * flat browser window — a school runs this at a desk, not only on a phone.
 */
export function ResultsBand() {
  return (
    <section
      id="results"
      aria-labelledby="results-title"
      className="scroll-mt-24 px-4 sm:px-6 lg:px-8"
    >
      <div className="marketing-ink rounded-tile mx-auto max-w-7xl overflow-hidden bg-linear-to-br from-brand-600 to-brand-900 px-6 py-16 sm:px-10 lg:px-14 lg:py-20">
        <div className="grid items-center gap-12 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <Reveal>
              <p className="inline-flex items-center gap-2 rounded-full bg-foreground/10 px-3 py-1 text-sm font-medium text-foreground">
                <SuccessIcon className={ICON_SIZE.inline} aria-hidden />
                Marks & results
              </p>
              <h2
                id="results-title"
                className="font-display text-display-md mt-6 font-medium text-balance text-foreground"
              >
                Monitor student results with ease
              </h2>
              <p className="mt-5 text-lg text-pretty text-foreground">
                From the register to the result card, every mark lands against the student who
                earned it — and the principal sees the whole class the moment it is entered.
              </p>
            </Reveal>

            <ul className="mt-10 space-y-3">
              {POINTS.map(({ Icon, title, body }, position) => (
                <li key={title}>
                  <Reveal
                    index={position}
                    className="flex gap-4 rounded-2xl border border-foreground/15 bg-foreground/5 p-4"
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-foreground text-brand-800">
                      <Icon className={ICON_SIZE.nav} aria-hidden />
                    </span>
                    <span>
                      <span className="block font-semibold text-foreground">{title}</span>
                      <span className="mt-1 block text-sm leading-relaxed text-foreground">
                        {body}
                      </span>
                    </span>
                  </Reveal>
                </li>
              ))}
            </ul>

            <Reveal className="mt-8">
              <a
                href="#packages"
                className="inline-flex min-h-11 items-center gap-2 rounded-full text-sm font-semibold text-foreground transition-opacity duration-150 hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                See what each package includes
                <ForwardIcon className={ICON_SIZE.inline} aria-hidden />
              </a>
            </Reveal>
          </div>

          <Reveal index={1} from="end" className="lg:col-span-7">
            <div aria-hidden className="rounded-tile bg-foreground/10 p-2 sm:p-3">
              <ClassResultsWindow />
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
