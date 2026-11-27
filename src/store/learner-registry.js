import { mkdir, readdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { readJson, writeJson } from './json-file.js';
import { ProfileStore } from './profile-store.js';
import { ProgressStore } from './progress-store.js';
import { ReviewQueue } from './review-queue.js';

export const BUNDLE_FORMAT = 'dsh-learn/bundle';
export const BUNDLE_VERSION = 1;
const LEARNER_PREFIX = 'learn-';
const LEGACY_ENTRIES = ['profile.json', 'review-queue.json', 'roadmaps', 'diagnoses', 'notes'];

/** Normalize a learner id into a folder-safe slug ("learn-<slug>"). */
export function slugLearnerId(raw) {
  const slug = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9一-鿿]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return slug || 'default';
}

function timestamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

/** Recursively collect every file under `dir` as { path (relative), data (utf8) }. */
async function collectFiles(dir, base = dir) {
  let names = [];
  try {
    names = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files = [];
  for (const entry of names) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(full, base)));
    } else if (entry.isFile() && !entry.name.endsWith('.tmp')) {
      files.push({ path: full.slice(base.length + 1).split(sep).join('/'), data: await readFile(full, 'utf8') });
    }
  }
  return files;
}

/** Reject bundle paths that would escape the learner directory. */
function assertSafeRelative(path) {
  if (typeof path !== 'string' || !path || path.includes('\0')) {
    throw new Error(`bundle contains an invalid file path: ${JSON.stringify(path)}`);
  }
  const normalized = path.replaceAll('\\', '/');
  if (normalized.startsWith('/') || /^[a-zA-Z]:\//.test(normalized) || normalized.split('/').includes('..')) {
    throw new Error(`bundle file path escapes the learner directory: ${JSON.stringify(path)}`);
  }
}

/**
 * Resolves where learning data lives and owns one set of stores per learner.
 *
 * Layout (per call, the root is the current session workspace when the
 * workingDirectory service can resolve it, otherwise `fallbackRoot`):
 *
 *   <workspace>/dsh-learn/
 *   ├── learn-<learnerId>/        # one folder per learner ("learn-xx")
 *   │   ├── profile.json
 *   │   ├── review-queue.json
 *   │   ├── roadmaps/{roadmapId}.json
 *   │   ├── diagnoses/{id}.json
 *   │   └── notes/{roadmapId}/{nodeId}.md
 *   └── exports/learn-<learnerId>-<timestamp>.dsh-learn.json
 *
 * A legacy flat layout at the root (pre-workspace storage) is migrated into
 * `learn-default/` on first access.
 */
export class LearnerRegistry {
  constructor({ fallbackRoot, workingDirectory = null, masteryThreshold = 80, masteryWeights } = {}) {
    if (!fallbackRoot) throw new Error('LearnerRegistry requires fallbackRoot');
    this.fallbackRoot = fallbackRoot;
    this.workingDirectory = workingDirectory;
    this.masteryThreshold = masteryThreshold;
    this.masteryWeights = masteryWeights;
    this.cache = new Map(); // learnerDir -> { profileStore, progressStore, reviewQueue }
    this.migrated = new Set(); // roots already checked for the legacy flat layout
    this.rootsSeen = new Set(); // every root a tool call resolved to (for cross-root aggregation)
  }

  /**
   * Storage root for this call: `<session workspace>/dsh-learn` when the tool
   * execution carries an agent and the workingDirectory service resolves,
   * otherwise the configured fallback root.
   */
  async root(exec) {
    const agent = exec?.agent;
    if (this.workingDirectory && agent) {
      try {
        const dir = await this.workingDirectory.ensure(agent, exec?.signal);
        if (typeof dir === 'string' && dir.trim()) return join(dir, 'dsh-learn');
      } catch {
        // workspace unavailable (remote fs, disposed agent): keep the fallback
      }
    }
    return this.fallbackRoot;
  }

  /** Move a legacy flat layout at `root` into `learn-default/`, once per root. */
  async migrateLegacy(root) {
    if (this.migrated.has(root)) return;
    this.migrated.add(root);
    let hasLegacy = false;
    for (const name of ['profile.json', 'review-queue.json']) {
      try {
        if ((await stat(join(root, name))).isFile()) hasLegacy = true;
      } catch { /* missing */ }
    }
    try {
      if ((await stat(join(root, 'roadmaps'))).isDirectory()) hasLegacy = true;
    } catch { /* missing */ }
    if (!hasLegacy) return;
    const target = join(root, `${LEARNER_PREFIX}default`);
    try {
      await stat(target);
      return; // a default learner already exists; leave legacy files untouched
    } catch { /* does not exist yet */ }
    await mkdir(target, { recursive: true });
    for (const name of LEGACY_ENTRIES) {
      try {
        await rename(join(root, name), join(target, name));
      } catch { /* entry missing or blocked; skip */ }
    }
  }

  learnerDir(root, learnerId) {
    return join(root, `${LEARNER_PREFIX}${slugLearnerId(learnerId)}`);
  }

  /** Stores for one learner, creating and caching them per directory. */
  async stores(exec, learnerId) {
    const root = await this.root(exec);
    this.rootsSeen.add(root);
    await this.migrateLegacy(root);
    const id = slugLearnerId(learnerId);
    const dir = this.learnerDir(root, id);
    let entry = this.cache.get(dir);
    if (!entry) {
      entry = {
        profileStore: new ProfileStore(dir),
        progressStore: new ProgressStore(dir, {
          masteryThreshold: this.masteryThreshold,
          masteryWeights: this.masteryWeights,
        }),
        reviewQueue: new ReviewQueue(dir),
      };
      this.cache.set(dir, entry);
    }
    return { ...entry, root, learnerId: id, dir };
  }

  /** Every learner folder under the root, newest activity first. */
  async listLearners(exec) {
    const root = await this.root(exec);
    await this.migrateLegacy(root);
    let names = [];
    try {
      names = await readdir(root);
    } catch {
      return { root, learners: [] };
    }
    const learners = [];
    for (const name of names) {
      if (!name.startsWith(LEARNER_PREFIX)) continue;
      const dir = join(root, name);
      try {
        if (!(await stat(dir)).isDirectory()) continue;
      } catch {
        continue;
      }
      learners.push(await this.describe(dir, name.slice(LEARNER_PREFIX.length)));
    }
    learners.sort((a, b) => b.updatedAt - a.updatedAt);
    return { root, learners };
  }

  /** Summary stats for one learner folder (used by ai_learn_learners). */
  async describe(dir, learnerId) {
    const progressStore = new ProgressStore(dir, { masteryThreshold: this.masteryThreshold });
    const reviewQueue = new ReviewQueue(dir);
    const roadmaps = await progressStore.listRoadmaps();
    const reviewItems = await reviewQueue.list();
    const nodes = roadmaps.flatMap((r) => r.nodes ?? []);
    return {
      learnerId,
      dir,
      topics: roadmaps.map((r) => r.topic),
      roadmaps: roadmaps.length,
      masteredNodes: nodes.filter((n) => n.status === 'mastered').length,
      totalNodes: nodes.length,
      reviewItems: reviewItems.length,
      dueReviews: (await reviewQueue.due()).length,
      updatedAt: Math.max(0, ...roadmaps.map((r) => r.updatedAt ?? 0)),
    };
  }

  /** Aggregate one root: every learner's roadmaps / review items / diagnoses. */
  async aggregateRoot(root) {
    await this.migrateLegacy(root);
    let names = [];
    try {
      names = await readdir(root);
    } catch {
      return { root, learners: [], roadmaps: [], reviewItems: [], diagnoses: [] };
    }
    const learners = [];
    const roadmaps = [];
    const reviewItems = [];
    const diagnoses = [];
    for (const name of names) {
      if (!name.startsWith(LEARNER_PREFIX)) continue;
      const dir = join(root, name);
      try {
        if (!(await stat(dir)).isDirectory()) continue;
      } catch {
        continue;
      }
      const learnerId = name.slice(LEARNER_PREFIX.length);
      learners.push({ ...(await this.describe(dir, learnerId)), root });
      const progressStore = new ProgressStore(dir, { masteryThreshold: this.masteryThreshold });
      const reviewQueue = new ReviewQueue(dir);
      for (const roadmap of await progressStore.listRoadmaps()) {
        roadmaps.push({ ...roadmap, learnerId, root });
      }
      for (const item of await reviewQueue.list()) {
        reviewItems.push({ ...item, learnerId, root });
      }
      for (const diagnosis of await progressStore.listDiagnoses()) {
        diagnoses.push({ ...diagnosis, learnerId, root });
      }
    }
    learners.sort((a, b) => b.updatedAt - a.updatedAt);
    roadmaps.sort((a, b) => b.updatedAt - a.updatedAt);
    diagnoses.sort((a, b) => b.createdAt - a.createdAt);
    return { root, learners, roadmaps, reviewItems, diagnoses };
  }

  /**
   * Aggregate every known root (the fallback root plus every workspace root a
   * tool call touched) so the Web panel sees learning data regardless of which
   * session workspace produced it.
   */
  async aggregate(exec) {
    const roots = [...new Set([await this.root(exec), ...this.rootsSeen])];
    const merged = { roots, learners: [], roadmaps: [], reviewItems: [], diagnoses: [] };
    for (const root of roots) {
      const part = await this.aggregateRoot(root);
      merged.learners.push(...part.learners);
      merged.roadmaps.push(...part.roadmaps);
      merged.reviewItems.push(...part.reviewItems);
      merged.diagnoses.push(...part.diagnoses);
    }
    merged.learners.sort((a, b) => b.updatedAt - a.updatedAt);
    merged.roadmaps.sort((a, b) => b.updatedAt - a.updatedAt);
    merged.diagnoses.sort((a, b) => b.createdAt - a.createdAt);
    return merged;
  }

  /** Build the portable bundle object for one learner directory (no write). */
  async bundleFromDir(dir, learnerId) {
    const files = await collectFiles(dir);
    if (files.length === 0) {
      throw new Error(`learner "${learnerId}" has no data to export yet`);
    }
    return {
      format: BUNDLE_FORMAT,
      version: BUNDLE_VERSION,
      learnerId,
      exportedAt: Date.now(),
      files,
    };
  }

  /** Find one learner's directory across every known root. */
  async findLearnerDir(exec, learnerId) {
    const id = slugLearnerId(learnerId);
    const { learners } = await this.aggregate(exec);
    const found = learners.find((l) => l.learnerId === id);
    return found ? { dir: found.dir, root: found.root, learnerId: id } : null;
  }

  /**
   * Export one learner folder as a single portable JSON bundle.
   * Default target: `<root>/exports/learn-<id>-<timestamp>.dsh-learn.json`.
   */
  async exportLearner(exec, learnerId, outPath) {
    const { root, dir, learnerId: id } = await this.stores(exec, learnerId);
    const bundle = await this.bundleFromDir(dir, id);
    const target = outPath ?? join(root, 'exports', `${LEARNER_PREFIX}${id}-${timestamp()}.dsh-learn.json`);
    await writeJson(target, bundle);
    return { path: target, learnerId: id, fileCount: bundle.files.length };
  }

  /**
   * Import a bundle produced by exportLearner. Restores into the bundle's own
   * learner id unless `learnerId` renames it. Refuses to write over existing
   * data unless `overwrite` is true (existing files with the same path are
   * replaced; unrelated files are kept).
   */
  async importLearner(exec, { path: bundlePath, learnerId, overwrite = false }) {
    const bundle = await readJson(bundlePath, null);
    if (!bundle || bundle.format !== BUNDLE_FORMAT || !Array.isArray(bundle.files)) {
      throw new Error(`not a dsh-learn export bundle: ${bundlePath}`);
    }
    if (typeof bundle.version !== 'number' || bundle.version > BUNDLE_VERSION) {
      throw new Error(`unsupported bundle version ${bundle.version}; this plugin supports up to ${BUNDLE_VERSION}`);
    }
    const root = await this.root(exec);
    await this.migrateLegacy(root);
    const id = slugLearnerId(learnerId ?? bundle.learnerId);
    const dir = this.learnerDir(root, id);
    const existing = await collectFiles(dir);
    if (existing.length > 0 && !overwrite) {
      throw new Error(
        `learner "${id}" already has ${existing.length} file(s) at ${dir}; pass overwrite=true to merge the bundle over it`,
      );
    }
    for (const file of bundle.files) {
      assertSafeRelative(file.path);
      if (typeof file.data !== 'string') {
        throw new Error(`bundle file ${JSON.stringify(file.path)} has non-text data`);
      }
    }
    for (const file of bundle.files) {
      const target = resolve(dir, file.path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, file.data, 'utf8');
    }
    this.cache.delete(dir); // force fresh stores so imported data is picked up
    return { learnerId: id, dir, imported: bundle.files.length, overwritten: existing.length > 0 };
  }
}
