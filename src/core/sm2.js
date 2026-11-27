/**
 * SM-2 spaced repetition algorithm (plan Appendix A).
 *
 * ReviewItem: { nodeId, roadmapId, easiness, interval, repetitions, nextReviewAt, lastQuality }
 * quality ∈ 0..5  (讲错=1-2, 讲对但吃力=3, 流畅讲出=4-5)
 */

export const SM2_MIN_EASINESS = 1.3;
export const SM2_INITIAL_EASINESS = 2.5;
export const DAY_MS = 24 * 60 * 60 * 1000;

export function createReviewItem(nodeId, roadmapId, now = Date.now()) {
  return {
    nodeId,
    roadmapId,
    easiness: SM2_INITIAL_EASINESS,
    interval: 0,
    repetitions: 0,
    nextReviewAt: now,
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
  let { easiness, interval, repetitions } = item;

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
    lastReviewAt: now,
    nextReviewAt: now + interval * DAY_MS,
  };
}

/** Items whose review is due at `now`, sorted by nextReviewAt ascending. */
export function dueItems(items, now = Date.now()) {
  return items
    .filter((item) => item.nextReviewAt <= now)
    .sort((a, b) => a.nextReviewAt - b.nextReviewAt);
}
