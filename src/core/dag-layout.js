/**
 * Layered DAG layout for roadmap visualization (v2 F4).
 * Pure function: nodes with prerequisites → abstract grid coordinates
 * (x = dependency depth, y = index within the layer) + edge list.
 * The client scales units to pixels.
 */

export function layoutDag(nodes) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const depthMemo = new Map();

  function depthOf(id, visiting) {
    if (depthMemo.has(id)) return depthMemo.get(id);
    const node = byId.get(id);
    if (!node) return 0;
    if (visiting.has(id)) return 0; // defensive: cycles are rejected upstream
    visiting.add(id);
    const pres = (node.prerequisites ?? []).filter((p) => byId.has(p));
    const depth = pres.length === 0 ? 0 : 1 + Math.max(...pres.map((p) => depthOf(p, visiting)));
    visiting.delete(id);
    depthMemo.set(id, depth);
    return depth;
  }

  const layers = new Map();
  for (const node of nodes) {
    const d = depthOf(node.id, new Set());
    if (!layers.has(d)) layers.set(d, []);
    layers.get(d).push(node.id);
  }

  const positions = {};
  let maxY = 0;
  for (const [depth, ids] of layers) {
    ids.forEach((id, y) => {
      positions[id] = { x: depth, y };
      maxY = Math.max(maxY, y);
    });
  }
  const edges = [];
  for (const node of nodes) {
    for (const pre of node.prerequisites ?? []) {
      if (byId.has(pre)) edges.push({ from: pre, to: node.id });
    }
  }
  return {
    positions,
    edges,
    width: layers.size ? Math.max(...layers.keys()) + 1 : 0,
    height: nodes.length ? maxY + 1 : 0,
  };
}
