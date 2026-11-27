import { readFileSync } from 'node:fs';
import { mkdir, rm, stat, writeFile, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAnalysis } from './src/analysis.js';
import { layoutDag } from './src/core/dag-layout.js';
import { readJson, writeJson } from './src/store/json-file.js';
import { LearnerRegistry } from './src/store/learner-registry.js';
import { assertSafeId, isLearnRoot, normalizeRoot, safeJoin } from './src/store/paths.js';
import { ProfileStore } from './src/store/profile-store.js';
import { ReviewQueue } from './src/store/review-queue.js';
import { createLearnTools } from './src/tools/learn-tools.js';
import { createTutorGate } from './src/tools/activation.js';

const packageDir = dirname(fileURLToPath(import.meta.url));
const skillDir = join(packageDir, 'src', 'skills', 'tutor');

export const inject = ['tools', 'sessions'];

const REMINDER_INTERVAL_MS = 15 * 60 * 1000;
const REMINDER_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const MAX_BODY_BYTES = 1024 * 1024;

function sendJson(res, status, payload, headers = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...headers,
  });
  res.end(body);
}

/**
 * Read a JSON request body with a hard size cap.
 *
 * Root cause of the "local API can be used as a memory pump" finding: the body
 * was buffered with no limit, so one request could hold hundreds of megabytes.
 */
function readBody(req, limit = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        const error = new Error(`request body exceeds ${limit} bytes`);
        error.status = 413;
        reject(error);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/**
 * Parse a JSON request body, tolerating a UTF-8 BOM.
 *
 * Root cause of the "profile save returns 500" report: a body written by a
 * Windows tool (PowerShell `Set-Content -Encoding utf8`) starts with a BOM,
 * which JSON.parse rejects — a client mistake that surfaced as a server error.
 * Stripping the BOM and answering 400 keeps the failure legible.
 */
async function readJsonBody(req) {
  const text = (await readBody(req)).replace(/^\uFEFF/, '').trim();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (error) {
    const bad = new Error(`request body is not valid JSON: ${error.message}`);
    bad.status = 400;
    throw bad;
  }
}

/**
 * Reject cross-site writes.
 *
 * Root cause of "any web page can write learning data": the plugin routes are
 * served by DSH's local web server, which does not authenticate prefixed
 * handlers, and nothing checked where the request came from. A browser on any
 * site can therefore POST to 127.0.0.1. Browsers always attach `Origin` to a
 * cross-origin POST, so a present-and-foreign Origin (or a cross-site
 * `sec-fetch-site`) is refused; non-browser clients without those headers are
 * still allowed so the CLI export/import scripts keep working.
 */
function isCrossSiteRequest(req) {
  const site = (req.headers['sec-fetch-site'] ?? '').toString().toLowerCase();
  if (site === 'cross-site' || site === 'same-site') return true;
  const origin = req.headers.origin;
  if (!origin) return false;
  const host = req.headers.host;
  if (!host) return true;
  try {
    return new URL(origin).host !== host;
  } catch {
    return true;
  }
}

/** Reject a URL/query identifier that is not a safe slug (400 response). */
function requireId(res, value, label) {
  try {
    assertSafeId(value, label);
    return value;
  } catch (error) {
    sendJson(res, 400, { error: String(error?.message ?? error) });
    return null;
  }
}

// ---------------------------------------------------------------------------
// Course metadata ("课堂" UI): favorites, locks, aliases, groups and the chat
// session each course was taught in. Lives at <fallbackRoot>/course-meta.json,
// keyed by `${root}::${learnerId}::${roadmapId}` so courses stay addressable
// across workspace roots.
// ---------------------------------------------------------------------------
function courseKey(root, learnerId, roadmapId) {
  return `${normalizeRoot(root)}::${learnerId}::${roadmapId}`;
}

function makeCourseMetaStore(path) {
  return {
    async all() {
      return readJson(path, {});
    },
    async get(root, learnerId, roadmapId) {
      const all = await readJson(path, {});
      return all[courseKey(root, learnerId, roadmapId)] ?? {};
    },
    async patch(root, learnerId, roadmapId, patch) {
      const all = await readJson(path, {});
      const key = courseKey(root, learnerId, roadmapId);
      const next = { ...(all[key] ?? {}), ...patch, updatedAt: Date.now() };
      for (const [k, v] of Object.entries(next)) if (v === undefined || v === null || v === '') delete next[k];
      all[key] = next;
      await writeJson(path, all);
      return next;
    },
    async remove(root, learnerId, roadmapId) {
      const all = await readJson(path, {});
      delete all[courseKey(root, learnerId, roadmapId)];
      await writeJson(path, all);
    },
  };
}

/** True when `dir` looks like a learn data root this plugin manages. */
function readRootOrNull(value) {
  return isLearnRoot(value) ? normalizeRoot(value) : null;
}

/**
 * dsh-learn-expert: a 1v1 AI private tutor.
 * Registers the ai_learn_* tool set, the `learn-expert` teaching skill, the
 * Web analysis API, and the spaced-review reminder.
 *
 * Learning data is persisted per learner into the session workspace:
 *   <workspace>/dsh-learn/learn-<learnerId>/{profile.json,review-queue.json,roadmaps/,diagnoses/,notes/}
 * falling back to `dataDir` when no workspace can be resolved. Export/import
 * bundles live in <root>/dsh-learn/exports/.
 *
 * config (cordis.patch.yml row):
 *   dataDir           fallback storage root; default $DSH_HOME/dsh-learn
 *   masteryThreshold  unlock threshold, default 80
 *   masteryWeights    { accuracy, depth, transfer, discrimination }, default equal
 *   reviewReminder    'recent' (default) | 'all' | 'off' — who gets woken when reviews come due
 */
export function apply(ctx, config = {}) {
  const fallbackRoot =
    config.dataDir ??
    join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'dsh-learn');
  const masteryThreshold = config.masteryThreshold ?? 80;
  const reminderMode = config.reviewReminder ?? 'recent';

  const registry = new LearnerRegistry({
    fallbackRoot,
    // Resolved per tool call: on a cold start `ctx.get('workingDirectory')` is
    // still null while apply() runs, and capturing it here froze every later
    // call onto the fallback root.
    resolveWorkingDirectory: (agent, signal) => {
      const service = ctx.get('workingDirectory');
      if (!service || typeof service.ensure !== 'function') return null;
      return service.ensure(agent, signal);
    },
    masteryThreshold,
    masteryWeights: config.masteryWeights,
  });

  const tools = createLearnTools({ registry, masteryThreshold });
  const reminderStatePath = join(fallbackRoot, 'reminder-state.json');
  const courseMeta = makeCourseMetaStore(join(fallbackRoot, 'course-meta.json'));

  /**
   * Bind a roadmap to the chat session it is being taught in, so the 课堂 UI
   * can offer a "随手问" jump back into that conversation.
   */
  async function bindSession(exec, roadmapId, learnerId) {
    const sessionId = exec?.agent?.session?.id;
    if (!sessionId || !roadmapId) return;
    try {
      const root = await registry.root(exec);
      await courseMeta.patch(root, learnerId ?? 'default', roadmapId, { sessionId, lastSessionAt: Date.now() });
    } catch { /* best effort */ }
  }

  /** Wrap a tool so a successful call stamps its roadmap's session binding. */
  function withSessionBinding(tool) {
    const execute = tool.execute;
    return {
      ...tool,
      async execute(args, exec) {
        const result = await execute(args, exec);
        try {
          const roadmapId =
            args?.roadmapId ??
            result?.roadmapId ??
            result?.roadmap?.id ??
            (tool.name === 'ai_learn_create_roadmap' ? result?.id : undefined);
          await bindSession(exec, roadmapId, args?.learnerId);
        } catch { /* never break the tool */ }
        return result;
      },
    };
  }

  /** Due review items across every known root. */
  async function dueReviewCount() {
    const { reviewItems } = await registry.aggregate(null);
    const now = Date.now();
    return reviewItems.filter((item) => Number(item.nextReviewAt) <= now).length;
  }

  /**
   * F2: remind about due reviews at most once per 24h. On agent creation we
   * inject (no wake — the learner sees it at the next interaction); on the
   * 15-minute timer we follow up (wake) the most recently created agent,
   * every agent, or nobody, per config.reviewReminder.
   */
  async function maybeRemind(kind) {
    if (reminderMode === 'off') return;
    try {
      const due = await dueReviewCount();
      if (due === 0) return;
      const state = await readJson(reminderStatePath, {});
      if (Date.now() - (state.lastReminderAt ?? 0) < REMINDER_COOLDOWN_MS) return;
      const agents = ctx.get('agents')?.list?.() ?? [];
      if (agents.length === 0) return;
      const text =
        `【learn-expert 复习提醒】（这是一条系统提醒，请勿原文转达给学习者，` +
        `也不要透露工具名与内部机制。）学习者有 ${due} 个到期的复习项，` +
        `按记忆曲线现在复习效果最好。请用自己的话，配合 ask_user_question ` +
        `选项卡询问学习者现在是否复习（选项：现在复习 / 先学新内容）；` +
        `学习者同意后先调用复习查询工具获取明细，再按私教协议做主动回忆式复习。`;
      const message = { content: [{ type: 'text', text }], source: { kind: 'learn-expert' } };
      const targets = reminderMode === 'all' ? agents : agents.slice(-1);
      for (const agent of targets) {
        try {
          if (kind === 'created') agent.inject(message);
          else agent.followup(message);
        } catch { /* agent disposed between list and send */ }
      }
      await writeJson(reminderStatePath, { lastReminderAt: Date.now(), due });
    } catch { /* reminder is best-effort; never break the host */ }
  }

  ctx.effect(() => {
    // The toolset only exists for a session that asked for a tutor (see
    // src/tools/activation.js). A session that never mentions learning keeps
    // the ~14 tool schemas out of its context entirely.
    const gate = createTutorGate();
    const when = (context) => gate.isActive(context?.agent);
    const disposers = tools.map((tool) => ctx.tools.register(withSessionBinding(tool), { when }));

    // Live turns: watch committed events so a later "我想学…" switches the
    // session on without re-reading history. Resumed sessions publish no events
    // for their seeded prefix, which the gate covers by seeding from messages.
    try {
      disposers.push(ctx.on('session/event', (session, event) => gate.observe(session, event)));
    } catch { /* event bus unavailable: seeding still activates */ }

    // ---- Web API for the analysis panel / profile card (F3, F4, F5, F9) ----
    // The webServer service can be installed AFTER this plugin is applied on a
    // cold start; mount lazily and retry instead of silently dropping the routes.
    const mountWebApi = (webServer) => {
      disposers.push(
        webServer.register({
          kind: 'prefix',
          path: '/dsh-learn-expert/api', // NOTE: no trailing slash; prefix p matches p and p/<anything>
          async handler(req, res) {
            try {
              if (isCrossSiteRequest(req)) {
                sendJson(res, 403, { error: 'cross-site requests are not allowed on this endpoint' });
                return;
              }
              if (req.method === 'POST') {
                const type = (req.headers['content-type'] ?? '').toString().toLowerCase();
                if (!type.includes('application/json')) {
                  sendJson(res, 415, { error: 'POST bodies must be sent as application/json' });
                  return;
                }
              }
              const url = new URL(req.url, 'http://localhost');
              const sub = url.pathname.slice('/dsh-learn-expert/api/'.length);

              if (sub === 'analysis' && req.method === 'GET') {
                const { roadmaps, reviewItems, diagnoses, learners } = await registry.aggregate(null);
                sendJson(res, 200, { ...buildAnalysis({ roadmaps, reviewItems, diagnoses }), learners });
                return;
              }

              if (sub === 'profile' && req.method === 'GET') {
                const learnerId = requireId(res, url.searchParams.get('learnerId') || 'default', 'learnerId');
                if (!learnerId) return;
                const found = await registry.findLearnerDir(null, learnerId);
                const dir = found?.dir ?? registry.learnerDir(fallbackRoot, learnerId);
                const profile = await new ProfileStore(dir).get();
                sendJson(res, 200, { ...profile, learnerId });
                return;
              }

              if (sub === 'profile' && req.method === 'POST') {
                // Write to the same folder GET reads from: writing to the
                // fallback root unconditionally made GUI edits silently vanish
                // as soon as the learner folder lived under the workspace.
                const body = await readJsonBody(req);
                const learnerId = requireId(
                  res,
                  typeof body.learnerId === 'string' && body.learnerId ? body.learnerId : 'default',
                  'learnerId',
                );
                if (!learnerId) return;
                const { learnerId: _omit, ...patch } = body;
                const found = await registry.findLearnerDir(null, learnerId);
                const dir = found?.dir ?? registry.learnerDir(fallbackRoot, learnerId);
                const profile = await new ProfileStore(dir).update(patch);
                registry.cache.delete(dir); // keep cached stores consistent
                sendJson(res, 200, { ...profile, learnerId });
                return;
              }

              if (sub === 'export' && req.method === 'GET') {
                const learnerId = requireId(res, url.searchParams.get('learnerId') || 'default', 'learnerId');
                if (!learnerId) return;
                const found = await registry.findLearnerDir(null, learnerId);
                if (!found) {
                  sendJson(res, 404, { error: `learner "${learnerId}" has no data to export yet` });
                  return;
                }
                const bundle = await registry.bundleFromDir(found.dir, learnerId);
                sendJson(res, 200, bundle, {
                  'content-disposition': `attachment; filename="learn-expert-${learnerId}-${Date.now()}.json"`,
                });
                return;
              }

              if (sub === 'courses' && req.method === 'GET') {
                const { roadmaps, reviewItems } = await registry.aggregate(null);
                const meta = await courseMeta.all();
                const now = Date.now();
                const courses = [];
                for (const r of roadmaps) {
                  const key = courseKey(r.root, r.learnerId, r.id);
                  const m = meta[key] ?? {};
                  const notesDir = safeJoin(r.root, `learn-${r.learnerId}`, 'notes', r.id);
                  const nodes = [];
                  for (const n of r.nodes ?? []) {
                    let hasNote = false;
                    let hasUserNote = false;
                    try { hasNote = (await stat(safeJoin(notesDir, `${n.id}.md`))).size > 0; } catch { /* none */ }
                    try { hasUserNote = (await stat(safeJoin(notesDir, `${n.id}.user.md`))).size > 0; } catch { /* none */ }
                    nodes.push({
                      id: n.id,
                      title: n.title,
                      description: n.description ?? '',
                      status: n.status,
                      prerequisites: n.prerequisites ?? [],
                      mastery: n.mastery ?? null,
                      total: n.mastery?.total ?? null,
                      assessedAt: n.mastery?.assessedAt ?? null,
                      hasNote,
                      hasUserNote,
                    });
                  }
                  const reviews = reviewItems
                    .filter((i) => i.roadmapId === r.id && i.learnerId === r.learnerId && i.root === r.root)
                    .map((i) => ({
                      nodeId: i.nodeId,
                      roadmapId: i.roadmapId,
                      nextReviewAt: i.nextReviewAt,
                      due: Number(i.nextReviewAt) <= now,
                      title: (r.nodes ?? []).find((n) => n.id === i.nodeId)?.title ?? i.nodeId,
                    }));
                  const nodeCount = nodes.length;
                  const masteredCount = nodes.filter((n) => n.status === 'mastered').length;
                  // `activeNode` used to be a bare title string while the panel
                  // treated it as a node object; expose the whole node plus a
                  // `activeNodeTitle` convenience field.
                  const activeNode = nodes.find((n) => n.status === 'active') ?? null;
                  courses.push({
                    key,
                    root: r.root,
                    learnerId: r.learnerId,
                    roadmapId: r.id,
                    topic: r.topic,
                    state: r.state,
                    dag: layoutDag(r.nodes ?? []),
                    createdAt: r.createdAt,
                    updatedAt: r.updatedAt,
                    nodeCount,
                    masteredCount,
                    relearnCount: nodes.filter((n) => n.status === 'needs-relearn').length,
                    activeNode,
                    activeNodeTitle: activeNode?.title ?? null,
                    dueCount: reviews.filter((i) => i.due).length,
                    reviews,
                    nodes,
                    meta: {
                      alias: m.alias ?? null,
                      favorite: m.favorite === true,
                      locked: m.locked === true,
                      group: m.group ?? null,
                      sessionId: m.sessionId ?? null,
                    },
                  });
                }
                courses.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
                sendJson(res, 200, { generatedAt: now, courses });
                return;
              }

              if (sub === 'course/meta' && req.method === 'POST') {
                const body = await readJsonBody(req);
                const { root, learnerId, roadmapId, patch } = body;
                const safeRoot = readRootOrNull(root);
                if (!safeRoot || typeof patch !== 'object' || !patch) {
                  sendJson(res, 400, { error: 'course/meta requires { root, learnerId, roadmapId, patch }' });
                  return;
                }
                try {
                  assertSafeId(learnerId, 'learnerId');
                  assertSafeId(roadmapId, 'roadmapId');
                } catch (error) {
                  sendJson(res, 400, { error: String(error?.message ?? error) });
                  return;
                }
                const allowed = {};
                for (const k of ['alias', 'favorite', 'locked', 'group']) {
                  if (k in patch) allowed[k] = patch[k];
                }
                const meta = await courseMeta.patch(safeRoot, learnerId, roadmapId, allowed);
                sendJson(res, 200, { ok: true, meta });
                return;
              }

              if (sub === 'course/note' && req.method === 'GET') {
                const root = url.searchParams.get('root');
                const learnerId = url.searchParams.get('learnerId');
                const roadmapId = url.searchParams.get('roadmapId');
                const nodeId = url.searchParams.get('nodeId');
                const kind = url.searchParams.get('kind') === 'user' ? 'user' : 'tutor';
                const safeRoot = readRootOrNull(root);
                if (!safeRoot || !learnerId || !roadmapId || !nodeId) {
                  sendJson(res, 400, { error: 'course/note requires root, learnerId, roadmapId, nodeId' });
                  return;
                }
                // NOTE: `roadmapId`/`nodeId` come straight from the URL and end
                // up in a file path; validate them before joining.
                let file;
                try {
                  assertSafeId(learnerId, 'learnerId');
                  assertSafeId(roadmapId, 'roadmapId');
                  assertSafeId(nodeId, 'nodeId');
                  file = safeJoin(
                    safeRoot,
                    `learn-${learnerId}`,
                    'notes',
                    roadmapId,
                    `${nodeId}${kind === 'user' ? '.user' : ''}.md`,
                  );
                } catch (error) {
                  sendJson(res, 400, { error: String(error?.message ?? error) });
                  return;
                }
                let content = '';
                try { content = await readFile(file, 'utf8'); } catch { /* no note yet */ }
                sendJson(res, 200, { content, kind });
                return;
              }

              if (sub === 'course/note' && req.method === 'POST') {
                const body = await readJsonBody(req);
                const { root, learnerId, roadmapId, nodeId, content } = body;
                const safeRoot = readRootOrNull(root);
                if (!safeRoot || !learnerId || !roadmapId || !nodeId || typeof content !== 'string') {
                  sendJson(res, 400, { error: 'course/note POST requires { root, learnerId, roadmapId, nodeId, content }' });
                  return;
                }
                let dir;
                let file;
                try {
                  assertSafeId(learnerId, 'learnerId');
                  assertSafeId(roadmapId, 'roadmapId');
                  assertSafeId(nodeId, 'nodeId');
                  dir = safeJoin(safeRoot, `learn-${learnerId}`, 'notes', roadmapId);
                  file = safeJoin(dir, `${nodeId}.user.md`);
                } catch (error) {
                  sendJson(res, 400, { error: String(error?.message ?? error) });
                  return;
                }
                await mkdir(dir, { recursive: true });
                await writeFile(file, content, 'utf8');
                sendJson(res, 200, { ok: true });
                return;
              }

              if (sub === 'course/delete' && req.method === 'POST') {
                const body = await readJsonBody(req);
                const { root, learnerId, roadmapId } = body;
                const safeRoot = readRootOrNull(root);
                if (!safeRoot || !learnerId || !roadmapId) {
                  sendJson(res, 400, { error: 'course/delete requires { root, learnerId, roadmapId }' });
                  return;
                }
                // Root cause of the traversal finding: only the root was
                // checked, so roadmapId "../.." made the recursive rm below
                // delete an arbitrary directory.
                let dir;
                let notesDir;
                try {
                  assertSafeId(learnerId, 'learnerId');
                  assertSafeId(roadmapId, 'roadmapId');
                  dir = safeJoin(safeRoot, `learn-${learnerId}`);
                  notesDir = safeJoin(dir, 'notes', roadmapId);
                } catch (error) {
                  sendJson(res, 400, { error: String(error?.message ?? error) });
                  return;
                }
                await rm(safeJoin(dir, 'roadmaps', `${roadmapId}.json`), { force: true });
                await rm(notesDir, { recursive: true, force: true });
                const queue = new ReviewQueue(dir);
                const items = await queue.list();
                await queue.saveAll(items.filter((i) => i.roadmapId !== roadmapId));
                await courseMeta.remove(safeRoot, learnerId, roadmapId);
                registry.cache.delete(dir);
                sendJson(res, 200, { ok: true });
                return;
              }

              sendJson(res, 404, { error: `unknown learn-expert endpoint: ${sub}` });
            } catch (error) {
              sendJson(res, Number(error?.status) || 500, { error: String(error?.message ?? error) });
            }
          },
        }),
      );
    };

    let webMounted = false;
    let webTries = 0;
    const tryMountWeb = () => {
      if (webMounted) return;
      let ws = null;
      try { ws = ctx.get('webServer'); } catch { /* service not ready yet */ }
      if (!ws) return;
      try {
        mountWebApi(ws);
        webMounted = true;
      } catch { /* keep retrying */ }
    };
    tryMountWeb();
    if (!webMounted) {
      const webRetry = setInterval(() => {
        tryMountWeb();
        if (webMounted || ++webTries > 120) clearInterval(webRetry);
      }, 500);
      disposers.push(() => clearInterval(webRetry));
    }

    // ---- F2: spaced-review reminder ----
    if (reminderMode !== 'off') {
      disposers.push(ctx.on('agent/created', () => void maybeRemind('created')));
      const timer = setInterval(() => void maybeRemind('tick'), REMINDER_INTERVAL_MS);
      disposers.push(() => clearInterval(timer));
    }

    const skills = ctx.get('skills');
    if (skills) {
      disposers.push(
        skills.register({
          name: 'learn-expert',
          description:
            '1v1 AI 私教：说出想学什么或丢进资料就开讲。摸底诊断 → 按背景生成章节路线图 → 逐节教学（讲一段出一题）→ 四维掌握度 ≥80 解锁 → 笔记沉淀 → SM-2 间隔复习。当用户想真正学会一个主题时使用。',
          whenToUse:
            'Use ONLY when the user explicitly asks to learn, be taught, or review a topic (e.g. "我想学…", "教我…", "带我学会…", "复习一下…", "teach me …"), or when a spaced-review reminder arrives. Do not load this skill for ordinary questions about a topic.',
          content: readFileSync(join(skillDir, 'SKILL.md'), 'utf8'),
          source: 'bundled',
          resourceBase: { kind: 'directory', path: skillDir },
        }),
      );
    }
    return () => {
      for (const dispose of disposers.splice(0)) dispose();
    };
  });
}
