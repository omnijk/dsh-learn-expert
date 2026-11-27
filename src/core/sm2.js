/**
 * SM-2 spaced repetition algorithm (plan Appendix A).
 *
 * ReviewItem: { nodeId, roadmapId, easiness, interval, repetitions, nextReviewAt, lastQuality }
 * quality ∈ 0..5  (讲错=1-2, 讲对但吃力=3, 流畅讲出=4-5)
 */

export const SM2_MIN_EASINESS = 1.3;
export const SM2_INITIAL_EASINESS = 2.5;
export const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Coerce a timestamp to epoch milliseconds.
 *
 * Root cause of "review dates never come due": tool callers sometimes pass `now`
 * as a string, and `now + interval * DAY_MS` then concatenated ("1750000000" +
 * "86400000") instead of adding — the item's `nextReviewAt` became a nonsense
 * string that never compares <= a number again.
 */
export function toTimestamp(value, fallback = Date.now()) {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function createReviewItem(nodeId, roadmapId, now = Date.now()) {
  return {
    nodeId,
    roadmapId,
    easiness: SM2_INITIAL_EASINESS,
    interval: 0,
    repetitions: 0,
    nextReviewAt: toTimestamp(now),
    lastQuality: null,
  };
}

/**
 * Apply one SM-2 review outcome. Returns a NEW item; the input is not mutated.
 * @param {object} item current ReviewItem
 * @param {number} quality 0..5
 * @param {number} now timestamp ms
 */
export function reviewOnce(item, quality, now = Date.now()) {
  if (!Number.isInteger(quality) || quality < 0 || quality > 5) {
    throw new Error(`SM-2 quality must be an integer in 0..5, got ${quality}`);
  }
  const at = toTimestamp(now);
  let { easiness, interval, repetitions } = item;
  easiness = Number.isFinite(Number(easiness)) ? Number(easiness) : SM2_INITIAL_EASINESS;
  interval = Number.isFinite(Number(interval)) ? Number(interval) : 0;
  repetitions = Number.isFinite(Number(repetitions)) ? Number(repetitions) : 0;

  // EF updates first; the interval for repetitions >= 2 uses the NEW easiness
  // (plan Appendix A vector: round(6 * 2.6) = 16).
  easiness = Math.max(
    SM2_MIN_EASINESS,
    easiness + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02),
  );
  // Avoid float noise like 2.2800000000000002 in stored data.
  easiness = Math.round(easiness * 1000) / 1000;

  if (quality < 3) {
    repetitions = 0;
    interval = 1;
  } else {
    if (repetitions === 0) interval = 1;
    else if (repetitions === 1) interval = 6;
    else interval = Math.round(interval * easiness);
    repetitions += 1;
  }

  return {
    ...item,
    easiness,
    interval,
    repetitions,
    lastQuality: quality,
    lastReviewAt: at,
    nextReviewAt: at + interval * DAY_MS,
  };
}

/** Items whose review is due at `now`, sorted by nextReviewAt ascending. */
export function dueItems(items, now = Date.now()) {
  const at = toTimestamp(now);
  return (Array.isArray(items) ? items : [])
    .filter((item) => toTimestamp(item?.nextReviewAt, 0) <= at)
    .sort((a, b) => toTimestamp(a.nextReviewAt, 0) - toTimestamp(b.nextReviewAt, 0));
}
