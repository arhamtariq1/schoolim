import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { stashPrintSelection, takePrintSelection } from './print-handoff';

/**
 * Handing a selection to the print tab.
 *
 * This existed as two lines against `sessionStorage` and was wrong in a way no
 * type could catch: a tab opened with `noopener` has no relationship to its
 * opener, and the sessionStorage copy a new tab normally inherits is part of
 * that relationship. The print tab opened onto an empty store and told somebody
 * who had just ticked fourteen vouchers that nothing was selected.
 *
 * So the behaviour is pinned here — that a token survives being handed to a
 * different tab, that it is spent once, and that a browser refusing to store
 * anything is reported rather than producing a blank page.
 */

/** A store that behaves like `localStorage`, including throwing when told to. */
function fakeStorage() {
  const map = new Map<string, string>();

  return {
    failWrites: false,
    get length() {
      return map.size;
    },
    key(index: number) {
      return [...map.keys()][index] ?? null;
    },
    getItem(key: string) {
      return map.get(key) ?? null;
    },
    setItem(this: { failWrites: boolean }, key: string, value: string) {
      if (this.failWrites) {
        throw new DOMException('QuotaExceededError');
      }
      map.set(key, value);
    },
    removeItem(key: string) {
      map.delete(key);
    },
    clear() {
      map.clear();
    },
  };
}

let storage: ReturnType<typeof fakeStorage>;

beforeEach(() => {
  storage = fakeStorage();
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('crypto', { randomUUID: () => `token-${String(storage.length)}` });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('handing a selection over', () => {
  it('comes back exactly as it went in', () => {
    const ids = ['a', 'b', 'c'];
    const token = stashPrintSelection(ids);

    expect(token).toBeDefined();
    expect(takePrintSelection(token ?? null)).toEqual(ids);
  });

  it('survives the opener being gone', () => {
    // The whole point. The print tab has no handle on the page that opened it,
    // so the only thing it has is the token in its own URL.
    const token = stashPrintSelection(['a']);

    // Nothing of the opener is available here — no reference, no inherited
    // session store — and it still resolves.
    expect(takePrintSelection(token ?? null)).toEqual(['a']);
  });

  it('is spent once, so a refresh does not print a stale stack', () => {
    const token = stashPrintSelection(['a', 'b']);

    expect(takePrintSelection(token ?? null)).toHaveLength(2);
    expect(takePrintSelection(token ?? null)).toEqual([]);
  });

  it('keeps two runs apart instead of letting the second win both tabs', () => {
    const first = stashPrintSelection(['a']);
    const second = stashPrintSelection(['b', 'c']);

    expect(first).not.toBe(second);
    expect(takePrintSelection(first ?? null)).toEqual(['a']);
    expect(takePrintSelection(second ?? null)).toEqual(['b', 'c']);
  });
});

describe('when it cannot hand anything over', () => {
  it('says so rather than opening a tab that can only apologise', () => {
    storage.failWrites = true;

    expect(stashPrintSelection(['a'])).toBeUndefined();
  });

  it('treats a missing token as an empty selection', () => {
    expect(takePrintSelection(null)).toEqual([]);
    expect(takePrintSelection('')).toEqual([]);
    expect(takePrintSelection('never-written')).toEqual([]);
  });

  it('does not throw on a value somebody else left under our prefix', () => {
    storage.setItem('ilm:print:junk', 'not json');

    expect(takePrintSelection('junk')).toEqual([]);
    // And it is cleared, so it cannot fail twice.
    expect(storage.getItem('ilm:print:junk')).toBeNull();
  });
});

describe('cleaning up after itself', () => {
  it('drops a handoff from a run that was never opened', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-27T10:00:00Z'));
    const abandoned = stashPrintSelection(['a']);

    // Two hours later, somebody prints something else.
    vi.setSystemTime(new Date('2026-09-27T12:00:00Z'));
    stashPrintSelection(['b']);

    expect(takePrintSelection(abandoned ?? null)).toEqual([]);
  });

  it('keeps one from a few minutes ago — a tab can sit unopened for a while', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-27T10:00:00Z'));
    const earlier = stashPrintSelection(['a']);

    vi.setSystemTime(new Date('2026-09-27T10:05:00Z'));
    stashPrintSelection(['b']);

    expect(takePrintSelection(earlier ?? null)).toEqual(['a']);
  });

  it('removes anything under the prefix it cannot read', () => {
    storage.setItem('ilm:print:corrupt', '{{{');
    storage.setItem('unrelated', 'left alone');

    stashPrintSelection(['a']);

    expect(storage.getItem('ilm:print:corrupt')).toBeNull();
    expect(storage.getItem('unrelated')).toBe('left alone');
  });
});
