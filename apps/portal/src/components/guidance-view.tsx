import { Button, Card, EmptyState, StatusBadge } from '@ilm/ui';
import {
  AccessIcon,
  AcademicsIcon,
  AttendanceIcon,
  ChevronRightIcon,
  DashboardIcon,
  FeesIcon,
  FinanceIcon,
  InfoIcon,
  RequestsIcon,
  ResultIcon,
  SettingsIcon,
  StaffIcon,
  StudentsIcon,
  SuccessIcon,
} from '@ilm/ui/icons';
import { BRAND } from '@ilm/utils';
import type { Route } from 'next';
import Link from 'next/link';
import type { ComponentType } from 'react';

import { GuidanceIllustration } from '@/components/guidance-illustrations';
import { PageHeader } from '@/components/page-header';
import {
  EVERYDAY_TIPS,
  GETTING_STARTED_STEPS,
  GUIDANCE_FAQ,
  GUIDANCE_MODULES,
  type GuidanceModule,
  type GuidanceStep,
} from '@/lib/guidance-content';

/** The icons the guide draws, by name — named, so the rest stay out of the bundle. */
const MODULE_ICONS: Record<
  string,
  ComponentType<{ className?: string; 'aria-hidden'?: boolean }>
> = {
  AccessIcon,
  AcademicsIcon,
  AttendanceIcon,
  DashboardIcon,
  FeesIcon,
  FinanceIcon,
  RequestsIcon,
  ResultIcon,
  SettingsIcon,
  StaffIcon,
  StudentsIcon,
};

/**
 * `/guidance` — what the product is, and how to use the parts of it you can open.
 *
 * Pure presentation over `lib/guidance-content.ts`. The caller passes the
 * permissions it holds; sections and steps the person cannot reach are left
 * out rather than shown greyed (docs/16 §7, permission denied).
 */
export function GuidanceView({
  permissions,
  tenantHref,
}: {
  readonly permissions: readonly string[];
  /** Turns an in-app path into one that works in path or subdomain mode. */
  readonly tenantHref: (path: string) => string;
}) {
  const held = new Set(permissions);
  const steps = GETTING_STARTED_STEPS.filter((step) => held.has(step.permission));
  const modules = GUIDANCE_MODULES.filter((module) => held.has(module.permission));

  const contents = [
    ...(steps.length > 0 ? [{ id: 'getting-started', label: 'Getting started' }] : []),
    ...modules.map((module) => ({ id: module.id, label: module.title })),
    { id: 'everyday', label: 'Everyday tips' },
    { id: 'faq', label: 'Questions' },
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        title="Guidance"
        description={`Everything ${BRAND.name} does, and how to use it — step by step.`}
      />

      <Card className="overflow-hidden">
        <div className="grid items-center gap-6 p-4 sm:p-6 md:grid-cols-2">
          <div className="space-y-4">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              Welcome to {BRAND.name}
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {BRAND.name} runs your whole school from one place: admissions and the student
              register, daily attendance, monthly fee vouchers and collection, tests and marks,
              timetables, staff and salaries, and the school’s income and expenses. Parents get
              their own portal for their children’s attendance, results and fee vouchers.
            </p>
            <ul className="space-y-2 text-sm text-foreground">
              {[
                'Each person sees only the screens their role can use.',
                'Every change is recorded — who made it, and when.',
                'Your school’s data is isolated from every other school’s.',
                'Works on a phone as well as on the office computer.',
              ].map((point) => (
                <li key={point} className="flex items-start gap-2">
                  <SuccessIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </div>
          <GuidanceIllustration name="overview" />
        </div>
      </Card>

      <nav aria-label="On this page" className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">On this page</p>
        <ul className="flex flex-wrap gap-2">
          {contents.map((item) => (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                className="inline-flex min-h-8 items-center rounded-full border border-border bg-card px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {steps.length > 0 ? <GettingStarted steps={steps} tenantHref={tenantHref} /> : null}

      {modules.length === 0 ? (
        <EmptyState
          title="No guides for your role yet"
          description="Guides appear here for each area your role can open. Ask your school admin if you expected to see one."
        />
      ) : (
        <section aria-labelledby="modules-heading" className="space-y-4">
          <h2 id="modules-heading" className="text-lg font-semibold tracking-tight text-foreground">
            How to use each area
          </h2>
          <div className="space-y-6">
            {modules.map((module, index) => (
              <ModuleGuide
                key={module.id}
                module={module}
                flipped={index % 2 === 1}
                tenantHref={tenantHref}
              />
            ))}
          </div>
        </section>
      )}

      <section id="everyday" aria-labelledby="everyday-heading" className="scroll-mt-24 space-y-4">
        <h2 id="everyday-heading" className="text-lg font-semibold tracking-tight text-foreground">
          Everyday tips
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {EVERYDAY_TIPS.map((tip) => (
            <li key={tip.title}>
              <Card className="h-full space-y-1 p-4">
                <h3 className="text-sm font-semibold text-foreground">{tip.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{tip.body}</p>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      <section id="faq" aria-labelledby="faq-heading" className="scroll-mt-24 space-y-4">
        <h2 id="faq-heading" className="text-lg font-semibold tracking-tight text-foreground">
          Questions
        </h2>
        <Card className="divide-y divide-border">
          {GUIDANCE_FAQ.map((item) => (
            <details key={item.question} className="group px-4 sm:px-6">
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 py-3 text-sm font-medium text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                {item.question}
                <ChevronRightIcon
                  aria-hidden="true"
                  className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 group-open:rotate-90 motion-reduce:transition-none"
                />
              </summary>
              <p className="pb-4 text-sm leading-relaxed text-muted-foreground">{item.answer}</p>
            </details>
          ))}
        </Card>
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <InfoIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>
            Still stuck? Email{' '}
            <a
              href={`mailto:${BRAND.supportEmail}`}
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              {BRAND.supportEmail}
            </a>{' '}
            and tell us which screen you were on.
          </span>
        </p>
      </section>
    </div>
  );
}

function GettingStarted({
  steps,
  tenantHref,
}: {
  readonly steps: readonly GuidanceStep[];
  readonly tenantHref: (path: string) => string;
}) {
  return (
    <section
      id="getting-started"
      aria-labelledby="getting-started-heading"
      className="scroll-mt-24 space-y-4"
    >
      <div className="space-y-1">
        <h2
          id="getting-started-heading"
          className="text-lg font-semibold tracking-tight text-foreground"
        >
          Getting started
        </h2>
        <p className="text-sm text-muted-foreground">
          Setting up a new school? Work through these in order — each step builds on the one before.
        </p>
      </div>
      <ol className="grid gap-4 md:grid-cols-2">
        {steps.map((step, index) => (
          <li key={step.href}>
            <Card className="flex h-full gap-4 p-4">
              <span
                aria-hidden="true"
                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary"
              >
                {index + 1}
              </span>
              <div className="min-w-0 space-y-2">
                <h3 className="text-sm font-semibold text-foreground">
                  <span className="sr-only">Step {index + 1}: </span>
                  {step.title}
                </h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{step.body}</p>
                <Link
                  href={tenantHref(step.href) as Route}
                  className="inline-flex min-h-8 items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
                >
                  Go there
                  <ChevronRightIcon aria-hidden="true" className="size-4" />
                </Link>
              </div>
            </Card>
          </li>
        ))}
      </ol>
    </section>
  );
}

function ModuleGuide({
  module,
  flipped,
  tenantHref,
}: {
  readonly module: GuidanceModule;
  /** Alternate the picture's side so a long page does not read as one column of clones. */
  readonly flipped: boolean;
  readonly tenantHref: (path: string) => string;
}) {
  const Icon = MODULE_ICONS[module.icon] ?? InfoIcon;
  return (
    <Card id={module.id} className="scroll-mt-24 overflow-hidden">
      <article
        aria-labelledby={`${module.id}-heading`}
        className="grid gap-6 p-4 sm:p-6 lg:grid-cols-2"
      >
        <div className={flipped ? 'lg:order-2' : undefined}>
          <div className="rounded-xl bg-muted/40 p-3">
            <GuidanceIllustration name={module.illustration} />
          </div>
        </div>
        <div className="min-w-0 space-y-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Icon aria-hidden={true} className="size-6 text-primary" />
              <h3
                id={`${module.id}-heading`}
                className="text-lg font-semibold tracking-tight text-foreground"
              >
                {module.title}
              </h3>
            </div>
            <StatusBadge tone="neutral">{module.audience}</StatusBadge>
            <p className="text-sm leading-relaxed text-muted-foreground">{module.summary}</p>
          </div>

          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-foreground">How to use it</h4>
            <ol className="space-y-2">
              {module.steps.map((step, index) => (
                <li key={step} className="flex items-start gap-3 text-sm text-foreground">
                  <span
                    aria-hidden="true"
                    className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground"
                  >
                    {index + 1}
                  </span>
                  <span className="pt-0.5 leading-relaxed">{step}</span>
                </li>
              ))}
            </ol>
          </div>

          {module.tips.length > 0 ? (
            <div className="space-y-2 rounded-md bg-info/10 p-3">
              <h4 className="flex items-center gap-2 text-sm font-semibold text-info">
                <InfoIcon aria-hidden="true" className="size-4" />
                Good to know
              </h4>
              <ul className="space-y-1 text-sm leading-relaxed text-foreground">
                {module.tips.map((tip) => (
                  <li key={tip}>{tip}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <Button asChild tone="outline" size="touch">
            <Link href={tenantHref(module.href)}>
              {module.cta}
              <ChevronRightIcon aria-hidden="true" className="size-4" />
            </Link>
          </Button>
        </div>
      </article>
    </Card>
  );
}
