# dsh-learn-expert · 学习专家（AI 私教）

一个跑在 DeepSeek Harness 里的 1v1 AI 私教插件。说出想学什么，或丢进来一份资料（书、讲义、视频、代码仓库），它就开讲；像真人老师一样一节一节带你走，随时打断提问，直到你真懂。

## 它能做什么

- **备课与摸底**：给资料先读完再讲，没资料先调研；开讲前用几个问题（选项卡）摸清背景、基础与目标。
- **章节路线图**：根据摸底结果生成章节式学习路线图，已会的跳过，讲解中暴露新盲区会动态补节点。
- **逐节教学**：每次回复 = 讲解一小段 + 一个问题（考验刚讲的内容，或顺势引入新知识点）；答错不直给答案，换角度重讲，掌握了才往下走。
- **节末确认**：一节讲完、确认无疑问后给出本节核心总结卡片，并在同一轮对话里自然衔接下一节。
- **易错点记录**：自动沉淀学习者反复出错与易混淆的知识点，后续讲解与出题针对性覆盖。
- **笔记与召回**：每节学完自动整理一页笔记（优先用学习者自己的话）；按遗忘曲线（SM-2）在合适时机叫你回来复习，以主动回忆为主。
- **分析面板（左侧边栏入口）**：掌握进度折线图、路线图结构图（DAG）、学习热力图、教学质量指标（每节点作答轮数、复习通过率）、多学习者切换与数据导出。
- **今日首页**：按时间问候 +「想弄懂点新东西？」输入入口 +「继续学习」卡片（当前课程的分段进度、正在学的章节、上次学习时间），一键回到课堂。
- **复盘面板**：跨课程汇总 SM-2 到期复习项；每个到期知识点支持**费曼复述**（用自己的话讲一遍，存为该节点的手记），也可一键跳回对应会话复习。
- **课堂（左侧边栏入口）**：课程列表总览——每门课程一张卡片（分段进度条、掌握/重学/复习计数），支持收藏、状态筛选（全部/收藏/在学/待复习/已学完/书房）、搜索；卡片悬停出现「随手问」（跳回该课程的教学会话）与「⋯」菜单（重命名 / 移动到分组 / 锁定 / 删除）。点开课程进入仪表盘：「学习旅程」按节点展示掌握状态（已掌握=绿色对号、当前节=序号、未解锁=锁），并可在每个节点下展开**笔记**（老师整理的结课笔记）、**导图**（该课程的知识结构图）、**手记**（你自己的随堂笔记，可保存）；「复习巩固」列出到期与即将到期的复习项。全部节点掌握时显示撒花庆祝横幅。
- **对话内庆祝卡片**：节点评分解锁时，工具卡片变成彩色渐变卡并撒花祝贺；课程全部掌握时撒花加倍。
- **插件详情页画像卡**：查看/编辑学习者画像（背景、强项、易错点计数、讲解与节奏偏好）。

## 使用方式

1. 安装并启用本 bundle（见下）。
2. 打开任意会话，对它说「我想学 ……」，或直接输入 `/learn-expert` 唤起教学技能。
3. 左侧边栏点「学习分析」图标查看学习面板。

## 安装（开发期）

在 DSH 会话中执行：

```
plugin_manager install_bundle → target: <本仓库目录绝对路径>
```

然后到「插件」页启用 `dsh-learn-expert`。安装后如同时启用了旧的 `@local/dsh-learn`，请停用旧 bundle（两者注册同名 `ai_learn_*` 工具与 `dsh-learn` 技能，会冲突）。

## 数据沉淀

学习数据按学习者沉淀在**当前工作区**的 `dsh-learn/` 目录（JSON + Markdown，可直接查看）：

```
<工作区>/dsh-learn/
├── learn-<learnerId>/{profile.json, review-queue.json, roadmaps/, diagnoses/, notes/}
└── exports/        # ai_learn_export 导出的 .dsh-learn.json 包（可 ai_learn_import 迁移）
```

无工作区时回退到 `$DSH_HOME/dsh-learn`（可在 `cordis.patch.yml` 的 config.dataDir 覆盖）。

## 配置（cordis.patch.yml 的 config）

| 键 | 默认 | 说明 |
| --- | --- | --- |
| `dataDir` | `$DSH_HOME/dsh-learn` | 无工作区时的回退存储根 |
| `masteryThreshold` | `80` | 四维掌握度解锁阈值 |
| `masteryWeights` | 等权 | `{ accuracy, depth, transfer, discrimination }` |
| `reviewReminder` | `recent` | 到期复习提醒对象：`recent` / `all` / `off` |

## 健壮性与安全（v1.2.1）

一轮完整代码审查后的修复，全部有回归探针覆盖（`node .probe/verify.mjs`）：

| 问题 | 修法 |
| --- | --- |
| `/course/note`、`/course/delete` 用未校验的 `roadmapId`/`nodeId` 拼路径，`../..` 可删任意目录 | `src/store/paths.js`：`assertSafeId` + `safeJoin`（解析后必须落在根目录内），越界返回 400 |
| 插件 API 绕过 DSH 鉴权，任意网页可写本地数据 | 拒绝跨站 `Origin`/`sec-fetch-site`（403）；POST 必须 `application/json`（415）；请求体上限 1 MiB（413） |
| 冷启动时 `ctx.get('webServer')` 为空 → 路由根本不注册（面板全空） | 懒挂载 + 60s 内重试；同理 `workingDirectory` 改为每次调用惰性解析，不再冻结成 fallback 根 |
| 一个损坏的 JSON 让 `/analysis`、`/courses` 全部 500 | 读失败即把文件隔离为 `*.corrupt-<ts>` 并返回默认值；写入改为 tmp + fsync + rename 原子替换 |
| `passed: Boolean("false")` 把答错记成通过 | 严格布尔转换，非 `true/false` 直接报错 |
| 锁定节点也能被直接判"已掌握"、跳序解锁 | `applyMastery` 校验 locked/当前节点/前置；`advance` 按 `prerequisites` 选下一个可学节点 |
| 并发写同一文件互相覆盖 | 新增 `src/store/lock.js`：按数据目录串行化所有 read-modify-write |
| 复习项同名节点跨课程改错、字符串 `now` 让 SM-2 永不到期 | `reviewQueue.update` 要求 `roadmapId` 消歧；`toTimestamp` 统一数值化 |
| 导图白屏（`plan.topic` 缺失）、`activeNode` 字符串/对象混用、hooks 顺序崩溃 | 传完整 `course`、后端同时给 `activeNode` 对象与 `activeNodeTitle`、hooks 前置；新增 ErrorBoundary 兜住渲染异常 |
| 画像「擅长」输入被逗号吞掉、切学习者串数据、导出下载被取消 | 独立文本态 + `alive` 守卫 + 导出挂 DOM 后再 revoke |
| 热力图跨时区错列、星期标签写死中文 | 后端给 `date`/`weekday`，前端 i18n 标签 |
| 已掌握节点可被一次误评分静默降级；两次答错后课程永远卡在 `REMEDIATING` | `applyMastery` 拒绝重评已掌握节点（改走复习失败标记）；答对即把 `REMEDIATING` 拉回 `TEACHING` |
| 同一 slug 规则写了两份（学习者 id / 课程 id），改动易走样；60s 轮询在三个面板各抄一遍 | 新增 `src/store/slug.js` 统一规则；前端抽出 `useLoadPoll` |

## 全景导图布局（v1.2.2）

路线图不是自动排版的 DAG，而是一张**横向思维导图**：课程主题在左，概念节点按教学顺序自上而下排成一列。
早期版本用「字数 × 字号」估算文字宽度，导致三个可见故障——曲线从根节点一点扇出、横穿整片标题；根方框压在中间几行字上；行末状态圆点落进更长的副标题里。

现在布局有三条硬约束（写在 `client.js` 的 `DagChart` 注释里）：

1. 根节点与文字列之间是一段保留的 `GUTTER`，贝塞尔曲线的两个控制点都被限制在它内部，曲线水平离开根、水平进入标签；
2. 每行固定行高（标题 + 副标题两行），文字用 canvas `measureText` 按**真实字宽**测量后加省略号，既不越右缘也不会侵入相邻行；
3. 状态只由左侧圆环颜色表达，不再画行末圆点。

`.probe/render-dag.mjs` 会把真实的 `DagChart` 抽出来在浏览器里跑一遍（同样的 canvas 测量路径），输出几何审计：`maxTextRight ≤ viewBox 宽`、相邻行零重叠。

## 结构

```
index.js                 Host 端：ai_learn_* 工具集、learn-expert 技能、/dsh-learn-expert/api、复习提醒
                         （含课堂接口：/courses、/course/meta、/course/note、/course/delete；课程元数据存 course-meta.json）
client.js                Web 端：侧边栏入口 + 课堂（课程列表/仪表盘）+ 分析面板 + 画像卡 + 对话内工具卡片
src/skills/tutor/        教学协议 SKILL.md + prompts/（tutor-system / diagnose / mastery-rubric / socratic）
src/tools/ src/store/    工具定义、学习者注册表、进度/复习/画像存储
src/core/                概念图、DAG 布局、SM-2、章节状态机
src/analysis.js          面板数据聚合
```

License: MIT
