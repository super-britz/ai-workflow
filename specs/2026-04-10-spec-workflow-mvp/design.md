---
name: spec-workflow MVP
status: in-progress (design)
type: meta-workflow
source: 用户需求讨论（brainstorming 阶段）
created: 2026-04-10
---

# spec-workflow MVP - Design

本文档设计一个 **spec-driven workflow 系统**，通过 TG 触发、Claude Code 主线程编排、subagent 封装的方式，把用户需求一次性转换为 `requirements.md + design.md + tasks.md` 三件套，并自动归档到 `specs/` 目录。

> 这是"第一个迭代"的 MVP 设计，对应范围决策 **A 方案**（见下方决策清单）。后续迭代会扩展到 B（task-executor）、C（codex-reviewer + test-runner）。

---

## 范围与决策清单

在进入详细设计前，先列出已经达成一致的关键决策，便于后续章节参照：

| # | 维度 | 决策 |
|---|---|---|
| 1 | 迭代范围 | **A 方案（MVP）**：`spec-writer` + `spec-archiver` + `/start-workflow`，只跑通"需求 → 规范 → 归档" |
| 2 | 需求类型分流 | **Z 方案**：单 `spec-writer` skill 内部按 `type: backend / frontend / fullstack` 分流，使用不同 design 模板和 tasks 排序 |
| 3 | skill 职责划分 | **β 方案**：两个 skill 串联（`spec-writer` 生成，`spec-archiver` 归档），关注点分离 |
| 4 | 分层机制 | **Subagent 封装**：新建 `spec-workflow` subagent，绑定两个底层 skill，主线程 context 只看得到 subagent 入口 |
| 5 | URL 读取位置 | **主线程**（不在 subagent），便于降级时和用户对话式补充 |
| 6 | URL 降级策略 | L1 `Claude_in_Chrome` → L3 用户手动补充（文字或截图）。**去掉 L2 WebFetch**，因为核心场景是内部登录态页面 |
| 7 | 双源融合 | 支持 1 个 PRD URL + 1 个设计稿 URL 的组合。设计稿走 `figma MCP` 或 Stitch |
| 8 | subagent 运行模式 | **D 方案**：前台同步 + 派发前心跳提示 + 事后时间线。不用后台轮询 |
| 9 | 失败策略 | subagent 任何步骤失败 → 立即返回 `FAILED:` + 原因，**不自动重试**，不做部分回滚 |
| 10 | 进度输出 | 主线程每个关键节点即时输出到 TG。subagent 运行期间静默，结束后展示 `PROGRESS:` 轨迹 + 时间线 |

---

## 第 1 节：整体架构 + 文件结构

### 1.1 核心流程图

```
                         TG 消息
                           │
                           ▼
                  /start-workflow <输入>
                           │
      ┌────────────────────┴────────────────────┐
      │           主线程（Opus）                 │
      │                                          │
      │  1. 解析输入类型 (URL / 自然语言 / 混合)  │
      │  2. URL 分类: PRD / 设计稿                │
      │  3. 各源独立读取:                         │
      │     - PRD → Claude_in_Chrome              │
      │     - 设计稿 → figma MCP / Stitch         │
      │  4. 失败 → L3 用户手动补充                │
      │  5. 派发 spec-workflow subagent (前台)    │
      │  6. 接收结果 → 转发 TG                    │
      └────────────────────┬────────────────────┘
                           │
                           ▼
      ┌───────────────────────────────────────┐
      │     spec-workflow subagent            │
      │     （独立 context，绑定 2 个 skill） │
      │                                       │
      │  tools: Read/Write/Edit/Bash/Skill    │
      │         /Glob/Grep                    │
      │                                       │
      │  职责: 编排 spec-writer → spec-archiver│
      │  失败: 立即 FAILED, 不重试             │
      └──────────────────┬────────────────────┘
                         │
          ┌──────────────┴──────────────┐
          ▼                             ▼
    [spec-writer]               [spec-archiver]
      ├─ 分类 type               ├─ _drafts → specs/YYYY-MM-DD-<slug>/
      ├─ 读 .claude 规范         ├─ 写 meta.json
      ├─ 按模板生成三件套        ├─ diff 判断是否更新 .claude
      ├─ 一致性自检              └─ 返回归档路径 + 更新摘要
      └─ 写入 specs/_drafts/<slug>/
```

### 1.2 文件结构

```
.claude/
  commands/
    start-workflow.md        ← slash command prompt (新增)
  agents/
    spec-workflow.md         ← subagent 定义 (新增)
  skills/                    ← 符号链接 → .agents/skills/ (已存在)
  ARCHITECTURE.md            ← 项目架构规范 (新增, bootstrap 阶段创建)
  SECURITY.md                ← 安全规范 (新增)
  CODING_GUIDELINES.md       ← 编码规范 (新增)
  CLAUDE.md                  ← 已存在（Ultracite 规范）
  settings.json              ← 已存在

.agents/
  skills/
    spec-writer/             ← 新增
      SKILL.md               ← user-invocable: false
      templates/
        requirements.md      ← 通用需求模板
        backend.md           ← design.md 后端章节模板
        frontend.md          ← design.md 前端章节模板
        fullstack.md         ← design.md 全栈章节模板
        tasks.md             ← 通用任务模板
    spec-archiver/           ← 新增
      SKILL.md               ← user-invocable: false

specs/                       ← 归档根目录 (新增)
  README.md                  ← 命名规则 + 归档格式说明
  _drafts/                   ← spec-writer 临时输出区
    <slug>/
      requirements.md
      design.md
      tasks.md
  2026-04-10-user-profile/   ← spec-archiver 归档后的示例
    requirements.md
    design.md
    tasks.md
    meta.json                ← type / source / 时间戳 / .claude 更新摘要
```

**为什么分 `_drafts/` 和正式目录两阶段**：

1. **原子性**：spec-writer 生成失败（比如一致性自检没过）时，`_drafts/` 里的半成品不会污染正式的 `specs/`
2. **职责隔离**：spec-writer 只管"生成"，不需要知道命名约定和归档元数据格式；spec-archiver 独占"归档决策"
3. **可检查**：如果 spec-archiver 失败，`_drafts/` 里的内容还在，方便 debug 和手动补救

### 1.3 组件清单

| 组件 | 层级 | 数量 | 状态 |
|---|---|---|---|
| Slash command | `.claude/commands/` | 1 | ✅ 新增 `start-workflow.md` |
| Subagent | `.claude/agents/` | 1 | ✅ 新增 `spec-workflow.md` |
| Skills | `.agents/skills/` | 2 | ✅ 新增 `spec-writer` + `spec-archiver` |
| 规范文件 | `.claude/` | 3 | ✅ 新增 ARCHITECTURE / SECURITY / CODING_GUIDELINES |
| 归档目录 | `specs/` | 1 | ✅ 新增根目录 + `_drafts/` + `README.md` |

### 1.4 数据流一句话总结

> **主线程**负责 "输入 → 纯文本" + "结果 → TG"，**subagent** 负责 "纯文本 → 三件套 → 归档"，两者通过 Agent 工具的标准 prompt/return 机制通信，底层 skill 对主线程 context 完全透明。

---

<!-- §2 / §3 将在后续 commit 中追加 -->
