/**
 * dsh-learn-expert Web client (v2): left-rail panel entry + learning analysis panel
 * (line chart, DAG, heatmap, quality metrics), conversation tool-view cards,
 * and the learner-profile card on the bundle detail page.
 * Plain JavaScript, no JSX (React comes from the browser module table).
 * Data comes from the Host half's /dsh-learn-expert/api/* routes.
 */
window.__ModuleLoader__.load({
  id: 'dsh-learn-expert',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useEffect, useMemo, useState } = React;

    const PALETTE = ['#4C7DF0', '#F5A623', '#3FB27F', '#D96C8E', '#8E6BD8', '#4FB3C6', '#C98A4B', '#7BA05B'];
    const TOKEN = {
      text: 'var(--dsw-alias-label-primary)',
      text2: 'var(--dsw-alias-label-secondary)',
      surface: 'var(--dsw-alias-bg-layer-1)',
      surface2: 'var(--dsw-alias-bg-layer-2)',
      border: 'var(--dsw-alias-border-l1)',
      brand: 'var(--dsw-alias-brand-primary)',
      success: 'var(--dsw-alias-state-success-primary)',
      warn: 'var(--dsw-alias-state-warn-primary)',
      error: 'var(--dsw-alias-state-error-primary)',
      idle: 'var(--dsw-alias-state-idle-primary)',
    };

    // ---- i18n (F6): dictionaries live here; the active language follows the
    // Client locale service when present, else the browser, else Chinese.
    const DICT = {
      zh: {
        title: '学习分析', refresh: '刷新', export: '导出数据',
        subtitle: 'learn-expert 私教：掌握进度折线图 ｜ 路线图 DAG ｜ 学习热力图 ｜ 复习队列',
        loading: '加载中…', loadFailed: '加载失败',
        emptyTitle: '还没有学习计划', emptyBody: '回到对话，对私教说「我想学 ……」开始第一节课。',
        statPlans: '学习计划', statPlansHint: '按主题拆分',
        statMastered: '已掌握节点', statMasteredHint: '掌握度 ≥80 计入',
        statAvg: '平均掌握度', statAvgHint: '四维加权均分',
        statReview: '待复习', statReviewHint: '复习队列共 {n} 项',
        qualityTitle: '教学质量',
        qualityDensity: '每节点平均作答轮数', qualityDensityHint: '目标 ≥2，低于此值说明在灌输',
        qualityPass: '复习通过率', qualityPassHint: '目标 ≥70%（SM-2 历史 {n} 次）',
        lineTitle: '掌握进度折线图',
        lineSubtitle: '每个学习计划一条线：已掌握节点数随时间的累计变化（阶梯线）。',
        dagTitle: '路线图结构图', dagSubtitle: '概念节点按依赖分层；颜色 = 状态，悬停看四维分。',
        heatTitle: '学习热力图', heatSubtitle: '最近 {n} 周：摸底、评分、检查点作答与复习的次数。',
        detailTitle: '学习计划明细',
        allPlans: '全部计划', allLearners: '全部学习者',
        masteredOf: '{m}/{n} 节点', avgScore: '均分 {n}', relearn: '{n} 待重学',
        heatCell: '{date}：{n} 次学习活动',
        state_ROADMAP_READY: '待开始', state_TEACHING: '学习中', state_QUESTIONING: '追问中',
        state_CHECKPOINT: '检查点', state_REMEDIATING: '重讲中', state_COMPLETED: '已完成',
        state_REVIEWING: '复习中', state_DIAGNOSING: '摸底中', state_IDLE: '未开始',
        status_locked: '未解锁', status_active: '进行中', status_mastered: '已掌握', 'status_needs-relearn': '待重学',
        // profile card
        profileTitle: '学习者画像', profileLearner: '学习者', profileBackground: '知识背景',
        profileStrengths: '强项（逗号分隔）', profileStyle: '讲解偏好', profilePace: '节奏偏好',
        styleExample: '示例驱动', stylePrinciple: '原理驱动', styleUnset: '未设置',
        paceFast: '快', paceNormal: '正常', paceSlow: '慢',
        profileErrors: '错因计数', profileCourses: '已学课程 {n} 门',
        profileSave: '保存', profileSaved: '已保存', profileSaveFailed: '保存失败',
        // tool cards
        cardMastery: '掌握度评分', cardUnlock: '已解锁下一节点', cardQuestion: '继续追问', cardRemediate: '换角度重讲',
        cardCourseDone: '课程完成 🎉', cardThreshold: '解锁线 {n}',
        dimAccuracy: '准确性', cardRoadmap: '学习路线图', cardNodes: '{n} 个节点',
        cardAnswerPass: '回答通过 ✓', cardAnswerFail: '未通过', cardRemediateWarn: '连续失败，需要重讲',
        cardReviewDue: '{n} 个到期复习项', cardNoReview: '暂无到期复习',
        cardPending: '进行中…',
        // 课堂 (course list + detail)
        panelTitle: '学习私教',
        tabCourses: '课堂', tabAnalysis: '分析',
        courseAll: '全部', courseFav: '收藏', courseLearning: '在学', courseReview: '待复习',
        courseDone: '已学完', courseShelf: '书房',
        courseSearch: '搜索课程或知识点',
        askTutor: '随手问', askTutorNoSession: '该课程还没有关联的对话',
        menuRename: '重命名', menuMove: '移动到分组', menuLock: '锁定', menuUnlock: '解锁',
        menuDelete: '删除', menuCancel: '取消',
        renamePrompt: '新的课程名称', groupPrompt: '分组名称（留空则移出书房）',
        deleteConfirm: '删除课程「{t}」？将同时删除路线图、笔记和复习队列，不可恢复。',
        journey: '学习旅程', reviewTab: '复习巩固',
        masteredLine: '{m} / {n} 个知识点已掌握',
        nodeNote: '笔记', nodeMap: '导图', nodeScratch: '手记',
        noteEmpty: '这一节还没有笔记', scratchPlaceholder: '用你自己的话记下这一节的理解和疑问…',
        scratchSave: '保存手记', scratchSaved: '已保存', scratchFailed: '保存失败',
        activeNode: '正在学：{t}',
        reviewEmpty: '这门课暂无到期复习项', reviewAllEmpty: '全部复习项都还未到期',
        goReview: '去复习', reviewNext: '下次复习 {d}',
        backToList: '返回课堂',
        courseEmptyTitle: '还没有课程', courseEmptyBody: '回到对话，对私教说「我想学 ……」开课。',
        courseLockedTip: '已锁定', favAdd: '收藏', favRemove: '取消收藏',
        mapTitle: '知识导图',
      },
      en: {
        title: 'Learning analysis', refresh: 'Refresh', export: 'Export data',
        subtitle: 'learn-expert tutor: mastery timeline | roadmap DAG | activity heatmap | review queue',
        loading: 'Loading…', loadFailed: 'Load failed',
        emptyTitle: 'No learning plans yet', emptyBody: 'Go back to the conversation and tell the tutor "I want to learn …".',
        statPlans: 'Plans', statPlansHint: 'one per topic',
        statMastered: 'Nodes mastered', statMasteredHint: 'mastery ≥80 counts',
        statAvg: 'Avg mastery', statAvgHint: 'weighted four-dimension mean',
        statReview: 'Reviews due', statReviewHint: '{n} queued in total',
        qualityTitle: 'Teaching quality',
        qualityDensity: 'Avg attempts per node', qualityDensityHint: 'target ≥2; lower means lecturing',
        qualityPass: 'Review pass rate', qualityPassHint: 'target ≥70% ({n} SM-2 reviews)',
        lineTitle: 'Mastery timeline',
        lineSubtitle: 'One step line per plan: cumulative mastered nodes over time.',
        dagTitle: 'Roadmap structure', dagSubtitle: 'Concept nodes layered by dependency; color = status, hover for scores.',
        heatTitle: 'Activity heatmap', heatSubtitle: 'Last {n} weeks: diagnoses, assessments, checkpoint answers and reviews.',
        detailTitle: 'Plans',
        allPlans: 'All plans', allLearners: 'All learners',
        masteredOf: '{m}/{n} nodes', avgScore: 'avg {n}', relearn: '{n} to relearn',
        heatCell: '{date}: {n} learning activities',
        state_ROADMAP_READY: 'ready', state_TEACHING: 'teaching', state_QUESTIONING: 'questioning',
        state_CHECKPOINT: 'checkpoint', state_REMEDIATING: 'remediating', state_COMPLETED: 'completed',
        state_REVIEWING: 'reviewing', state_DIAGNOSING: 'diagnosing', state_IDLE: 'idle',
        status_locked: 'locked', status_active: 'active', status_mastered: 'mastered', 'status_needs-relearn': 'needs relearn',
        profileTitle: 'Learner profile', profileLearner: 'Learner', profileBackground: 'Background',
        profileStrengths: 'Strengths (comma separated)', profileStyle: 'Teaching style', profilePace: 'Pace',
        styleExample: 'example-first', stylePrinciple: 'principle-first', styleUnset: 'unset',
        paceFast: 'fast', paceNormal: 'normal', paceSlow: 'slow',
        profileErrors: 'Error causes', profileCourses: '{n} course(s) finished',
        profileSave: 'Save', profileSaved: 'Saved', profileSaveFailed: 'Save failed',
        cardMastery: 'Mastery score', cardUnlock: 'next node unlocked', cardQuestion: 'keep questioning', cardRemediate: 're-teach another way',
        cardCourseDone: 'Course completed 🎉', cardThreshold: 'threshold {n}',
        dimAccuracy: 'accuracy', cardRoadmap: 'Roadmap', cardNodes: '{n} nodes',
        cardAnswerPass: 'Answer passed ✓', cardAnswerFail: 'failed', cardRemediateWarn: 'repeated failures; re-teach',
        cardReviewDue: '{n} reviews due', cardNoReview: 'no reviews due',
        cardPending: 'in progress…',
        // Classroom (course list + detail)
        panelTitle: 'AI Tutor',
        tabCourses: 'Courses', tabAnalysis: 'Analysis',
        courseAll: 'All', courseFav: 'Favorites', courseLearning: 'Learning', courseReview: 'To review',
        courseDone: 'Done', courseShelf: 'Shelf',
        courseSearch: 'Search courses or concepts',
        askTutor: 'Ask now', askTutorNoSession: 'This course has no linked conversation yet',
        menuRename: 'Rename', menuMove: 'Move to group', menuLock: 'Lock', menuUnlock: 'Unlock',
        menuDelete: 'Delete', menuCancel: 'Cancel',
        renamePrompt: 'New course name', groupPrompt: 'Group name (empty removes from shelf)',
        deleteConfirm: 'Delete course "{t}"? Its roadmap, notes and review queue will be removed permanently.',
        journey: 'Journey', reviewTab: 'Review',
        masteredLine: '{m} / {n} concepts mastered',
        nodeNote: 'Notes', nodeMap: 'Map', nodeScratch: 'My notes',
        noteEmpty: 'No notes for this section yet', scratchPlaceholder: 'Write down your own understanding and questions…',
        scratchSave: 'Save', scratchSaved: 'Saved', scratchFailed: 'Save failed',
        activeNode: 'Learning: {t}',
        reviewEmpty: 'No reviews due for this course', reviewAllEmpty: 'Nothing is due yet',
        goReview: 'Review now', reviewNext: 'next review {d}',
        backToList: 'Back to courses',
        courseEmptyTitle: 'No courses yet', courseEmptyBody: 'Go back to the chat and tell the tutor "I want to learn …".',
        courseLockedTip: 'Locked', favAdd: 'Favorite', favRemove: 'Unfavorite',
        mapTitle: 'Concept map',
      },
    };
    // depth/transfer/discrimination share keys with tool meta fields
    DICT.zh.dimDepth = '理解深度'; DICT.zh.dimTransfer = '举一反三'; DICT.zh.dimDiscrimination = '辨别能力';
    DICT.en.dimDepth = 'depth'; DICT.en.dimTransfer = 'transfer'; DICT.en.dimDiscrimination = 'discrimination';

    function createI18n(localeSvc) {
      const listeners = new Set();
      const lang = () => {
        try {
          const active = localeSvc?.getSnapshot?.().active;
          if (typeof active === 'string') return active.toLowerCase().startsWith('zh') ? 'zh' : 'en';
        } catch { /* fall through */ }
        return (typeof navigator !== 'undefined' && navigator.language || 'zh').toLowerCase().startsWith('zh') ? 'zh' : 'en';
      };
      if (localeSvc?.subscribe) {
        try { localeSvc.subscribe(() => listeners.forEach((fn) => fn())); } catch { /* optional */ }
      }
      const t = (key, vars) => {
        let text = DICT[lang()]?.[key] ?? DICT.zh[key] ?? key;
        if (vars) for (const [k, v] of Object.entries(vars)) text = text.replaceAll(`{${k}}`, String(v));
        return text;
      };
      return { t, lang, subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); } };
    }

    function useT(i18n) {
      const [, setTick] = useState(0);
      useEffect(() => i18n.subscribe(() => setTick((n) => n + 1)), [i18n]);
      return i18n.t;
    }

    // ---- data -------------------------------------------------------------
    function api(path, options) {
      const query = window.location.search || '';
      const joiner = path.includes('?') ? (query ? '&' : '') : (query ? '?' : '');
      return fetch(`/dsh-learn-expert/api/${path}${joiner}${query.replace(/^\?/, '')}`, {
        credentials: 'same-origin',
        ...options,
      }).then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      });
    }

    function fmtDate(t) {
      const d = new Date(t);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    function fmtMonthDay(t) {
      const d = new Date(t);
      return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    // ---- shared bits --------------------------------------------------------
    function PanelIcon(props = {}) {
      const size = props.size || 20;
      return h('svg', {
        viewBox: '0 0 36 36', width: size, height: size, 'aria-hidden': true,
        style: { display: 'block' },
      },
        h('path', {
          d: 'M6 11.5c2.6-1.5 5.4-2 8.5-1.4 1.6.3 2.7.9 3.5 1.7.8-.8 1.9-1.4 3.5-1.7 3.1-.6 5.9-.1 8.5 1.4v15.6c-2.6-1.4-5.4-1.8-8.5-1.3-1.6.3-2.7.9-3.5 1.7-.8-.8-1.9-1.4-3.5-1.7-3.1-.5-5.9-.1-8.5 1.3z',
          fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinejoin: 'round',
        }),
        h('path', { d: 'M18 12.5v14.5', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' }),
        h('circle', { cx: 26.6, cy: 10.4, r: 3.4, fill: 'currentColor' }),
        h('path', {
          d: 'M25.4 9.6c.15-.8.85-1.4 1.7-1.4.95 0 1.6.6 1.6 1.45 0 1.1-1 1.35-1.5 1.95',
          stroke: 'var(--dsw-specific-sidebar-fill, #fff)', strokeWidth: 1.1, strokeLinecap: 'round', fill: 'none',
        }),
      );
    }

    function Card({ children, style }) {
      return h('div', {
        style: {
          background: TOKEN.surface, border: `1px solid ${TOKEN.border}`,
          borderRadius: 10, padding: '12px 14px', ...style,
        },
      }, children);
    }

    function StatCard({ label, value, hint, color }) {
      return h(Card, { style: { flex: '1 1 140px', minWidth: 140 } },
        h('div', { style: { fontSize: 12, color: TOKEN.text2, marginBottom: 6 } }, label),
        h('div', { style: { fontSize: 24, fontWeight: 600, color: color || TOKEN.text, lineHeight: 1.2 } }, value),
        hint ? h('div', { style: { fontSize: 12, color: TOKEN.text2, marginTop: 4 } }, hint) : null,
      );
    }

    function SectionTitle({ children, sub }) {
      return h(React.Fragment, null,
        h('h2', { style: { fontSize: 14, fontWeight: 600, margin: '26px 0 4px' } }, children),
        sub ? h('div', { style: { fontSize: 12, color: TOKEN.text2, marginBottom: 4 } }, sub) : null,
      );
    }

    function Chip({ active, onClick, color, children }) {
      return h('button', {
        onClick,
        style: {
          display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer',
          padding: '4px 10px', borderRadius: 999, fontSize: 12,
          border: `1px solid ${active ? TOKEN.brand : TOKEN.border}`,
          background: active ? 'color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent)' : 'transparent',
          color: TOKEN.text,
        },
      },
        color ? h('span', { style: { width: 8, height: 8, borderRadius: 4, background: color } }) : null,
        children,
      );
    }

    // ---- line chart ---------------------------------------------------------
    function LineChart({ plans, selected }) {
      const W = 760; const H = 260;
      const M = { top: 16, right: 16, bottom: 30, left: 36 };
      const iw = W - M.left - M.right;
      const ih = H - M.top - M.bottom;

      const { minT, maxT, maxY } = useMemo(() => {
        let lo = Infinity; let hi = -Infinity; let y = 1;
        for (const plan of plans) {
          for (const p of plan.series) {
            lo = Math.min(lo, p.t); hi = Math.max(hi, p.t); y = Math.max(y, p.mastered);
          }
        }
        if (!Number.isFinite(lo)) { lo = Date.now() - 86400000; hi = Date.now(); }
        if (hi - lo < 86400000) hi = lo + 86400000;
        return { minT: lo, maxT: hi, maxY: y };
      }, [plans]);

      if (plans.length === 0) return null;
      const x = (t) => M.left + ((t - minT) / (maxT - minT)) * iw;
      const y = (v) => M.top + ih - (v / maxY) * ih;

      const gridYs = [];
      for (let i = 0; i <= maxY; i += 1) gridYs.push(i);
      const ticks = 5;
      const gridXs = [];
      for (let i = 0; i <= ticks; i += 1) gridXs.push(minT + ((maxT - minT) * i) / ticks);

      return h('svg', { viewBox: `0 0 ${W} ${H}`, style: { width: '100%', height: 'auto', display: 'block' } },
        gridYs.map((v) => h('line', {
          key: `gy${v}`, x1: M.left, x2: W - M.right, y1: y(v), y2: y(v),
          stroke: TOKEN.border, strokeWidth: v === 0 ? 1.4 : 0.7,
        })),
        gridYs.map((v) => h('text', {
          key: `gyl${v}`, x: M.left - 8, y: y(v) + 4, textAnchor: 'end', fontSize: 11, fill: TOKEN.text2,
        }, String(v))),
        gridXs.map((t, i) => h('text', {
          key: `gx${i}`, x: x(t), y: H - 8, textAnchor: 'middle', fontSize: 11, fill: TOKEN.text2,
        }, fmtMonthDay(t))),
        plans.map((plan, pi) => {
          const color = PALETTE[pi % PALETTE.length];
          const dim = selected && selected !== plan.id;
          const pts = [];
          plan.series.forEach((p, i) => {
            if (i > 0) pts.push(`${x(p.t)},${y(plan.series[i - 1].mastered)}`);
            pts.push(`${x(p.t)},${y(p.mastered)}`);
          });
          if (plan.series.length) pts.push(`${x(maxT)},${y(plan.series[plan.series.length - 1].mastered)}`);
          return h('g', { key: plan.id, opacity: dim ? 0.15 : 1, style: { transition: 'opacity .15s' } },
            h('polyline', {
              points: pts.join(' '), fill: 'none', stroke: color, strokeWidth: 2, strokeLinejoin: 'round',
            }),
            plan.series.slice(1).map((p, i) => h('circle', {
              key: i, cx: x(p.t), cy: y(p.mastered), r: 3.2, fill: color,
            }, h('title', null, `${plan.topic}: ${p.mastered} (${fmtDate(p.t)})`))),
          );
        }),
      );
    }

    // ---- roadmap DAG (F4) ----------------------------------------------------
    const STATUS_COLOR = {
      locked: TOKEN.idle,
      active: TOKEN.brand,
      mastered: TOKEN.success,
      'needs-relearn': TOKEN.warn,
    };

    function DagChart({ plan, t }) {
      const [focus, setFocus] = useState(null);
      const dag = plan.dag;
      if (!dag || !dag.width) return null;
      const NW = 156; const NH = 46; const GX = 56; const GY = 18;
      const px = (ux) => ux * (NW + GX);
      const py = (uy) => uy * (NH + GY);
      const W = dag.width * (NW + GX) - GX + 8;
      const H = dag.height * (NH + GY) - GY + 8;

      const chain = useMemo(() => {
        if (!focus) return null;
        const set = new Set([focus]);
        let grew = true;
        while (grew) {
          grew = false;
          for (const e of dag.edges) {
            if (set.has(e.to) && !set.has(e.from)) { set.add(e.from); grew = true; }
            if (set.has(e.from) && !set.has(e.to)) { set.add(e.to); grew = true; }
          }
        }
        return set;
      }, [focus, dag]);

      const nodeById = Object.fromEntries(plan.nodes.map((n) => [n.id, n]));

      return h('div', { style: { overflowX: 'auto' } },
        h('svg', { viewBox: `0 0 ${W} ${H}`, style: { minWidth: Math.min(W, 720), width: '100%', height: 'auto', display: 'block' } },
          dag.edges.map((e, i) => {
            const a = dag.positions[e.from]; const b = dag.positions[e.to];
            if (!a || !b) return null;
            const x1 = px(a.x) + NW; const y1 = py(a.y) + NH / 2;
            const x2 = px(b.x); const y2 = py(b.y) + NH / 2;
            const mx = (x1 + x2) / 2;
            const dim = chain && !(chain.has(e.from) && chain.has(e.to));
            return h('path', {
              key: i, d: `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`,
              fill: 'none', stroke: TOKEN.border, strokeWidth: 1.4, opacity: dim ? 0.15 : 1,
            });
          }),
          Object.entries(dag.positions).map(([id, pos]) => {
            const node = nodeById[id] ?? { id, title: id, status: 'locked' };
            const color = STATUS_COLOR[node.status] ?? TOKEN.idle;
            const dim = chain && !chain.has(id);
            const label = node.title.length > 12 ? `${node.title.slice(0, 11)}…` : node.title;
            const m = node.mastery;
            const tip = `${node.title}\n${t(`status_${node.status}`) ?? node.status}` +
              (m ? `\n${t('dimAccuracy')} ${m.accuracy ?? '—'} / ${t('dimDepth')} ${m.depth ?? '—'} / ${t('dimTransfer')} ${m.transfer ?? '—'} / ${t('dimDiscrimination')} ${m.discrimination ?? '—'} = ${m.total ?? '—'}` : '');
            return h('g', {
              key: id,
              opacity: dim ? 0.2 : 1,
              onMouseEnter: () => setFocus(id),
              onMouseLeave: () => setFocus(null),
              style: { cursor: 'default', transition: 'opacity .15s' },
            },
              h('title', null, tip),
              h('rect', {
                x: px(pos.x) + 4, y: py(pos.y), width: NW, height: NH, rx: 9,
                fill: TOKEN.surface2, stroke: color, strokeWidth: node.status === 'active' ? 2.2 : 1.4,
              }),
              h('circle', { cx: px(pos.x) + 16, cy: py(pos.y) + NH / 2, r: 4, fill: color }),
              h('text', {
                x: px(pos.x) + 26, y: py(pos.y) + (m ? NH / 2 - 2 : NH / 2 + 4),
                fontSize: 12, fill: TOKEN.text,
              }, label),
              m ? h('text', {
                x: px(pos.x) + 26, y: py(pos.y) + NH / 2 + 13,
                fontSize: 10, fill: TOKEN.text2,
              }, `${t('avgScore', { n: m.total ?? '—' })}`) : null,
            );
          }),
        ),
      );
    }

    // ---- activity heatmap ------------------------------------------------------
    function Heatmap({ days, t }) {
      const leadBlanks = days.length ? (new Date(days[0].day).getDay() + 6) % 7 : 0;
      const cells = [...Array(leadBlanks).fill(null), ...days];
      const weeks = Math.ceil(cells.length / 7);
      const maxCount = days.reduce((m, d) => Math.max(m, d.count), 0);
      const level = (count) => {
        if (count === 0) return 0;
        if (maxCount <= 2) return count === 1 ? 2 : 3;
        const ratio = count / maxCount;
        return ratio <= 0.25 ? 1 : ratio <= 0.5 ? 2 : ratio <= 0.75 ? 3 : 4;
      };
      const levelColor = [
        TOKEN.surface2,
        'color-mix(in srgb, var(--dsw-alias-brand-primary) 30%, transparent)',
        'color-mix(in srgb, var(--dsw-alias-brand-primary) 55%, transparent)',
        'color-mix(in srgb, var(--dsw-alias-brand-primary) 80%, transparent)',
        'var(--dsw-alias-brand-primary)',
      ];
      return h('div', { style: { display: 'flex', gap: 6 } },
        h('div', {
          style: {
            display: 'grid', gridTemplateRows: 'repeat(7, 12px)', rowGap: 3,
            fontSize: 10, color: TOKEN.text2, marginRight: 2, paddingTop: 1,
          },
        }, ['一', '', '三', '', '五', '', '日'].map((d, i) => h('span', { key: i, style: { lineHeight: '12px' } }, d))),
        h('div', {
          style: {
            display: 'grid', gridAutoFlow: 'column', gridTemplateRows: 'repeat(7, 12px)',
            gridTemplateColumns: `repeat(${weeks}, 12px)`, gap: 3,
          },
        }, cells.map((d, i) => h('div', {
          key: i,
          title: d ? t('heatCell', { date: fmtDate(d.day), n: d.count }) : undefined,
          style: d ? {
            width: 12, height: 12, borderRadius: 3,
            background: levelColor[level(d.count)],
            outline: d.count === 0 ? `1px solid ${TOKEN.border}` : 'none',
          } : { width: 12, height: 12 },
        }))),
      );
    }

    // ---- plan rows --------------------------------------------------------------
    function PlanRows({ plans, allPlans, t }) {
      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 10 } },
        plans.map((p) => {
          const pct = p.nodeCount ? Math.round((p.masteredCount / p.nodeCount) * 100) : 0;
          return h(Card, { key: `${p.learnerId}:${p.id}` },
            h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' } },
              h('div', { style: { fontSize: 14, fontWeight: 600 } },
                h('span', { style: { color: PALETTE[allPlans.indexOf(p) % PALETTE.length], marginRight: 8 } }, '●'),
                p.topic,
                p.learnerId && p.learnerId !== 'default'
                  ? h('span', { style: { marginLeft: 8, fontSize: 11, color: TOKEN.text2, fontWeight: 400 } }, `@${p.learnerId}`)
                  : null,
              ),
              h('div', { style: { fontSize: 12, color: TOKEN.text2, whiteSpace: 'nowrap' } },
                `${t(`state_${p.state}`) ?? p.state} ｜ ${t('masteredOf', { m: p.masteredCount, n: p.nodeCount })}` +
                (p.avgMastery != null ? ` ｜ ${t('avgScore', { n: p.avgMastery })}` : '') +
                (p.relearnCount ? ` ｜ ${t('relearn', { n: p.relearnCount })}` : ''),
              ),
            ),
            h('div', {
              style: { marginTop: 8, height: 6, borderRadius: 3, background: TOKEN.surface2, overflow: 'hidden' },
            }, h('div', {
              style: {
                width: `${pct}%`, height: '100%', borderRadius: 3,
                background: p.state === 'COMPLETED' ? TOKEN.success : TOKEN.brand,
                transition: 'width .3s',
              },
            })),
          );
        }),
      );
    }

    // ---- 课堂: course list & detail (v3) ----------------------------------------
    function IconBtn({ title, onClick, children, danger }) {
      const [hover, setHover] = useState(false);
      return h('button', {
        title, onClick,
        onMouseEnter: () => setHover(true), onMouseLeave: () => setHover(false),
        style: {
          cursor: 'pointer', border: 'none', borderRadius: 6, padding: '4px 6px',
          fontSize: 13, lineHeight: 1, background: hover ? TOKEN.surface2 : 'transparent',
          color: danger && hover ? TOKEN.error : TOKEN.text2,
        },
      }, children);
    }

    /** One rounded segment per node, colored by status (screenshot-style). */
    function SegmentedProgress({ nodes }) {
      return h('div', { style: { display: 'flex', gap: 4, marginTop: 10 } },
        nodes.map((n) => h('div', {
          key: n.id,
          title: `${n.title} · ${n.status}`,
          style: {
            flex: 1, height: 6, borderRadius: 3,
            background: STATUS_COLOR[n.status] ?? TOKEN.idle,
            opacity: n.status === 'locked' ? 0.35 : 1,
          },
        })),
      );
    }

    /** "⋯" dropdown menu that closes on outside click. */
    function KebabMenu({ items }) {
      const [open, setOpen] = useState(false);
      useEffect(() => {
        if (!open) return undefined;
        const close = () => setOpen(false);
        document.addEventListener('click', close);
        return () => document.removeEventListener('click', close);
      }, [open]);
      return h('span', {
        style: { position: 'relative', display: 'inline-block' },
        onClick: (e) => e.stopPropagation(),
      },
        h(IconBtn, {
          title: '…',
          onClick: (e) => { e.stopPropagation(); setOpen(!open); },
        }, '⋯'),
        open ? h('div', {
          style: {
            position: 'absolute', right: 0, top: '100%', zIndex: 30, minWidth: 140,
            background: TOKEN.surface, border: `1px solid ${TOKEN.border}`, borderRadius: 8,
            boxShadow: '0 6px 24px rgba(0,0,0,.18)', padding: 4,
          },
        }, items.filter(Boolean).map((item, i) => h('button', {
          key: i,
          onClick: (e) => { e.stopPropagation(); setOpen(false); item.onClick(); },
          style: {
            display: 'flex', width: '100%', boxSizing: 'border-box', textAlign: 'left',
            gap: 8, alignItems: 'center', cursor: 'pointer', border: 'none',
            background: 'transparent', padding: '7px 10px', borderRadius: 6,
            fontSize: 12, color: item.danger ? TOKEN.error : TOKEN.text,
            borderTop: item.separator ? `1px solid ${TOKEN.border}` : 'none',
          },
          onMouseEnter: (e) => { e.currentTarget.style.background = TOKEN.surface2; },
          onMouseLeave: (e) => { e.currentTarget.style.background = 'transparent'; },
        }, item.label))) : null,
      );
    }

    const STAR = (filled) => filled ? '★' : '☆';

    function CourseCard({ course: c, t, onOpen, onMutate, onDelete, onAsk }) {
      const [hover, setHover] = useState(false);
      const pct = c.nodeCount ? Math.round((c.masteredCount / c.nodeCount) * 100) : 0;
      const done = c.masteredCount === c.nodeCount && c.nodeCount > 0;
      return h('div', {
        onMouseEnter: () => setHover(true), onMouseLeave: () => setHover(false),
        onClick: () => onOpen(c),
        style: {
          position: 'relative', cursor: 'pointer',
          background: TOKEN.surface, border: `1px solid ${TOKEN.border}`, borderRadius: 12,
          padding: '14px 16px', opacity: c.meta.locked ? 0.75 : 1,
          transition: 'border-color .15s, box-shadow .15s',
          borderColor: hover ? TOKEN.brand : TOKEN.border,
          boxShadow: hover ? '0 2px 12px rgba(0,0,0,.08)' : 'none',
        },
      },
        h('div', { style: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 } },
          h('div', { style: { fontSize: 14, fontWeight: 600, flex: 1, minWidth: 0, lineHeight: 1.4 } },
            c.meta.alias ?? c.topic,
            c.meta.locked ? h('span', { title: t('courseLockedTip'), style: { marginLeft: 6, fontSize: 11 } }, '🔒') : null,
            c.meta.group ? h('span', {
              style: {
                marginLeft: 8, fontSize: 11, fontWeight: 400, color: TOKEN.text2,
                padding: '1px 8px', borderRadius: 999, border: `1px solid ${TOKEN.border}`,
              },
            }, c.meta.group) : null,
          ),
          h('span', {
            style: { display: 'inline-flex', gap: 2, visibility: hover ? 'visible' : 'hidden', flexShrink: 0 },
          },
            h(IconBtn, {
              title: c.meta.favorite ? t('favRemove') : t('favAdd'),
              onClick: (e) => { e.stopPropagation(); onMutate(c, { favorite: !c.meta.favorite }); },
            }, h('span', { style: { color: c.meta.favorite ? '#F5A623' : undefined } }, STAR(c.meta.favorite))),
            h(KebabMenu, {
              items: [
                !c.meta.locked && { label: `✏️ ${t('menuRename')}`, onClick: () => onMutate(c, 'rename') },
                !c.meta.locked && { label: `📂 ${t('menuMove')}`, onClick: () => onMutate(c, 'group') },
                { label: c.meta.locked ? `🔓 ${t('menuUnlock')}` : `🔒 ${t('menuLock')}`, onClick: () => onMutate(c, { locked: !c.meta.locked }) },
                !c.meta.locked && { label: `🗑 ${t('menuDelete')}`, danger: true, separator: true, onClick: () => onDelete(c) },
              ],
            }),
          ),
        ),
        h('div', { style: { fontSize: 12, color: TOKEN.text2, marginTop: 4, minHeight: 16 } },
          c.activeNode ? t('activeNode', { t: c.activeNode })
            : done ? t(`state_COMPLETED`)
            : t(`state_${c.state}`) ?? c.state,
        ),
        h(SegmentedProgress, { nodes: c.nodes }),
        h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 } },
          h('span', { style: { fontSize: 12, color: TOKEN.text2 } },
            `${t('masteredOf', { m: c.masteredCount, n: c.nodeCount })} · ${pct}%`,
            c.dueCount > 0 ? h('span', { style: { color: TOKEN.warn, marginLeft: 8 } }, `⏰ ${t('cardReviewDue', { n: c.dueCount })}`) : null,
          ),
          h('button', {
            onClick: (e) => { e.stopPropagation(); onAsk(c); },
            style: {
              cursor: 'pointer', fontSize: 12, padding: '3px 12px', borderRadius: 999,
              border: `1px solid ${TOKEN.brand}`, background: 'transparent', color: TOKEN.brand,
              visibility: hover ? 'visible' : 'hidden',
            },
          }, `💬 ${t('askTutor')}`),
        ),
      );
    }

    function CourseListView({ courses, t, onOpen, onMutate, onDelete, onAsk }) {
      const [filter, setFilter] = useState('all');
      const [query, setQuery] = useState('');
      const counts = useMemo(() => ({
        all: courses.length,
        fav: courses.filter((c) => c.meta.favorite).length,
        learning: courses.filter((c) => c.masteredCount < c.nodeCount).length,
        review: courses.filter((c) => c.dueCount > 0).length,
        done: courses.filter((c) => c.nodeCount > 0 && c.masteredCount === c.nodeCount).length,
        shelf: courses.filter((c) => c.meta.group).length,
      }), [courses]);
      const visible = useMemo(() => {
        let list = courses;
        if (filter === 'fav') list = list.filter((c) => c.meta.favorite);
        if (filter === 'learning') list = list.filter((c) => c.masteredCount < c.nodeCount);
        if (filter === 'review') list = list.filter((c) => c.dueCount > 0);
        if (filter === 'done') list = list.filter((c) => c.nodeCount > 0 && c.masteredCount === c.nodeCount);
        if (filter === 'shelf') list = list.filter((c) => c.meta.group);
        const q = query.trim().toLowerCase();
        if (q) {
          list = list.filter((c) =>
            (c.meta.alias ?? c.topic).toLowerCase().includes(q) ||
            c.nodes.some((n) => n.title.toLowerCase().includes(q)));
        }
        return list;
      }, [courses, filter, query]);
      const filters = [
        ['all', 'courseAll'], ['fav', 'courseFav'], ['learning', 'courseLearning'],
        ['review', 'courseReview'], ['done', 'courseDone'], ['shelf', 'courseShelf'],
      ];
      return h(React.Fragment, null,
        h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16, alignItems: 'center' } },
          filters.map(([id, key]) => h(Chip, {
            key: id, active: filter === id, onClick: () => setFilter(id),
          }, `${t(key)} ${counts[id]}`)),
          h('input', {
            value: query, onChange: (e) => setQuery(e.target.value),
            placeholder: `🔍 ${t('courseSearch')}`,
            style: {
              marginLeft: 'auto', fontSize: 12, padding: '5px 12px', borderRadius: 999,
              border: `1px solid ${TOKEN.border}`, background: TOKEN.surface, color: TOKEN.text,
              outline: 'none', width: 200,
            },
          }),
        ),
        visible.length === 0 ? h('div', {
          style: {
            marginTop: 24, padding: 24, borderRadius: 12, textAlign: 'center',
            border: `1px dashed ${TOKEN.border}`, color: TOKEN.text2,
          },
        },
          h('div', { style: { fontSize: 15, marginBottom: 8 } }, t('courseEmptyTitle')),
          h('div', null, t('courseEmptyBody')),
        ) : h('div', {
          style: {
            display: 'grid', marginTop: 16,
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12,
          },
        }, visible.map((c) => h(CourseCard, {
          key: c.key, course: c, t, onOpen, onMutate, onDelete, onAsk,
        }))),
      );
    }

    /** Inline expander under a node row: tutor note / mini DAG / user scratchpad. */
    function NodePane({ course, node, kind, t, onSaved }) {
      const [content, setContent] = useState(null);
      const [draft, setDraft] = useState(null);
      const [status, setStatus] = useState(null);
      useEffect(() => {
        setContent(null); setDraft(null); setStatus(null);
        if (kind === 'map') return;
        const q = `course/note?root=${encodeURIComponent(course.root)}&learnerId=${encodeURIComponent(course.learnerId)}` +
          `&roadmapId=${encodeURIComponent(course.roadmapId)}&nodeId=${encodeURIComponent(node.id)}&kind=${kind === 'scratch' ? 'user' : 'tutor'}`;
        api(q).then((d) => { setContent(d.content); setDraft(d.content); }).catch(() => setContent(''));
      }, [course.key, node.id, kind]);
      const save = () => {
        setStatus(null);
        api('course/note', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            root: course.root, learnerId: course.learnerId,
            roadmapId: course.roadmapId, nodeId: node.id, content: draft ?? '',
          }),
        }).then(() => { setStatus('ok'); onSaved?.(); }).catch(() => setStatus('fail'));
      };
      const boxStyle = {
        marginTop: 8, padding: '10px 12px', borderRadius: 8, fontSize: 12,
        background: TOKEN.surface2, border: `1px solid ${TOKEN.border}`,
      };
      if (kind === 'map') {
        return h('div', { style: boxStyle },
          h('div', { style: { color: TOKEN.text2, marginBottom: 6 } }, `${t('mapTitle')} · ${course.topic}`),
          h(DagChart, { plan: { nodes: course.nodes, dag: course.dag }, t }),
        );
      }
      if (kind === 'note') {
        return h('div', { style: boxStyle },
          content === null ? t('loading')
            : content ? h('pre', {
                style: { margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'inherit', color: TOKEN.text },
              }, content)
            : h('span', { style: { color: TOKEN.text2 } }, t('noteEmpty')),
        );
      }
      return h('div', { style: boxStyle },
        h('textarea', {
          value: draft ?? '', rows: 4, placeholder: t('scratchPlaceholder'),
          onChange: (e) => setDraft(e.target.value),
          style: {
            width: '100%', boxSizing: 'border-box', fontSize: 12, padding: 8, borderRadius: 6,
            border: `1px solid ${TOKEN.border}`, background: TOKEN.surface, color: TOKEN.text,
            fontFamily: 'inherit', resize: 'vertical',
          },
        }),
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 } },
          h('button', {
            onClick: save,
            style: {
              cursor: 'pointer', fontSize: 12, padding: '4px 14px', borderRadius: 6,
              border: `1px solid ${TOKEN.brand}`, background: TOKEN.brand, color: '#fff',
            },
          }, t('scratchSave')),
          status === 'ok' ? h('span', { style: { color: TOKEN.success } }, t('scratchSaved')) : null,
          status === 'fail' ? h('span', { style: { color: TOKEN.error } }, t('scratchFailed')) : null,
        ),
      );
    }

    function NodeRow({ course, node, t, onSaved }) {
      const [pane, setPane] = useState(null); // null | 'note' | 'map' | 'scratch'
      const toggle = (kind) => setPane(pane === kind ? null : kind);
      const color = STATUS_COLOR[node.status] ?? TOKEN.idle;
      const pill = (kind, label, marked) => h('button', {
        onClick: () => toggle(kind),
        style: {
          cursor: 'pointer', fontSize: 11, padding: '2px 10px', borderRadius: 999,
          border: `1px solid ${pane === kind ? TOKEN.brand : TOKEN.border}`,
          background: pane === kind ? 'color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent)' : 'transparent',
          color: TOKEN.text2,
        },
      }, `${label}${marked ? ' ·' : ''}`);
      return h('div', {
        style: {
          background: TOKEN.surface, border: `1px solid ${TOKEN.border}`, borderRadius: 10,
          padding: '10px 14px',
        },
      },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' } },
          h('span', {
            style: {
              width: 18, height: 18, borderRadius: 9, flexShrink: 0, display: 'inline-flex',
              alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#fff',
              background: node.status === 'mastered' ? TOKEN.success
                : node.status === 'active' ? TOKEN.brand
                : node.status === 'needs-relearn' ? TOKEN.warn : TOKEN.surface2,
              border: `1px solid ${color}`,
            },
          }, node.status === 'mastered' ? '✓' : node.status === 'needs-relearn' ? '!' : ''),
          h('span', { style: { flex: 1, minWidth: 120, fontSize: 13, fontWeight: 500 } }, node.title),
          node.total != null ? h('span', { style: { fontSize: 11, color: TOKEN.text2 } }, t('avgScore', { n: node.total })) : null,
          h('span', { style: { display: 'inline-flex', gap: 6 } },
            pill('note', t('nodeNote'), node.hasNote),
            pill('map', t('nodeMap')),
            pill('scratch', t('nodeScratch'), node.hasUserNote),
          ),
        ),
        pane ? h(NodePane, { course, node, kind: pane, t, onSaved }) : null,
      );
    }

    function CourseDetailView({ course, t, onBack, onAsk, reload }) {
      const [tab, setTab] = useState('journey');
      const done = course.nodeCount > 0 && course.masteredCount === course.nodeCount;
      return h(React.Fragment, null,
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 12, marginTop: 4, flexWrap: 'wrap' } },
          h('button', {
            onClick: onBack,
            style: {
              cursor: 'pointer', fontSize: 12, padding: '4px 12px', borderRadius: 6,
              border: `1px solid ${TOKEN.border}`, background: 'transparent', color: TOKEN.text2,
            },
          }, `← ${t('backToList')}`),
          h('div', { style: { display: 'inline-flex', gap: 4, background: TOKEN.surface2, borderRadius: 999, padding: 3 } },
            [['journey', t('journey')], ['review', t('reviewTab')]].map(([id, label]) => h('button', {
              key: id, onClick: () => setTab(id),
              style: {
                cursor: 'pointer', fontSize: 12, padding: '4px 16px', borderRadius: 999, border: 'none',
                background: tab === id ? TOKEN.surface : 'transparent',
                color: tab === id ? TOKEN.text : TOKEN.text2, fontWeight: tab === id ? 600 : 400,
                boxShadow: tab === id ? '0 1px 3px rgba(0,0,0,.12)' : 'none',
              },
            }, label)),
          ),
        ),
        h('h2', { style: { fontSize: 17, fontWeight: 650, margin: '16px 0 2px' } }, course.meta.alias ?? course.topic),
        h('div', { style: { fontSize: 12, color: TOKEN.text2 } },
          t('masteredLine', { m: course.masteredCount, n: course.nodeCount }),
          done ? ` · ${t('state_COMPLETED')} 🎉` : '',
        ),
        h(SegmentedProgress, { nodes: course.nodes }),
        tab === 'journey'
          ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 } },
              course.nodes.map((n) => h(NodeRow, {
                key: n.id, course, node: n, t, onSaved: reload,
              })),
            )
          : h('div', { style: { marginTop: 16 } },
              (() => {
                const due = course.reviews.filter((r) => r.due);
                const upcoming = course.reviews.filter((r) => !r.due).sort((a, b) => a.nextReviewAt - b.nextReviewAt);
                return h(React.Fragment, null,
                  due.length === 0
                    ? h('div', {
                        style: {
                          padding: 20, borderRadius: 10, textAlign: 'center', color: TOKEN.text2,
                          border: `1px dashed ${TOKEN.border}`, fontSize: 13,
                        },
                      }, course.reviews.length ? t('reviewAllEmpty') : t('reviewEmpty'))
                    : h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
                        due.map((r) => h('div', {
                          key: r.nodeId,
                          style: {
                            display: 'flex', alignItems: 'center', gap: 10,
                            background: TOKEN.surface, border: `1px solid ${TOKEN.border}`,
                            borderLeft: `3px solid ${TOKEN.warn}`, borderRadius: 10, padding: '10px 14px',
                          },
                        },
                          h('span', { style: { flex: 1, fontSize: 13 } }, `📅 ${r.title}`),
                          h('button', {
                            onClick: () => onAsk(course),
                            style: {
                              cursor: 'pointer', fontSize: 12, padding: '3px 12px', borderRadius: 999,
                              border: `1px solid ${TOKEN.brand}`, background: 'transparent', color: TOKEN.brand,
                            },
                          }, t('goReview')),
                        )),
                      ),
                  upcoming.length ? h('div', { style: { marginTop: 14, fontSize: 12, color: TOKEN.text2 } },
                    upcoming.slice(0, 5).map((r) => h('div', { key: r.nodeId, style: { marginTop: 4 } },
                      `· ${r.title} — ${t('reviewNext', { d: fmtDate(r.nextReviewAt) })}`)),
                  ) : null,
                );
              })(),
            ),
      );
    }

    /** 课堂 root: course list ↔ course detail. */
    function CoursesPanel({ i18n, navCtx, onReload }) {
      const t = useT(i18n);
      const [data, setData] = useState(null);
      const [error, setError] = useState(null);
      const [openKey, setOpenKey] = useState(null);
      const load = () => {
        setError(null);
        api('courses').then(setData, (e) => setError(String(e?.message ?? e)));
      };
      useEffect(() => {
        load();
        const iv = setInterval(load, 60000);
        const onVis = () => { if (document.visibilityState === 'visible') load(); };
        document.addEventListener('visibilitychange', onVis);
        return () => { clearInterval(iv); document.removeEventListener('visibilitychange', onVis); };
      }, []);
      const courses = data?.courses ?? [];
      const openCourse = courses.find((c) => c.key === openKey) ?? null;

      const mutate = (course, patch) => {
        let body = patch;
        if (patch === 'rename') {
          const alias = window.prompt(t('renamePrompt'), course.meta.alias ?? course.topic);
          if (alias === null) return;
          body = { alias: alias.trim() || null };
        } else if (patch === 'group') {
          const group = window.prompt(t('groupPrompt'), course.meta.group ?? '');
          if (group === null) return;
          body = { group: group.trim() || null };
        } else {
          body = patch;
        }
        api('course/meta', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ root: course.root, learnerId: course.learnerId, roadmapId: course.roadmapId, patch: body }),
        }).then(() => { load(); onReload?.(); }).catch(() => {});
      };
      const remove = (course) => {
        if (!window.confirm(t('deleteConfirm', { t: course.meta.alias ?? course.topic }))) return;
        api('course/delete', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ root: course.root, learnerId: course.learnerId, roadmapId: course.roadmapId }),
        }).then(() => { setOpenKey(null); load(); onReload?.(); }).catch(() => {});
      };
      const ask = (course) => {
        const sid = course.meta.sessionId;
        let jumped = false;
        if (sid) {
          try {
            const uiWorkspace = navCtx?.get?.('uiWorkspace');
            if (uiWorkspace?.openSession) { uiWorkspace.openSession(sid); jumped = true; }
          } catch { /* session may be gone */ }
        }
        if (!jumped) {
          try { navCtx?.get?.('layout')?.selectPanel?.(null); } catch { /* optional */ }
        }
      };

      if (error) return h('div', { style: { marginTop: 20, color: TOKEN.error } }, `${t('loadFailed')}: ${error}`);
      if (!data) return h('div', { style: { marginTop: 20, color: TOKEN.text2 } }, t('loading'));
      return openCourse
        ? h(CourseDetailView, { course: openCourse, t, onBack: () => setOpenKey(null), onAsk: ask, reload: load })
        : h(CourseListView, { courses, t, onOpen: (c) => setOpenKey(c.key), onMutate: mutate, onDelete: remove, onAsk: ask });
    }

    /** Plugin main panel: 课堂 + 分析 tabs. */
    function LearnPanel({ i18n, navCtx }) {
      const t = useT(i18n);
      const [tab, setTab] = useState('courses');
      const [analysisTick, setAnalysisTick] = useState(0);
      return h('div', {
        style: {
          height: '100%', overflowY: 'auto', boxSizing: 'border-box',
          padding: '24px 28px 40px', color: TOKEN.text,
          fontFamily: 'inherit', fontSize: 13,
        },
      },
        h('div', { style: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 } },
          h('h1', { style: { fontSize: 18, fontWeight: 650, margin: 0 } }, t('panelTitle')),
          h('div', { style: { display: 'inline-flex', gap: 4, background: TOKEN.surface2, borderRadius: 999, padding: 3 } },
            [['courses', t('tabCourses')], ['analysis', t('tabAnalysis')]].map(([id, label]) => h('button', {
              key: id, onClick: () => setTab(id),
              style: {
                cursor: 'pointer', fontSize: 12, padding: '4px 18px', borderRadius: 999, border: 'none',
                background: tab === id ? TOKEN.surface : 'transparent',
                color: tab === id ? TOKEN.text : TOKEN.text2, fontWeight: tab === id ? 600 : 400,
                boxShadow: tab === id ? '0 1px 3px rgba(0,0,0,.12)' : 'none',
              },
            }, label)),
          ),
        ),
        tab === 'courses'
          ? h(CoursesPanel, { i18n, navCtx, onReload: () => setAnalysisTick((n) => n + 1) })
          : h(AnalysisPanel, { i18n, key: analysisTick, embedded: true }),
      );
    }

    // ---- main analysis panel ------------------------------------------------------
    function AnalysisPanel({ i18n, embedded }) {
      const t = useT(i18n);
      const [data, setData] = useState(null);
      const [error, setError] = useState(null);
      const [selected, setSelected] = useState(null);
      const [learner, setLearner] = useState(null);
      const [exporting, setExporting] = useState(false);

      const load = () => {
        setError(null);
        api('analysis').then((payload) => setData(payload), (e) => setError(String(e?.message ?? e)));
      };
      // F6: poll every 60s + refresh when the page becomes visible again.
      useEffect(() => {
        load();
        const iv = setInterval(load, 60000);
        const onVis = () => { if (document.visibilityState === 'visible') load(); };
        document.addEventListener('visibilitychange', onVis);
        return () => { clearInterval(iv); document.removeEventListener('visibilitychange', onVis); };
      }, []);

      const allPlans = useMemo(
        () => (data?.plans ?? []).filter((p) => !learner || (p.learnerId ?? 'default') === learner),
        [data, learner],
      );
      const plans = useMemo(
        () => (selected ? allPlans.filter((p) => p.id === selected) : allPlans),
        [allPlans, selected],
      );
      const learners = data?.learners ?? [];

      const avgAll = useMemo(() => {
        const scored = allPlans.filter((p) => p.avgMastery != null);
        if (!scored.length) return null;
        return Math.round(scored.reduce((s, p) => s + p.avgMastery, 0) / scored.length);
      }, [allPlans]);

      const doExport = () => {
        const id = learner ?? learners[0]?.learnerId ?? 'default';
        setExporting(true);
        api(`export?learnerId=${encodeURIComponent(id)}`)
          .then((bundle) => {
            const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `learn-expert-${id}-${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
            URL.revokeObjectURL(a.href);
          })
          .catch(() => {})
          .finally(() => setExporting(false));
      };

      const dagPlan = selected ? plans[0] : allPlans[0];

      return h('div', {
        style: embedded ? {} : {
          height: '100%', overflowY: 'auto', boxSizing: 'border-box',
          padding: '24px 28px 40px', color: TOKEN.text,
          fontFamily: 'inherit', fontSize: 13,
        },
      },
        h('div', { style: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 } },
          embedded ? h('div', { style: { fontSize: 12, color: TOKEN.text2 } }, t('subtitle'))
            : h('h1', { style: { fontSize: 18, fontWeight: 650, margin: 0 } }, t('title')),
          h('div', { style: { display: 'flex', gap: 8 } },
            h('button', {
              onClick: doExport, disabled: exporting || !learners.length,
              style: {
                cursor: 'pointer', fontSize: 12, padding: '4px 12px', borderRadius: 6,
                border: `1px solid ${TOKEN.border}`, background: 'transparent', color: TOKEN.text2,
                opacity: exporting || !learners.length ? 0.5 : 1,
              },
            }, t('export')),
            h('button', {
              onClick: load,
              style: {
                cursor: 'pointer', fontSize: 12, padding: '4px 12px', borderRadius: 6,
                border: `1px solid ${TOKEN.border}`, background: 'transparent', color: TOKEN.text2,
              },
            }, t('refresh')),
          ),
        ),
        embedded ? null : h('div', { style: { fontSize: 12, color: TOKEN.text2, marginTop: 4 } }, t('subtitle')),

        learners.length > 1 ? h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 } },
          h(Chip, { active: !learner, onClick: () => setLearner(null) }, t('allLearners')),
          learners.map((l) => h(Chip, {
            key: l.learnerId, active: learner === l.learnerId,
            onClick: () => setLearner(learner === l.learnerId ? null : l.learnerId),
          }, `@${l.learnerId}`)),
        ) : null,

        error ? h('div', { style: { marginTop: 20, color: TOKEN.error } }, `${t('loadFailed')}: ${error}`) : null,
        !error && !data ? h('div', { style: { marginTop: 20, color: TOKEN.text2 } }, t('loading')) : null,

        data && allPlans.length === 0 ? h('div', {
          style: {
            marginTop: 24, padding: 24, borderRadius: 12, textAlign: 'center',
            border: `1px dashed ${TOKEN.border}`, color: TOKEN.text2,
          },
        },
          h('div', { style: { fontSize: 15, marginBottom: 8 } }, t('emptyTitle')),
          h('div', null, t('emptyBody')),
        ) : null,

        data && allPlans.length > 0 ? h(React.Fragment, null,
          h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 18 } },
            h(StatCard, { label: t('statPlans'), value: String(allPlans.length), hint: t('statPlansHint') }),
            h(StatCard, {
              label: t('statMastered'),
              value: `${allPlans.reduce((s, p) => s + p.masteredCount, 0)}/${allPlans.reduce((s, p) => s + p.nodeCount, 0)}`,
              hint: t('statMasteredHint'),
            }),
            h(StatCard, { label: t('statAvg'), value: avgAll != null ? String(avgAll) : '—', hint: t('statAvgHint') }),
            h(StatCard, {
              label: t('statReview'), value: String(data.review.due),
              hint: t('statReviewHint', { n: data.review.total }),
              color: data.review.due > 0 ? TOKEN.warn : undefined,
            }),
          ),

          data.quality && (data.quality.avgAttemptsPerNode != null || data.quality.reviewPassRate != null)
            ? h(React.Fragment, null,
                h(SectionTitle, null, t('qualityTitle')),
                h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 12 } },
                  h(StatCard, {
                    label: t('qualityDensity'),
                    value: data.quality.avgAttemptsPerNode != null ? String(data.quality.avgAttemptsPerNode) : '—',
                    hint: t('qualityDensityHint'),
                    color: data.quality.avgAttemptsPerNode != null && data.quality.avgAttemptsPerNode < 2 ? TOKEN.warn : undefined,
                  }),
                  h(StatCard, {
                    label: t('qualityPass'),
                    value: data.quality.reviewPassRate != null ? `${data.quality.reviewPassRate}%` : '—',
                    hint: t('qualityPassHint', { n: data.quality.reviewedCount }),
                    color: data.quality.reviewPassRate != null && data.quality.reviewPassRate < 70 ? TOKEN.warn : undefined,
                  }),
                ),
              )
            : null,

          h(SectionTitle, { sub: t('lineSubtitle') }, t('lineTitle')),
          h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 8, margin: '10px 0 14px' } },
            h(Chip, { active: !selected, onClick: () => setSelected(null) }, t('allPlans')),
            allPlans.map((p) => h(Chip, {
              key: p.id, color: PALETTE[allPlans.indexOf(p) % PALETTE.length],
              active: selected === p.id,
              onClick: () => setSelected(selected === p.id ? null : p.id),
            }, `${p.topic} ${t('masteredOf', { m: p.masteredCount, n: p.nodeCount })}`)),
          ),
          h(Card, null, h(LineChart, { plans, selected })),

          dagPlan ? h(React.Fragment, null,
            h(SectionTitle, { sub: t('dagSubtitle') }, `${t('dagTitle')} — ${dagPlan.topic}`),
            h(Card, null, h(DagChart, { plan: dagPlan, t })),
          ) : null,

          h(SectionTitle, { sub: t('heatSubtitle', { n: Math.round(data.heatmap.length / 7) }) }, t('heatTitle')),
          h(Card, { style: { overflowX: 'auto' } }, h(Heatmap, { days: data.heatmap, t })),

          h(SectionTitle, null, t('detailTitle')),
          h(PlanRows, { plans, allPlans, t }),
        ) : null,
      );
    }

    // ---- profile card on the bundle detail page (F3) -------------------------------
    function ProfileCard({ i18n }) {
      const t = useT(i18n);
      const [learners, setLearners] = useState([]);
      const [learnerId, setLearnerId] = useState('default');
      const [profile, setProfile] = useState(null);
      const [status, setStatus] = useState(null);

      useEffect(() => {
        api('analysis').then((d) => {
          const ids = (d.learners ?? []).map((l) => l.learnerId);
          setLearners(ids.length ? ids : ['default']);
        }).catch(() => setLearners(['default']));
      }, []);
      useEffect(() => {
        setProfile(null);
        api(`profile?learnerId=${encodeURIComponent(learnerId)}`).then(setProfile).catch(() => setProfile(null));
      }, [learnerId]);

      const save = () => {
        setStatus(null);
        api('profile', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            learnerId,
            background: profile.background,
            strengths: profile.strengths,
            strengthsMode: 'replace',
            preferences: profile.preferences,
          }),
        }).then(() => setStatus('ok')).catch(() => setStatus('fail'));
      };

      const inputStyle = {
        width: '100%', boxSizing: 'border-box', fontSize: 13, padding: '6px 8px',
        borderRadius: 6, border: `1px solid ${TOKEN.border}`, background: TOKEN.surface2, color: TOKEN.text,
      };
      const labelStyle = { fontSize: 12, color: TOKEN.text2, margin: '10px 0 4px', display: 'block' };

      return h(Card, { style: { maxWidth: 560 } },
        h('div', { style: { fontSize: 14, fontWeight: 600, marginBottom: 4 } }, t('profileTitle')),
        h('label', { style: labelStyle }, t('profileLearner')),
        h('select', {
          value: learnerId, onChange: (e) => setLearnerId(e.target.value), style: inputStyle,
        }, learners.map((id) => h('option', { key: id, value: id }, `@${id}`))),
        !profile ? h('div', { style: { marginTop: 10, color: TOKEN.text2, fontSize: 12 } }, t('loading'))
          : h(React.Fragment, null,
              h('label', { style: labelStyle }, t('profileBackground')),
              h('textarea', {
                value: profile.background ?? '', rows: 2, style: inputStyle,
                onChange: (e) => setProfile({ ...profile, background: e.target.value }),
              }),
              h('label', { style: labelStyle }, t('profileStrengths')),
              h('input', {
                value: (profile.strengths ?? []).join(', '), style: inputStyle,
                onChange: (e) => setProfile({ ...profile, strengths: e.target.value.split(/[,，]/).map((s) => s.trim()).filter(Boolean) }),
              }),
              h('div', { style: { display: 'flex', gap: 12 } },
                h('div', { style: { flex: 1 } },
                  h('label', { style: labelStyle }, t('profileStyle')),
                  h('select', {
                    value: profile.preferences?.style ?? '', style: inputStyle,
                    onChange: (e) => setProfile({ ...profile, preferences: { ...profile.preferences, style: e.target.value || undefined } }),
                  },
                    h('option', { value: '' }, t('styleUnset')),
                    h('option', { value: 'example-first' }, t('styleExample')),
                    h('option', { value: 'principle-first' }, t('stylePrinciple')),
                  ),
                ),
                h('div', { style: { flex: 1 } },
                  h('label', { style: labelStyle }, t('profilePace')),
                  h('select', {
                    value: profile.preferences?.pace ?? '', style: inputStyle,
                    onChange: (e) => setProfile({ ...profile, preferences: { ...profile.preferences, pace: e.target.value || undefined } }),
                  },
                    h('option', { value: '' }, t('styleUnset')),
                    h('option', { value: 'fast' }, t('paceFast')),
                    h('option', { value: 'normal' }, t('paceNormal')),
                    h('option', { value: 'slow' }, t('paceSlow')),
                  ),
                ),
              ),
              Object.keys(profile.errorPatterns ?? {}).length
                ? h('div', { style: { marginTop: 10, fontSize: 12, color: TOKEN.text2 } },
                    `${t('profileErrors')}: ${Object.entries(profile.errorPatterns).map(([k, v]) => `${k}×${v}`).join('  ')}`)
                : null,
              h('div', { style: { marginTop: 4, fontSize: 12, color: TOKEN.text2 } },
                t('profileCourses', { n: (profile.courseHistory ?? []).length })),
              h('div', { style: { marginTop: 12, display: 'flex', alignItems: 'center', gap: 10 } },
                h('button', {
                  onClick: save,
                  style: {
                    cursor: 'pointer', fontSize: 12, padding: '5px 14px', borderRadius: 6,
                    border: `1px solid ${TOKEN.brand}`, background: TOKEN.brand, color: '#fff',
                  },
                }, t('profileSave')),
                status === 'ok' ? h('span', { style: { fontSize: 12, color: TOKEN.success } }, t('profileSaved')) : null,
                status === 'fail' ? h('span', { style: { fontSize: 12, color: TOKEN.error } }, t('profileSaveFailed')) : null,
              ),
            ),
      );
    }

    // ---- conversation tool-view cards (F1) -------------------------------------------
    function toolMeta(props) {
      if (props.phase !== 'result') return null;
      return props.block?.meta ?? null;
    }

    function ToolCardShell({ icon, title, tone, children }) {
      return h('div', {
        style: {
          display: 'flex', gap: 10, alignItems: 'flex-start',
          padding: '8px 12px', borderRadius: 8,
          border: `1px solid ${TOKEN.border}`,
          borderLeft: `3px solid ${tone || TOKEN.brand}`,
          background: TOKEN.surface, fontSize: 12, color: TOKEN.text,
          maxWidth: 640,
        },
      },
        h('span', { style: { fontSize: 14, lineHeight: '18px' } }, icon),
        h('div', { style: { flex: 1, minWidth: 0 } },
          h('div', { style: { fontWeight: 600, marginBottom: children ? 6 : 0 } }, title),
          children,
        ),
      );
    }

    function DimBar({ label, value }) {
      if (typeof value !== 'number') return null;
      return h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 } },
        h('span', { style: { width: 64, color: TOKEN.text2 } }, label),
        h('div', { style: { flex: 1, height: 5, borderRadius: 3, background: TOKEN.surface2, overflow: 'hidden' } },
          h('div', { style: { width: `${value}%`, height: '100%', background: value >= 80 ? TOKEN.success : value >= 60 ? TOKEN.warn : TOKEN.error } }),
        ),
        h('span', { style: { width: 28, textAlign: 'right' } }, String(value)),
      );
    }

    function MasteryCard(props) {
      const meta = toolMeta(props);
      if (!meta?.mastery) return h(ToolCardShell, { icon: '📊', title: `learn-expert · ${props.toolName}` }, null);
      const t = props.t;
      const m = meta.mastery;
      const tone = meta.action === 'unlock' ? TOKEN.success : meta.action === 'remediate' ? TOKEN.error : TOKEN.warn;
      const actionText = meta.action === 'unlock' ? t('cardUnlock') : meta.action === 'remediate' ? t('cardRemediate') : t('cardQuestion');
      return h(ToolCardShell, { icon: '📊', title: `${t('cardMastery')}：${m.total}（${t('cardThreshold', { n: meta.threshold })}）· ${actionText}`, tone },
        h(DimBar, { label: t('dimAccuracy'), value: m.accuracy }),
        h(DimBar, { label: t('dimDepth'), value: m.depth }),
        h(DimBar, { label: t('dimTransfer'), value: m.transfer }),
        h(DimBar, { label: t('dimDiscrimination'), value: m.discrimination }),
        meta.courseCompleted ? h('div', { style: { marginTop: 6, color: TOKEN.success, fontWeight: 600 } }, t('cardCourseDone')) : null,
      );
    }

    function RoadmapCard(props) {
      const meta = toolMeta(props);
      if (!meta?.nodes) return h(ToolCardShell, { icon: '🗺️', title: `learn-expert · ${props.toolName}` }, null);
      const t = props.t;
      return h(ToolCardShell, { icon: '🗺️', title: `${t('cardRoadmap')}：${meta.topic}（${t('cardNodes', { n: meta.nodes.length })}）` },
        h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 6 } },
          meta.nodes.map((n) => h('span', {
            key: n.id,
            style: {
              padding: '2px 8px', borderRadius: 999, fontSize: 11,
              border: `1px solid ${STATUS_COLOR[n.status] ?? TOKEN.idle}`,
              color: n.status === 'locked' ? TOKEN.text2 : STATUS_COLOR[n.status],
              opacity: n.status === 'locked' ? 0.7 : 1,
            },
          }, n.title)),
        ),
      );
    }

    function AnswerCard(props) {
      const meta = toolMeta(props);
      if (!meta || typeof meta.passed !== 'boolean') return h(ToolCardShell, { icon: '✅', title: `learn-expert · ${props.toolName}` }, null);
      const t = props.t;
      return h(ToolCardShell, {
        icon: meta.passed ? '✅' : '🔄',
        tone: meta.passed ? TOKEN.success : meta.remediate ? TOKEN.error : TOKEN.warn,
        title: meta.passed ? t('cardAnswerPass') : `${t('cardAnswerFail')}${meta.cause ? ` · ${meta.cause}` : ''}`,
      },
        meta.remediate ? h('div', { style: { color: TOKEN.error } }, t('cardRemediateWarn')) : null,
        meta.feedback ? h('div', { style: { color: TOKEN.text2, marginTop: 2 } }, meta.feedback) : null,
      );
    }

    function ReviewDueCard(props) {
      const meta = toolMeta(props);
      if (!meta || typeof meta.count !== 'number') return h(ToolCardShell, { icon: '📅', title: `learn-expert · ${props.toolName}` }, null);
      const t = props.t;
      return h(ToolCardShell, {
        icon: '📅', tone: meta.count > 0 ? TOKEN.warn : TOKEN.success,
        title: meta.count > 0 ? t('cardReviewDue', { n: meta.count }) : t('cardNoReview'),
      },
        (meta.items ?? []).slice(0, 6).map((item) => h('div', {
          key: `${item.roadmapId}:${item.nodeId}`, style: { color: TOKEN.text2, marginTop: 2 },
        }, `• ${item.title ?? item.nodeId}${item.topic ? `（${item.topic}）` : ''}`)),
      );
    }

    // ---- registration ------------------------------------------------------
    return {
      inject: ['slots'],
      apply(ctx) {
        const i18n = createI18n(ctx.get('locale'));
        const withT = (Component) => (props) => h(Component, { ...props, t: i18n.t });

        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist', id: 'dsh-learn-expert', order: 60, label: () => i18n.t('title'),
        }, PanelIcon));

        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main', key: 'dsh-learn-expert',
        }, () => h(LearnPanel, { i18n, navCtx: ctx })));

        ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
          name: 'plugins.bundle.config', key: 'dsh-learn-expert',
        }, (props) => (props?.view === 'summary'
          ? h('span', null, i18n.t('profileTitle'))
          : h(ProfileCard, { i18n }))));

        ctx.slots.inject('tool.call.toolview', () => [
          ctx.slots.register({ name: 'tool.call.toolview', key: 'ai_learn_assess_mastery' }, withT(MasteryCard)),
          ctx.slots.register({ name: 'tool.call.toolview', key: 'ai_learn_create_roadmap' }, withT(RoadmapCard)),
          ctx.slots.register({ name: 'tool.call.toolview', key: 'ai_learn_update_roadmap' }, withT(RoadmapCard)),
          ctx.slots.register({ name: 'tool.call.toolview', key: 'ai_learn_submit_answer' }, withT(AnswerCard)),
          ctx.slots.register({ name: 'tool.call.toolview', key: 'ai_learn_review_due' }, withT(ReviewDueCard)),
        ]);
      },
    };
  },
});
