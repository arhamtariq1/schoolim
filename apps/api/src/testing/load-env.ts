import { loadEnv } from '@ilm/db';

loadEnv();

/**
 * Tests never send mail. Not configurable, not overridable from `.env`.
 *
 * The e2e suite signs up schools repeatedly, at addresses like
 * `founder@signup-e2e.test` that do not exist. With a real relay configured —
 * and `.env` may well have one, because the product actually sends mail now —
 * every run would push a burst of undeliverable messages through it. On a
 * consumer account that is how the account gets rate-limited or suspended, and
 * the failure would show up as "signup is broken" days later.
 *
 * Forced here rather than left to each suite to remember, because the suite
 * that forgets is the one that runs in CI at 3am. See ADR-0011.
 */
process.env['MAIL_DRIVER'] = 'log';
