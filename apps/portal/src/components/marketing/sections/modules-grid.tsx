import { cn } from '@ilm/ui';
import { ICON_SIZE } from '@ilm/ui/icons';

import { Accent, CONTAINER, SECTION_Y, SectionHeading } from './shared';

import { FEATURES } from '@/components/marketing/marketing-content';
import { Reveal } from '@/components/marketing/marketing-parts';

/** Every module, as a card with its icon, so a principal can scan the list. */
export function ModulesGrid() {
  return (
    <section id="modules" aria-labelledby="modules-title" className="scroll-mt-16">
      <div className={cn(CONTAINER, SECTION_Y)}>
        <SectionHeading
          align="center"
          eyebrow="Modules"
          titleId="modules-title"
          title={
            <>
              Everything a school needs, <Accent>in one login</Accent>
            </>
          }
          lead="Switch on what you need today. Every module shares one student record, so nothing is typed twice."
        />

        <ul className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(({ Icon, title, body, soon }, index) => (
            <li key={title}>
              <Reveal
                index={index % 4}
                className="group rounded-tile hover:shadow-tile h-full border border-border bg-card p-6 transition-shadow duration-200"
              >
                <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary transition-colors duration-200 group-hover:bg-primary group-hover:text-primary-foreground">
                  <Icon className={ICON_SIZE.heading} aria-hidden />
                </span>
                <h3 className="mt-6 flex flex-wrap items-center gap-2 text-lg font-bold">
                  {title}
                  {soon === true ? (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                      Coming soon
                    </span>
                  ) : null}
                </h3>
                <p className="mt-2 text-sm text-pretty text-muted-foreground">{body}</p>
              </Reveal>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
