import { systemClock, type Clock } from '@ilm/utils';

/**
 * The injectable clock.
 *
 * The shared ESLint config bans bare `new Date()`, so every read of "now" comes
 * from here. Injecting it is what makes a fee due date, a lockout window or a
 * token expiry testable against a fixed instant instead of a moving target.
 */
export const CLOCK = 'CLOCK';

export const clockProvider = {
  provide: CLOCK,
  useValue: systemClock,
};

export type { Clock };
