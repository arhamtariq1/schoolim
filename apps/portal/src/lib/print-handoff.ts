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
 * ## Why it is read once and deleted
 *
 * `localStorage` persists. A selection left behind is a stale list that the
 * next print run could pick up, and it is nobody's idea of data worth keeping
 * after the paper is out of the printer. Reading removes it, and a sweep on
 * write clears anything an abandoned run left behind.
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

/** Take the selection for a token. Removes it: a handoff is read once. */
export function takePrintSelection(token: string | null): readonly string[] {
  if (token === null || token === '') {
    return [];
  }

  try {
    const raw = localStorage.getItem(PREFIX + token);
    localStorage.removeItem(PREFIX + token);

    if (raw === null) {
      return [];
    }

    const parsed = JSON.parse(raw) as Partial<Handoff>;

    // Checked rather than asserted: this came out of storage, where anything
    // could have put anything, and an id that is not a string would reach the
    // API as part of a request body.
    if (!Array.isArray(parsed.ids)) {
      return [];
    }
    return parsed.ids.filter((id): id is string => typeof id === 'string');
  } catch {
    // Unreadable, or storage is unavailable. Either way there is nothing to
    // print, which is what the caller is about to say.
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
