/**
 * Time is injected, never read from the ambient environment.
 *
 * The shared ESLint config bans bare `new Date()` precisely so that every read
 * of "now" goes through a Clock. Fee due dates, attendance windows and
 * voucher-run boundaries are all time-dependent, and none of them can be tested
 * against a moving target.
 */
export interface Clock {
  now(): Date;
}

/** The real clock. Injected once, at the composition root. */
export const systemClock: Clock = {
  now: () => new Date(Date.now()),
};

/** A clock frozen at an instant, for tests and for a deterministic job run. */
export function fixedClock(instant: Date): Clock {
  const frozen = instant.getTime();
  return { now: () => new Date(frozen) };
}

/**
 * A clock that advances only when told to, for testing sequences where
 * ordering matters — a refresh-token rotation, a job cursor, an audit trail.
 */
export function mutableClock(start: Date): Clock & { advanceBy(milliseconds: number): void } {
  let current = start.getTime();
  return {
    now: () => new Date(current),
    advanceBy: (milliseconds: number) => {
      current += milliseconds;
    },
  };
}
