/**
 * Concept node graph: validation, topological ordering, dynamic insertion.
 * Pure functions only; persistence lives in store/progress-store.js.
 */

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isKebabId(id) {
  return typeof id === 'string' && KEBAB.test(id);
}

/**
 * Validate a list of raw node specs {id,title,description,prerequisites?}.
 * Throws on the first problem, with a model-readable message.
 */
export function validateNodeSpecs(specs) {
  if (!Array.isArray(specs) || specs.length === 0) {
    throw new Error('nodes must be a non-empty array');
  }
  const seen = new Set();
  for (const spec of specs) {
    if (!spec || typeof spec !== 'object') throw new Error('every node must be an object');
    if (!isKebabId(spec.id)) {
      throw new Error(`node id "${spec.id}" must be kebab-case, e.g. "fiber-linked-list"`);
    }
    if (seen.has(spec.id)) throw new Error(`duplicate node id "${spec.id}"`);
    seen.add(spec.id);
    if (typeof spec.title !== 'string' || !spec.title.trim()) {
      throw new Error(`node "${spec.id}" needs a non-empty title`);
    }
    if (typeof spec.description !== 'string' || !spec.description.trim()) {
      throw new Error(`node "${spec.id}" needs a non-empty description of what it teaches`);
    }
    if (spec.prerequisites !== undefined && !Array.isArray(spec.prerequisites)) {
      throw new Error(`node "${spec.id}" prerequisites must be an array of node ids`);
    }
  }
  const ids = new Set(specs.map((s) => s.id));
  for (const spec of specs) {
    for (const pre of spec.prerequisites ?? []) {
      if (!ids.has(pre)) throw new Error(`node "${spec.id}" depends on unknown node "${pre}"`);
      if (pre === spec.id) throw new Error(`node "${spec.id}" cannot depend on itself`);
    }
  }
  detectCycle(specs);
}

/** Kahn's algorithm over specs (objects with id + prerequisites). Throws on a cycle. */
export function detectCycle(specs) {
  const indegree = new Map();
  const dependents = new Map();
  for (const s of specs) {
    indegree.set(s.id, (s.prerequisites ?? []).length);
    for (const pre of s.prerequisites ?? []) {
      if (!dependents.has(pre)) dependents.set(pre, []);
      dependents.get(pre).push(s.id);
    }
  }
  const queue = specs.filter((s) => (s.prerequisites ?? []).length === 0).map((s) => s.id);
  let visited = 0;
  while (queue.length) {
    const id = queue.shift();
    visited += 1;
    for (const dep of dependents.get(id) ?? []) {
      indegree.set(dep, indegree.get(dep) - 1);
      if (indegree.get(dep) === 0) queue.push(dep);
    }
  }
  if (visited !== specs.length) {
    throw new Error('prerequisites form a cycle; the concept graph must be a DAG');
  }
}

/**
 * Topologically sort specs; input order breaks ties so the model's intended
 * teaching order survives whenever dependencies allow it.
 */
export function topoSort(specs) {
  validateNodeSpecs(specs);
  const order = new Map(specs.map((s, i) => [s.id, i]));
  const byId = new Map(specs.map((s) => [s.id, s]));
  const result = [];
  const placed = new Set();
  let progressed = true;
  while (result.length < specs.length && progressed) {
    progressed = false;
    for (const spec of specs) {
      if (placed.has(spec.id)) continue;
      if ((spec.prerequisites ?? []).every((p) => placed.has(p))) {
        placed.add(spec.id);
        result.push(byId.get(spec.id));
        progressed = true;
      }
    }
  }
  // Stable by input order within dependency constraints.
  return result.sort((a, b) => {
    const depthA = dependencyDepth(a, byId);
    const depthB = dependencyDepth(b, byId);
    if (depthA !== depthB) return depthA - depthB;
    return order.get(a.id) - order.get(b.id);
  });
}

function dependencyDepth(spec, byId, memo = new Map()) {
  if (memo.has(spec.id)) return memo.get(spec.id);
  const pres = spec.prerequisites ?? [];
  const depth = pres.length === 0 ? 0 : 1 + Math.max(...pres.map((p) => dependencyDepth(byId.get(p), byId, memo)));
  memo.set(spec.id, depth);
  return depth;
}

/**
 * Would adding `newSpec` ({id, prerequisites}) to existing specs create a
 * cycle or reference unknown nodes?
 */
export function assertInsertable(existingSpecs, newSpec) {
  validateNodeSpecs([...existingSpecs, newSpec]);
}

/** First node that is not mastered, in learning order. */
export function firstUnmastered(roadmap) {
  return roadmap.nodes.find((n) => n.status !== 'mastered') ?? null;
}

/** The node right after `nodeId` in learning order, or null. */
export function nextNode(roadmap, nodeId) {
  const index = roadmap.nodes.findIndex((n) => n.id === nodeId);
  return index >= 0 ? roadmap.nodes[index + 1] ?? null : null;
}

export function allMastered(roadmap) {
  return roadmap.nodes.every((n) => n.status === 'mastered');
}

export function findNode(roadmap, nodeId) {
  const node = roadmap.nodes.find((n) => n.id === nodeId);
  if (!node) throw new Error(`roadmap "${roadmap.id}" has no node "${nodeId}"`);
  return node;
}
