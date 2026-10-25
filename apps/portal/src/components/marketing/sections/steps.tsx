import { cn } from '@ilm/ui';

import { Accent, CONTAINER, SECTION_Y, SectionHeading } from './shared';

import { STEPS } from '@/components/marketing/marketing-content';
import { Reveal } from '@/components/marketing/marketing-parts';

/** Four steps from sign-up to a first real month. */
export function Steps() {
  return (
    <section id="how" aria-labelledby="how-title" className="scroll-mt-16 bg-muted/50">
      <div className={cn(CONTAINER, SECTION_Y)}>
        <SectionHeading
          align="center"
          eyebrow="Getting started"
          titleId="how-title"
          title={
            <>
              Up and running <Accent>in a week</Accent>
            </>
          }
          lead="No consultant, no setup fee, nothing to install."
        />

        <ol className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, index) => (
            <li key={step.title}>
              <Reveal index={index} className="rounded-tile h-full bg-card p-6 sm:p-8">
                <span className="inline-flex size-12 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground tabular-nums">
                  {index + 1}
                </span>
                <p className="mt-6 text-sm font-semibold text-primary">{step.when}</p>
                <h3 className="mt-1 text-xl font-bold">{step.title}</h3>
                <p className="mt-3 text-sm text-pretty text-muted-foreground">{step.body}</p>
              </Reveal>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
