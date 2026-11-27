/**
 * Teaching state machine (plan §4.3).
 *
 * IDLE → DIAGNOSING → ROADMAP_READY → TEACHING
 * TEACHING → QUESTIONING → (掌握) → CHECKPOINT → (≥80) → TEACHING(下一节点)
 *                                ↘ (不达标) → REMEDIATING → QUESTIONING
 * 任意状态 → REVIEWING → 回到原状态
 * 所有节点 mastered → COMPLETED
 */

export const TUTOR_STATES = [
  'IDLE',
  'DIAGNOSING',
  'ROADMAP_READY',
  'TEACHING',
  'QUESTIONING',
  'CHECKPOINT',
  'REMEDIATING',
  'REVIEWING',
  'COMPLETED',
];

/** event → allowed source states. REVIEW is allowed from any non-COMPLETED state. */
const TRANSITIONS = {
  DIAGNOSE: ['IDLE'],
  ROADMAP: ['DIAGNOSING', 'IDLE'],
  TEACH: ['ROADMAP_READY', 'TEACHING', 'QUESTIONING', 'CHECKPOINT', 'REMEDIATING', 'REVIEWING'],
  QUESTION: ['TEACHING', 'QUESTIONING', 'CHECKPOINT', 'REMEDIATING', 'REVIEWING'],
  CHECKPOINT: ['TEACHING', 'QUESTIONING'],
  REMEDIATE: ['QUESTIONING', 'CHECKPOINT'],
  REVIEW: ['IDLE', 'DIAGNOSING', 'ROADMAP_READY', 'TEACHING', 'QUESTIONING', 'CHECKPOINT', 'REMEDIATING', 'REVIEWING'],
  COMPLETE: ['TEACHING', 'CHECKPOINT', 'QUESTIONING'],
};

const EVENT_TARGET = {
  DIAGNOSE: 'DIAGNOSING',
  ROADMAP: 'ROADMAP_READY',
  TEACH: 'TEACHING',
  QUESTION: 'QUESTIONING',
  CHECKPOINT: 'CHECKPOINT',
  REMEDIATE: 'REMEDIATING',
  REVIEW: 'REVIEWING',
  COMPLETE: 'COMPLETED',
};

/**
 * Transition `state` by `event`. Returns the new state.
 * Throws when the transition is not allowed.
 */
export function transition(state, event) {
  const sources = TRANSITIONS[event];
  if (!sources) throw new Error(`unknown tutor event "${event}"`);
  if (!sources.includes(state)) {
    throw new Error(`tutor state "${state}" cannot handle event "${event}"`);
  }
  return EVENT_TARGET[event];
}

/** True when the event may fire from the state. */
export function canTransition(state, event) {
  return (TRANSITIONS[event] ?? []).includes(state);
}
