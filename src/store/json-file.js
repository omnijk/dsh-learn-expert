import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { dirname } from 'node:path';

/** Paths already reported as corrupt, so a burst of reads logs once per file. */
const quarantined = new Set();

/**
 * Read a JSON file.
 *
 * Root cause of the "one bad file 500s every dashboard endpoint" bug: this
 * function only treated ENOENT as "no data" and re-threw everything else —
 * including the SyntaxError from JSON.parse — so a single truncated
 * roadmap.json broke /analysis, /courses, learners and export at once.
 *
 * A file that exists but cannot be parsed is now moved aside to
 * `<path>.corrupt-<ts>` (never silently overwritten or deleted) and the caller
 * gets `fallback`, so the rest of the data stays readable.
 */
export async function readJson(path, fallback) {
  let text;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    if (error && error.code === 'ENOENT') return fallback;
    throw error;
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    await quarantine(path, error);
    return fallback;
  }
}

async function quarantine(path, error) {
  const target = `${path}.corrupt-${Date.now()}`;
  try {
    await rename(path, target);
  } catch {
    // Someone else already moved it, or the file is locked: nothing to do.
  }
  if (!quarantined.has(path)) {
    quarantined.add(path);
    // eslint-disable-next-line no-console
    console.warn(`[learn-expert] unreadable JSON moved to ${target}: ${error?.message ?? error}`);
  }
  return target;
}

/** Write JSON atomically (unique tmp file + fsync + rename), creating parents. */
export async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.${randomUUID()}.tmp`;
  const text = `${JSON.stringify(value, null, 2)}\n`;
  const handle = await open(tmp, 'w');
  try {
    await handle.writeFile(text, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename(tmp, path);
  } catch (error) {
    await rm(tmp, { force: true }).catch(() => {});
    throw error;
  }
}
