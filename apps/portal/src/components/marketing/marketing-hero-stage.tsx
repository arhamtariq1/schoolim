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
import { useRef, type ReactNode } from 'react';

import { useMarketingMotion } from './marketing-motion-gate';

/**
 * The hero's product stage — ADR-0019 as amended.
 *
 * The dashboard starts tipped back in perspective and stands upright as the
 * reader scrolls it into place; the cards around it drift at their own rates.
 * Every value is a function of scroll position, so nothing here moves on a
 * timer, and for a reader who has asked for less motion the stage stays flat
 * and still (see `useMarketingMotion`).
 *
 * `LazyMotion` + `m` rather than `motion`: the page needs scroll-linked styles
 * and nothing else, and the lazy feature bundle is what keeps the route inside
 * the budget docs/16 §14 sets for a 4G phone.
 */

export type StageFloat = {
  node: ReactNode;
  /** Placement, as utility classes — the float is absolutely positioned. */
  className: string;
  /** Pixels of drift across the stage's scroll range; negative rises. */
  drift: number;
};

function Float({
  float,
  progress,
  isMoving,
}: {
  float: StageFloat;
  progress: MotionValue<number>;
  isMoving: boolean;
}) {
  const y = useTransform(progress, [0, 1], [0, float.drift]);
  return (
    <m.div style={isMoving ? { y } : undefined} className={cn('absolute z-10', float.className)}>
      {float.node}
    </m.div>
  );
}

export function HeroStage({
  children,
  floats,
  className,
}: {
  children: ReactNode;
  floats: StageFloat[];
  className?: string;
}) {
  const stage = useRef<HTMLDivElement>(null);
  const isMoving = useMarketingMotion();
  // 0 when the stage's top meets the bottom of the viewport, 1 when it reaches the top.
  const { scrollYProgress } = useScroll({ target: stage, offset: ['start end', 'start start'] });
  const rotateX = useTransform(scrollYProgress, [0, 0.55], [16, 0]);
  const scale = useTransform(scrollYProgress, [0, 0.55], [0.92, 1]);

  return (
    <LazyMotion features={domAnimation} strict>
      <div ref={stage} className={cn('relative perspective-distant', className)}>
        <m.div style={isMoving ? { rotateX, scale } : undefined} className="origin-top">
          {children}
        </m.div>
        {floats.map((float, position) => (
          <Float key={position} float={float} progress={scrollYProgress} isMoving={isMoving} />
        ))}
      </div>
    </LazyMotion>
  );
}
