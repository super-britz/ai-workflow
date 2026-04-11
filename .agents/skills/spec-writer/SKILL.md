---
name: spec-writer
description: 把结构化需求输入（PRD + 设计稿 + 用户补充）转换为 specs/_drafts/<slug>/ 下的三件套（requirements/design/tasks），按 backend/frontend/fullstack 选模板。只被 spec-workflow subagent invoke，不主动激活。
user-invocable: false
---

# spec-writer

你是 spec-driven workflow 的"大脑"。被 `spec-workflow` subagent 通过 Skill 工具调用，**不主动激活**，**不直接面向用户**。

## 输入契约

调用方传入一个固定 5 段格式的 prompt：

1. `## 需求来源` — `source_type` / `prd_url` / `design_url` / `design_tool` / `user_type`
2. `## PRD 内容` — 纯文本（可能为空 N/A）
3. `## 设计稿上下文` — 纯文本或结构化描述（可能为空 N/A）
4. `## 用户补充` — 可选文字
5. `## 你的任务` — 固定行为说明

## 执行流程

整个 skill 严格按以下 6 个 Stage 顺序执行。每个 Stage 开始前必须**单独输出一行** `PROGRESS: <描述>`。

### Stage 1: 解析输入 + 分类 type

- 解析 `## 需求来源` 段，提取 `source_type` / `prd_url` / `design_url` / `design_tool` / `user_type`
- 执行 type 分类（**按顺序匹配第一个命中的规则**）：

  **规则 0（最高优先级）**：如果 `user_type` 不为 `N/A`（用户在 /start-workflow 用 `type=` 显式指定）
    → 直接使用 `user_type`，**跳过下面所有自动判断**
    → 输出：`PROGRESS: type = <user_type> (user-specified)`

  **规则 1**：如果 `design_url` 不为 `N/A`（含 figma / stitch / figjam 等）
    → 必然涉及前端
    → 如果 PRD 内容里提到 数据库 / API / 认证 / 后端服务 → `type = fullstack`
    → 否则 → `type = frontend`

  **规则 2**：如果 PRD 内容里包含关键词
    `["API", "endpoint", "database", "schema", "迁移", "认证", "授权", "后端", "服务", "queue", "cron", "webhook"]`
    且不包含 `["页面", "组件", "UI", "样式", "响应式", "按钮"]`
    → `type = backend`

  **规则 3**：如果 PRD 内容里包含关键词
    `["页面", "组件", "UI", "样式", "响应式", "交互", "表单", "按钮", "弹窗", "路由"]`
    且不包含 `["API", "endpoint", "database"]`
    → `type = frontend`

  **规则 4（兜底）**：上述都没命中或混合
    → `type = fullstack`（**永远不要兜底成 backend 或 frontend，避免丢失信息**）

- 记录 `type_classification` 字段：用户指定时填 `user-specified`，自动判断时填 `auto`

### Stage 2: 生成 slug

- 输出：`PROGRESS: 生成 slug`
- 从需求标题（PRD 第一行 / 自然语言首句 / 设计稿标题）推导 slug：
  1. 移除标点和特殊符号（保留中英文、数字、空格、连字符）
  2. 中文字符**保留原样**
  3. 英文字母**统一转小写**
  4. 空格统一为 `-`
  5. 连续的 `-` 合并为一个
  6. 首尾的 `-` 去掉
  7. 长度 ≤ 40 个 Unicode 字符
  8. 如果最终为空 → `ticket-<HHMMSS>`（HHMMSS 取主机当前时间）
- **冲突检查**：Glob 检查 `specs/_drafts/<slug>/` 是否存在，存在则追加 `-2` / `-3` 直到空位

### Stage 3: 读 .claude 规范文件

- 输出：`PROGRESS: 读取 .claude/ARCHITECTURE.md`
- Read：`.claude/ARCHITECTURE.md`
- 输出：`PROGRESS: 读取 .claude/SECURITY.md`
- Read：`.claude/SECURITY.md`
- 输出：`PROGRESS: 读取 .claude/CODING_GUIDELINES.md`
- Read：`.claude/CODING_GUIDELINES.md`
- **三份必须齐全**。任一缺失或读取错误 → 立即返回：

  ```json
  {
    "status": "failed",
    "stage": "stage-3-read-norms",
    "reason": "未找到 .claude/<filename>。请先运行 /bootstrap-claude-docs 创建规范文件模板，然后填充内容。",
    "partial_files": []
  }
  ```

- 把三份内容拼接成 `project_norms` 变量，供 Stage 4 使用

### Stage 4: 按 type 选模板生成三件套

**采用 α 方案：在同一回答里按顺序发出 3 个 Write tool call**（一次大调用，三件套强关联生成，不要拆成 3 次独立调用）。

- 输出：`PROGRESS: 加载模板 (type=<type>)`
- Read 3 个模板：
  - `.agents/skills/spec-writer/templates/requirements.md`
  - `.agents/skills/spec-writer/templates/design-<type>.md`（type 是 backend/frontend/fullstack 之一）
  - `.agents/skills/spec-writer/templates/tasks.md`
- 构造完整生成上下文：`project_norms` + `input_summary`（PRD + 设计稿 + 用户补充） + `type` + `slug`
- **在同一回答内按顺序写 3 个文件**（顺序很重要：requirements → design → tasks，因为 design 引用 requirements，tasks 引用 design）：

  ```
  PROGRESS: 生成 requirements.md
  Write: specs/_drafts/<slug>/requirements.md
  PROGRESS: 生成 design.md
  Write: specs/_drafts/<slug>/design.md
  PROGRESS: 生成 tasks.md
  Write: specs/_drafts/<slug>/tasks.md
  ```

- **requirements.md 必须含 frontmatter**，包含字段：`name`, `type`, `priority` (默认 P1), `source`, `created`
- **design.md 必须保留 3 个强制章节标题**：`## 架构变更` / `## 安全考虑` / `## 编码约定变更`（无变更时写"无"，否则写 diff-friendly 段落）
- **任务顺序按 type 不同**：
  - backend: 模型 → migration → API → 业务逻辑 → 测试
  - frontend: 页面骨架 → 组件 → 数据接入 → 交互 → a11y → 测试
  - fullstack: Backend 全部完成 → Frontend

### Stage 5: 一致性自检

- 输出：`PROGRESS: 三件套一致性自检`
- Read `.agents/skills/spec-writer/checklists/consistency-check.md`
- 对照 checklist 逐项判断 _drafts 里 3 个文件
- **全部通过** → 输出 `PROGRESS: 一致性自检通过`，`retry_count = 0`，进入 Stage 6
- **有违反**：
  - 输出 `PROGRESS: 自检发现 N 项违反，尝试 1 次修复`
  - **最多 1 次修复**：只重写违反项对应的那一个文件，不重跑整个 Stage 4
  - 修复完跑第二次自检
  - 仍有违反 → 立即返回：

    ```json
    {
      "status": "failed",
      "stage": "stage-5-consistency-check",
      "reason": "consistency check failed after 1 retry, violations: [...]",
      "partial_files": ["specs/_drafts/<slug>/requirements.md", "..."]
    }
    ```

- 记录 `retry_count`：未触发修复填 `0`，触发并修复成功填 `1`

### Stage 6: 返回结构化结果

- 输出：`PROGRESS: 返回结果`
- 返回结构（参考 §返回值契约）

## PROGRESS 输出约定

- 每个 Stage 开始前**必须**单独输出一行 `PROGRESS: <描述>`
- 中间步骤可输出更细的 `PROGRESS:` 行（如 Stage 4 内的"生成 requirements.md"）
- `PROGRESS:` 行**不要**使用 markdown 语法
- 不要把 `PROGRESS:` 和实际生成的文件内容混在同一个 Write tool call 里

## 失败约定

- **任何 Stage 失败立即返回结构化错误**，不尝试 fallback
- **唯一例外**：Stage 5 自检允许 1 次修复（见 Stage 5 节）
- 失败返回结构：`{status: "failed", stage, reason, partial_files: [...]}`

## 返回值契约

**成功**：

```json
{
  "status": "success",
  "slug": "user-profile-page",
  "type": "fullstack",
  "drafts_path": "specs/_drafts/user-profile-page/",
  "files": [
    "specs/_drafts/user-profile-page/requirements.md",
    "specs/_drafts/user-profile-page/design.md",
    "specs/_drafts/user-profile-page/tasks.md"
  ],
  "source_meta": {
    "source_type": "prd_and_design",
    "prd_url": "https://...",
    "design_url": "https://...",
    "design_tool": "figma",
    "user_type_specified": null,
    "prd_fetched_at": "2026-04-10T14:23:10Z"
  },
  "type_classification": "auto",
  "consistency_check": "passed",
  "retry_count": 0
}
```

`type_classification` 取值：`user-specified` 或 `auto`。
`user_type_specified` 仅在用户用 `type=` 显式指定时填对应值，否则 `null`。
`retry_count` 取值：`0` 或 `1`。

**失败**：

```json
{
  "status": "failed",
  "stage": "<stage-N-description>",
  "reason": "<人类可读的原因 + 可执行的修复建议>",
  "partial_files": ["<已写入但因失败留在 _drafts 的文件路径>"]
}
```

## 禁止行为

- 不读 URL，不联网
- 不修改 `_drafts/<slug>/` 之外的项目代码
- 不 `git add` / `git commit`
- 不调用 Agent 工具（不嵌套派发 subagent）
- 不调用其它 skill
- **不擅自创建** `.claude/` 下的规范文件（缺失 → FAILED，让用户用 `/bootstrap-claude-docs`）
