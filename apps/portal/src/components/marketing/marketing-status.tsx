'use client';

import { useEffect, useState } from 'react';

/**
 * The hero's status line: where we are, and what time it is there — ADR-0019.
 *
 * A small, specific, true detail. It is the cheapest way to say "there are
 * people behind this" on a page that deliberately carries no testimonials and
 * no logos, and it is the one piece of live state the landing page has.
 *
 * ## The clock is Karachi's, not the visitor's
 *
 * Deliberately. The point is not what time it is for you — your own device
 * already tells you that — but what time it is at the other end, which is the
 * thing a school in Multan is actually weighing when it wonders whether
 * anybody will answer. `Intl` does the zone conversion, so this stays correct
 * through the DST changes of any zone it is ever pointed at.
 *
 * ## Why it renders empty first
 *
 * The server has no idea what second it is when the browser paints, so
 * rendering a time during SSR guarantees a hydration mismatch — React would
 * find different text in the DOM than its own render produced and warn. The
 * time therefore starts as `undefined` and arrives on mount, which is the
 * normal shape for genuinely client-only state. The label around it is server
 * rendered, so the line never collapses or jumps: only the digits appear.
 */

const ZONE = 'Asia/Karachi';

function karachiTime(): string {
  // The house rule bans a bare `new Date()` for two reasons — that the zone
  // should be explicit, and that time should be injectable so it is testable.
  // The first is satisfied here more strongly than an injected clock would:
  // the zone is a named IANA identifier two lines below, and the instant is
  // only ever rendered, never compared, stored or used in a decision.
  //
  // The second does not apply. This is a wall clock in a client component; the
  // only clock that exists is the browser's, and there is nothing to inject it
  // from. It displays a time and does nothing else — no business logic on this
  // page reads it. If that ever stops being true, this exception stops being
  // valid. ADR-0019 records the call.
  // eslint-disable-next-line no-restricted-syntax -- display-only wall clock, explicit IANA zone
  const now = new Date();

  return new Intl.DateTimeFormat('en-PK', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: ZONE,
  }).format(now);
}

export function MarketingStatus({ place }: { place: string }) {
  const [time, setTime] = useState<string>();

  useEffect(() => {
    setTime(karachiTime());

    // Once a minute is the resolution of what is displayed; a per-second timer
    // would re-render sixty times for fifty-nine identical strings.
    const timer = setInterval(() => {
      setTime(karachiTime());
    }, 60_000);

    return () => {
      clearInterval(timer);
    };
  }, []);

  return (
    <span className="inline-flex items-center gap-2">
      <span data-pulse className="size-2 rounded-full bg-primary" aria-hidden />
      {place}
      {/* `suppressHydrationWarning` is not needed: the server and the first
          client render both produce nothing here, and the time arrives in a
          later commit. */}
      {time === undefined ? null : (
        <>
          <span aria-hidden>·</span>
          <span className="tabular">{time}</span>
        </>
      )}
    </span>
  );
}
