/**
 * Tiny per-key async mutex.
 *
 * Root cause of the "two sessions lose each other's updates" bug: every write
 * is a read-modify-write of a whole JSON file with no serialization, so two
 * concurrent tool calls both read the same snapshot and the second write
 * discarded the first one's change. Reads stay lock-free; only mutating
 * operations queue on the same data directory.
 */
const tails = new Map();

export function withLock(key, fn) {
  const previous = tails.get(key) ?? Promise.resolve();
  const run = previous.then(fn, fn);
  // Keep the chain alive but never let a rejection poison the next waiter.
  const settled = run.then(
    () => {},
    () => {},
  );
  tails.set(key, settled);
  // Drop the key only when nothing queued behind this run: the old check
  // (`tails.get(key) === undefined`) was never true, so every key leaked.
  run.finally(() => {
    if (tails.get(key) === settled) tails.delete(key);
  }).catch(() => {});
  return run;
}

/** Current number of tracked keys (diagnostics only). */
export function lockCount() {
  return tails.size;
}
