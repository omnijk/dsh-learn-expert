import { ERROR_CAUSE_ENUM, defineTool, requireString } from './define.js';

const nodeSpecSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string', description: 'kebab-case node id, e.g. "fiber-linked-list"' },
    title: { type: 'string' },
    description: { type: 'string', description: 'what this node must teach' },
    prerequisites: { type: 'array', items: { type: 'string' }, description: 'ids of prerequisite nodes' },
  },
  required: ['id', 'title', 'description'],
};

const estimateSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    nodeId: { type: 'string', description: 'concept id when known' },
    concept: { type: 'string', description: 'concept title when no id exists yet' },
    estimatedMastery: { type: 'number', description: '0-100 estimate from the diagnosis dialogue' },
    evidence: { type: 'string', description: "learner's own words that ground this estimate" },
  },
  required: ['estimatedMastery', 'evidence'],
};

/** Every learning tool accepts the learner whose workspace folder it operates on. */
const learnerParam = {
  learnerId: {
    type: 'string',
    description:
      'Learner id; data is persisted under <workspace>/dsh-learn/learn-<learnerId>/. Defaults to "default".',
  },
};

/**
 * The ai_learn_* tool set. The agent conducts the dialogue; these tools
 * persist and enforce the teaching loop's state: diagnosis, roadmap, mastery
 * gating, checkpoints, notes, SM-2 review, learner profile — one folder per
 * learner in the session workspace, plus export/import.
 *
 * @param {{ registry: import('../store/learner-registry.js').LearnerRegistry, masteryThreshold: number }} deps
 */
export function createLearnTools({ registry, masteryThreshold }) {
  const stores = (exec, args) => registry.stores(exec, args?.learnerId);
  // Slim roadmap projection for the conversation tool-view card (F1).
  const roadmapMeta = (_args, roadmap) => ({
    id: roadmap.id,
    topic: roadmap.topic,
    state: roadmap.state,
    currentNodeId: roadmap.currentNodeId,
    nodes: (roadmap.nodes ?? []).map((n) => ({ id: n.id, title: n.title, status: n.status })),
  });

  const diagnose = defineTool({
    name: 'ai_learn_diagnose',
    description:
      'Record the result of an interactive diagnosis you just conducted with the learner (3-5 probing questions, no recitation; prefer a single batched ask_user_question option-card call for enumerable answers, record the chosen option text as the answer). Persists the DiagnosisResult and returns it together with the learner profile. Ask the questions first; call this only after the learner answered.',
    parameters: {
      properties: {
        ...learnerParam,
        topic: { type: 'string' },
        materials: { type: 'array', items: { type: 'string' }, description: 'file paths or URLs the learner supplied' },
        questions: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: { question: { type: 'string' }, answer: { type: 'string' } },
            required: ['question', 'answer'],
          },
          description: 'the diagnosis questions you asked and the learner\u2019s verbatim answers (option-card answers: the chosen option text)',
        },
        estimates: { type: 'array', items: estimateSchema },
        suggestedStartNodeId: { type: 'string', description: 'concept the learner should start from' },
      },
      required: ['topic', 'questions', 'estimates'],
    },
    async execute(args, exec) {
      if (!Array.isArray(args.questions) || args.questions.length === 0) {
        throw new Error('questions must contain the asked questions and the learner\u2019s answers');
      }
      const { profileStore, progressStore } = await stores(exec, args);
      const diagnosis = await progressStore.saveDiagnosis({
        topic: requireString(args, 'topic'),
        materials: args.materials ?? [],
        questions: args.questions,
        estimates: args.estimates,
        suggestedStartNodeId: args.suggestedStartNodeId ?? null,
      });
      const profile = await profileStore.get();
      return { diagnosis, profile };
    },
  });

  const createRoadmap = defineTool({
    name: 'ai_learn_create_roadmap',
    description:
      'Break a topic into a DAG of concept nodes and create the learning roadmap. Nodes with a diagnosis estimate at or above the mastery threshold start as mastered; the first unmastered node becomes active. Returns the persisted Roadmap.',
    parameters: {
      properties: {
        ...learnerParam,
        topic: { type: 'string' },
        materials: { type: 'array', items: { type: 'string' } },
        nodes: { type: 'array', items: nodeSpecSchema, description: 'concept nodes in intended teaching order' },
        estimates: { type: 'array', items: estimateSchema, description: 'estimates from the preceding diagnosis' },
      },
      required: ['topic', 'nodes'],
    },
    async execute(args, exec) {
      const { progressStore, reviewQueue } = await stores(exec, args);
      const roadmap = await progressStore.createRoadmap({
        topic: requireString(args, 'topic'),
        materials: args.materials ?? [],
        nodes: args.nodes,
        estimates: args.estimates ?? [],
      });
      for (const node of roadmap.nodes) {
        if (node.status === 'mastered') await reviewQueue.ensure(node.id, roadmap.id);
      }
      return roadmap;
    },
    meta: roadmapMeta,
  });

  const updateRoadmap = defineTool({
    name: 'ai_learn_update_roadmap',
    description:
      'Dynamically adjust a roadmap: insertNode adds a concept node (e.g. a newly exposed gap) without creating dependency cycles; skipNode marks a node mastered and advances to the next.',
    parameters: {
      properties: {
        ...learnerParam,
        roadmapId: { type: 'string' },
        op: { type: 'string', enum: ['insertNode', 'skipNode'] },
        payload: {
          type: 'object',
          additionalProperties: false,
          properties: {
            node: nodeSpecSchema,
            afterNodeId: { type: 'string', description: 'insert position; defaults to right after the current node' },
            nodeId: { type: 'string', description: 'for skipNode' },
          },
        },
      },
      required: ['roadmapId', 'op', 'payload'],
    },
    async execute(args, exec) {
      const { progressStore } = await stores(exec, args);
      return progressStore.updateRoadmap(requireString(args, 'roadmapId'), args.op, args.payload ?? {});
    },
    meta: roadmapMeta,
  });

  const assessMastery = defineTool({
    name: 'ai_learn_assess_mastery',
    description:
      'Score a node on four dimensions (accuracy, depth, transfer, discrimination, each 0-100) from the dialogue. total >= 80 unlocks the next node; 60-79 keeps questioning; < 60 triggers re-teaching from another angle. The rationale MUST quote the learner\u2019s own words.',
    parameters: {
      properties: {
        ...learnerParam,
        roadmapId: { type: 'string' },
        nodeId: { type: 'string' },
        scores: {
          type: 'object',
          additionalProperties: false,
          properties: {
            accuracy: { type: 'number' },
            depth: { type: 'number' },
            transfer: { type: 'number' },
            discrimination: { type: 'number' },
          },
          required: ['accuracy', 'depth', 'transfer', 'discrimination'],
        },
        rationale: { type: 'string', description: 'per-dimension justification quoting the learner verbatim' },
      },
      required: ['roadmapId', 'nodeId', 'scores', 'rationale'],
    },
    async execute(args, exec) {
      const { profileStore, progressStore, reviewQueue } = await stores(exec, args);
      const result = await progressStore.applyMastery(
        requireString(args, 'roadmapId'),
        requireString(args, 'nodeId'),
        args.scores,
        requireString(args, 'rationale'),
      );
      if (result.action === 'unlock') {
        await reviewQueue.ensure(result.node.id, result.roadmap.id);
      }
      if (result.courseCompleted) {
        await profileStore.update({
          courseHistory: [{
            topic: result.roadmap.topic,
            masteredNodes: result.roadmap.nodes.map((n) => n.id),
            finishedAt: Date.now(),
          }],
        });
      }
      return {
        mastery: result.mastery,
        threshold: masteryThreshold,
        action: result.action,
        nodeStatus: result.node.status,
        nextNodeId: result.nextNodeId,
        courseCompleted: result.courseCompleted,
      };
    },
  });

  const checkpoint = defineTool({
    name: 'ai_learn_checkpoint',
    description:
      'Store the checkpoint questions (1-2: one understanding, one transfer) you wrote for a finished node. Ask them next — batched in one ask_user_question call when answers are enumerable — then collect answers with ai_learn_submit_answer.',
    parameters: {
      properties: {
        ...learnerParam,
        roadmapId: { type: 'string' },
        nodeId: { type: 'string' },
        questions: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              id: { type: 'string' },
              kind: { type: 'string', enum: ['understanding', 'transfer'] },
              text: { type: 'string' },
            },
            required: ['text'],
          },
        },
      },
      required: ['roadmapId', 'nodeId', 'questions'],
    },
    async execute(args, exec) {
      const { progressStore } = await stores(exec, args);
      const { questions } = await progressStore.saveCheckpoint(
        requireString(args, 'roadmapId'),
        requireString(args, 'nodeId'),
        args.questions,
      );
      return { questions };
    },
  });

  const submitAnswer = defineTool({
    name: 'ai_learn_submit_answer',
    description:
      'Judge one checkpoint answer and record the outcome. On failure, classify the error cause; two consecutive failures on a node set remediate=true (re-teach from another angle before retrying). Failed causes are counted into the learner profile.',
    parameters: {
      properties: {
        ...learnerParam,
        roadmapId: { type: 'string' },
        nodeId: { type: 'string' },
        questionId: { type: 'string' },
        answer: { type: 'string', description: 'the learner\u2019s verbatim answer' },
        passed: { type: 'boolean' },
        cause: { type: 'string', enum: ERROR_CAUSE_ENUM, description: 'required when passed=false' },
        feedback: { type: 'string', description: 'Socratic feedback direction, not the correct answer' },
      },
      required: ['roadmapId', 'nodeId', 'questionId', 'answer', 'passed'],
    },
    async execute(args, exec) {
      if (args.passed === false && !args.cause) {
        throw new Error(`cause is required when passed=false; one of ${ERROR_CAUSE_ENUM.join(', ')}`);
      }
      const { profileStore, progressStore } = await stores(exec, args);
      const result = await progressStore.recordAnswer(
        requireString(args, 'roadmapId'),
        requireString(args, 'nodeId'),
        {
          questionId: requireString(args, 'questionId'),
          answer: requireString(args, 'answer'),
          passed: args.passed,
          cause: args.cause,
          feedback: args.feedback,
        },
      );
      if (!result.passed && args.cause) await profileStore.recordErrorCause(args.cause);
      return result;
    },
    meta: (args, result) => ({
      passed: result.passed,
      cause: args.cause,
      feedback: args.feedback,
      consecutiveFails: result.consecutiveFails,
      remediate: result.remediate,
    }),
  });

  const genNotes = defineTool({
    name: 'ai_learn_gen_notes',
    description:
      'Write the structured note for a finished node to disk. learnerQuotes must contain at least one verbatim statement from the learner; prefer the learner\u2019s own phrasing for definitions. Returns the note path.',
    parameters: {
      properties: {
        ...learnerParam,
        roadmapId: { type: 'string' },
        nodeId: { type: 'string' },
        title: { type: 'string' },
        content: { type: 'string', description: 'markdown body: key reasoning, pitfalls, relation to neighbor concepts' },
        learnerQuotes: { type: 'array', items: { type: 'string' }, minItems: 1 },
      },
      required: ['roadmapId', 'nodeId', 'content', 'learnerQuotes'],
    },
    async execute(args, exec) {
      const { progressStore } = await stores(exec, args);
      const { path } = await progressStore.writeNote(
        requireString(args, 'roadmapId'),
        requireString(args, 'nodeId'),
        { title: args.title, content: args.content, learnerQuotes: args.learnerQuotes },
      );
      return { notePath: path };
    },
  });

  const reviewDue = defineTool({
    name: 'ai_learn_review_due',
    description:
      'List review items whose SM-2 schedule is due. Check this at the start of a learning session; offer retrieval practice for due items before teaching new content.',
    parameters: {
      properties: {
        ...learnerParam,
        now: { type: 'number', description: 'timestamp ms; defaults to the current time' },
      },
    },
    async execute(args, exec) {
      const { progressStore, reviewQueue } = await stores(exec, args);
      const now = args.now ?? Date.now();
      const items = await reviewQueue.due(now);
      const enriched = [];
      for (const item of items) {
        let title = item.nodeId;
        let topic;
        try {
          const roadmap = await progressStore.findRoadmapByNode(item.nodeId, item.roadmapId);
          title = roadmap.nodes.find((n) => n.id === item.nodeId)?.title ?? title;
          topic = roadmap.topic;
        } catch { /* roadmap deleted; keep bare item */ }
        enriched.push({ ...item, title, topic });
      }
      return { now, count: enriched.length, items: enriched };
    },
    meta: (_args, result) => ({
      count: result.count,
      items: (result.items ?? []).map((i) => ({
        nodeId: i.nodeId, roadmapId: i.roadmapId, title: i.title, topic: i.topic,
      })),
    }),
  });

  const reviewUpdate = defineTool({
    name: 'ai_learn_review_update',
    description:
      'Update one review item\u2019s SM-2 schedule after retrieval practice. quality: 1-2 wrong, 3 correct but labored, 4-5 fluent. quality < 3 also marks the node needs-relearn in its roadmap.',
    parameters: {
      properties: {
        ...learnerParam,
        nodeId: { type: 'string' },
        roadmapId: { type: 'string', description: 'disambiguates nodes shared across roadmaps' },
        quality: { type: 'integer', minimum: 0, maximum: 5 },
        now: { type: 'number' },
      },
      required: ['nodeId', 'quality'],
    },
    async execute(args, exec) {
      const { progressStore, reviewQueue } = await stores(exec, args);
      const now = args.now ?? Date.now();
      const item = await reviewQueue.update(requireString(args, 'nodeId'), args.quality, {
        roadmapId: args.roadmapId,
        now,
      });
      let relearn = false;
      if (args.quality < 3) {
        const roadmap = await progressStore.findRoadmapByNode(item.nodeId, item.roadmapId);
        const node = roadmap.nodes.find((n) => n.id === item.nodeId);
        if (node && node.status === 'mastered') {
          node.status = 'needs-relearn';
          roadmap.currentNodeId = node.id;
          if (roadmap.state === 'COMPLETED') roadmap.state = 'TEACHING';
          await progressStore.saveRoadmap(roadmap);
          relearn = true;
        }
      }
      return { item, relearn };
    },
  });

  const profileGet = defineTool({
    name: 'ai_learn_profile_get',
    description:
      'Read the persistent learner profile: background, strengths, error patterns, preferences, course history. Consult it before diagnosing a new topic.',
    parameters: { properties: { ...learnerParam } },
    async execute(args, exec) {
      const { profileStore, learnerId, dir } = await stores(exec, args);
      const profile = await profileStore.get();
      return { ...profile, learnerId, dir };
    },
  });

  const profileUpdate = defineTool({
    name: 'ai_learn_profile_update',
    description:
      'Update the learner profile. strengths are union-merged (pass strengthsMode="replace" to overwrite), errorPatterns counts are added, preferences shallow-merged, courseHistory appended. The learner may view, edit, or delete any of this data.',
    parameters: {
      properties: {
        ...learnerParam,
        background: { type: 'string' },
        strengths: { type: 'array', items: { type: 'string' } },
        strengthsMode: { type: 'string', enum: ['union', 'replace'] },
        errorPatterns: {
          type: 'object',
          additionalProperties: false,
          properties: Object.fromEntries(ERROR_CAUSE_ENUM.map((c) => [c, { type: 'number' }])),
        },
        preferences: {
          type: 'object',
          additionalProperties: false,
          properties: {
            style: { type: 'string', enum: ['example-first', 'principle-first'] },
            pace: { type: 'string', enum: ['fast', 'normal', 'slow'] },
          },
        },
        courseHistory: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              topic: { type: 'string' },
              masteredNodes: { type: 'array', items: { type: 'string' } },
              finishedAt: { type: 'number' },
            },
            required: ['topic', 'masteredNodes', 'finishedAt'],
          },
        },
      },
    },
    async execute(args, exec) {
      const { profileStore, learnerId } = await stores(exec, args);
      const { learnerId: _omit, ...patch } = args ?? {};
      const profile = await profileStore.update(patch);
      return { ...profile, learnerId };
    },
  });

  const learners = defineTool({
    name: 'ai_learn_learners',
    description:
      'List every learner folder in this workspace (learn-*) with progress stats: topics, mastered/total nodes, pending reviews. Use it to pick or confirm a learnerId before teaching.',
    parameters: { properties: {} },
    async execute(_args, exec) {
      return registry.listLearners(exec);
    },
  });

  const exportTool = defineTool({
    name: 'ai_learn_export',
    description:
      'Export one learner\u2019s complete data (profile, roadmaps, diagnoses, review queue, notes) as a single portable JSON bundle file. Default target: <workspace>/dsh-learn/exports/learn-<id>-<timestamp>.dsh-learn.json. Share or back up this file; restore it with ai_learn_import.',
    parameters: {
      properties: {
        ...learnerParam,
        path: { type: 'string', description: 'absolute output path for the bundle; defaults to the exports folder' },
      },
    },
    async execute(args, exec) {
      return registry.exportLearner(exec, args?.learnerId, args?.path);
    },
  });

  const importTool = defineTool({
    name: 'ai_learn_import',
    description:
      'Import a bundle produced by ai_learn_export into this workspace. Restores the bundle\u2019s learner id unless learnerId renames it. Fails when the target learner already has data unless overwrite=true (same-path files are replaced, other files kept).',
    parameters: {
      properties: {
        path: { type: 'string', description: 'path of the .dsh-learn.json bundle to import' },
        learnerId: { type: 'string', description: 'rename the learner on import; defaults to the bundle\u2019s id' },
        overwrite: { type: 'boolean', description: 'allow merging over an existing learner folder' },
      },
      required: ['path'],
    },
    async execute(args, exec) {
      return registry.importLearner(exec, {
        path: requireString(args, 'path'),
        learnerId: args.learnerId,
        overwrite: args.overwrite === true,
      });
    },
  });

  return [
    diagnose,
    createRoadmap,
    updateRoadmap,
    assessMastery,
    checkpoint,
    submitAnswer,
    genNotes,
    reviewDue,
    reviewUpdate,
    profileGet,
    profileUpdate,
    learners,
    exportTool,
    importTool,
  ];
}
