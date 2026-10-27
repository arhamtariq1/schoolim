'use client';

import { cn } from '@ilm/ui';
import {
  LazyMotion,
  domAnimation,
  m,
  useScroll,
  useTransform,
  type MotionValue,
} from 'motion/react';
import { useRef, type CSSProperties, type ReactNode } from 'react';

import { useMarketingMotion } from './marketing-motion-gate';

/**
 * "One window" — the page's central set piece, and the product's whole pitch.
 *
 * The scattered tools a school runs on today (a register, a receipt book, a
 * spreadsheet, a parents' group…) sit around the edge of the stage; as the
 * reader scrolls, they fold into the centre and a single window takes their
 * place. Scroll is the only input — nothing here plays on its own.
 *
 * ## Two layouts, one DOM
 *
 * Without motion (no JS, before hydration, reduced motion) the section is its
 * finished picture: the window in the middle with the old tools still visible
 * around it, placed by CSS custom properties. With motion, `data-active` makes
 * the section tall and its stage sticky (globals.css), and Motion writes
 * transforms over the same elements. The markup never changes between the two,
 * which is what keeps hydration exact.
 */

export type ConvergeTool = {
  label: string;
  icon: ReactNode;
  /** Resting offset from the stage centre, in viewport units, and a tilt. */
  x: number;
  y: number;
  tilt: number;
};

/** Offsets are computed per tool — docs/16 §2's one allowance for inline style. */
function restingPlacement(tool: ConvergeTool): CSSProperties {
  return {
    '--tool-x': `${String(tool.x)}vw`,
    '--tool-y': `${String(tool.y)}vh`,
    '--tool-tilt': `${String(tool.tilt)}deg`,
  } as CSSProperties;
}

function Tool({
  tool,
  progress,
  isMoving,
}: {
  tool: ConvergeTool;
  progress: MotionValue<number>;
  isMoving: boolean;
}) {
  const x = useTransform(
    progress,
    [0, 0.25, 0.62],
    [`${String(tool.x)}vw`, `${String(tool.x * 0.9)}vw`, '0vw'],
  );
  const y = useTransform(
    progress,
    [0, 0.25, 0.62],
    [`${String(tool.y)}vh`, `${String(tool.y * 0.9)}vh`, '0vh'],
  );
  const rotate = useTransform(progress, [0, 0.62], [tool.tilt, 0]);
  const scale = useTransform(progress, [0.45, 0.66], [1, 0.55]);
  const opacity = useTransform(progress, [0.55, 0.7], [1, 0]);

  return (
    <div className="absolute start-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rtl:translate-x-1/2">
      <m.div
        data-converge-tool
        style={isMoving ? { x, y, rotate, scale, opacity } : restingPlacement(tool)}
        className="rounded-tile shadow-tile flex items-center gap-3 border border-border bg-card px-4 py-3 text-sm font-medium whitespace-nowrap"
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
          {tool.icon}
        </span>
        {tool.label}
      </m.div>
    </div>
  );
}

export function Converge({
  before,
  after,
  tools,
  children,
}: {
  /** The problem, read first. */
  before: ReactNode;
  /** The answer, which takes over as the tools fold away. */
  after: ReactNode;
  tools: ConvergeTool[];
  /** The one window. */
  children: ReactNode;
}) {
  const section = useRef<HTMLDivElement>(null);
  const isMoving = useMarketingMotion();
  const { scrollYProgress } = useScroll({ target: section, offset: ['start start', 'end end'] });

  const beforeOpacity = useTransform(scrollYProgress, [0.42, 0.64], [1, 0.3]);
  const afterOpacity = useTransform(scrollYProgress, [0.5, 0.74], [0.3, 1]);
  const windowOpacity = useTransform(scrollYProgress, [0.5, 0.76], [0, 1]);
  const windowScale = useTransform(scrollYProgress, [0.5, 0.82], [0.86, 1]);

  return (
    <LazyMotion features={domAnimation} strict>
      <div ref={section} data-converge data-active={isMoving ? '' : undefined}>
        <div data-converge-stage className="relative flex flex-col items-center overflow-hidden">
          <div className="relative z-20 mx-auto max-w-3xl px-6 text-center">
            <m.div style={isMoving ? { opacity: beforeOpacity } : undefined}>{before}</m.div>
            <m.div style={isMoving ? { opacity: afterOpacity } : undefined} className="mt-4">
              {after}
            </m.div>
          </div>

          <div data-converge-field className="relative w-full flex-1">
            {tools.map((tool) => (
              <Tool key={tool.label} tool={tool} progress={scrollYProgress} isMoving={isMoving} />
            ))}
            <m.div
              style={isMoving ? { opacity: windowOpacity, scale: windowScale } : undefined}
              className={cn(
                'absolute start-1/2 top-1/2 z-10 w-full max-w-3xl -translate-x-1/2 -translate-y-1/2 px-6 rtl:translate-x-1/2',
              )}
            >
              {children}
            </m.div>
          </div>
        </div>
      </div>
    </LazyMotion>
  );
}
