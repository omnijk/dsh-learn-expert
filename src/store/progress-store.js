import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  allMastered,
  assertInsertable,
  findNode,
  firstUnmastered,
  nextNode,
  topoSort,
  validateNodeSpecs,
} from '../core/concept-graph.js';
import { transition } from '../core/state-machine.js';
import { readJson, writeJson } from './json-file.js';

function slugify(text) {
  const slug = String(text)
    .toLowerCase()
    .replace(/[^a-z0-9一-鿿]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return slug || 'course';
}

/**
 * Roadmap / Diagnosis / notes persistence (plan §4.1–§4.3):
 *   <dataDir>/roadmaps/{roadmapId}.json
 *   <dataDir>/diagnoses/{id}.json
 *   <dataDir>/notes/{roadmapId}/{nodeId}.md
 */
export class ProgressStore {
  constructor(dataDir, { masteryThreshold = 80, masteryWeights } = {}) {
    this.dataDir = dataDir;
    this.roadmapsDir = join(dataDir, 'roadmaps');
    this.diagnosesDir = join(dataDir, 'diagnoses');
    this.notesDir = join(dataDir, 'notes');
    this.masteryThreshold = masteryThreshold;
    this.masteryWeights = masteryWeights ?? { accuracy: 1, depth: 1, transfer: 1, discrimination: 1 };
  }

  roadmapPath(id) {
    return join(this.roadmapsDir, `${id}.json`);
  }

  async getRoadmap(id) {
    const roadmap = await readJson(this.roadmapPath(id), null);
    if (!roadmap) throw new Error(`roadmap "${id}" not found`);
    return roadmap;
  }

  async saveRoadmap(roadmap) {
    const next = { ...roadmap, updatedAt: Date.now() };
    await writeJson(this.roadmapPath(roadmap.id), next);
    return next;
  }

  /** Every stored roadmap, newest first. */
  async listRoadmaps() {
    const { readdir } = await import('node:fs/promises');
    let files = [];
    try {
      files = await readdir(this.roadmapsDir);
    } catch {
      return [];
    }
    const roadmaps = [];
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const roadmap = await readJson(join(this.roadmapsDir, file), null);
      if (roadmap) roadmaps.push(roadmap);
    }
    return roadmaps.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /** Locate the roadmap that contains `nodeId` (optionally narrowed by roadmapId). */
  async findRoadmapByNode(nodeId, roadmapId) {
    if (roadmapId) {
      const roadmap = await this.getRoadmap(roadmapId);
      findNode(roadmap, nodeId);
      return roadmap;
    }
    for (const roadmap of await this.listRoadmaps()) {
      if (roadmap.nodes.some((n) => n.id === nodeId)) return roadmap;
    }
    throw new Error(`no roadmap contains node "${nodeId}"`);
  }

  // ---- diagnosis -------------------------------------------------------

  async saveDiagnosis(diagnosis) {
    const id = `${slugify(diagnosis.topic)}-${Date.now().toString(36)}`;
    const record = { id, createdAt: Date.now(), ...diagnosis };
    await writeJson(join(this.diagnosesDir, `${id}.json`), record);
    return record;
  }

  async listDiagnoses() {
    const { readdir } = await import('node:fs/promises');
    let files = [];
    try {
      files = await readdir(this.diagnosesDir);
    } catch {
      return [];
    }
    const diagnoses = [];
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const record = await readJson(join(this.diagnosesDir, file), null);
      if (record) diagnoses.push(record);
    }
    return diagnoses.sort((a, b) => b.createdAt - a.createdAt);
  }

  // ---- roadmap lifecycle ----------------------------------------------

  /**
   * Create a roadmap from node specs. `estimates` (from the diagnosis) mark
   * nodes with estimatedMastery >= threshold as already mastered; the first
   * remaining node becomes active and everything after it locked.
   */
  async createRoadmap({ topic, materials = [], nodes, estimates = [], threshold }) {
    validateNodeSpecs(nodes);
    const sorted = topoSort(nodes);
    const cutoff = threshold ?? this.masteryThreshold;

    const estimateOf = new Map();
    for (const est of estimates) {
      const key = (est.nodeId ?? est.concept ?? '').toLowerCase();
      if (key) estimateOf.set(key, est);
    }

    const built = sorted.map((spec) => {
      const estimate =
        estimateOf.get(spec.id.toLowerCase()) ?? estimateOf.get(spec.title.toLowerCase());
      const mastered = estimate && Number(estimate.estimatedMastery) >= cutoff;
      return {
        id: spec.id,
        title: spec.title,
        description: spec.description,
        prerequisites: spec.prerequisites ?? [],
        status: mastered ? 'mastered' : 'locked',
        ...(mastered
          ? {
              skippedByDiagnosis: true,
              mastery: {
                accuracy: null,
                depth: null,
                transfer: null,
                discrimination: null,
                total: estimate.estimatedMastery,
                rationale: `diagnosis estimate: ${estimate.evidence ?? 'learner demonstrated prior knowledge'}`,
                assessedAt: Date.now(),
              },
            }
          : {}),
      };
    });

    const roadmap = {
      id: `${slugify(topic)}-${randomUUID().slice(0, 8)}`,
      topic,
      sourceMaterial: materials,
      state: 'ROADMAP_READY',
      nodes: built,
      currentNodeId: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const first = roadmap.nodes.find((n) => n.status !== 'mastered');
    if (first) {
      first.status = 'active';
      roadmap.currentNodeId = first.id;
    } else {
      roadmap.state = 'COMPLETED';
    }
    return this.saveRoadmap(roadmap);
  }

  /** insertNode / skipNode (plan M2 dynamic adjustment). */
  async updateRoadmap(roadmapId, op, payload = {}) {
    const roadmap = await this.getRoadmap(roadmapId);
    if (op === 'insertNode') {
      const spec = payload.node;
      if (!spec) throw new Error('payload.node is required for insertNode');
      assertInsertable(
        roadmap.nodes.map((n) => ({ ...n })),
        spec,
      );
      const node = {
        id: spec.id,
        title: spec.title,
        description: spec.description,
        prerequisites: spec.prerequisites ?? [],
        status: 'locked',
      };
      const afterId = payload.afterNodeId;
      if (afterId !== undefined) {
        const index = roadmap.nodes.findIndex((n) => n.id === afterId);
        if (index < 0) throw new Error(`afterNodeId "${afterId}" not found in roadmap "${roadmapId}"`);
        roadmap.nodes.splice(index + 1, 0, node);
      } else {
        const currentIndex = roadmap.nodes.findIndex((n) => n.id === roadmap.currentNodeId);
        roadmap.nodes.splice(currentIndex >= 0 ? currentIndex + 1 : roadmap.nodes.length, 0, node);
      }
      // If nothing is active (e.g. the learner stalled between nodes), open the
      // next locked node whose prerequisites are mastered. needs-relearn nodes
      // are left to the tutor flow (re-teach, then re-assess mastery).
      if (!roadmap.nodes.some((n) => n.status === 'active') && !allMastered(roadmap)) {
        const target = roadmap.nodes.find(
          (n) => n.status === 'locked' && n.prerequisites.every((p) => this.isMastered(roadmap, p)),
        );
        if (target) {
          target.status = 'active';
          roadmap.currentNodeId = target.id;
        }
      }
    } else if (op === 'skipNode') {
      const node = findNode(roadmap, payload.nodeId);
      node.status = 'mastered';
      node.skippedByRequest = true;
      this.advance(roadmap, node.id);
    } else {
      throw new Error(`unknown roadmap op "${op}"; expected "insertNode" or "skipNode"`);
    }
    return this.saveRoadmap(roadmap);
  }

  isMastered(roadmap, nodeId) {
    return roadmap.nodes.find((n) => n.id === nodeId)?.status === 'mastered';
  }

  /** After `nodeId` completes: activate the next unmastered node, or complete. */
  advance(roadmap, nodeId) {
    if (roadmap.currentNodeId === nodeId) {
      const next = nextNode(roadmap, nodeId);
      const target = next && next.status !== 'mastered'
        ? next
        : firstUnmastered(roadmap);
      if (target) {
        if (target.status === 'locked') target.status = 'active';
        roadmap.currentNodeId = target.id;
      } else {
        roadmap.currentNodeId = null;
      }
    }
    if (allMastered(roadmap)) {
      roadmap.state = 'COMPLETED';
      roadmap.currentNodeId = null;
    }
  }

  // ---- mastery ----------------------------------------------------------

  weightedTotal(scores) {
    const w = this.masteryWeights;
    const sum = w.accuracy + w.depth + w.transfer + w.discrimination;
    return Math.round(
      (scores.accuracy * w.accuracy +
        scores.depth * w.depth +
        scores.transfer * w.transfer +
        scores.discrimination * w.discrimination) /
        sum,
    );
  }

  /**
   * Record a four-dimension MasteryScore on a node.
   * Returns { roadmap, node, mastery, action, nextNodeId, courseCompleted }
   * where action is "unlock" | "question" | "remediate" (plan M4 thresholds).
   */
  async applyMastery(roadmapId, nodeId, scores, rationale) {
    for (const dim of ['accuracy', 'depth', 'transfer', 'discrimination']) {
      const value = scores?.[dim];
      if (typeof value !== 'number' || value < 0 || value > 100) {
        throw new Error(`scores.${dim} must be a number in 0..100`);
      }
    }
    if (typeof rationale !== 'string' || !rationale.trim()) {
      throw new Error('rationale is required and must quote the learner\u2019s own words');
    }
    const roadmap = await this.getRoadmap(roadmapId);
    const node = findNode(roadmap, nodeId);
    const mastery = {
      accuracy: scores.accuracy,
      depth: scores.depth,
      transfer: scores.transfer,
      discrimination: scores.discrimination,
      total: this.weightedTotal(scores),
      rationale,
      assessedAt: Date.now(),
    };
    node.mastery = mastery;

    let action;
    if (mastery.total >= this.masteryThreshold) {
      node.status = 'mastered';
      this.advance(roadmap, nodeId);
      action = 'unlock';
      if (roadmap.state !== 'COMPLETED') roadmap.state = 'TEACHING';
    } else if (mastery.total < 60) {
      node.status = 'active';
      roadmap.currentNodeId = nodeId;
      roadmap.state = 'REMEDIATING';
      action = 'remediate';
    } else {
      node.status = 'active';
      roadmap.currentNodeId = nodeId;
      roadmap.state = 'QUESTIONING';
      action = 'question';
    }
    await this.saveRoadmap(roadmap);
    return {
      roadmap,
      node,
      mastery,
      action,
      nextNodeId: roadmap.currentNodeId,
      courseCompleted: roadmap.state === 'COMPLETED',
    };
  }

  // ---- checkpoint --------------------------------------------------------

  async saveCheckpoint(roadmapId, nodeId, questions) {
    if (!Array.isArray(questions) || questions.length === 0) {
      throw new Error('questions must be a non-empty array');
    }
    const roadmap = await this.getRoadmap(roadmapId);
    const node = findNode(roadmap, nodeId);
    const stamped = questions.map((q, i) => {
      if (typeof q?.text !== 'string' || !q.text.trim()) {
        throw new Error(`questions[${i}].text is required`);
      }
      return {
        id: q.id ?? `${nodeId}-q${(node.checkpoint?.questions.length ?? 0) + i + 1}`,
        kind: q.kind === 'transfer' ? 'transfer' : 'understanding',
        text: q.text,
      };
    });
    node.checkpoint = { createdAt: Date.now(), questions: stamped, attempts: node.checkpoint?.attempts ?? [] };
    if (roadmap.state === 'TEACHING' || roadmap.state === 'QUESTIONING') {
      roadmap.state = transition(roadmap.state, 'CHECKPOINT');
    }
    await this.saveRoadmap(roadmap);
    return { roadmap, questions: stamped };
  }

  /**
   * Record one checkpoint answer. Returns { roadmap, passed, consecutiveFails, remediate }.
   * Two consecutive failures on the same node request re-teaching (plan M5).
   */
  async recordAnswer(roadmapId, nodeId, { questionId, answer, passed, cause, feedback }) {
    const roadmap = await this.getRoadmap(roadmapId);
    const node = findNode(roadmap, nodeId);
    if (!node.checkpoint) throw new Error(`node "${nodeId}" has no checkpoint yet; call ai_learn_checkpoint first`);
    if (!node.checkpoint.questions.some((q) => q.id === questionId)) {
      throw new Error(`node "${nodeId}" checkpoint has no question "${questionId}"`);
    }
    node.checkpoint.attempts.push({
      questionId,
      answer,
      passed: Boolean(passed),
      cause: passed ? undefined : cause,
      feedback,
      at: Date.now(),
    });

    let consecutiveFails = 0;
    for (let i = node.checkpoint.attempts.length - 1; i >= 0; i -= 1) {
      if (node.checkpoint.attempts[i].passed) break;
      consecutiveFails += 1;
    }
    const remediate = consecutiveFails >= 2;
    if (remediate) {
      roadmap.state = 'REMEDIATING';
    } else if (!passed) {
      roadmap.state = 'QUESTIONING';
    } else if (roadmap.state === 'CHECKPOINT' || roadmap.state === 'QUESTIONING') {
      roadmap.state = 'TEACHING';
    }
    await this.saveRoadmap(roadmap);
    return { roadmap, passed: Boolean(passed), consecutiveFails, remediate };
  }

  // ---- notes --------------------------------------------------------------

  /**
   * Write notes/<roadmapId>/<nodeId>.md. learnerQuotes (>=1) guarantees the
   * note carries the learner's own phrasing (plan M6 acceptance).
   */
  async writeNote(roadmapId, nodeId, { title, content, learnerQuotes }) {
    if (typeof content !== 'string' || !content.trim()) {
      throw new Error('content is required');
    }
    if (!Array.isArray(learnerQuotes) || learnerQuotes.length === 0 || learnerQuotes.some((q) => typeof q !== 'string' || !q.trim())) {
      throw new Error('learnerQuotes must contain at least one non-empty quote from the learner');
    }
    const roadmap = await this.getRoadmap(roadmapId);
    const node = findNode(roadmap, nodeId);
    const dir = join(this.notesDir, roadmapId);
    await mkdir(dir, { recursive: true });
    const path = join(dir, `${nodeId}.md`);
    const doc = [
      `# ${title ?? node.title}`,
      '',
      `> roadmap: ${roadmap.topic} (${roadmapId}) ｜ node: ${nodeId} ｜ updated: ${new Date().toISOString()}`,
      '',
      '## 学习者自己的表述',
      ...learnerQuotes.map((q) => `> ${q}`),
      '',
      '## 笔记',
      content.trim(),
      '',
    ].join('\n');
    await writeFile(path, doc, 'utf8');
    node.notePath = path;
    await this.saveRoadmap(roadmap);
    return { path, node };
  }
}
