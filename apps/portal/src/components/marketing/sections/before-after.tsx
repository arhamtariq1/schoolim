import { Tabs, TabsContent, TabsList, TabsTrigger, cn } from '@ilm/ui';
import { ApproveIcon, CloseIcon, ICON_SIZE } from '@ilm/ui/icons';
import { BRAND } from '@ilm/utils';

import { CONTAINER } from './shared';

import { PROBLEMS } from '@/components/marketing/marketing-content';
import { Reveal } from '@/components/marketing/marketing-parts';

const pad = (value: number) => String(value).padStart(2, '0');

const MODES = [
  { value: 'paper', label: 'On paper today' },
  { value: 'lemma', label: `With ${BRAND.name}` },
] as const;

/**
 * The problem, in the hero's language — its pill and display type, on the
 * plain white page — with a switch instead of a
 * screenshot. Flip it and the five jobs a school does every week turn from
 * the paper way into the one-record way, row by row.
 *
 * The switch is Radix Tabs, so it is keyboard-operable and every row of both
 * states is in the served HTML. With JavaScript off the first state shows.
 */
export function BeforeAfter() {
  return (
    <section
      id="product"
      aria-labelledby="before-after-title"
      className="scroll-mt-16 px-2 py-16 sm:px-4 sm:py-24"
    >
      <div className="relative">
        <Tabs defaultValue="paper" className={cn(CONTAINER, 'py-20 sm:py-28')}>
          <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
            <Reveal className="lg:col-span-5">
              <div className="lg:sticky lg:top-28">
                <p className="inline-flex items-center gap-3 rounded-full border border-foreground/15 bg-foreground/5 py-1 ps-1 pe-4 text-sm text-foreground/85">
                  <span className="inline-flex items-center gap-2 rounded-full bg-foreground px-3 py-1 text-xs font-medium text-background">
                    <span aria-hidden className="size-2 rounded-full bg-primary" />
                    Why schools switch
                  </span>
                  Five jobs, one record
                </p>

                <h2
                  id="before-after-title"
                  className="font-display text-display-md mt-8 font-medium text-balance"
                >
                  From five registers to one record.
                </h2>
                <p className="mt-6 max-w-md text-lg text-pretty text-muted-foreground">
                  The same five jobs every school does each week. Flip the switch to see each one
                  the paper way, and the {BRAND.name} way.
                </p>

                <TabsList
                  aria-label="Compare"
                  className="mt-10 inline-flex h-auto gap-1 rounded-full border border-foreground/15 bg-foreground/5 p-1"
                >
                  {MODES.map((mode) => (
                    <TabsTrigger
                      key={mode.value}
                      value={mode.value}
                      className="min-h-11 rounded-full px-5 text-sm text-foreground/75 data-[state=active]:bg-foreground data-[state=active]:text-background data-[state=active]:shadow-none"
                    >
                      {mode.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>
            </Reveal>

            <div className="lg:col-span-7">
              <TabsContent value="paper" data-role-panel className="mt-0">
                <ol className="space-y-3">
                  {PROBLEMS.map((row, index) => (
                    <li
                      key={row.problem}
                      className="flex gap-5 rounded-2xl border border-border bg-muted p-5 sm:p-6"
                    >
                      <span className="text-sm text-muted-foreground tabular-nums">
                        {pad(index + 1)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-lg font-semibold">{row.problem}</span>
                        <span className="mt-1 block text-sm text-pretty text-muted-foreground">
                          {row.before}
                        </span>
                      </span>
                      <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-danger/15 text-danger">
                        <CloseIcon className={ICON_SIZE.inline} aria-hidden />
                        <span className="sr-only">The problem</span>
                      </span>
                    </li>
                  ))}
                </ol>
              </TabsContent>

              <TabsContent value="lemma" data-role-panel className="mt-0">
                <ol className="space-y-3">
                  {PROBLEMS.map((row, index) => (
                    <li
                      key={row.problem}
                      className="flex gap-5 rounded-2xl border border-primary/40 bg-primary/10 p-5 sm:p-6"
                    >
                      <span className="text-sm text-primary tabular-nums">{pad(index + 1)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-lg font-semibold">{row.problem}</span>
                        <span className="mt-1 block text-sm text-pretty text-foreground/85">
                          {row.after}
                        </span>
                      </span>
                      <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <ApproveIcon className={ICON_SIZE.inline} aria-hidden />
                        <span className="sr-only">Solved with {BRAND.name}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              </TabsContent>
            </div>
          </div>
        </Tabs>
      </div>
    </section>
  );
}
