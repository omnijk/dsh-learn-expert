import { join } from 'node:path';
import { createReviewItem, dueItems, reviewOnce } from '../core/sm2.js';
import { readJson, writeJson } from './json-file.js';
import { withLock } from './lock.js';

/**
 * ReviewItem[] persistence at <dataDir>/review-queue.json (plan §4.1 / §4.2).
 *
 * `ensure` and `update` are read-modify-write on one file, so they hold
 * `withLock(dataDir)`; `saveAll` is the unlocked primitive they share (taking
 * the same lock inside would deadlock the serial chain).
 */
export class ReviewQueue {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.path = join(dataDir, 'review-queue.json');
  }

  async list() {
    const items = await readJson(this.path, []);
    return Array.isArray(items) ? items : [];
  }

  async saveAll(items) {
    await writeJson(this.path, items);
    return items;
  }

  /** Items due at `now`, sorted by nextReviewAt. */
  async due(now = Date.now()) {
    return dueItems(await this.list(), now);
  }

  /** Add a review item for a freshly mastered node; idempotent per (roadmapId, nodeId). */
  async ensure(nodeId, roadmapId, now = Date.now()) {
    return withLock(this.dataDir, async () => {
      const items = await this.list();
      const existing = items.find((i) => i.nodeId === nodeId && i.roadmapId === roadmapId);
      if (existing) return existing;
      const item = createReviewItem(nodeId, roadmapId, now);
      items.push(item);
      await this.saveAll(items);
      return item;
    });
  }

  /**
   * Apply one SM-2 review outcome. Finds the item by nodeId
   * (optionally narrowed by roadmapId) and persists the update.
   *
   * Root cause of "reviewing one course's node rescheduled another course's
   * node": when `roadmapId` was omitted the first match by nodeId won, and
   * node ids are only unique inside a course. An ambiguous match is now an
   * error that tells the caller to pass `roadmapId`.
   */
  async update(nodeId, quality, { roadmapId, now = Date.now() } = {}) {
    return withLock(this.dataDir, async () => {
      const items = await this.list();
      const matches = items
        .map((item, index) => ({ item, index }))
        .filter(({ item }) => item.nodeId === nodeId && (roadmapId === undefined || item.roadmapId === roadmapId));
      if (matches.length === 0) {
        throw new Error(`no review item for node "${nodeId}"${roadmapId ? ` in roadmap "${roadmapId}"` : ''}`);
      }
      if (matches.length > 1) {
        const known = matches.map(({ item }) => item.roadmapId).filter(Boolean).join(', ');
        throw new Error(
          `node "${nodeId}" exists in multiple roadmaps (${known}); pass roadmapId to disambiguate`,
        );
      }
      const { item, index } = matches[0];
      const updated = reviewOnce(item, quality, now);
      const history = [...(item.history ?? []), { at: now, quality }].slice(-50);
      items[index] = { ...updated, history };
      await this.saveAll(items);
      return items[index];
    });
  }
}
