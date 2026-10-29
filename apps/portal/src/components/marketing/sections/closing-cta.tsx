import { TRIAL_DAYS } from '@ilm/contracts';
import { cn } from '@ilm/ui';
import { ForwardIcon, ICON_SIZE } from '@ilm/ui/icons';
import Image from 'next/image';
import Link from 'next/link';

import classroom from '../../../../public/marketing/classroom-uniforms.jpg';

import { CONTAINER, GHOST_ON_DARK, PRIMARY } from './shared';

import { CONTACT } from '@/components/marketing/marketing-content';
import { Reveal } from '@/components/marketing/marketing-parts';

/**
 * The last ask, over the classroom again. The scrim runs from solid ink on
 * the text side to clear on the photo side, so the copy always sits on ink.
 */
export function ClosingCta() {
  return (
    <section aria-labelledby="closing-title" className="px-2 sm:px-4">
      <div className="marketing-ink rounded-tile relative overflow-hidden bg-background">
        <Image
          src={classroom}
          alt=""
          placeholder="blur"
          sizes="100vw"
          className="absolute inset-0 size-full object-cover object-top"
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-linear-to-r from-background via-background/90 to-background/40"
        />

        <div className={cn(CONTAINER, 'relative py-24 sm:py-32')}>
          <Reveal className="max-w-2xl">
            <h2 id="closing-title" className="font-display text-display-lg font-bold text-balance">
              Put the register back in the cupboard.
            </h2>
            <p className="mt-6 text-lg text-pretty text-foreground/85">
              Create your school in under a minute and run a real month on it — {TRIAL_DAYS} days
              free, nothing to install, no card asked for.
            </p>
            <div className="mt-10 flex flex-wrap gap-3">
              <Link href="/signup" className={PRIMARY}>
                Start your free trial
                <ForwardIcon className={ICON_SIZE.inline} aria-hidden />
              </Link>
              <a href={`mailto:${CONTACT.email}`} className={GHOST_ON_DARK}>
                Talk to us
              </a>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
