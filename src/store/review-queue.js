import { join } from 'node:path';
import { createReviewItem, dueItems, reviewOnce } from '../core/sm2.js';
import { readJson, writeJson } from './json-file.js';

/**
 * ReviewItem[] persistence at <dataDir>/review-queue.json (plan §4.1 / §4.2).
 */
export class ReviewQueue {
  constructor(dataDir) {
    this.path = join(dataDir, 'review-queue.json');
  }

  async list() {
    return readJson(this.path, []);
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
    const items = await this.list();
    const existing = items.find((i) => i.nodeId === nodeId && i.roadmapId === roadmapId);
    if (existing) return existing;
    const item = createReviewItem(nodeId, roadmapId, now);
    items.push(item);
    await this.saveAll(items);
    return item;
  }

  /**
   * Apply one SM-2 review outcome. Finds the item by nodeId
   * (optionally narrowed by roadmapId) and persists the update.
   */
  async update(nodeId, quality, { roadmapId, now = Date.now() } = {}) {
    const items = await this.list();
    const index = items.findIndex(
      (i) => i.nodeId === nodeId && (roadmapId === undefined || i.roadmapId === roadmapId),
    );
    if (index < 0) {
      throw new Error(`no review item for node "${nodeId}"${roadmapId ? ` in roadmap "${roadmapId}"` : ''}`);
    }
    const updated = reviewOnce(items[index], quality, now);
    const history = [...(items[index].history ?? []), { at: now, quality }].slice(-50);
    items[index] = { ...updated, history };
    await this.saveAll(items);
    return items[index];
  }
}
