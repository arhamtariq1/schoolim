import { TRIAL_DAYS } from '@ilm/contracts';
import { cn } from '@ilm/ui';
import { ApproveIcon, ICON_SIZE } from '@ilm/ui/icons';
import { BRAND } from '@ilm/utils';

import { Accent, CONTAINER, SECTION_Y, SectionHeading } from './shared';

import { EVERY_PLAN } from '@/components/marketing/marketing-content';
import { MarketingPricing } from '@/components/marketing/marketing-pricing';

export function PricingSection() {
  return (
    <section id="pricing" aria-labelledby="pricing-title" className="scroll-mt-16">
      <div className={cn(CONTAINER, SECTION_Y)}>
        <SectionHeading
          align="center"
          eyebrow="Pricing"
          titleId="pricing-title"
          title={
            <>
              Simple pricing, <Accent>per campus</Accent>
            </>
          }
          lead={`Every plan starts with ${String(TRIAL_DAYS)} days free, with every module switched on. Pay monthly, or yearly and get two months free.`}
        />

        <div className="mt-12">
          <MarketingPricing />
        </div>

        <div className="rounded-tile mt-8 bg-muted p-6 sm:p-8">
          <h3 className="font-bold">Included in every plan</h3>
          <ul className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {EVERY_PLAN.map((item) => (
              <li key={item} className="flex gap-3">
                <ApproveIcon
                  className={cn(ICON_SIZE.inline, 'mt-0.5 shrink-0 text-primary')}
                  aria-hidden
                />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <p className="mt-8 text-center text-sm text-muted-foreground">
          Prices in Pakistani rupees, per campus, exclusive of applicable taxes. More than one
          campus or over 1,000 students?{' '}
          <a
            href={`mailto:${BRAND.supportEmail}`}
            className="font-semibold text-primary underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            Talk to us
          </a>
        </p>
      </div>
    </section>
  );
}
