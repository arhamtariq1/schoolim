/**
 * The panel beside the sign-in form.
 *
 * ## What it is showing
 *
 * Three of this product's own surfaces, at the moment they are actually useful:
 * a term's collection against its target, a challan as a parent receives it,
 * and the overdue list an office works from on a Monday. Not a carousel, not a
 * feature list — the thing itself, small.
 *
 * The numbers are illustrative and deliberately unremarkable: a school of a few
 * hundred, a fee of six thousand, four families behind. Round marketing figures
 * on a sign-in screen read as a brochure, and this is the screen where somebody
 * decides whether the product is for a school like theirs.
 *
 * ## Why it is not interactive
 *
 * The whole panel is `aria-hidden` in the layout above, so nothing in here may
 * be focusable or carry meaning a screen-reader user would miss. It is a
 * picture made of divs: no links, no buttons, no text that says anything the
 * form does not.
 */
export function AuthShowcase() {
  return (
    <div className="relative flex h-full flex-col justify-between overflow-hidden p-10 xl:p-14">
      {/* A soft light from the top-left, so the flat gradient reads as a
          surface rather than a swatch. */}
      <div className="pointer-events-none absolute -top-24 -left-24 size-96 rounded-full bg-white/10 blur-3xl" />

      <div className="relative flex flex-1 items-center justify-center">
        <div className="w-full max-w-sm space-y-4">
          <CollectionCard />
          <div className="flex gap-4">
            <ChallanCard />
            <DefaultersCard />
          </div>
        </div>
      </div>

      <div className="relative mt-10">
        <h2 className="text-2xl leading-tight font-semibold tracking-tight text-balance text-white">
          Every rupee accounted for, from the challan to the bank.
        </h2>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-white/70">
          Fees, attendance and admissions in one place — with a voucher a bank accepts, arrears that
          carry themselves forward, and totals that still reconcile in year four.
        </p>
      </div>
    </div>
  );
}

/** Frosted glass, the one place in the product where a blur earns its keep. */
function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-xl border border-white/15 bg-white/10 p-4 shadow-overlay backdrop-blur-sm ${className ?? ''}`}
    >
      {children}
    </div>
  );
}

function CollectionCard() {
  return (
    <Panel>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xs font-medium text-white/60">Collected this term</p>
        <p className="text-[0.6875rem] text-white/50">Nov 2026</p>
      </div>
      <p className="mt-1.5 font-mono text-2xl font-semibold tracking-tight text-white tabular-nums">
        PKR 18,42,000
      </p>

      {/* 82% — the bar and the label say the same thing, because colour and
          length alone are not a figure anybody can quote. */}
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/15">
        <div className="h-full w-[82%] rounded-full bg-white/80" />
      </div>
      <div className="mt-2 flex justify-between text-[0.6875rem] text-white/60">
        <span>82% of billed</span>
        <span className="font-mono tabular-nums">PKR 4,06,000 outstanding</span>
      </div>
    </Panel>
  );
}

function ChallanCard() {
  return (
    <Panel className="flex-1">
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
  );
}

function DefaultersCard() {
  return (
    <Panel className="flex-1">
      <p className="text-[0.6875rem] font-medium text-white/60">Defaulters</p>
      <p className="mt-1 font-mono text-lg font-semibold text-white tabular-nums">4</p>
      <ul className="mt-2.5 space-y-1.5 text-[0.6875rem] text-white/70">
        {[
          ['Ayesha N.', '3 months'],
          ['Bilal R.', '2 months'],
          ['Hamza S.', '1 month'],
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
