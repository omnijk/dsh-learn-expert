import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { readJson, writeJson } from './json-file.js';
import { canonicalRoot, normalizeRoot } from './paths.js';
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
  constructor({ fallbackRoot, workingDirectory = null, resolveWorkingDirectory = null, masteryThreshold = 80, masteryWeights } = {}) {
    if (!fallbackRoot) throw new Error('LearnerRegistry requires fallbackRoot');
    this.fallbackRoot = normalizeRoot(fallbackRoot) || fallbackRoot;
    this.workingDirectory = workingDirectory;
    // Lazy resolver: called per tool execution, so a service that registers
    // *after* the plugin's apply() (the cold-start race) is still usable.
    this.resolveWorkingDirectory = resolveWorkingDirectory;
    this.masteryThreshold = masteryThreshold;
    this.masteryWeights = masteryWeights;
    this.cache = new Map(); // learnerDir -> { profileStore, progressStore, reviewQueue }
    this.migrated = new Set(); // roots already checked for the legacy flat layout
    // canonicalRoot -> real root. Every root a tool call resolved to, so the
    // panel can aggregate across workspace roots.
    this.roots = new Map();
  }

  /**
   * The session workspace for one tool execution, or null when unavailable.
   *
   * Root cause of "data landed in $DSH_HOME instead of the workspace": the
   * workingDirectory service used to be captured once in apply() (`ctx.get`),
   * which happens before services are ready on a cold start — so every call saw
   * `null` and fell back forever. The resolver reads the service per call.
   */
  async sessionWorkspace(agent, signal) {
    if (!agent) return null;
    const resolvers = [];
    if (typeof this.resolveWorkingDirectory === 'function') {
      resolvers.push(() => this.resolveWorkingDirectory(agent, signal));
    }
    if (this.workingDirectory && typeof this.workingDirectory.ensure === 'function') {
      resolvers.push(() => this.workingDirectory.ensure(agent, signal));
    }
    for (const resolveOnce of resolvers) {
      try {
        const dir = await resolveOnce();
        if (typeof dir === 'string' && dir.trim()) return dir;
      } catch {
        // workspace unavailable (remote fs, disposed agent): try the next one
      }
    }
    return null;
  }

  /**
   * Storage root for this call: `<session workspace>/dsh-learn` when the tool
   * execution carries an agent and the workspace resolves, otherwise the
   * configured fallback root.
   */
  async root(exec) {
    const workspace = await this.sessionWorkspace(exec?.agent, exec?.signal);
    const root = normalizeRoot(workspace ? join(workspace, 'dsh-learn') : this.fallbackRoot);
    this.roots.set(canonicalRoot(root), root);
    return root;
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
    let targetEntries = [];
    try {
      if (!(await stat(target)).isDirectory()) return;
      targetEntries = await readdir(target);
    } catch {
      // does not exist yet: create it below
    }
    // An *empty* learn-default (created by a first read before migration ran)
    // used to abort the migration and hide the learner's old data forever.
    if (targetEntries.length > 0) return;
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
   *
   * Roots are de-duplicated by `canonicalRoot`: the same folder reached with a
   * different casing or a trailing separator used to be scanned twice, which
   * doubled every course and every due count in the panel.
   */
  async aggregate(exec) {
    const current = await this.root(exec);
    const byKey = new Map();
    byKey.set(canonicalRoot(this.fallbackRoot), this.fallbackRoot);
    for (const [key, value] of this.roots) byKey.set(key, value);
    byKey.set(canonicalRoot(current), current);
    byKey.delete(canonicalRoot(this.fallbackRoot));
    byKey.delete(canonicalRoot(current));
    const ordered = [this.fallbackRoot, current, ...byKey.values()];
    const merged = { roots: ordered, learners: [], roadmaps: [], reviewItems: [], diagnoses: [] };
    const seenLearnerDirs = new Set();
    for (const root of ordered) {
      const part = await this.aggregateRoot(root);
      for (const learner of part.learners) {
        const key = canonicalRoot(learner.dir);
        if (seenLearnerDirs.has(key)) continue;
        seenLearnerDirs.add(key);
        merged.learners.push(learner);
      }
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
    // Stage the merged result next to the learner folder, then swap it in.
    // Root cause of "an interrupted import left a half-written learner": the
    // bundle was written file-by-file straight into the live folder, so a crash
    // (or a full disk) left a mixture of old and new roadmaps that the panel
    // then showed as truth. The swap keeps the previous folder as a backup.
    const staging = join(dirname(dir), `.import-${id}-${Date.now()}`);
    let backup = null;
    try {
      await mkdir(staging, { recursive: true });
      for (const file of existing) {
        const target = resolve(staging, file.path);
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, file.data, 'utf8');
      }
      for (const file of bundle.files) {
        const target = resolve(staging, file.path);
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, file.data, 'utf8');
      }
      if (existing.length > 0) {
        backup = `${dir}.backup-${timestamp()}`;
        await rename(dir, backup);
      }
      await rename(staging, dir);
    } catch (error) {
      await rm(staging, { recursive: true, force: true }).catch(() => {});
      throw error;
    }
    this.cache.delete(dir); // force fresh stores so imported data is picked up
    return { learnerId: id, dir, imported: bundle.files.length, overwritten: existing.length > 0, backup };
  }
}
