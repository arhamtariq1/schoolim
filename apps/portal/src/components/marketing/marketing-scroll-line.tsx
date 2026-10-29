'use client';

import { cn } from '@ilm/ui';
import { LazyMotion, domAnimation, m, useScroll, useTransform } from 'motion/react';
import { useRef } from 'react';

import { useMarketingMotion } from './marketing-motion-gate';

/**
 * A hairline that draws itself as the reader moves through the steps it joins.
 *
 * `scaleX` on a full-width line rather than animating `width` (docs/16 §12).
 * Without motion it is simply drawn: a finished line, never a missing one.
 */
export function ScrollLine({ className }: { className?: string }) {
  const track = useRef<HTMLDivElement>(null);
  const isMoving = useMarketingMotion();
  const { scrollYProgress } = useScroll({ target: track, offset: ['start 85%', 'end 55%'] });
  const scaleX = useTransform(scrollYProgress, [0, 1], [0, 1]);

  return (
    <LazyMotion features={domAnimation} strict>
      <div ref={track} aria-hidden className={cn('relative h-px w-full bg-border', className)}>
        <m.span
          style={isMoving ? { scaleX } : undefined}
          className="absolute inset-0 origin-left bg-primary rtl:origin-right"
        />
      </div>
    </LazyMotion>
  );
}
