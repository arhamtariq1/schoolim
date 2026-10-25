import { BRAND } from '@ilm/utils';
import type { Metadata } from 'next';

import { MarketingBootstrap } from '@/components/marketing/marketing-bootstrap';
import { MarketingRevealGuard } from '@/components/marketing/marketing-reveal-guard';
import { MarketingSmoothScroll } from '@/components/marketing/marketing-smooth-scroll';
import { BeforeAfter } from '@/components/marketing/sections/before-after';
import { ClosingCta } from '@/components/marketing/sections/closing-cta';
import { Faq } from '@/components/marketing/sections/faq';
import { Hero } from '@/components/marketing/sections/hero';
import { ModulesGrid } from '@/components/marketing/sections/modules-grid';
import { PortalsBand } from '@/components/marketing/sections/portals-band';
import { PricingSection } from '@/components/marketing/sections/pricing-section';
import { Showcase } from '@/components/marketing/sections/showcase';
import { SiteFooter } from '@/components/marketing/sections/site-footer';
import { SiteHeader } from '@/components/marketing/sections/site-header';
import { Steps } from '@/components/marketing/sections/steps';

/**
 * The public landing page — ADR-0024.
 *
 * Dark bands for the moments that sell (hero, closing call, footer), white
 * for the moments that explain (comparison, features, portals, modules,
 * pricing, FAQ). Real classroom photography carries the warmth; the product's own
 * screens carry the proof. Each section is its own file in
 * `components/marketing/sections/`.
 *
 * The honesty rules of ADR-0019 still hold: no testimonials, no customer
 * logos, no usage figures. Product screens are sample data and say so.
 */
export const metadata: Metadata = {
  title: `${BRAND.name} — school management for Pakistan`,
  description:
    'Admissions, fee vouchers, attendance, exams, staff and accounts in one place, with a portal for admins, principals, teachers, parents and office staff.',
};

export default function WelcomePage() {
  return (
    <div id="top" className="marketing min-h-dvh bg-background text-foreground">
      <MarketingBootstrap />
      <MarketingSmoothScroll />
      <MarketingRevealGuard />

      <a
        href="#main"
        className="sr-only rounded-full bg-primary px-4 py-2 text-sm text-primary-foreground focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-50"
      >
        Skip to content
      </a>

      <SiteHeader />

      <main id="main">
        <Hero />
        <BeforeAfter />
        <Showcase />
        <PortalsBand />
        <ModulesGrid />
        <Steps />
        <PricingSection />
        <Faq />
        <div className="py-16">
          <ClosingCta />
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
