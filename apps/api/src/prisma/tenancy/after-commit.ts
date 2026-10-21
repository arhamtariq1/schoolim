/**
 * Work that must happen only if the transaction it was queued in commits.
 *
 * A notification row is written inside the caller's transaction so it exists
 * exactly when the change it describes does. The push for it is a side effect
 * on a third party, which cannot be rolled back — so it waits here until
 * `runInTenant` knows the commit happened. A voucher run that rolls back sends
 * nobody a push about vouchers that do not exist.
 *
 * Keyed by the transaction client itself, so there is no global queue to leak
 * between requests and a rolled-back transaction's hooks are simply garbage
 * collected.
 */
const pending = new WeakMap<object, Array<() => void>>();

/** Queue `hook` to run after `tx` commits. The hook must not throw. */
export function afterCommit(tx: object, hook: () => void): void {
  const queued = pending.get(tx);
  if (queued === undefined) {
    pending.set(tx, [hook]);
  } else {
    queued.push(hook);
  }
}

/** Run, once, whatever was queued on `tx`. Called by `runInTenant` after a commit. */
export function runAfterCommit(tx: object | undefined): void {
  if (tx === undefined) {
    return;
  }
  const queued = pending.get(tx);
  pending.delete(tx);
  for (const hook of queued ?? []) {
    hook();
  }
}
