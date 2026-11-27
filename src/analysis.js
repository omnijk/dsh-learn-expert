/**
 * Aggregate persisted learning state into the dashboard payload consumed by
 * the Web analysis panel (left sidebar entry → 折线图 + 学习热力图).
 * Pure function; the Host route and tests both call it.
 */

import { layoutDag } from './core/dag-layout.js';

const DAY_MS = 24 * 60 * 60 * 1000;

function dayKey(ts, now) {
  // Local-calendar day bucket aligned to `now`'s timezone offset.
  const offset = new Date(now).getTimezoneOffset() * 60_000;
  return Math.floor((ts - offset) / DAY_MS);
}

/**
 * @param {object} input
 * @param {Array} input.roadmaps stored Roadmap records
 * @param {Array} input.reviewItems stored ReviewItem records
 * @param {Array} input.diagnoses stored DiagnosisResult records
 * @param {Array} input.learners learner ids from the profile store
 * @param {number} input.now reference timestamp
 * @param {number} input.days heatmap window length in days (default 182)
 */
export function buildAnalysis({ roadmaps, reviewItems, diagnoses = [], learners = [], now = Date.now(), days = 182 }) {
  const plans = roadmaps.map((roadmap) => {
    const nodes = roadmap.nodes.map((node) => ({
      id: node.id,
      title: node.title,
      status: node.status,
      prerequisites: node.prerequisites ?? [],
      total: node.mastery?.total ?? null,
      mastery: node.mastery
        ? {
            accuracy: node.mastery.accuracy,
            depth: node.mastery.depth,
            transfer: node.mastery.transfer,
            discrimination: node.mastery.discrimination,
            total: node.mastery.total,
          }
        : null,
      assessedAt: node.mastery?.assessedAt ?? null,
      attempts: (node.checkpoint?.attempts ?? []).length,
    }));
    const assessed = nodes
      .filter((n) => n.assessedAt && n.status === 'mastered')
      .sort((a, b) => a.assessedAt - b.assessedAt);
    // Cumulative mastered-node count over time → one polyline per plan.
    const series = [{ t: roadmap.createdAt, mastered: 0 }];
    assessed.forEach((node, index) => {
      series.push({ t: node.assessedAt, mastered: index + 1 });
    });
    const scored = nodes.filter((n) => typeof n.total === 'number');
    const avgMastery = scored.length
      ? Math.round(scored.reduce((sum, n) => sum + n.total, 0) / scored.length)
      : null;
    return {
      id: roadmap.id,
      topic: roadmap.topic,
      state: roadmap.state,
      // Provenance: the panel filters and groups plans by learner and root, so
      // dropping these here made every plan look like learner "default".
      learnerId: roadmap.learnerId ?? null,
      root: roadmap.root ?? null,
      activeNodeId: roadmap.currentNodeId ?? null,
      createdAt: roadmap.createdAt,
      updatedAt: roadmap.updatedAt,
      nodeCount: nodes.length,
      masteredCount: nodes.filter((n) => n.status === 'mastered').length,
      relearnCount: nodes.filter((n) => n.status === 'needs-relearn').length,
      avgMastery,
      nodes,
      series,
      dag: layoutDag(roadmap.nodes),
    };
  });

  // Teaching-quality metrics (v2 F5, plan §8): checkpoint attempts per node
  // approximates questioning density; review pass rate from SM-2 history.
  let attemptNodes = 0;
  let attemptTotal = 0;
  for (const plan of plans) {
    for (const node of plan.nodes) {
      if (node.attempts > 0) {
        attemptNodes += 1;
        attemptTotal += node.attempts;
      }
    }
  }
  let reviewedCount = 0;
  let reviewPassed = 0;
  for (const item of reviewItems) {
    for (const entry of item.history ?? []) {
      reviewedCount += 1;
      if (entry.quality >= 3) reviewPassed += 1;
    }
  }
  const quality = {
    avgAttemptsPerNode: attemptNodes ? Math.round((attemptTotal / attemptNodes) * 10) / 10 : null,
    reviewPassRate: reviewedCount ? Math.round((reviewPassed / reviewedCount) * 100) : null,
    reviewedCount,
  };

  // Activity events for the heatmap: assessments, checkpoint attempts,
  // completed reviews, diagnoses.
  const events = [];
  for (const roadmap of roadmaps) {
    for (const node of roadmap.nodes) {
      if (node.mastery?.assessedAt) events.push(node.mastery.assessedAt);
      for (const attempt of node.checkpoint?.attempts ?? []) {
        if (attempt.at) events.push(attempt.at);
      }
    }
  }
  for (const item of reviewItems) {
    // Every completed review is an activity; counting only `lastReviewAt`
    // under-reported the heatmap once a node had been reviewed more than once.
    const history = item.history ?? [];
    if (history.length) {
      for (const entry of history) if (entry?.at) events.push(entry.at);
    } else if (item.lastReviewAt) {
      events.push(item.lastReviewAt); // legacy items without history
    }
  }
  for (const diagnosis of diagnoses) {
    if (diagnosis.createdAt) events.push(diagnosis.createdAt);
  }

  const endDay = dayKey(now, now);
  const startDay = endDay - days + 1;
  const counts = new Map();
  for (const ts of events) {
    const key = dayKey(ts, now);
    if (key >= startDay && key <= endDay) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const heatmap = [];
  const offset = new Date(now).getTimezoneOffset() * 60_000;
  for (let key = startDay; key <= endDay; key += 1) {
    // `day` is the raw bucket (kept for backwards compatibility) and is not a
    // real timestamp in UTC-west zones; `date`/`weekday` are what the panel
    // renders, so all bucketing happens here instead of in the browser.
    const localMidnight = new Date(key * DAY_MS + offset);
    heatmap.push({
      day: key * DAY_MS,
      date: `${localMidnight.getUTCFullYear()}-${String(localMidnight.getUTCMonth() + 1).padStart(2, '0')}-${String(localMidnight.getUTCDate()).padStart(2, '0')}`,
      weekday: (localMidnight.getUTCDay() + 6) % 7, // 0 = Monday
      count: counts.get(key) ?? 0,
    });
  }

  const dueCount = reviewItems.filter((i) => Number(i.nextReviewAt) <= now).length;

  return {
    generatedAt: now,
    plans,
    heatmap,
    quality,
    learners,
    review: { due: dueCount, total: reviewItems.length },
    totals: {
      plans: plans.length,
      masteredNodes: plans.reduce((sum, p) => sum + p.masteredCount, 0),
      nodes: plans.reduce((sum, p) => sum + p.nodeCount, 0),
    },
  };
}
