import { BRAND } from '@ilm/utils';
import type { Metadata } from 'next';

import { ClosingBand } from '@/components/marketing/landing/closing-band';
import { EmpowerSection } from '@/components/marketing/landing/empower-section';
import { FeatureGrid } from '@/components/marketing/landing/feature-grid';
import { LandingFooter } from '@/components/marketing/landing/landing-footer';
import { PackagesSection } from '@/components/marketing/landing/packages-section';
import { QuestionsSection } from '@/components/marketing/landing/questions-section';
import { ResultsBand } from '@/components/marketing/landing/results-band';
import { RolesSection } from '@/components/marketing/landing/roles-section';
import { MarketingBootstrap } from '@/components/marketing/marketing-bootstrap';
import { MarketingRevealGuard } from '@/components/marketing/marketing-reveal-guard';
import { MarketingSmoothScroll } from '@/components/marketing/marketing-smooth-scroll';
import { Hero } from '@/components/marketing/sections/hero';
import { SiteHeader } from '@/components/marketing/sections/site-header';
import { brandFont } from '@/lib/fonts';
import { getPublicPlans } from '@/lib/public-plans';

/**
 * The public landing page, served at the apex — ADR-0010, art-directed per
 * ADR-0019 and laid out after the product owner's reference, in the brand's
 * own teal.
 *
 * Reached by a rewrite from `/` (see `src/proxy.ts`), so the address bar reads
 * as the bare domain. This is the only page in the portal with no tenant and no
 * session, which makes it the only page allowed to say anything about the
 * product rather than about a school.
 *
 * ## The order
 *
 * The dark hero with the admin dashboard, every module around a phone, a teal band on
 * results, the case for switching beside a classroom photograph, who sees
 * what, packages, questions, and a teal closing band over a dark footer. Each
 * section is its own file in `components/marketing/landing/`.
 *
 * ## What it shows, and what it still refuses to
 *
 * The product is shown as previews built from the real `@ilm/ui` parts, with
 * every number drawn from one sample-school file and labelled as a sample
 * (`SampleTag`). Where the reference has testimonials and usage figures, this
 * page has the roles the product serves and facts that can be checked in the
 * trial: no testimonials, no customer logos, no usage statistics.
 *
 * ## Motion
 *
 * Reveals are CSS transitions driven by one `IntersectionObserver` in
 * `MarketingBootstrap`, and smooth scrolling is Lenis. Nothing moves on a
 * timer, and with no JavaScript or under `prefers-reduced-motion` the page is
 * complete as served HTML.
 */
export const metadata: Metadata = {
  title: `${BRAND.name} — the all-in-one school management system`,
  description:
    'Admissions, fees, attendance, marks, timetables, staff and finance in one place. One login, one record per student, set up in an afternoon.',
};

/**
 * Plans are data, not code: prices and plan details come from the platform
 * console (`getPublicPlans`) and are cached for a short window. Pricing is
 * decision D2 (docs/15) and still open, which is exactly why it must be
 * editable without a deploy.
 */
// A literal, not an imported constant: Next reads route-segment config statically
// and rejects anything it cannot evaluate at build time. Keep it equal to
// PLANS_REVALIDATE_SECONDS in lib/public-plans.ts.
export const revalidate = 30;

const NAV = [
  { href: '#features', label: 'Features' },
  { href: '#results', label: 'Results' },
  { href: '#roles', label: 'Roles' },
  { href: '#packages', label: 'Packages' },
  { href: '#questions', label: 'Questions' },
] as const;

export default async function WelcomePage() {
  const plans = await getPublicPlans();
  return (
    <div
      id="top"
      className={`${brandFont.variable} marketing min-h-dvh overflow-x-clip bg-background text-foreground`}
    >
      {/* Before the content, so the attribute is set before the hero paints. */}
      <MarketingBootstrap />
      {/* After it, and after hydration: re-observes anything React replaced. */}
      <MarketingRevealGuard />
      <MarketingSmoothScroll />

      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:start-6 focus:top-6 focus:z-50 focus:rounded-full focus:bg-card focus:px-4 focus:py-2 focus:text-sm focus:ring-2 focus:ring-ring"
      >
        Skip to content
      </a>

      <SiteHeader links={NAV} />

      <main id="main">
        <Hero />
        <FeatureGrid />
        <ResultsBand />
        <EmpowerSection />
        <RolesSection />
        <PackagesSection plans={plans} />
        <QuestionsSection />
        <ClosingBand />
      </main>

      <LandingFooter links={NAV} />
    </div>
  );
}
