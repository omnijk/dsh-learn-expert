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

    // ---- celebration confetti (CSS keyframes injected once) -----------------------
    let confettiInjected = false;
    function ensureConfettiStyle() {
      if (confettiInjected || typeof document === 'undefined') return;
      const el = document.createElement('style');
      el.textContent = [
        '@keyframes dsh-learn-confetti {',
        '0% { transform: translateY(0) rotate(0deg); opacity: 1; }',
        '100% { transform: translateY(var(--fall, 120px)) rotate(var(--spin, 360deg)); opacity: 0; }',
        '}',
      ].join('\n');
      document.head.appendChild(el);
      confettiInjected = true;
    }
    const CONFETTI_EMOJI = ['🎉', '🎊', '⭐', '✨', '🟡', '🔵', '🟢'];
    function Confetti({ count = 14 }) {
      ensureConfettiStyle();
      const pieces = useMemo(() => Array.from({ length: count }, (_, i) => ({
        left: `${(i * 97) % 100}%`,
        delay: `${((i * 137) % 900) / 1000}s`,
        dur: `${1.1 + ((i * 53) % 110) / 100}s`,
        fall: `${70 + ((i * 71) % 130)}px`,
        spin: `${(i % 2 ? -1 : 1) * (180 + ((i * 89) % 180))}deg`,
        size: 10 + ((i * 31) % 12),
        emoji: CONFETTI_EMOJI[i % CONFETTI_EMOJI.length],
      })), [count]);
      return h('span', {
        style: {
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          pointerEvents: 'none', overflow: 'hidden', borderRadius: 'inherit',
        },
      }, pieces.map((p, i) => h('span', {
        key: i,
        style: {
          position: 'absolute', top: -6, left: p.left, fontSize: p.size,
          animation: `dsh-learn-confetti ${p.dur} ease-out ${p.delay} both`,
          '--fall': p.fall, '--spin': p.spin,
        },
      }, p.emoji)));
    }

    // ---- i18n (F6): dictionaries live here; the active language follows the
    // Client locale service when present, else the browser, else Chinese.
    const DICT = {
      zh: {
        title: '学习分析', refresh: '刷新', export: '导出数据',
        subtitle: 'learn-expert 私教：掌握进度折线图 ｜ 路线图 DAG ｜ 学习热力图 ｜ 复习队列',
        loading: '加载中…', loadFailed: '加载失败',
        crashed: '这个面板出错了', retry: '重试',
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
        dagTitle: '路线图结构图', dagSubtitle: '概念节点按教学顺序展开为思维导图；分支末端圆点颜色 = 状态，悬停看四维分。',
        heatTitle: '学习热力图', heatSubtitle: '最近 {n} 周：摸底、评分、检查点作答与复习的次数。',
        detailTitle: '学习计划明细',
        allPlans: '全部计划', allLearners: '全部学习者',
        masteredOf: '{m}/{n} 节点', avgScore: '均分 {n}', relearn: '{n} 待重学',
        heatCell: '{date}：{n} 次学习活动',
        wdShort: '一,二,三,四,五,六,日',
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
        mapTitle: '知识导图', mapTab: '全景导图',
        // Home / review / celebration (v3.1)
        tabToday: '今日', tabReview: '复盘',
        greetMorning: '早上好', greetNoon: '中午好', greetAfternoon: '下午好', greetEvening: '晚上好',
        homeIdea: '想弄懂点新东西？', homeIdeaPlaceholder: '比如：为什么利率上升，股市往往跌？',
        homeIdeaGo: '去问私教',
        homeContinue: '继续学习', homeBackToCourse: '回到课堂', homeAllCourses: '全部课程',
        homeIdeaCopied: '已复制到剪贴板，在对话框粘贴发送即可开始',
        homeLastStudy: '上次学习：{d}', homeNone: '还没有进行中的课程',
        feynmanTitle: '费曼复述', feynmanHint: '合上资料，用自己的话把这个知识点讲给"外行"听。讲不清楚的地方就是你的盲区。',
        feynmanPlaceholder: '用自己的话讲一遍……', feynmanSaved: '已存入手记',
        reviewDueLine: '{n} 个知识点到期', reviewNoneLine: '今天没有到期复习',
        celebrateCourse: '这门课的知识点都掌握了，撒花！🎉', celebrateNode: '本节已掌握 🎉',
        lockedTip: '前置章节掌握后解锁', nodeIndex: '第 {n} 节',
      },
      en: {
        title: 'Learning analysis', refresh: 'Refresh', export: 'Export data',
        subtitle: 'learn-expert tutor: mastery timeline | roadmap DAG | activity heatmap | review queue',
        loading: 'Loading…', loadFailed: 'Load failed',
        crashed: 'This panel hit an error', retry: 'Retry',
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
        dagTitle: 'Roadmap structure', dagSubtitle: 'Concept nodes as a mind map in teaching order; end-dot color = status, hover for scores.',
        heatTitle: 'Activity heatmap', heatSubtitle: 'Last {n} weeks: diagnoses, assessments, checkpoint answers and reviews.',
        detailTitle: 'Plans',
        allPlans: 'All plans', allLearners: 'All learners',
        masteredOf: '{m}/{n} nodes', avgScore: 'avg {n}', relearn: '{n} to relearn',
        heatCell: '{date}: {n} learning activities',
        wdShort: 'M,T,W,T,F,S,S',
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
        mapTitle: 'Concept map', mapTab: 'Mind map',
        // Home / review / celebration (v3.1)
        tabToday: 'Today', tabReview: 'Review',
        greetMorning: 'Good morning', greetNoon: 'Good noon', greetAfternoon: 'Good afternoon', greetEvening: 'Good evening',
        homeIdea: 'Want to understand something new?', homeIdeaPlaceholder: 'e.g. why do stocks fall when interest rates rise?',
        homeIdeaGo: 'Ask the tutor',
        homeContinue: 'Continue learning', homeBackToCourse: 'Back to classroom', homeAllCourses: 'All courses',
        homeIdeaCopied: 'Copied to clipboard — paste it into the chat to start',
        homeLastStudy: 'last study: {d}', homeNone: 'No course in progress',
        feynmanTitle: 'Feynman retelling', feynmanHint: 'Close your notes and explain this concept to a layperson in your own words. Where you stumble is your blind spot.',
        feynmanPlaceholder: 'Explain it in your own words…', feynmanSaved: 'Saved to notes',
        reviewDueLine: '{n} concepts due', reviewNoneLine: 'Nothing due today',
        celebrateCourse: 'All concepts of this course mastered — confetti! 🎉', celebrateNode: 'Section mastered 🎉',
        lockedTip: 'Unlocks after prerequisites', nodeIndex: 'Section {n}',
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
      // NOTE: never append window.location.search here — that string belongs to
      // the DSH web shell (auth/route params), not to this API.
      return fetch(`/dsh-learn-expert/api/${path}`, {
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
      // Colorful horizontal mind-map: course topic as root on the left, one
      // branch per concept node in teaching order. Branch stroke cycles through
      // PALETTE; the end dot carries the node status color. Rendered at natural
      // size (never stretched), so font sizes stay constant.
      const nodes = plan.nodes ?? [];
      // Hooks must run unconditionally: the early return used to sit above
      // useState, so a course whose node list became empty mid-session changed
      // the hook count and React unmounted the whole panel.
      const [focus, setFocus] = useState(null);
      if (!nodes.length) return null;
      const ROW = 66;
      const ROOT_X = 18;
      const LABEL_X = 210;
      const PAD = 20;
      const estW = (s, size) => Math.max(18, Math.round([...s].length * size * 0.92));
      const H = PAD * 2 + nodes.length * ROW;
      const rootY = H / 2;
      const topic = String(plan.topic ?? '');
      const rootTitle = topic.length > 12 ? `${topic.slice(0, 11)}…` : topic;
      const rootW = estW(rootTitle, 13) + 26;
      const dotX = (title) => LABEL_X + 14 + estW(title, 12) + 14;
      const branches = nodes.map((n, i) => {
        const title = n.title.length > 15 ? `${n.title.slice(0, 14)}…` : n.title;
        const desc = String(n.description ?? '').replace(/[\r\n]+/g, ' ').trim();
        return {
          n, i, title,
          desc: desc.length > 22 ? `${desc.slice(0, 21)}…` : desc,
          y: PAD + i * ROW + ROW / 2,
          color: STATUS_COLOR[n.status] ?? TOKEN.idle,
          stroke: PALETTE[i % PALETTE.length],
        };
      });
      const W = Math.max(...branches.map((b) => dotX(b.title)), LABEL_X + 60) + 24;

      const tip = (n) => `${n.title}\n${t(`status_${n.status}`) ?? n.status}` +
        (n.mastery ? `\n${t('dimAccuracy')} ${n.mastery.accuracy ?? '—'} / ${t('dimDepth')} ${n.mastery.depth ?? '—'} / ${t('dimTransfer')} ${n.mastery.transfer ?? '—'} / ${t('dimDiscrimination')} ${n.mastery.discrimination ?? '—'} = ${n.mastery.total ?? '—'}` : '');

      return h('div', { style: { overflowX: 'auto' } },
        h('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, style: { display: 'block', maxWidth: 'none' } },
          // branches
          branches.map((b) => {
            const x1 = ROOT_X + rootW;
            const x2 = dotX(b.title);
            const mx = (x1 + x2) / 2;
            const dim = focus !== null && focus !== b.n.id;
            return h('path', {
              key: `e${b.n.id}`,
              d: `M ${x1} ${rootY} C ${mx} ${rootY}, ${mx} ${b.y}, ${x2} ${b.y}`,
              fill: 'none', stroke: b.stroke, strokeWidth: 1.8,
              opacity: dim ? 0.15 : 0.9,
            });
          }),
          // root node
          h('g', null,
            h('rect', {
              x: ROOT_X, y: rootY - 19, width: rootW, height: 38, rx: 10,
              fill: TOKEN.surface2, stroke: TOKEN.brand, strokeWidth: 1.6,
            }),
            h('circle', { cx: ROOT_X + rootW, cy: rootY, r: 4.5, fill: TOKEN.surface, stroke: TOKEN.brand, strokeWidth: 1.6 }),
            h('text', { x: ROOT_X + 13, y: rootY + 4.5, fontSize: 13, fontWeight: 600, fill: TOKEN.text }, rootTitle),
          ),
          // branch nodes
          branches.map((b) => {
            const dim = focus !== null && focus !== b.n.id;
            return h('g', {
              key: b.n.id,
              opacity: dim ? 0.2 : 1,
              onMouseEnter: () => setFocus(b.n.id),
              onMouseLeave: () => setFocus(null),
              style: { cursor: 'default', transition: 'opacity .15s' },
            },
              h('title', null, tip(b.n)),
              h('circle', { cx: LABEL_X, cy: b.y, r: 5, fill: TOKEN.surface, stroke: b.color, strokeWidth: 1.8 }),
              h('text', { x: LABEL_X + 14, y: b.y + 4, fontSize: 12, fill: TOKEN.text }, b.title),
              b.desc ? h('text', { x: LABEL_X + 14, y: b.y + 19, fontSize: 10, fill: TOKEN.text2 }, b.desc) : null,
              h('circle', { cx: dotX(b.title), cy: b.y, r: 5.5, fill: b.color }),
            );
          }),
        ),
      );
    }

    // ---- activity heatmap ------------------------------------------------------
    function Heatmap({ days, t }) {
      // `date`/`weekday` come from the host, which buckets by the *local*
      // calendar day. Deriving the weekday in the browser from the raw bucket
      // put every column one day off west of UTC.
      const leadBlanks = days.length ? (days[0].weekday ?? 0) : 0;
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
      const weekdayLabels = String(t('wdShort')).split(',');
      return h('div', { style: { display: 'flex', gap: 6 } },
        h('div', {
          style: {
            display: 'grid', gridTemplateRows: 'repeat(7, 12px)', rowGap: 3,
            fontSize: 10, color: TOKEN.text2, marginRight: 2, paddingTop: 1,
          },
        }, [0, 1, 2, 3, 4, 5, 6].map((i) => h('span', { key: i, style: { lineHeight: '12px' } },
          i % 2 === 0 ? (weekdayLabels[i] ?? '') : ''))),
        h('div', {
          style: {
            display: 'grid', gridAutoFlow: 'column', gridTemplateRows: 'repeat(7, 12px)',
            gridTemplateColumns: `repeat(${weeks}, 12px)`, gap: 3,
          },
        }, cells.map((d, i) => h('div', {
          key: i,
          title: d ? t('heatCell', { date: d.date ?? fmtDate(d.day), n: d.count }) : undefined,
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
            style: { display: 'inline-flex', gap: 2, opacity: hover ? 1 : 0.55, flexShrink: 0, transition: 'opacity .15s' },
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
          c.activeNodeTitle ? t('activeNode', { t: c.activeNodeTitle })
            : done ? t('state_COMPLETED')
            : t(`state_${c.state}`),
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
              opacity: hover ? 1 : 0.6, transition: 'opacity .15s',
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
    function NodePane({ course, node, kind, t, onSaved, state, onLoad, onEdit }) {
      const [status, setStatus] = useState(null);
      useEffect(() => {
        if (kind === 'map') return undefined;
        if (state.content !== null) return undefined; // already fetched for this row
        let alive = true;
        const q = `course/note?root=${encodeURIComponent(course.root)}&learnerId=${encodeURIComponent(course.learnerId)}` +
          `&roadmapId=${encodeURIComponent(course.roadmapId)}&nodeId=${encodeURIComponent(node.id)}&kind=${kind === 'scratch' ? 'user' : 'tutor'}`;
        api(q)
          .then((d) => { if (alive) onLoad(d.content ?? ''); })
          .catch(() => { if (alive) onLoad(''); });
        return () => { alive = false; };
      }, [kind, course.key, node.id, state.content]);
      const save = () => {
        setStatus(null);
        api('course/note', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            root: course.root, learnerId: course.learnerId,
            roadmapId: course.roadmapId, nodeId: node.id, content: state.draft ?? '',
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
          // Pass the whole course: DagChart needs `topic` for the root label and
          // used to throw on `plan.topic.length` when only {nodes, dag} was passed.
          h(DagChart, { plan: course, t }),
        );
      }
      if (kind === 'note') {
        return h('div', { style: boxStyle },
          state.content === null ? t('loading')
            : state.content ? h('pre', {
                style: { margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'inherit', color: TOKEN.text },
              }, state.content)
            : h('span', { style: { color: TOKEN.text2 } }, t('noteEmpty')),
        );
      }
      return h('div', { style: boxStyle },
        h('textarea', {
          value: state.draft ?? '', rows: 4, placeholder: t('scratchPlaceholder'),
          onChange: (e) => onEdit(e.target.value),
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

    function NodeRow({ course, node, index, t, onSaved }) {
      const [pane, setPane] = useState(null); // null | 'note' | 'map' | 'scratch'
      // Drafts live here so switching panes no longer throws away unsaved text.
      const [panes, setPanes] = useState({});
      const paneState = panes[pane] ?? { content: null, draft: null };
      const patchPane = (kind, next) => setPanes((all) => ({
        ...all,
        [kind]: { ...(all[kind] ?? { content: null, draft: null }), ...next },
      }));
      const toggle = (kind) => setPane(pane === kind ? null : kind);
      const pill = (kind, label, marked) => h('button', {
        onClick: () => toggle(kind),
        style: {
          cursor: 'pointer', fontSize: 11, padding: '2px 10px', borderRadius: 999,
          border: `1px solid ${pane === kind ? TOKEN.brand : TOKEN.border}`,
          background: pane === kind ? 'color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent)' : 'transparent',
          color: TOKEN.text2,
        },
      }, `${label}${marked ? ' ·' : ''}`);
      // Status badge: mastered = solid green circle with white ✓; active = numbered
      // circle (1-based section index); needs-relearn = warn '!'; locked = gray lock.
      const badge = node.status === 'mastered'
        ? h('span', {
            style: {
              width: 26, height: 26, borderRadius: 13, flexShrink: 0, display: 'inline-flex',
              alignItems: 'center', justifyContent: 'center', fontSize: 14, color: '#fff',
              background: TOKEN.success, boxShadow: '0 1px 4px rgba(0,0,0,.15)',
            },
          }, '✓')
        : node.status === 'active'
          ? h('span', {
              style: {
                width: 26, height: 26, borderRadius: 13, flexShrink: 0, display: 'inline-flex',
                alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600,
                color: TOKEN.brand, border: `2px solid ${TOKEN.brand}`, background: TOKEN.surface,
              },
            }, index + 1)
          : node.status === 'needs-relearn'
            ? h('span', {
                style: {
                  width: 26, height: 26, borderRadius: 13, flexShrink: 0, display: 'inline-flex',
                  alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600,
                  color: '#fff', background: TOKEN.warn,
                },
              }, '!')
            : h('span', {
                title: t('lockedTip'),
                style: {
                  width: 26, height: 26, borderRadius: 13, flexShrink: 0, display: 'inline-flex',
                  alignItems: 'center', justifyContent: 'center', fontSize: 12,
                  color: TOKEN.idle, border: `1px solid ${TOKEN.border}`, background: TOKEN.surface2,
                },
              }, '🔒');
      return h('div', {
        style: {
          background: TOKEN.surface, border: `1px solid ${node.status === 'active' ? TOKEN.brand : TOKEN.border}`,
          borderRadius: 10, padding: '10px 14px',
        },
      },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' } },
          badge,
          h('span', {
            style: {
              flex: 1, minWidth: 120, fontSize: 13, fontWeight: node.status === 'locked' ? 400 : 500,
              color: node.status === 'locked' ? TOKEN.text2 : TOKEN.text,
            },
          }, node.title),
          node.total != null ? h('span', { style: { fontSize: 11, color: TOKEN.text2 } }, t('avgScore', { n: node.total })) : null,
          node.status === 'locked'
            ? null
            : h('span', { style: { display: 'inline-flex', gap: 6 } },
                pill('note', t('nodeNote'), node.hasNote),
                pill('map', t('nodeMap')),
                pill('scratch', t('nodeScratch'), node.hasUserNote),
              ),
        ),
        pane ? h(NodePane, {
          course, node, kind: pane, t, onSaved,
          state: paneState,
          onLoad: (content) => patchPane(pane, { content, draft: content }),
          onEdit: (draft) => patchPane(pane, { draft }),
        }) : null,
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
            [['journey', t('journey')], ['map', t('mapTab')], ['review', t('reviewTab')]].map(([id, label]) => h('button', {
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
        done
          ? h('div', {
              style: {
                position: 'relative', overflow: 'hidden', borderRadius: 10, marginTop: 12,
                padding: '12px 16px', fontSize: 14, fontWeight: 600,
                background: 'linear-gradient(120deg, #3FB27F22, #4C7DF022)',
                border: `1px solid ${TOKEN.success}`, color: TOKEN.text,
              },
            }, h(Confetti, { count: 18 }), t('celebrateCourse'))
          : null,
        tab === 'journey'
          ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 } },
              course.nodes.map((n, i) => h(NodeRow, {
                key: n.id, course, node: n, index: i, t, onSaved: reload,
              })),
            )
          : tab === 'map'
            ? h('div', { style: { marginTop: 16 } },
                h(Card, { style: { overflowX: 'auto' } }, h(DagChart, { plan: course, t })),
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

    /** Jump back to the chat bound to a course; falls back to the current chat. */
    function jumpToSession(navCtx, course) {
      const sid = course?.meta?.sessionId;
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
    }

    /** 课堂 root: course list ↔ course detail. */
    function CoursesPanel({ i18n, navCtx, onReload, openKey, setOpenKey }) {
      const t = useT(i18n);
      const [data, setData] = useState(null);
      const [error, setError] = useState(null);
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
      const ask = (course) => jumpToSession(navCtx, course);

      if (error) return h('div', { style: { marginTop: 20, color: TOKEN.error } }, `${t('loadFailed')}: ${error}`);
      if (!data) return h('div', { style: { marginTop: 20, color: TOKEN.text2 } }, t('loading'));
      return openCourse
        ? h(CourseDetailView, { course: openCourse, t, onBack: () => setOpenKey(null), onAsk: ask, reload: load })
        : h(CourseListView, { courses, t, onOpen: (c) => setOpenKey(c.key), onMutate: mutate, onDelete: remove, onAsk: ask });
    }

    /** 今日 home: greeting + "learn something new" entry + continue-learning card. */
    function HomePanel({ i18n, navCtx, onOpenCourse, onGoCourses }) {
      const t = useT(i18n);
      const [data, setData] = useState(null);
      const [idea, setIdea] = useState('');
      const [copied, setCopied] = useState(false);
      useEffect(() => {
        let alive = true;
        api('courses').then((d) => { if (alive) setData(d); }).catch(() => { if (alive) setData({ courses: [] }); });
        return () => { alive = false; };
      }, []);
      const courses = data?.courses ?? [];
      // courses arrive sorted by updatedAt desc — first unfinished course is "current".
      const current = courses.find((c) => c.nodeCount > 0 && c.masteredCount < c.nodeCount) ?? null;
      const activeNode = current?.activeNode ?? null;
      // `activeNode` is a node object now; match by id (the old code passed the
      // title string to indexOf on the node array and always got -1).
      const activeIdx = current && activeNode
        ? current.nodes.findIndex((n) => n.id === activeNode.id)
        : -1;
      const now = new Date();
      const hr = now.getHours();
      const greet = hr < 11 ? t('greetMorning') : hr < 14 ? t('greetNoon') : hr < 18 ? t('greetAfternoon') : t('greetEvening');
      const dateLine = new Intl.DateTimeFormat(undefined, { month: 'long', day: 'numeric', weekday: 'short' }).format(now);
      // The chat composer cannot be pre-filled from a plugin, so the typed idea
      // is copied to the clipboard before jumping — otherwise it was silently
      // thrown away when the panel closed.
      const goChat = () => {
        const text = idea.trim();
        if (!text) { jumpToSession(navCtx, null); return; }
        try {
          navigator.clipboard?.writeText(text).then(() => setCopied(true)).catch(() => {});
        } catch { /* clipboard blocked */ }
        jumpToSession(navCtx, null);
      };
      useEffect(() => {
        if (!copied) return undefined;
        const id = setTimeout(() => setCopied(false), 6000);
        return () => clearTimeout(id);
      }, [copied]);

      return h('div', { style: { marginTop: 4 } },
        h('div', { style: { fontSize: 12, color: TOKEN.text2 } }, dateLine),
        h('h1', { style: { fontSize: 28, fontWeight: 650, margin: '6px 0 18px' } }, greet),
        // "想弄懂点新东西？" input card
        h('div', {
          style: {
            background: TOKEN.surface, border: `1px solid ${TOKEN.border}`, borderRadius: 14,
            padding: '16px 18px', maxWidth: 720,
          },
        },
          h('div', { style: { fontSize: 15, fontWeight: 600, marginBottom: 10 } }, t('homeIdea')),
          h('div', { style: { display: 'flex', gap: 8, alignItems: 'center' } },
            h('input', {
              value: idea, placeholder: t('homeIdeaPlaceholder'),
              onChange: (e) => setIdea(e.target.value),
              onKeyDown: (e) => { if (e.key === 'Enter') goChat(); },
              style: {
                flex: 1, fontSize: 13, padding: '8px 12px', borderRadius: 999,
                border: `1px solid ${TOKEN.border}`, background: TOKEN.surface2, color: TOKEN.text,
                outline: 'none', fontFamily: 'inherit',
              },
            }),
            h('button', {
              onClick: goChat, title: t('homeIdeaGo'),
              style: {
                cursor: 'pointer', width: 34, height: 34, borderRadius: 17, border: 'none',
                background: TOKEN.brand, color: '#fff', fontSize: 16, flexShrink: 0,
              },
            }, '➤'),
          ),
          copied ? h('div', { style: { fontSize: 11, color: TOKEN.success, marginTop: 8 } }, t('homeIdeaCopied')) : null,
        ),
        // continue-learning card
        current ? h('div', {
          style: {
            background: TOKEN.surface, border: `1px solid ${TOKEN.border}`, borderRadius: 14,
            padding: '18px 20px', maxWidth: 720, marginTop: 16, position: 'relative', overflow: 'hidden',
          },
        },
          h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 } },
            h('span', { style: { fontSize: 13, color: TOKEN.text2 } }, `${t('homeContinue')} · ${current.meta.alias ?? current.topic}`),
            h('button', {
              onClick: onGoCourses,
              style: {
                cursor: 'pointer', fontSize: 12, padding: '4px 12px', borderRadius: 999,
                border: `1px solid ${TOKEN.border}`, background: 'transparent', color: TOKEN.text2,
              },
            }, `${t('homeAllCourses')} ↗`),
          ),
          activeNode ? h('h2', {
            style: { fontSize: 24, fontWeight: 650, margin: '14px 0 8px', lineHeight: 1.25 },
          },
            h('span', { style: { color: '#C98A4B', fontStyle: 'italic', marginRight: 10 } }, String(activeIdx + 1).padStart(2, '0')),
            activeNode.title,
          ) : null,
          activeNode?.description ? h('div', {
            style: {
              fontSize: 13, color: TOKEN.text2, marginBottom: 14,
              borderLeft: `3px solid ${TOKEN.brand}`, paddingLeft: 10,
            },
          }, activeNode.description) : null,
          h(SegmentedProgress, { nodes: current.nodes }),
          h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 12, flexWrap: 'wrap' } },
            h('span', { style: { fontSize: 12, color: TOKEN.text2 } },
              `${t('masteredLine', { m: current.masteredCount, n: current.nodeCount })} · ${t('homeLastStudy', { d: fmtDate(current.updatedAt) })}`),
            h('button', {
              onClick: () => onOpenCourse(current.key),
              style: {
                cursor: 'pointer', fontSize: 13, padding: '8px 22px', borderRadius: 10, border: 'none',
                background: 'linear-gradient(135deg, #4C7DF0, #8E6BD8)', color: '#fff', fontWeight: 600,
                boxShadow: '0 2px 8px rgba(76,125,240,.35)',
              },
            }, `${t('homeBackToCourse')} ›`),
          ),
        )
          : data ? h('div', {
              style: {
                marginTop: 16, padding: 20, borderRadius: 12, textAlign: 'center',
                border: `1px dashed ${TOKEN.border}`, color: TOKEN.text2, maxWidth: 720,
              },
            }, t('homeNone')) : null,
      );
    }

    /** Feynman retelling textarea for one review item; saved as the node's user note. */
    function FeynmanNote({ course, item, t }) {
      const [open, setOpen] = useState(false);
      const [draft, setDraft] = useState(null);
      const [status, setStatus] = useState(null);
      useEffect(() => {
        if (!open) return undefined;
        let alive = true;
        const qs = `root=${encodeURIComponent(course.root)}&learnerId=${encodeURIComponent(course.learnerId)}`
          + `&roadmapId=${encodeURIComponent(course.roadmapId)}&nodeId=${encodeURIComponent(item.nodeId)}&kind=user`;
        // Re-fetch whenever the target changes (the dep list used to be `[open]`
        // only) and drop the result if the component went away meanwhile.
        api(`course/note?${qs}`)
          .then((d) => { if (alive) setDraft(d.content ?? ''); })
          .catch(() => { if (alive) setDraft(''); });
        return () => { alive = false; };
      }, [open, course.root, course.learnerId, course.roadmapId, item.nodeId]);
      const save = () => {
        setStatus(null);
        api('course/note', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            root: course.root, learnerId: course.learnerId, roadmapId: course.roadmapId,
            nodeId: item.nodeId, content: draft ?? '',
          }),
        }).then(() => setStatus('ok')).catch(() => setStatus('fail'));
      };
      return h('div', { style: { marginTop: open ? 8 : 0 } },
        h('button', {
          onClick: () => setOpen(!open),
          style: {
            cursor: 'pointer', fontSize: 12, padding: '3px 12px', borderRadius: 999,
            border: `1px solid ${open ? '#8E6BD8' : TOKEN.border}`,
            background: open ? '#8E6BD81A' : 'transparent', color: open ? '#8E6BD8' : TOKEN.text2,
          },
        }, `🗣 ${t('feynmanTitle')}`),
        open ? h('div', { style: { marginTop: 8 } },
          h('div', { style: { fontSize: 11, color: TOKEN.text2, marginBottom: 6 } }, t('feynmanHint')),
          h('textarea', {
            value: draft ?? '', rows: 3, placeholder: t('feynmanPlaceholder'),
            onChange: (e) => setDraft(e.target.value),
            style: {
              width: '100%', boxSizing: 'border-box', fontSize: 12, padding: 8, borderRadius: 6,
              border: '1px solid #8E6BD866', background: TOKEN.surface, color: TOKEN.text,
              fontFamily: 'inherit', resize: 'vertical',
            },
          }),
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 } },
            h('button', {
              onClick: save,
              style: {
                cursor: 'pointer', fontSize: 12, padding: '4px 14px', borderRadius: 6,
                border: '1px solid #8E6BD8', background: '#8E6BD8', color: '#fff',
              },
            }, t('scratchSave')),
            status === 'ok' ? h('span', { style: { color: TOKEN.success, fontSize: 12 } }, t('feynmanSaved')) : null,
            status === 'fail' ? h('span', { style: { color: TOKEN.error, fontSize: 12 } }, t('scratchFailed')) : null,
          ),
        ) : null,
      );
    }

    /** 复盘 panel: SM-2 due items across all courses + Feynman retelling. */
    function ReviewPanel({ i18n, navCtx, onOpenCourse }) {
      const t = useT(i18n);
      const [data, setData] = useState(null);
      const [error, setError] = useState(null);
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
      const dueItems = [];
      const upcoming = [];
      for (const c of courses) {
        for (const r of c.reviews) {
          if (r.due) dueItems.push({ course: c, item: r });
          else upcoming.push({ course: c, item: r });
        }
      }
      upcoming.sort((a, b) => a.item.nextReviewAt - b.item.nextReviewAt);

      if (error) return h('div', { style: { marginTop: 20, color: TOKEN.error } }, `${t('loadFailed')}: ${error}`);
      if (!data) return h('div', { style: { marginTop: 20, color: TOKEN.text2 } }, t('loading'));

      return h('div', { style: { marginTop: 16 } },
        h('div', {
          style: {
            fontSize: 13, marginBottom: 12, fontWeight: 600,
            color: dueItems.length ? TOKEN.warn : TOKEN.success,
          },
        }, dueItems.length ? t('reviewDueLine', { n: dueItems.length }) : `✓ ${t('reviewNoneLine')}`),
        dueItems.map(({ course, item }) => h('div', {
          key: `${course.key}:${item.nodeId}`,
          style: {
            background: TOKEN.surface, border: `1px solid ${TOKEN.border}`,
            borderLeft: `3px solid ${TOKEN.warn}`, borderRadius: 10, padding: '12px 16px',
            marginBottom: 8, maxWidth: 720,
          },
        },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' } },
            h('span', { style: { flex: 1, minWidth: 140, fontSize: 13, fontWeight: 500 } }, `📅 ${item.title}`),
            h('span', {
              style: { fontSize: 11, color: TOKEN.text2, cursor: 'pointer' },
              onClick: () => onOpenCourse(course.key),
              title: course.topic,
            }, course.meta.alias ?? course.topic),
            h('button', {
              onClick: () => jumpToSession(navCtx, course),
              style: {
                cursor: 'pointer', fontSize: 12, padding: '3px 12px', borderRadius: 999,
                border: `1px solid ${TOKEN.brand}`, background: 'transparent', color: TOKEN.brand,
              },
            }, t('goReview')),
          ),
          h(FeynmanNote, { course, item, t }),
        )),
        dueItems.length === 0 ? h('div', {
          style: {
            padding: 24, borderRadius: 12, textAlign: 'center', color: TOKEN.text2,
            border: `1px dashed ${TOKEN.border}`, maxWidth: 720,
          },
        }, t('reviewAllEmpty')) : null,
        upcoming.length ? h('div', { style: { marginTop: 16, fontSize: 12, color: TOKEN.text2, maxWidth: 720 } },
          upcoming.slice(0, 8).map(({ course, item }) => h('div', { key: `${course.key}:${item.nodeId}`, style: { marginTop: 4 } },
            `· ${item.title}（${course.meta.alias ?? course.topic}）— ${t('reviewNext', { d: fmtDate(item.nextReviewAt) })}`)),
        ) : null,
      );
    }

    /** Plugin main panel: 今日 + 课堂 + 复盘 + 分析 tabs. */
    function LearnPanel({ i18n, navCtx }) {
      const t = useT(i18n);
      const [tab, setTab] = useState('today');
      const [openKey, setOpenKey] = useState(null);
      const [analysisTick, setAnalysisTick] = useState(0);
      const openCourse = (key) => { setOpenKey(key); setTab('courses'); };
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
            [['today', t('tabToday')], ['courses', t('tabCourses')], ['review', t('tabReview')], ['analysis', t('tabAnalysis')]].map(([id, label]) => h('button', {
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
        tab === 'today'
          ? h(HomePanel, { i18n, navCtx, onOpenCourse: openCourse, onGoCourses: () => { setOpenKey(null); setTab('courses'); } })
          : tab === 'courses'
            ? h(CoursesPanel, { i18n, navCtx, onReload: () => setAnalysisTick((n) => n + 1), openKey, setOpenKey })
            : tab === 'review'
              ? h(ReviewPanel, { i18n, navCtx, onOpenCourse: openCourse })
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
            const url = URL.createObjectURL(blob);
            a.href = url;
            a.download = `learn-expert-${id}-${new Date().toISOString().slice(0, 10)}.json`;
            // Detached anchors are ignored by some engines, and revoking the
            // URL right after click() cancels the download.
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
              a.remove();
              URL.revokeObjectURL(url);
            }, 1000);
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
            h(StatCard, { label: t('statPlans'), value: String(allPlans.length), hint: t('statPlansHint'), color: PALETTE[0] }),
            h(StatCard, {
              label: t('statMastered'),
              value: `${allPlans.reduce((s, p) => s + p.masteredCount, 0)}/${allPlans.reduce((s, p) => s + p.nodeCount, 0)}`,
              hint: t('statMasteredHint'), color: PALETTE[2],
            }),
            h(StatCard, { label: t('statAvg'), value: avgAll != null ? String(avgAll) : '—', hint: t('statAvgHint'), color: PALETTE[4] }),
            h(StatCard, {
              label: t('statReview'), value: String(data.review.due),
              hint: t('statReviewHint', { n: data.review.total }),
              color: data.review.due > 0 ? TOKEN.warn : TOKEN.success,
            }),
          ),

          data.quality && (data.quality.avgAttemptsPerNode != null || data.quality.reviewPassRate != null)
            ? h(React.Fragment, null,
                h(SectionTitle, null, `🧪 ${t('qualityTitle')}`),
                h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 12 } },
                  h(StatCard, {
                    label: t('qualityDensity'),
                    value: data.quality.avgAttemptsPerNode != null ? String(data.quality.avgAttemptsPerNode) : '—',
                    hint: t('qualityDensityHint'),
                    color: data.quality.avgAttemptsPerNode != null && data.quality.avgAttemptsPerNode < 2 ? TOKEN.warn : PALETTE[5],
                  }),
                  h(StatCard, {
                    label: t('qualityPass'),
                    value: data.quality.reviewPassRate != null ? `${data.quality.reviewPassRate}%` : '—',
                    hint: t('qualityPassHint', { n: data.quality.reviewedCount }),
                    color: data.quality.reviewPassRate != null && data.quality.reviewPassRate < 70 ? TOKEN.warn : PALETTE[2],
                  }),
                ),
              )
            : null,

          h(SectionTitle, { sub: t('lineSubtitle') }, `📈 ${t('lineTitle')}`),
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
            h(SectionTitle, { sub: t('dagSubtitle') }, `🗺️ ${t('dagTitle')} — ${dagPlan.topic}`),
            h(Card, null, h(DagChart, { plan: dagPlan, t })),
          ) : null,

          h(SectionTitle, { sub: t('heatSubtitle', { n: Math.round(data.heatmap.length / 7) }) }, `🔥 ${t('heatTitle')}`),
          h(Card, { style: { overflowX: 'auto' } }, h(Heatmap, { days: data.heatmap, t })),

          h(SectionTitle, null, `📚 ${t('detailTitle')}`),
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
      // Strengths are edited as free text and only split on save: deriving the
      // input value from the parsed array made every comma disappear instantly.
      const [strengthsText, setStrengthsText] = useState('');

      useEffect(() => {
        let alive = true;
        api('analysis').then((d) => {
          if (!alive) return;
          const ids = (d.learners ?? []).map((l) => l.learnerId);
          setLearners(ids.length ? ids : ['default']);
        }).catch(() => { if (alive) setLearners(['default']); });
        return () => { alive = false; };
      }, []);
      useEffect(() => {
        let alive = true;
        setProfile(null);
        api(`profile?learnerId=${encodeURIComponent(learnerId)}`)
          .then((p) => {
            if (!alive) return;
            setProfile(p);
            setStrengthsText((p.strengths ?? []).join(', '));
          })
          .catch(() => { if (alive) setProfile(null); });
        return () => { alive = false; };
      }, [learnerId]);

      const save = () => {
        if (!profile) return;
        setStatus(null);
        const strengths = strengthsText.split(/[,，、]/).map((s) => s.trim()).filter(Boolean);
        api('profile', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            learnerId,
            background: profile.background,
            strengths,
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
                value: strengthsText, style: inputStyle,
                onChange: (e) => setStrengthsText(e.target.value),
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
      const celebrate = meta.action === 'unlock';
      // A node just unlocked: gradient celebration card with confetti burst.
      if (celebrate) {
        return h('div', {
          style: {
            position: 'relative', overflow: 'hidden', maxWidth: 640, fontSize: 12, color: TOKEN.text,
            padding: '10px 14px', borderRadius: 10,
            border: `1px solid ${TOKEN.success}`,
            background: 'linear-gradient(120deg, rgba(63,178,127,.16), rgba(76,125,240,.14))',
          },
        },
          h(Confetti, { count: meta.courseCompleted ? 22 : 12 }),
          h('div', { style: { display: 'flex', gap: 10, alignItems: 'flex-start' } },
            h('span', { style: { fontSize: 14, lineHeight: '18px' } }, '🎉'),
            h('div', { style: { flex: 1, minWidth: 0 } },
              h('div', { style: { fontWeight: 600, marginBottom: 6 } },
                `${t('celebrateNode')} · ${t('cardMastery')}：${m.total}（${t('cardThreshold', { n: meta.threshold })}）· ${actionText}`),
              h(DimBar, { label: t('dimAccuracy'), value: m.accuracy }),
              h(DimBar, { label: t('dimDepth'), value: m.depth }),
              h(DimBar, { label: t('dimTransfer'), value: m.transfer }),
              h(DimBar, { label: t('dimDiscrimination'), value: m.discrimination }),
              meta.courseCompleted ? h('div', { style: { marginTop: 6, color: TOKEN.success, fontWeight: 600 } }, t('cardCourseDone')) : null,
            ),
          ),
        );
      }
      return h(ToolCardShell, { icon: '📊', title: `${t('cardMastery')}：${m.total}（${t('cardThreshold', { n: meta.threshold })}）· ${actionText}`, tone },
        h(DimBar, { label: t('dimAccuracy'), value: m.accuracy }),
        h(DimBar, { label: t('dimDepth'), value: m.depth }),
        h(DimBar, { label: t('dimTransfer'), value: m.transfer }),
        h(DimBar, { label: t('dimDiscrimination'), value: m.discrimination }),
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

    // ---- error boundary ---------------------------------------------------------
    // Without one, any render-time throw (a malformed course, a bad tool result)
    // unmounted the entire host slot, leaving a blank panel with no way back.
    class ErrorBoundary extends React.Component {
      constructor(props) {
        super(props);
        this.state = { error: null };
      }
      static getDerivedStateFromError(error) {
        return { error };
      }
      componentDidCatch(error, info) {
        try { console.error('[learn-expert] render failed', error, info?.componentStack); } catch { /* ignore */ }
      }
      render() {
        if (!this.state.error) return this.props.children;
        return h('div', {
          style: {
            margin: 12, padding: '12px 14px', borderRadius: 10,
            border: `1px solid ${TOKEN.error ?? '#c0392b'}66`, background: TOKEN.surface,
            color: TOKEN.text, fontSize: 12, maxWidth: 560,
          },
        },
          h('div', { style: { fontWeight: 600, marginBottom: 6 } }, `⚠️ ${this.props.title ?? ''}`),
          h('div', { style: { color: TOKEN.text2, marginBottom: 8, wordBreak: 'break-word' } },
            String(this.state.error?.message ?? this.state.error)),
          h('button', {
            onClick: () => this.setState({ error: null }),
            style: {
              cursor: 'pointer', fontSize: 12, padding: '4px 12px', borderRadius: 6,
              border: `1px solid ${TOKEN.border}`, background: 'transparent', color: TOKEN.text,
            },
          }, this.props.retryLabel ?? '↻'),
        );
      }
    }

    // ---- registration ------------------------------------------------------
    return {
      inject: ['slots'],
      apply(ctx) {
        const i18n = createI18n(ctx.get('locale'));
        // Subscribe to locale changes: the previous version captured i18n.t once,
        // so tool cards kept rendering in the language that was active at load.
        const withT = (Component) => function WithT(props) {
          const t = useT(i18n);
          return h(Component, { ...props, t });
        };

        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist', id: 'dsh-learn-expert', order: 60, label: () => i18n.t('title'),
        }, PanelIcon));

        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main', key: 'dsh-learn-expert',
        }, () => h(ErrorBoundary, { title: i18n.t('crashed'), retryLabel: i18n.t('retry') },
          h(LearnPanel, { i18n, navCtx: ctx }))));

        ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
          name: 'plugins.bundle.config', key: 'dsh-learn-expert',
        }, (props) => (props?.view === 'summary'
          ? h('span', null, i18n.t('profileTitle'))
          : h(ErrorBoundary, { title: i18n.t('crashed'), retryLabel: i18n.t('retry') },
              h(ProfileCard, { i18n })))));

        const wrapCard = (Component) => withT((props) => h(
          ErrorBoundary,
          { title: i18n.t('crashed'), retryLabel: i18n.t('retry') },
          h(Component, props),
        ));
        ctx.slots.inject('tool.call.toolview', () => [
          ctx.slots.register({ name: 'tool.call.toolview', key: 'ai_learn_assess_mastery' }, wrapCard(MasteryCard)),
          ctx.slots.register({ name: 'tool.call.toolview', key: 'ai_learn_create_roadmap' }, wrapCard(RoadmapCard)),
          ctx.slots.register({ name: 'tool.call.toolview', key: 'ai_learn_update_roadmap' }, wrapCard(RoadmapCard)),
          ctx.slots.register({ name: 'tool.call.toolview', key: 'ai_learn_submit_answer' }, wrapCard(AnswerCard)),
          ctx.slots.register({ name: 'tool.call.toolview', key: 'ai_learn_review_due' }, wrapCard(ReviewDueCard)),
        ]);
      },
    };
  },
});
