import { join } from 'node:path';
import { readJson, writeJson } from './json-file.js';
import { withLock } from './lock.js';

export const ERROR_CAUSES = [
  'concept-confusion',
  'missing-prerequisite',
  'surface-memory',
  'transfer-failure',
  'expression-unclear',
];

export function emptyProfile() {
  return {
    id: 'default',
    background: '',
    strengths: [],
    errorPatterns: {},
    preferences: {},
    courseHistory: [],
    updatedAt: Date.now(),
  };
}

/**
 * LearnerProfile persistence at <dataDir>/profile.json (plan §4.1 / §4.2).
 * Multi-learner separation is owned by LearnerRegistry, which points one
 * ProfileStore at each learner's folder.
 */
export class ProfileStore {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.path = join(dataDir, 'profile.json');
  }

  /**
   * Read the profile, normalising every field.
   *
   * Root cause of "the profile panel throws on some learners": `update()` spread
   * `current.strengths`/`current.errorPatterns`/`current.courseHistory` without
   * checking they exist, so any hand-edited or older `profile.json` that lacks
   * one of those keys crashed with `undefined is not iterable`.
   */
  async get() {
    const stored = await readJson(this.path, null);
    if (!stored || typeof stored !== 'object') return emptyProfile();
    const base = emptyProfile();
    return {
      ...base,
      ...stored,
      strengths: Array.isArray(stored.strengths) ? stored.strengths.filter((s) => typeof s === 'string') : [],
      errorPatterns: stored.errorPatterns && typeof stored.errorPatterns === 'object' && !Array.isArray(stored.errorPatterns)
        ? stored.errorPatterns
        : {},
      preferences: stored.preferences && typeof stored.preferences === 'object' && !Array.isArray(stored.preferences)
        ? stored.preferences
        : {},
      courseHistory: Array.isArray(stored.courseHistory) ? stored.courseHistory : [],
    };
  }

  async save(profile) {
    const next = { ...profile, updatedAt: Date.now() };
    await writeJson(this.path, next);
    return next;
  }

  /**
   * Merge an update into the stored profile.
   * - strengths: union (existing first), pass strengthsMode:"replace" to overwrite
   * - errorPatterns: counts are ADDED to existing counts
   * - preferences: shallow-merged
   * - courseHistory: appended
   *
   * Serialised with `withLock` so two sessions importing/recording at once
   * cannot lose each other's counters (read-modify-write on one file).
   */
  async update(patch = {}) {
    return withLock(this.dataDir, async () => {
      const current = await this.get();
    const next = { ...current };
    if (typeof patch.background === 'string') next.background = patch.background;
    if (Array.isArray(patch.strengths)) {
      next.strengths = patch.strengthsMode === 'replace'
        ? [...new Set(patch.strengths)]
        : [...new Set([...current.strengths, ...patch.strengths])];
    }
    if (patch.errorPatterns && typeof patch.errorPatterns === 'object') {
      next.errorPatterns = { ...current.errorPatterns };
      for (const [cause, count] of Object.entries(patch.errorPatterns)) {
        if (!ERROR_CAUSES.includes(cause)) {
          throw new Error(`unknown error cause "${cause}"; expected one of ${ERROR_CAUSES.join(', ')}`);
        }
        if (typeof count !== 'number' || !Number.isFinite(count)) {
          throw new Error(`errorPatterns.${cause} must be a number`);
        }
        next.errorPatterns[cause] = (next.errorPatterns[cause] ?? 0) + count;
      }
    }
    if (patch.preferences && typeof patch.preferences === 'object') {
      next.preferences = { ...current.preferences, ...patch.preferences };
    }
    if (Array.isArray(patch.courseHistory)) {
      next.courseHistory = [...current.courseHistory, ...patch.courseHistory];
    }
    return this.save(next);
    });
  }

  /** Increment one error-cause counter (used when a checkpoint answer fails). */
  async recordErrorCause(cause) {
    if (!ERROR_CAUSES.includes(cause)) {
      throw new Error(`unknown error cause "${cause}"; expected one of ${ERROR_CAUSES.join(', ')}`);
    }
    return this.update({ errorPatterns: { [cause]: 1 } });
  }
}
