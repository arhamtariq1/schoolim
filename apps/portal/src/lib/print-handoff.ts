'use client';

/**
 * Handing a selection of voucher ids to the print tab.
 *
 * ## Why not the URL
 *
 * Five hundred ids is eighteen kilobytes. Browsers and proxies start refusing
 * somewhere around two, so the selection cannot travel on the request line.
 *
 * ## Why not `sessionStorage`
 *
 * It was `sessionStorage`, and it did not work. A tab opened with `noopener`
 * gets a browsing context with **no relationship to its opener**, and the
 * sessionStorage copy a new tab normally inherits is part of that
 * relationship — so the print tab opened onto an empty store and reported that
 * nothing had been selected, to somebody who had just selected fourteen things.
 *
 * Dropping `noopener` would have fixed it by giving the print tab a handle on
 * the page that opened it. Keeping `noopener` and using a store that is shared
 * across tabs is the better trade: the tab needs the data, not the handle.
 *
 * ## Why a token rather than a fixed key
 *
 * Two print runs opened in quick succession would otherwise race for one key
 * and the second would win both tabs. Each run writes under its own id and the
 * print page is told which one to read, in a query string short enough to fit.
 *
 * ## Why reading does **not** delete
 *
 * It did, and that was a bug. React runs an effect twice on mount in Strict
 * Mode, which is on in development: the first read took the selection and
 * removed it, the second found an empty store, and the error won. Every print
 * run failed, on a token that was sitting right there in the address bar.
 *
 * Reading is idempotent now, and that is the right shape regardless of Strict
 * Mode — refreshing the print tab reprints the same stack, which is exactly
 * what somebody refreshing a print tab wants. "Read once" was protecting
 * against a stale reprint that nobody was asking for, at the cost of losing
 * the data on any remount at all.
 *
 * Growth is bounded by the sweep below rather than by deletion on read.
 */

const PREFIX = 'ilm:print:';

/** Long enough that an abandoned tab can still be opened, short enough to forget. */
const STALE_AFTER_MS = 60 * 60 * 1000;

interface Handoff {
  readonly at: number;
  readonly ids: readonly string[];
}

/**
 * Stash a selection and return the token that fetches it.
 *
 * Returns undefined when the browser refuses to store anything — a private
 * window with site data blocked, or a full quota. The caller says so rather
 * than opening a tab that can only apologise.
 */
export function stashPrintSelection(ids: readonly string[]): string | undefined {
  const token = crypto.randomUUID();

  try {
    sweep();
    localStorage.setItem(PREFIX + token, JSON.stringify({ at: Date.now(), ids } satisfies Handoff));
    return token;
  } catch {
    return undefined;
  }
}

/**
 * The selection for a token. Safe to call as many times as React feels like.
 */
export function readPrintSelection(token: string | null): readonly string[] {
  if (token === null || token === '') {
    return [];
  }

  try {
    const raw = localStorage.getItem(PREFIX + token);

    if (raw === null) {
      return [];
    }

    const parsed = JSON.parse(raw) as Partial<Handoff>;

    // Checked rather than asserted: this came out of storage, where anything
    // could have put anything, and an id that is not a string would reach the
    // API as part of a request body.
    if (!Array.isArray(parsed.ids)) {
      // Something else wrote under this key, or it was half-written. Clearing
      // it is the one case where reading removes anything: it cannot become
      // valid, and leaving it means failing the same way tomorrow.
      localStorage.removeItem(PREFIX + token);
      return [];
    }
    return parsed.ids.filter((id): id is string => typeof id === 'string');
  } catch {
    // Unreadable, or storage is unavailable. Either way there is nothing to
    // print, which is what the caller is about to say.
    try {
      localStorage.removeItem(PREFIX + token);
    } catch {
      // Storage is gone entirely. Nothing to clean up.
    }
    return [];
  }
}

/** Drop handoffs from runs that were never opened. */
function sweep(): void {
  const cutoff = Date.now() - STALE_AFTER_MS;

  for (let index = localStorage.length - 1; index >= 0; index -= 1) {
    const key = localStorage.key(index);
    if (key === null || !key.startsWith(PREFIX)) {
      continue;
    }

    try {
      const parsed = JSON.parse(localStorage.getItem(key) ?? '{}') as Partial<Handoff>;
      if (typeof parsed.at !== 'number' || parsed.at < cutoff) {
        localStorage.removeItem(key);
      }
    } catch {
      localStorage.removeItem(key);
    }
  }
}
