'use client';

import { cn } from '@ilm/ui';
import { AnimatePresence, LazyMotion, domAnimation, m } from 'motion/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { useMarketingMotion } from './marketing-motion-gate';

/**
 * The feature tour — four jobs a school does every day, each with the screen
 * that does it.
 *
 * Steps scroll past on the start side; on large screens a sticky stage on the
 * end side shows the screen for whichever step is in the middle of the
 * viewport. One `IntersectionObserver` picks the step; the swap is a 250ms
 * fade (docs/16 §12 keeps entrances to 200–300ms). Below `lg` there is no
 * sticky stage: each step carries its own screen inline, because a sticky panel
 * on a phone covers the text it is illustrating.
 */

export type TourStep = {
  id: string;
  label: string;
  title: string;
  body: string;
  points: readonly string[];
  screen: ReactNode;
};

export function Tour({ steps }: { steps: TourStep[] }) {
  const [active, setActive] = useState(0);
  const isMoving = useMarketingMotion();
  const stepRefs = useRef<(HTMLLIElement | null)[]>([]);

  useEffect(() => {
    // Synchronising with the viewport — the one thing `useEffect` is for (docs/12 §6).
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActive(Number((entry.target as HTMLElement).dataset.tourIndex));
          }
        }
      },
      { rootMargin: '-45% 0px -45% 0px' },
    );
    for (const node of stepRefs.current) if (node) observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const current = steps[active] ?? steps[0];

  return (
    <LazyMotion features={domAnimation} strict>
      <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
        <ol className="lg:col-span-5">
          {steps.map((step, position) => (
            <li
              key={step.id}
              ref={(node) => {
                stepRefs.current[position] = node;
              }}
              data-tour-index={position}
              data-tour-step
              className="flex flex-col justify-center py-10 lg:py-0"
            >
              <p
                className={cn(
                  'tracking-label text-xs font-medium uppercase transition-colors duration-200',
                  active === position ? 'text-primary' : 'text-muted-foreground',
                )}
              >
                {String(position + 1).padStart(2, '0')} — {step.label}
              </p>
              <h3
                className={cn(
                  'text-display-xs mt-4 font-semibold text-balance transition-opacity duration-200',
                  active === position ? 'opacity-100' : 'lg:opacity-40',
                )}
              >
                {step.title}
              </h3>
              <p className="mt-4 max-w-md text-base leading-relaxed text-muted-foreground">
                {step.body}
              </p>
              <ul className="mt-6 space-y-2">
                {step.points.map((point) => (
                  <li key={point} className="flex items-center gap-3 text-sm">
                    <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                    {point}
                  </li>
                ))}
              </ul>
              {/* Phones get the screen inline, under the step it illustrates. */}
              <div className="mt-8 lg:hidden" aria-hidden>
                {step.screen}
              </div>
            </li>
          ))}
        </ol>

        <div className="hidden lg:col-span-7 lg:block" aria-hidden>
          <div data-tour-stage className="sticky flex items-center">
            <div className="rounded-tile shadow-frame w-full border border-border bg-muted p-6">
              {isMoving ? (
                <AnimatePresence mode="wait" initial={false}>
                  <m.div
                    key={current?.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0, transition: { duration: 0.25, ease: 'easeOut' } }}
                    exit={{ opacity: 0, y: -8, transition: { duration: 0.15, ease: 'easeIn' } }}
                  >
                    {current?.screen}
                  </m.div>
                </AnimatePresence>
              ) : (
                current?.screen
              )}
            </div>
          </div>
        </div>
      </div>
    </LazyMotion>
  );
}
