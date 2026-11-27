/**
 * Tutor activation gate.
 *
 * Opening DSH must not put the private-tutor protocol into every conversation:
 * the 14 `ai_learn_*` tool schemas alone are several thousand tokens, and a
 * session about, say, fixing a build script has no use for them.
 *
 * A session only gets the toolset once it has actually asked for a tutor:
 *
 *   1. the user explicitly asks to learn / be taught / review something
 *      (`我想学…`, `教我…`, `带我学会…`, `复习一下…`, `teach me…`, …), or
 *   2. the model loaded the `learn-expert` skill — which it only does when the
 *      request matched that skill's description. The loaded skill body reaches
 *      the transcript as `<skill_content name="learn-expert">`, so the marker
 *      is visible on the committed message.
 *
 * Once a session qualifies it stays qualified: a course spans many turns and
 * the tools must not vanish between them.
 *
 * Live turns are detected from `session/event` (cheap, append-only). A resumed
 * session publishes no events for its seeded history, so the first check also
 * looks at the already-derived messages once.
 */

/** Wording that counts as an explicit request for a tutor. */
export const TUTOR_REQUEST =
  /(私教|教我|带我学|带我学会|带我过|我想学|我要学|想学点|学一下|学会|学习计划|学习路线|学习路径|开讲|复习|tutor|teach me|learn with me|study plan|quiz me)/i;

/** Loaded-skill marker, as injected by the host's skill loader. */
const SKILL_MARKER = /skill_content name="learn-expert"/;

/** Event types that can carry user-facing text (skill bodies ride user messages). */
const TEXT_EVENTS = new Set(['user/message', 'system/message', 'developer/message', 'tool/result']);

/** Flatten every string inside a payload into one searchable blob. */
function flatten(node, budget, depth = 0) {
  if (!node || budget.left <= 0 || depth > 6) return '';
  if (typeof node === 'string') {
    budget.left -= 1;
    return `${node}\n`;
  }
  if (typeof node !== 'object') return '';
  const items = Array.isArray(node) ? node : Object.values(node);
  let blob = '';
  for (const item of items) {
    blob += flatten(item, budget, depth + 1);
    if (budget.left <= 0) break;
  }
  return blob;
}

/** Flatten one session event / message payload into a searchable blob. */
function textOf(payload) {
  return flatten(payload, { left: 4000 });
}

/**
 * Whether one session event is an explicit tutor request.
 * @param event session event
 * @returns true when the event asks for teaching, review, or the tutor skill
 */
export function eventRequestsTutor(event) {
  if (!event) return false;
  const type = event.type;
  if (type && !TEXT_EVENTS.has(type)) return false;
  const text = textOf(event.data ?? event);
  if (!text) return false;
  // The host escapes the attribute inside JSON, so normalise before matching.
  if (SKILL_MARKER.test(text.replace(/\\"/g, '"'))) return true;
  // Only the learner's own words (or a tutor reminder) start a course — an
  // assistant message that merely mentions 复习 must not switch the session on.
  if (type && type !== 'user/message') return false;
  return TUTOR_REQUEST.test(text);
}

/** Whether an already-derived message asks for a tutor (used for resumed sessions). */
export function messageRequestsTutor(message) {
  const role = message?.role;
  if (role && role !== 'user') return false;
  const text = textOf(message?.content ?? message);
  if (!text) return false;
  if (SKILL_MARKER.test(text.replace(/\\"/g, '"'))) return true;
  return TUTOR_REQUEST.test(text);
}

/**
 * Build the per-session gate handed to `ctx.tools.register(..., { when })`.
 * @returns `{ observe(session, event), isActive(agent), activeSessions() }`
 */
export function createTutorGate() {
  const active = new Set();
  const seeded = new Set();

  /** Look at a resumed session's existing history exactly once. */
  function seed(session) {
    const id = session?.id;
    if (!id || seeded.has(id)) return active.has(id);
    seeded.add(id);
    try {
      const messages = typeof session.deriveMessages === 'function' ? session.deriveMessages() : [];
      if (Array.isArray(messages) && messages.some(messageRequestsTutor)) active.add(id);
    } catch {
      // A session that cannot be read is simply not activated yet.
    }
    return active.has(id);
  }

  return {
    /**
     * Feed one committed session event. Never throws.
     * @param session session the event belongs to
     * @param event committed event
     */
    observe(session, event) {
      try {
        const id = session?.id;
        if (!id || active.has(id)) return;
        if (eventRequestsTutor(event)) active.add(id);
      } catch {
        // Ignore: activation must never disturb the session.
      }
    },

    /**
     * True when this agent's session has asked for a tutor. Never throws: a
     * throwing activation condition fails step preparation for the whole turn.
     * @param agent preparing agent
     * @returns whether the ai_learn_* tools should be declared for this step
     */
    isActive(agent) {
      try {
        const id = agent?.id;
        if (!id) return false;
        if (active.has(id)) return true;
        return seed(agent.session);
      } catch {
        return false;
      }
    },

    /** Test seam: every session currently activated. */
    activeSessions() {
      return [...active];
    },
  };
}
