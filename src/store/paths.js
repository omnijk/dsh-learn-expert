import { resolve, sep } from 'node:path';

/**
 * Path safety for every identifier that ends up in a filesystem path.
 *
 * Root cause of the traversal bugs this module closes: ids arrived from tool
 * arguments and from the (unauthenticated) Web API and were concatenated with
 * `join()` without validation, so `roadmapId: '../..'` escaped the learner
 * folder. `isLearnRoot()` only checked the root, never the segments.
 */

// Roadmap / node / learner ids are slugs: letters, digits, '.', '_', '-'.
// A leading '.' is rejected so ids can never be '.', '..' or a hidden file.
const ID_RE = /^[A-Za-z0-9\u4e00-\u9fff][A-Za-z0-9\u4e00-\u9fff._-]{0,95}$/;

export function isSafeId(value) {
  return typeof value === 'string' && ID_RE.test(value);
}

export function assertSafeId(value, label = 'id') {
  if (!isSafeId(value)) {
    throw new Error(`${label} must match ${ID_RE} (got ${JSON.stringify(value)})`);
  }
  return value;
}

/** Join under `base`, refusing any result that escapes it. */
export function safeJoin(base, ...segments) {
  const root = resolve(base);
  const target = resolve(root, ...segments);
  if (target !== root && !target.startsWith(root + sep)) {
    throw new Error(`refusing path outside ${root}: ${target}`);
  }
  return target;
}

/** True when `dir` looks like a learn data root this plugin manages. */
export function isLearnRoot(dir) {
  return typeof dir === 'string' && /(^|[\\/])dsh-learn[\\/]?$/.test(dir.trim());
}

/** Canonical form used to de-duplicate roots (case + separators + trailing sep). */
export function canonicalRoot(dir) {
  if (typeof dir !== 'string') return '';
  const trimmed = dir.trim().replace(/[\\/]+$/, '');
  const absolute = resolve(trimmed);
  return process.platform === 'win32' ? absolute.toLowerCase() : absolute;
}

/**
 * Absolute root as used for filesystem access: resolved, no trailing separator,
 * original casing preserved (canonicalRoot is only a de-duplication key).
 */
export function normalizeRoot(dir) {
  if (typeof dir !== 'string' || !dir.trim()) return '';
  return resolve(dir.trim().replace(/[\\/]+$/, ''));
}
