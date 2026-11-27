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

## 结构

```
index.js                 Host 端：ai_learn_* 工具集、learn-expert 技能、/dsh-learn-expert/api、复习提醒
client.js                Web 端：侧边栏入口 + 分析面板 + 画像卡 + 对话内工具卡片
src/skills/tutor/        教学协议 SKILL.md + prompts/（tutor-system / diagnose / mastery-rubric / socratic）
src/tools/ src/store/    工具定义、学习者注册表、进度/复习/画像存储
src/core/                概念图、DAG 布局、SM-2、章节状态机
src/analysis.js          面板数据聚合
```

License: MIT
