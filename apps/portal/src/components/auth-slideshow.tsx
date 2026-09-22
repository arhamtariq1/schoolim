'use client';

import { useEffect, useState } from 'react';

/**
 * The visual half of every auth screen.
 *
 * Full-bleed slides rather than a static illustration: the eye needs a reason
 * to stay on the left while someone fills the form, and a single card collage
 * goes stale after one visit. Each slide is real markup on the brand gradient
 * — not a PNG — so the palette cannot drift from the rest of the product and
 * nothing ships as a second brand asset.
 *
 * The whole panel is `aria-hidden` in the layout above, so nothing here may be
 * focusable. Dot indicators are decorative only.
 */

const SLIDE_MS = 5_500;

const SLIDES = [
  {
    id: 'collection',
    eyebrow: 'This term',
    title: 'Every rupee accounted for, from the challan to the bank.',
    body: 'Fees billed, collected and reconciled in one place — with totals that still match in year four.',
    Scene: CollectionScene,
  },
  {
    id: 'challan',
    eyebrow: 'Fee vouchers',
    title: 'A challan a parent can pay, and a bank will accept.',
    body: 'Issued once, frozen at generate time — changing a plan never rewrites a voucher that already went out.',
    Scene: ChallanScene,
  },
  {
    id: 'defaulters',
    eyebrow: 'Follow-up',
    title: 'Who is behind, sorted by what it costs you.',
    body: 'Arrears that carry themselves forward, and a Monday morning list that names the families that matter.',
    Scene: DefaultersScene,
  },
] as const;

export function AuthSlideshow() {
  const [active, setActive] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => {
      setReducedMotion(media.matches);
    };
    sync();
    media.addEventListener('change', sync);
    return () => {
      media.removeEventListener('change', sync);
    };
  }, []);

  useEffect(() => {
    if (reducedMotion) {
      return;
    }

    const timer = window.setInterval(() => {
      setActive((current) => (current + 1) % SLIDES.length);
    }, SLIDE_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, [reducedMotion]);

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-brand-gradient p-10 xl:p-14">
      <div className="pointer-events-none absolute -top-24 -left-24 size-96 rounded-full bg-white/10 blur-3xl" />
      <div className="pointer-events-none absolute right-0 bottom-0 size-[28rem] translate-x-1/3 translate-y-1/4 rounded-full bg-white/5 blur-3xl" />

      <div className="relative flex min-h-0 flex-1 items-center justify-center">
        {SLIDES.map((slide, index) => {
          const isActive = index === active;
          return (
            <div
              key={slide.id}
              className={`absolute inset-0 flex flex-col justify-center transition-opacity duration-700 ease-in-out ${
                isActive ? 'opacity-100' : 'pointer-events-none opacity-0'
              }`}
            >
              <div className="mx-auto w-full max-w-md">
                <slide.Scene />
              </div>
            </div>
          );
        })}
      </div>

      <div className="relative mt-10">
        <div className="relative min-h-36">
          {SLIDES.map((slide, index) => {
            const isActive = index === active;
            return (
              <div
                key={slide.id}
                className={`transition-opacity duration-700 ease-in-out ${
                  isActive
                    ? 'relative opacity-100'
                    : 'pointer-events-none absolute inset-0 opacity-0'
                }`}
              >
                <p className="text-xs font-medium tracking-wide text-white/60 uppercase">
                  {slide.eyebrow}
                </p>
                <h2 className="mt-2 text-2xl leading-tight font-semibold tracking-tight text-balance text-white">
                  {slide.title}
                </h2>
                <p className="mt-3 max-w-md text-sm leading-relaxed text-white/70">{slide.body}</p>
              </div>
            );
          })}
        </div>

        <div className="mt-4 flex gap-2">
          {SLIDES.map((slide, index) => (
            <span
              key={slide.id}
              className={`h-1.5 rounded-full transition-all duration-500 ${
                index === active ? 'w-8 bg-white' : 'w-1.5 bg-white/35'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-xl border border-white/15 bg-white/10 p-4 shadow-overlay backdrop-blur-sm ${className ?? ''}`}
    >
      {children}
    </div>
  );
}

function CollectionScene() {
  return (
    <Panel>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xs font-medium text-white/60">Collected this term</p>
        <p className="text-[0.6875rem] text-white/50">Nov 2026</p>
      </div>
      <p className="mt-1.5 font-mono text-2xl font-semibold tracking-tight text-white tabular-nums">
        PKR 18,42,000
      </p>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/15">
        <div className="h-full w-4/5 rounded-full bg-white/80" />
      </div>
      <div className="mt-2 flex justify-between text-[0.6875rem] text-white/60">
        <span>82% of billed</span>
        <span className="font-mono tabular-nums">PKR 4,06,000 outstanding</span>
      </div>
    </Panel>
  );
}

function ChallanScene() {
  return (
    <div className="space-y-4">
      <Panel>
        <p className="text-[0.6875rem] font-medium text-white/60">Fee challan</p>
        <p className="mt-1 font-mono text-xs text-white/90">FV-001284</p>
        <dl className="mt-3 space-y-1.5 text-[0.6875rem]">
          <div className="flex justify-between gap-2 text-white/70">
            <dt>Tuition</dt>
            <dd className="font-mono tabular-nums">6,000</dd>
          </div>
          <div className="flex justify-between gap-2 text-white/70">
            <dt>Arrears</dt>
            <dd className="font-mono tabular-nums">6,000</dd>
          </div>
          <div className="flex justify-between gap-2 border-t border-white/15 pt-1.5 font-medium text-white">
            <dt>Due 15 Nov</dt>
            <dd className="font-mono tabular-nums">12,000</dd>
          </div>
        </dl>
      </Panel>
      <Panel>
        <p className="text-[0.6875rem] font-medium text-white/60">Receipt</p>
        <p className="mt-1 text-sm text-white">Paid at counter · cash</p>
        <p className="mt-2 font-mono text-lg font-semibold text-white tabular-nums">PKR 12,000</p>
      </Panel>
    </div>
  );
}

function DefaultersScene() {
  return (
    <Panel>
      <p className="text-[0.6875rem] font-medium text-white/60">Defaulters</p>
      <p className="mt-1 font-mono text-lg font-semibold text-white tabular-nums">4 families</p>
      <ul className="mt-2.5 space-y-1.5 text-[0.6875rem] text-white/70">
        {[
          ['Ayesha N.', '3 months'],
          ['Bilal R.', '2 months'],
          ['Hamza S.', '1 month'],
          ['Sara K.', '1 month'],
        ].map(([name, behind]) => (
          <li key={name} className="flex justify-between gap-2">
            <span className="truncate">{name}</span>
            <span className="shrink-0 tabular-nums">{behind}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
