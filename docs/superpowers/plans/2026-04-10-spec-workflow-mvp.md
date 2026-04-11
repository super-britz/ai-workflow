# spec-workflow MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在本仓库落地 spec-driven workflow MVP — 一个 `/start-workflow` slash command 串起 `spec-workflow` subagent，由 `spec-writer` 把需求转成三件套（requirements/design/tasks）写入 `specs/_drafts/`，再由 `spec-archiver` 归档到 `specs/YYYY-MM-DD-<slug>/` 并维护 `.claude/` 规范文件；同时提供 `/bootstrap-claude-docs` 命令在缺失规范时一键骨架化。

**Architecture:** 这个 MVP 没有任何 application code — 所有 artifact 都是 **Claude Code 配置文件**（slash command markdown / subagent markdown / SKILL.md / 模板 markdown）。因为没有可执行业务代码，TDD 的"测试"形态是 **bun:test 的静态结构校验**：用 `Bun.file()` 读 markdown，校验 frontmatter 字段、required 章节标题、占位符约定。每个文件都先写一个失败的 bun:test，再写文件让它通过。最终 Stage 8 做端到端 smoke test 验证真实 Claude Code 行为。

**Tech Stack:** bun 1.3.11（已是 packageManager）；TypeScript（已配置）；bun:test 内建测试运行器；Biome/Ultracite（项目已强制 lint，所有 .ts 测试都要过 `bun x ultracite check`）。**没有任何新的 npm 依赖**。

**Source spec:** `specs/2026-04-10-spec-workflow-mvp/design.md` — 全部决策已锁定，本计划严格按 design.md §1-§10 执行。

---

## File Structure

本 plan 涉及的全部新增/修改文件，按归属分组：

### 测试基础设施（新增）

```
tests/
  spec-workflow/
    _helpers.ts                    # parseMarkdown(path) 工具函数
    _helpers.test.ts               # 工具函数自身的 smoke test
    bootstrap.test.ts              # /bootstrap-claude-docs 命令 + 3 个模板的结构校验
    spec-writer-templates.test.ts  # 5 个 spec-writer 模板 + checklist 的结构校验
    spec-writer-skill.test.ts      # spec-writer SKILL.md 的结构校验
    spec-archiver-skill.test.ts    # spec-archiver SKILL.md 的结构校验
    spec-workflow-agent.test.ts    # spec-workflow subagent 的结构校验
    start-workflow-command.test.ts # /start-workflow 命令的结构校验
    specs-scaffold.test.ts         # specs/README.md + specs/_drafts/.gitkeep 校验
```

### `/bootstrap-claude-docs` 相关（新增）

```
.claude/
  commands/
    bootstrap-claude-docs.md       # slash command 主体（frontmatter + body）
.agents/skills/
  bootstrap-claude-docs/
    templates/
      ARCHITECTURE.md              # 项目架构骨架（design.md §7.4.1）
      SECURITY.md                  # 安全规范骨架（design.md §7.4.2）
      CODING_GUIDELINES.md         # 编码约定骨架（design.md §7.4.3）
```

注：bootstrap-claude-docs 不是真正的 Claude Code skill（没有 SKILL.md），templates 目录只借用 `.agents/skills/` 的组织习惯，不需要 `.claude/skills/bootstrap-claude-docs` 符号链接。slash command body 用 Read 工具按相对路径加载模板。

### `spec-writer` skill（新增）

```
.agents/skills/spec-writer/
  SKILL.md                         # 主指令（user-invocable: false）
  templates/
    requirements.md                # 通用需求模板（design.md §6.2）
    tasks.md                       # 通用任务模板（design.md §6.3）
    design-backend.md              # backend design 模板（design.md §6.4）
    design-frontend.md             # frontend design 模板（design.md §6.5）
    design-fullstack.md            # fullstack design 模板（design.md §6.6）
  checklists/
    consistency-check.md           # Stage 5 自检 checklist（design.md §4.7）
.claude/skills/
  spec-writer                      # 符号链接 → ../../.agents/skills/spec-writer
```

### `spec-archiver` skill（新增）

```
.agents/skills/spec-archiver/
  SKILL.md                         # 主指令（user-invocable: false）
.claude/skills/
  spec-archiver                    # 符号链接 → ../../.agents/skills/spec-archiver
```

### subagent 与主线程入口（新增）

```
.claude/
  agents/
    spec-workflow.md               # subagent 定义（绑定 spec-writer + spec-archiver）
  commands/
    start-workflow.md              # slash command（主线程入口，含工具白名单）
```

### 归档目录骨架（新增）

```
specs/
  README.md                        # 命名约定 + meta.json 字段说明
  _drafts/
    .gitkeep                       # 占位空目录
```

### 项目根（修改）

```
package.json                       # 新增 "test:specs" 脚本
```

---

## Stage 0: 测试基础设施

**Stage 目标**：搭建一个最小、可复用的 markdown 校验工具，让后续 7 个 stage 的 TDD 都跑在它上面。完成后 `bun test tests/spec-workflow/_helpers.test.ts` 必须绿。

### Task 0.1: 创建 parseMarkdown 工具函数

**Files:**
- Create: `tests/spec-workflow/_helpers.ts`

- [ ] **Step 1: 创建 helper 文件**

```ts
import { existsSync, readFileSync } from "node:fs";

export interface ParsedMarkdown {
  exists: boolean;
  content: string;
  frontmatter: string | null;
  body: string;
  headings: string[];
}

const FRONTMATTER_REGEX = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
const HEADING_REGEX = /^#{1,6}\s+.+$/gm;

export function parseMarkdown(path: string): ParsedMarkdown {
  if (!existsSync(path)) {
    return {
      exists: false,
      content: "",
      frontmatter: null,
      body: "",
      headings: [],
    };
  }
  const content = readFileSync(path, "utf8");
  const fmMatch = content.match(FRONTMATTER_REGEX);
  const frontmatter = fmMatch ? fmMatch[1] : null;
  const body = fmMatch ? fmMatch[2] : content;
  const headings = body.match(HEADING_REGEX) ?? [];
  return {
    exists: true,
    content,
    frontmatter,
    body,
    headings: headings.map((h) => h.trim()),
  };
}

export function frontmatterField(
  parsed: ParsedMarkdown,
  field: string
): string | null {
  if (!parsed.frontmatter) {
    return null;
  }
  const lineRegex = new RegExp(`^${field}:\\s*(.+)$`, "m");
  const match = parsed.frontmatter.match(lineRegex);
  return match ? match[1].trim() : null;
}
```

- [ ] **Step 2: 验证 lint 通过**

Run: `bun x ultracite check tests/spec-workflow/_helpers.ts`
Expected: PASS（无错误，无 warning）。如果有 warning 先 `bun x ultracite fix` 修，再确认 check 通过。

- [ ] **Step 3: Commit**

```bash
git add tests/spec-workflow/_helpers.ts
git commit -m "test(spec-workflow): 新增 parseMarkdown 工具函数"
```

### Task 0.2: 给 helper 写 smoke test

**Files:**
- Create: `tests/spec-workflow/_helpers.test.ts`

- [ ] **Step 1: 写测试**

```ts
import { test, expect } from "bun:test";
import { parseMarkdown, frontmatterField } from "./_helpers";

test("parseMarkdown 对不存在的文件返回 exists=false", () => {
  const result = parseMarkdown("tests/spec-workflow/__nope__.md");
  expect(result.exists).toBe(false);
  expect(result.headings).toEqual([]);
});

test("parseMarkdown 解析现有 design.md", () => {
  const result = parseMarkdown(
    "specs/2026-04-10-spec-workflow-mvp/design.md"
  );
  expect(result.exists).toBe(true);
  expect(result.frontmatter).not.toBeNull();
  expect(result.headings.length).toBeGreaterThan(20);
});

test("frontmatterField 提取 design.md 的 type 字段", () => {
  const result = parseMarkdown(
    "specs/2026-04-10-spec-workflow-mvp/design.md"
  );
  expect(frontmatterField(result, "type")).toBe("meta-workflow");
});
```

- [ ] **Step 2: 跑测试，期望全绿**

Run: `bun test tests/spec-workflow/_helpers.test.ts`
Expected: 3 passed, 0 failed.

- [ ] **Step 3: Lint**

Run: `bun x ultracite check tests/spec-workflow/_helpers.test.ts`
Expected: PASS。

- [ ] **Step 4: Commit**

```bash
git add tests/spec-workflow/_helpers.test.ts
git commit -m "test(spec-workflow): 新增 parseMarkdown smoke test"
```

### Task 0.3: 在 package.json 注册 test:specs 脚本

**Files:**
- Modify: `package.json` (`scripts` 段)

- [ ] **Step 1: 读取 package.json 当前 scripts**

Run: `bun pm view package.json` 或直接 Read。

- [ ] **Step 2: 在 scripts 加一行**

把 `package.json` 的 `scripts` 段从：

```json
"scripts": {
  "dev": "turbo dev",
  "build": "turbo build",
  "check-types": "turbo check-types",
  "dev:web": "turbo -F web dev",
  "dev:server": "turbo -F server dev",
  "db:push": "turbo -F @ai-workflow/db db:push",
  "db:studio": "turbo -F @ai-workflow/db db:studio",
  "db:generate": "turbo -F @ai-workflow/db db:generate",
  "db:migrate": "turbo -F @ai-workflow/db db:migrate",
  "deploy": "turbo -F @ai-workflow/infra deploy",
  "destroy": "turbo -F @ai-workflow/infra destroy",
  "check": "ultracite check",
  "fix": "ultracite fix"
}
```

改为追加 `test:specs`：

```json
"scripts": {
  "dev": "turbo dev",
  "build": "turbo build",
  "check-types": "turbo check-types",
  "dev:web": "turbo -F web dev",
  "dev:server": "turbo -F server dev",
  "db:push": "turbo -F @ai-workflow/db db:push",
  "db:studio": "turbo -F @ai-workflow/db db:studio",
  "db:generate": "turbo -F @ai-workflow/db db:generate",
  "db:migrate": "turbo -F @ai-workflow/db db:migrate",
  "deploy": "turbo -F @ai-workflow/infra deploy",
  "destroy": "turbo -F @ai-workflow/infra destroy",
  "check": "ultracite check",
  "fix": "ultracite fix",
  "test:specs": "bun test tests/spec-workflow/"
}
```

- [ ] **Step 3: 验证脚本可用**

Run: `bun run test:specs`
Expected: 上一个 task 的 3 条 test 全绿（因为只有 _helpers.test.ts 存在）。

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "chore: \u65b0\u589e test:specs \u811a\u672c\u8dd1 spec-workflow \u9759\u6001\u6d4b\u8bd5"
```

---

## Stage 1: /bootstrap-claude-docs 命令 + 3 份骨架模板

**Stage 目标**：实现 design.md §7 的全部内容 — 一个 slash command + 3 个 .claude 骨架模板。完成后用户可以 `/bootstrap-claude-docs` 一键创建 `.claude/ARCHITECTURE.md` / `SECURITY.md` / `CODING_GUIDELINES.md`。

**TDD 模式说明**：本 stage 用一个共享测试文件 `bootstrap.test.ts`，每个 task 添加一个 `test()` 块 + 对应 artifact 文件。每个任务 5 步：写测试 → 跑测试 → 创建文件 → 跑测试通过 → commit。

### Task 1.1: ARCHITECTURE.md 骨架模板

**Files:**
- Create: `tests/spec-workflow/bootstrap.test.ts`
- Create: `.agents/skills/bootstrap-claude-docs/templates/ARCHITECTURE.md`

- [ ] **Step 1: 写失败测试**

创建 `tests/spec-workflow/bootstrap.test.ts`：

```ts
import { test, expect } from "bun:test";
import { parseMarkdown } from "./_helpers";

const ARCHITECTURE_TEMPLATE =
  ".agents/skills/bootstrap-claude-docs/templates/ARCHITECTURE.md";

test("bootstrap: ARCHITECTURE 模板存在且包含必需骨架章节", () => {
  const md = parseMarkdown(ARCHITECTURE_TEMPLATE);
  expect(md.exists).toBe(true);
  expect(md.headings).toContain("# Project Architecture");
  expect(md.headings).toContain("## 技术栈");
  expect(md.headings).toContain("## 分层架构");
  expect(md.headings).toContain("## 核心模块");
  expect(md.headings).toContain("## 命名约定");
});
```

- [ ] **Step 2: 跑测试，期望失败**

Run: `bun run test:specs`
Expected: `bootstrap: ARCHITECTURE 模板存在且包含必需骨架章节` 失败（exists=false）。

- [ ] **Step 3: 创建 ARCHITECTURE 模板**

创建 `.agents/skills/bootstrap-claude-docs/templates/ARCHITECTURE.md`，内容（严格遵循 design.md §7.4.1）：

```markdown
# Project Architecture

> 本文件定义项目的整体架构决策。spec-writer 在生成 design.md 时会引用这里的定义。

## 技术栈

- 语言:
- 框架:
- 数据库:
- 部署:

## 分层架构

<描述项目的分层结构，例如 API / Service / Repository / DB>

## 核心模块

### <Module Name>

- 职责:
- 边界:
- 依赖:

## 模块间依赖关系

<描述或图示>

## 命名约定

- 服务命名:
- 模块命名:
- API 路径:

## 跨模块通信

- 同步调用:
- 异步事件:

## 数据一致性策略

- <描述>
```

- [ ] **Step 4: 跑测试通过**

Run: `bun run test:specs`
Expected: 该 test 绿，其他 _helpers.test.ts 仍绿。

- [ ] **Step 5: Commit**

```bash
git add tests/spec-workflow/bootstrap.test.ts .agents/skills/bootstrap-claude-docs/templates/ARCHITECTURE.md
git commit -m "feat(bootstrap): \u65b0\u589e ARCHITECTURE.md \u9aa8\u67b6\u6a21\u677f"
```

### Task 1.2: SECURITY.md 骨架模板

**Files:**
- Modify: `tests/spec-workflow/bootstrap.test.ts`
- Create: `.agents/skills/bootstrap-claude-docs/templates/SECURITY.md`

- [ ] **Step 1: 在 bootstrap.test.ts 追加测试**

在 `tests/spec-workflow/bootstrap.test.ts` 末尾追加：

```ts
const SECURITY_TEMPLATE =
  ".agents/skills/bootstrap-claude-docs/templates/SECURITY.md";

test("bootstrap: SECURITY 模板存在且包含必需骨架章节", () => {
  const md = parseMarkdown(SECURITY_TEMPLATE);
  expect(md.exists).toBe(true);
  expect(md.headings).toContain("# Security Guidelines");
  expect(md.headings).toContain("## 认证");
  expect(md.headings).toContain("## 授权");
  expect(md.headings).toContain("## 输入校验");
  expect(md.headings).toContain("## 敏感数据处理");
  expect(md.headings).toContain("## 已知风险与缓解");
});
```

- [ ] **Step 2: 跑测试，期望失败**

Run: `bun run test:specs`
Expected: 新 test 失败。

- [ ] **Step 3: 创建 SECURITY.md 模板**

创建 `.agents/skills/bootstrap-claude-docs/templates/SECURITY.md`（严格按 design.md §7.4.2）：

```markdown
# Security Guidelines

> 本文件定义项目的安全约定。spec-writer 在生成 design.md 的"安全考虑"章节时会参照这里。

## 认证

- 认证方式:
- token 存储:
- 过期策略:

## 授权

- 模型 (RBAC / ABAC / 其他):
- 权限粒度:

## 输入校验

- 校验层级:
- 校验工具:

## 敏感数据处理

- 脱敏规则:
- 加密字段:
- 日志脱敏:

## 安全相关的第三方服务

- <服务名>: <用途 + 约束>

## 已知风险与缓解

- <风险>: <缓解措施>
```

- [ ] **Step 4: 跑测试通过**

Run: `bun run test:specs`
Expected: 新 test 绿。

- [ ] **Step 5: Commit**

```bash
git add tests/spec-workflow/bootstrap.test.ts .agents/skills/bootstrap-claude-docs/templates/SECURITY.md
git commit -m "feat(bootstrap): \u65b0\u589e SECURITY.md \u9aa8\u67b6\u6a21\u677f"
```

### Task 1.3: CODING_GUIDELINES.md 骨架模板

**Files:**
- Modify: `tests/spec-workflow/bootstrap.test.ts`
- Create: `.agents/skills/bootstrap-claude-docs/templates/CODING_GUIDELINES.md`

- [ ] **Step 1: 追加测试**

在 `tests/spec-workflow/bootstrap.test.ts` 末尾追加：

```ts
const CODING_TEMPLATE =
  ".agents/skills/bootstrap-claude-docs/templates/CODING_GUIDELINES.md";

test("bootstrap: CODING_GUIDELINES 模板存在且包含必需骨架章节", () => {
  const md = parseMarkdown(CODING_TEMPLATE);
  expect(md.exists).toBe(true);
  expect(md.headings).toContain("# Coding Guidelines");
  expect(md.headings).toContain("## 语言风格");
  expect(md.headings).toContain("## 错误处理");
  expect(md.headings).toContain("## 日志");
  expect(md.headings).toContain("## 测试");
  expect(md.headings).toContain("## 代码审查");
  expect(md.headings).toContain("## 依赖管理");
});
```

- [ ] **Step 2: 跑测试，期望失败**

Run: `bun run test:specs`
Expected: 新 test 失败。

- [ ] **Step 3: 创建 CODING_GUIDELINES.md 模板**

创建 `.agents/skills/bootstrap-claude-docs/templates/CODING_GUIDELINES.md`（严格按 design.md §7.4.3）：

```markdown
# Coding Guidelines

> 本文件定义项目的编码约定。spec-writer 在生成 design.md 和 tasks.md 时会参照这里。

## 语言风格

- 命名风格 (camelCase / snake_case 等):
- 文件组织:
- 注释约定:

## 错误处理

- 错误类型:
- 错误传播:
- 日志级别使用:

## 日志

- 日志格式:
- 日志字段约定:
- 敏感字段过滤:

## 测试

- 测试框架:
- 覆盖率要求:
- Mock 策略:

## 代码审查

- PR 模板:
- 审查要点:
- 合并策略:

## 依赖管理

- 包管理器:
- 新增依赖的审批流程:
```

- [ ] **Step 4: 跑测试通过**

Run: `bun run test:specs`
Expected: 新 test 绿。

- [ ] **Step 5: Commit**

```bash
git add tests/spec-workflow/bootstrap.test.ts .agents/skills/bootstrap-claude-docs/templates/CODING_GUIDELINES.md
git commit -m "feat(bootstrap): \u65b0\u589e CODING_GUIDELINES.md \u9aa8\u67b6\u6a21\u677f"
```

### Task 1.4: /bootstrap-claude-docs slash command

**Files:**
- Modify: `tests/spec-workflow/bootstrap.test.ts`
- Create: `.claude/commands/bootstrap-claude-docs.md`

- [ ] **Step 1: 追加测试**

在 `tests/spec-workflow/bootstrap.test.ts` 末尾追加：

```ts
import { frontmatterField } from "./_helpers";

const BOOTSTRAP_COMMAND = ".claude/commands/bootstrap-claude-docs.md";

test("bootstrap: slash command frontmatter 含 description 与 allowed-tools", () => {
  const md = parseMarkdown(BOOTSTRAP_COMMAND);
  expect(md.exists).toBe(true);
  expect(frontmatterField(md, "name")).toBe("bootstrap-claude-docs");
  expect(md.frontmatter).toContain("description:");
  expect(md.frontmatter).toContain("allowed-tools:");
  expect(md.frontmatter).toContain("Read");
  expect(md.frontmatter).toContain("Write");
  expect(md.frontmatter).toContain("Bash");
  expect(md.frontmatter).toContain("Glob");
});

test("bootstrap: slash command body 列出三个目标文件", () => {
  const md = parseMarkdown(BOOTSTRAP_COMMAND);
  expect(md.body).toContain(".claude/ARCHITECTURE.md");
  expect(md.body).toContain(".claude/SECURITY.md");
  expect(md.body).toContain(".claude/CODING_GUIDELINES.md");
});

test("bootstrap: slash command body 写明跳过已存在的文件", () => {
  const md = parseMarkdown(BOOTSTRAP_COMMAND);
  expect(md.body).toMatch(/已存在.*跳过|跳过.*已存在/);
});
```

注意要把 `frontmatterField` 加到 import 行（或新增 import）。

- [ ] **Step 2: 跑测试，期望 3 条新 test 失败**

Run: `bun run test:specs`
Expected: 3 个 bootstrap test 失败（exists=false）。

- [ ] **Step 3: 创建 slash command**

创建 `.claude/commands/bootstrap-claude-docs.md`：

````markdown
---
name: bootstrap-claude-docs
description: 在 .claude/ 下创建 ARCHITECTURE.md / SECURITY.md / CODING_GUIDELINES.md 三个规范文件的骨架模板。已存在的文件跳过，不覆盖。
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
---

# /bootstrap-claude-docs

为当前仓库初始化 `.claude/` 下的 3 份规范骨架，供后续 `spec-writer` 在生成 design.md 时引用。

## 行为约定

- **不覆盖**已存在的文件 — 如果 `.claude/ARCHITECTURE.md` 已存在，则跳过、保留原内容
- 只创建缺失的文件
- 全程不修改 `.claude/CLAUDE.md`、`.claude/settings.json` 或任何其它无关文件
- 不 git commit，留给用户自己决定何时提交

## 执行步骤

1. **检查 `.claude/` 目录**
   - Bash: `mkdir -p .claude`（幂等，已存在不会报错）

2. **依次处理 3 个目标文件**，对每一个 `<file>`（`ARCHITECTURE.md` / `SECURITY.md` / `CODING_GUIDELINES.md`）：

   a. Glob 检查 `.claude/<file>` 是否已存在
   b. **若已存在** → 在输出里记一行 `已存在，跳过: .claude/<file>`，进入下一个文件
   c. **若不存在** →
      - Read `.agents/skills/bootstrap-claude-docs/templates/<file>` 加载骨架
      - Write `.claude/<file>`，内容为骨架原文
      - 在输出里记一行 `已创建: .claude/<file>`

3. **输出汇总**

   ```
   bootstrap-claude-docs 完成

   已创建:
     - <列表>
   已存在跳过:
     - <列表>

   下一步:
   1. 编辑上述文件，填入真实的项目架构 / 安全 / 编码约定
   2. 重新运行 /start-workflow
   ```

## 边界场景

| 场景 | 处理 |
|---|---|
| `.claude/` 不存在 | `mkdir -p .claude` 自动创建 |
| 3 份模板里某 1 份在 `.agents/skills/bootstrap-claude-docs/templates/` 缺失 | 报错并指出缺失文件，提示重新拉取 skill |
| `.claude/` 存在但写权限不足 | 报错，提示检查文件系统权限 |
| 全部 3 份目标文件都已存在 | 输出 "所有规范文件已存在，无需 bootstrap" |

## 禁止行为

- 不要写 `.claude/CLAUDE.md`、`.claude/settings.json`、`.claude/settings.local.json`
- 不要 git add / git commit
- 不要写 `.agents/` 或 `specs/` 下任何文件
- 不要联网，不调用 Agent / WebFetch
````

- [ ] **Step 4: 跑测试通过**

Run: `bun run test:specs`
Expected: 全部 bootstrap.test.ts 用例绿。

- [ ] **Step 5: Lint**

Run: `bun x ultracite check tests/spec-workflow/bootstrap.test.ts`
Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add tests/spec-workflow/bootstrap.test.ts .claude/commands/bootstrap-claude-docs.md
git commit -m "feat(bootstrap): \u65b0\u589e /bootstrap-claude-docs slash command"
```

---

## Stage 2: spec-writer 的 5 个模板 + checklist

**Stage 目标**：把 design.md §6 的全部 5 个模板（requirements / tasks / design-backend / design-frontend / design-fullstack）落地，加上 §4.7 的 consistency-check.md。这些是 spec-writer Stage 4 渲染时 Read 的输入。

**TDD 模式**：本 stage 用 `tests/spec-workflow/spec-writer-templates.test.ts` 一个文件累积测试。

**铁律提醒**（design.md §6.7）：
1. 三份 design 模板 **必须** 都有 `## 架构变更` / `## 安全考虑` / `## 编码约定变更` 三个标题
2. 章节标题统一用 `##`
3. 占位符统一用 `<xxx>` 尖括号

测试文件就是用这三条铁律做断言。

### Task 2.1: requirements.md 通用模板

**Files:**
- Create: `tests/spec-workflow/spec-writer-templates.test.ts`
- Create: `.agents/skills/spec-writer/templates/requirements.md`

- [ ] **Step 1: 写失败测试**

创建 `tests/spec-workflow/spec-writer-templates.test.ts`：

```ts
import { test, expect } from "bun:test";
import { parseMarkdown } from "./_helpers";

const REQUIREMENTS = ".agents/skills/spec-writer/templates/requirements.md";

test("spec-writer 模板: requirements.md 含全部固定章节", () => {
  const md = parseMarkdown(REQUIREMENTS);
  expect(md.exists).toBe(true);
  expect(md.headings).toContain("## 需求概述");
  expect(md.headings).toContain("## 用户故事");
  expect(md.headings).toContain("## 验收标准");
  expect(md.headings).toContain("## 范围边界");
  expect(md.headings).toContain("### 本次包含");
  expect(md.headings).toContain("### 本次不包含（Out of Scope）");
  expect(md.headings).toContain("## 依赖与前置");
  expect(md.headings).toContain("## 开放问题");
  expect(md.body).toContain("<");
  expect(md.body).toContain(">");
});
```

- [ ] **Step 2: 跑测试，期望失败**

Run: `bun run test:specs`
Expected: 该 test 失败（exists=false）。

- [ ] **Step 3: 创建 requirements.md 模板**

严格遵循 design.md §6.2：

```markdown
# Requirements: <feature name>

## 需求概述

<1-2 段落，说明要解决什么问题、为谁解决、关键背景>

## 用户故事

作为 <角色>
我希望 <能力>
以便 <收益>

## 验收标准

- [ ] AC1: <可测试的具体条件>
- [ ] AC2: ...

## 范围边界

### 本次包含

- ...

### 本次不包含（Out of Scope）

- ...

## 依赖与前置

- 依赖的其他 feature / 服务 / 数据
- 需要的前置准备

## 开放问题

- [ ] Q1: <待 design 阶段解决的问题>
```

- [ ] **Step 4: 跑测试通过**

Run: `bun run test:specs`
Expected: 该 test 绿。

- [ ] **Step 5: Commit**

```bash
git add tests/spec-workflow/spec-writer-templates.test.ts .agents/skills/spec-writer/templates/requirements.md
git commit -m "feat(spec-writer): \u65b0\u589e requirements.md \u901a\u7528\u6a21\u677f"
```

### Task 2.2: tasks.md 通用模板

**Files:**
- Modify: `tests/spec-workflow/spec-writer-templates.test.ts`
- Create: `.agents/skills/spec-writer/templates/tasks.md`

- [ ] **Step 1: 追加测试**

```ts
const TASKS_TEMPLATE = ".agents/skills/spec-writer/templates/tasks.md";

test("spec-writer 模板: tasks.md 含 Stage / Task / 测试章节", () => {
  const md = parseMarkdown(TASKS_TEMPLATE);
  expect(md.exists).toBe(true);
  expect(md.headings).toContain("## 任务总览");
  expect(md.headings).toContain("## Stage 1: <阶段名>");
  expect(md.headings).toContain("### Task 1.1: <任务名>");
  expect(md.headings).toContain("## 测试任务");
  expect(md.headings).toContain("## 风险与回滚");
  expect(md.body).toContain("**目标**");
  expect(md.body).toContain("**步骤**");
  expect(md.body).toContain("**验收**");
  expect(md.body).toContain("**预估**");
  expect(md.body).toContain("**依赖**");
});
```

- [ ] **Step 2: 跑测试，期望失败**

Run: `bun run test:specs`
Expected: 新 test 失败。

- [ ] **Step 3: 创建 tasks.md 模板**

严格按 design.md §6.3：

```markdown
# Tasks: <feature name>

## 任务总览

本次 feature 共拆分为 N 个阶段，约 M 个任务。

## Stage 1: <阶段名>

### Task 1.1: <任务名>

**目标**：<一句话>

**步骤**：
1. ...
2. ...

**验收**：
- [ ] <可验证的条件>

**预估**：<S / M / L>

**依赖**：<前置 task ID 或 N/A>

### Task 1.2: ...

## Stage 2: ...

## 测试任务

### Task T.1: 单元测试
### Task T.2: 集成测试

## 风险与回滚

- 风险 1：<描述 + 缓解>
- 回滚策略：<步骤>
```

- [ ] **Step 4: 跑测试通过**

Run: `bun run test:specs`
Expected: 新 test 绿。

- [ ] **Step 5: Commit**

```bash
git add tests/spec-workflow/spec-writer-templates.test.ts .agents/skills/spec-writer/templates/tasks.md
git commit -m "feat(spec-writer): \u65b0\u589e tasks.md \u901a\u7528\u6a21\u677f"
```

### Task 2.3: design-backend.md 模板

**Files:**
- Modify: `tests/spec-workflow/spec-writer-templates.test.ts`
- Create: `.agents/skills/spec-writer/templates/design-backend.md`

- [ ] **Step 1: 追加测试（验证 3 条铁律 + backend 专属章节）**

```ts
const DESIGN_BACKEND = ".agents/skills/spec-writer/templates/design-backend.md";

test("spec-writer 模板: design-backend.md 含 3 个强制章节 + 后端专属", () => {
  const md = parseMarkdown(DESIGN_BACKEND);
  expect(md.exists).toBe(true);
  // 铁律 1: 3 个强制章节
  expect(md.headings).toContain("## 架构变更");
  expect(md.headings).toContain("## 安全考虑");
  expect(md.headings).toContain("## 编码约定变更");
  // 后端专属
  expect(md.headings).toContain("## 架构定位");
  expect(md.headings).toContain("## API 契约");
  expect(md.headings).toContain("## 数据模型");
  expect(md.headings).toContain("## 核心流程");
  expect(md.headings).toContain("## 性能与扩展性");
  expect(md.headings).toContain("## 错误处理与降级");
  // 占位符约定
  expect(md.body).toContain("<feature name>");
});
```

- [ ] **Step 2: 跑测试，期望失败**

Run: `bun run test:specs`
Expected: 新 test 失败。

- [ ] **Step 3: 创建 design-backend.md**

严格按 design.md §6.4：

```markdown
# Design: <feature name> (Backend)

## 架构定位

<在整体架构中的位置，引用 .claude/ARCHITECTURE.md 的哪些模块>

## API 契约

### <Endpoint 名>

- Method: POST
- Path: /api/v1/...
- Request: <结构>
- Response: <结构>
- Error codes: <列表>

## 数据模型

### <Entity 名>

- 字段 / 类型 / 约束
- 索引策略

## 核心流程

<sequence 描述或伪代码>

## 架构变更

<若无，写"无">
<若有，必须是 .claude/ARCHITECTURE.md 可以吸收的 diff-friendly 格式>

## 安全考虑

<认证、授权、输入校验、敏感数据处理>
<若无额外考虑，写"无">

## 编码约定变更

<若无，写"无">

## 性能与扩展性

- 预期 QPS / 延迟
- 扩展瓶颈点

## 错误处理与降级

- 关键错误路径
- 降级策略
```

- [ ] **Step 4: 跑测试通过**

Run: `bun run test:specs`
Expected: 新 test 绿。

- [ ] **Step 5: Commit**

```bash
git add tests/spec-workflow/spec-writer-templates.test.ts .agents/skills/spec-writer/templates/design-backend.md
git commit -m "feat(spec-writer): \u65b0\u589e design-backend.md \u6a21\u677f"
```

### Task 2.4: design-frontend.md 模板

**Files:**
- Modify: `tests/spec-workflow/spec-writer-templates.test.ts`
- Create: `.agents/skills/spec-writer/templates/design-frontend.md`

- [ ] **Step 1: 追加测试**

```ts
const DESIGN_FRONTEND = ".agents/skills/spec-writer/templates/design-frontend.md";

test("spec-writer 模板: design-frontend.md 含 3 个强制章节 + 前端专属", () => {
  const md = parseMarkdown(DESIGN_FRONTEND);
  expect(md.exists).toBe(true);
  // 铁律 1
  expect(md.headings).toContain("## 架构变更");
  expect(md.headings).toContain("## 安全考虑");
  expect(md.headings).toContain("## 编码约定变更");
  // 前端专属
  expect(md.headings).toContain("## 页面与路由");
  expect(md.headings).toContain("## 组件拆分");
  expect(md.headings).toContain("## 状态管理");
  expect(md.headings).toContain("## 接口调用");
  expect(md.headings).toContain("## 样式与主题");
  expect(md.headings).toContain("## 可访问性");
  expect(md.headings).toContain("## 性能");
});
```

- [ ] **Step 2: 跑测试，期望失败**

Run: `bun run test:specs`
Expected: 新 test 失败。

- [ ] **Step 3: 创建 design-frontend.md**

严格按 design.md §6.5：

```markdown
# Design: <feature name> (Frontend)

## 页面与路由

- 路由: /profile/:id
- 入口来源: <从哪些页面进来>

## 组件拆分

### <Component 名>

- props / state
- 子组件
- 引用的共享组件

## 状态管理

- 本地状态 / 全局状态 / 服务端状态
- 数据流向

## 接口调用

- 依赖的后端 endpoint
- 错误 / loading / empty 三态处理

## 样式与主题

- 设计稿来源 (figma URL / 截图)
- 设计令牌引用

## 架构变更

<若无，写"无">

## 安全考虑

<XSS、权限、敏感数据前端处理>
<若无额外考虑，写"无">

## 编码约定变更

<若无，写"无">

## 可访问性

- 键盘导航 / ARIA / 对比度

## 性能

- 首屏关键指标
- 懒加载 / 代码分割策略
```

- [ ] **Step 4: 跑测试通过**

Run: `bun run test:specs`
Expected: 新 test 绿。

- [ ] **Step 5: Commit**

```bash
git add tests/spec-workflow/spec-writer-templates.test.ts .agents/skills/spec-writer/templates/design-frontend.md
git commit -m "feat(spec-writer): \u65b0\u589e design-frontend.md \u6a21\u677f"
```

### Task 2.5: design-fullstack.md 模板

**Files:**
- Modify: `tests/spec-workflow/spec-writer-templates.test.ts`
- Create: `.agents/skills/spec-writer/templates/design-fullstack.md`

- [ ] **Step 1: 追加测试**

```ts
const DESIGN_FULLSTACK = ".agents/skills/spec-writer/templates/design-fullstack.md";

test("spec-writer 模板: design-fullstack.md 含 3 个强制章节 + 全栈专属", () => {
  const md = parseMarkdown(DESIGN_FULLSTACK);
  expect(md.exists).toBe(true);
  // 铁律 1
  expect(md.headings).toContain("## 架构变更");
  expect(md.headings).toContain("## 安全考虑");
  expect(md.headings).toContain("## 编码约定变更");
  // 全栈专属
  expect(md.headings).toContain("## 架构定位");
  expect(md.headings).toContain("## 端到端流程");
  expect(md.headings).toContain("## 前后端契约");
  expect(md.headings).toContain("## 后端部分");
  expect(md.headings).toContain("## 前端部分");
  expect(md.headings).toContain("## 前后端联调策略");
});
```

- [ ] **Step 2: 跑测试，期望失败**

Run: `bun run test:specs`
Expected: 新 test 失败。

- [ ] **Step 3: 创建 design-fullstack.md**

严格按 design.md §6.6：

```markdown
# Design: <feature name> (Fullstack)

## 架构定位
## 端到端流程

<整体数据流 + 关键调用顺序>

## 前后端契约

### <API 名>

- Method / Path
- Request / Response / Error

## 后端部分

### 数据模型
### 核心流程
### 性能与扩展性

## 前端部分

### 页面与路由
### 组件与状态
### UX 注意事项

## 架构变更

<若无，写"无">

## 安全考虑

<跨前后端的安全设计>
<若无额外考虑，写"无">

## 编码约定变更

<若无,写"无">

## 前后端联调策略

- Mock / Stub 策略
- 联调顺序
- 环境差异处理
```

- [ ] **Step 4: 跑测试通过**

Run: `bun run test:specs`
Expected: 新 test 绿。

- [ ] **Step 5: Commit**

```bash
git add tests/spec-workflow/spec-writer-templates.test.ts .agents/skills/spec-writer/templates/design-fullstack.md
git commit -m "feat(spec-writer): \u65b0\u589e design-fullstack.md \u6a21\u677f"
```

### Task 2.6: consistency-check.md 自检 checklist

**Files:**
- Modify: `tests/spec-workflow/spec-writer-templates.test.ts`
- Create: `.agents/skills/spec-writer/checklists/consistency-check.md`

- [ ] **Step 1: 追加测试**

```ts
const CHECKLIST = ".agents/skills/spec-writer/checklists/consistency-check.md";

test("spec-writer checklist: consistency-check.md 覆盖三大维度", () => {
  const md = parseMarkdown(CHECKLIST);
  expect(md.exists).toBe(true);
  expect(md.headings).toContain("## Cross-file consistency");
  expect(md.headings).toContain("## Internal consistency");
  expect(md.headings).toContain("## Metadata");
  // 关键 checklist 项
  expect(md.body).toContain("requirements.md 的每一条验收标准");
  expect(md.body).toContain("design.md 的每一个 API/endpoint");
  expect(md.body).toContain("tasks.md 里没有引用 design.md 之外");
  expect(md.body).toContain("backend: 模型 → migration → API");
  expect(md.body).toContain("frontend: 页面骨架 → 组件");
  expect(md.body).toContain("fullstack: Backend 全部完成 → Frontend");
  expect(md.body).toContain("TODO");
  expect(md.body).toContain("FIXME");
  expect(md.body).toContain("<placeholder>");
});
```

- [ ] **Step 2: 跑测试，期望失败**

Run: `bun run test:specs`
Expected: 新 test 失败。

- [ ] **Step 3: 创建 consistency-check.md**

严格按 design.md §4.7：

```markdown
# spec-writer 一致性自检 checklist

> 此 checklist 由 spec-writer 在 Stage 5 加载并对照 _drafts 下的三件套逐条判断。
> 任何一项违反即记录为 violation。出现 violation 后允许做最多 1 次有针对性修复（仅重写违反项对应的单个文件），仍违反则整体 FAILED。

## Cross-file consistency

- [ ] requirements.md 的每一条验收标准都在 design.md 里有对应章节覆盖
- [ ] design.md 的每一个 API/endpoint/组件/页面，在 tasks.md 里都有对应的实现任务
- [ ] tasks.md 里没有引用 design.md 之外的"凭空任务"
- [ ] requirements.md frontmatter 的 type 与 design.md 选用的模板一致
- [ ] source 字段在 requirements.md frontmatter 里如实记录了 PRD 和设计稿 URL

## Internal consistency

- [ ] requirements.md 的"范围外"明确列出了不做的事
- [ ] design.md 的每个章节都不为空（模板里的 placeholder 都被替换了）
- [ ] tasks.md 的任务顺序符合 type 规则
    - backend: 模型 → migration → API → 业务逻辑 → 测试
    - frontend: 页面骨架 → 组件 → 数据接入 → 交互 → a11y → 测试
    - fullstack: Backend 全部完成 → Frontend
- [ ] tasks.md 里没有 "TODO" / "FIXME" / "<placeholder>" 等未填充的标记

## Metadata

- [ ] requirements.md 的 frontmatter 包含: name, type, priority, source, created
- [ ] 三件套文件名和路径都在 specs/_drafts/<slug>/ 下

## 修复约定

- 单次修复只允许重写违反项对应的那一个文件（不重跑 Stage 4 整体生成）
- 修复后必须重新跑完整 checklist
- 若仍有违反 → spec-writer 返回 `{status: "failed", stage: "stage-5-consistency-check", reason: "consistency check failed after 1 retry, violations: [...]"}`
```

- [ ] **Step 4: 跑测试通过**

Run: `bun run test:specs`
Expected: 新 test 绿。

- [ ] **Step 5: Commit**

```bash
git add tests/spec-workflow/spec-writer-templates.test.ts .agents/skills/spec-writer/checklists/consistency-check.md
git commit -m "feat(spec-writer): \u65b0\u589e consistency-check.md \u81ea\u68c0 checklist"
```

---

## Stage 3: spec-writer SKILL.md

**Stage 目标**：把 design.md §4 的 spec-writer 主指令落地到 SKILL.md。这是整个 MVP 最复杂的 artifact，包含 6 个 Stage 的执行流程、type 分类规则、slug 生成规则、Stage 4 α 方案约束、Stage 5 自检约束、返回值契约。

### Task 3.1: 建 spec-writer 目录与符号链接

**Files:**
- Create: `.agents/skills/spec-writer/` 目录（已经被 Stage 2 创建过）
- Create: `.claude/skills/spec-writer` 符号链接

- [ ] **Step 1: 验证目录已存在**

Run: `ls .agents/skills/spec-writer/`
Expected: 看到 `templates/` 和 `checklists/` 子目录（Stage 2 已经写了内容）。

- [ ] **Step 2: 创建符号链接**

Run: `ln -s ../../.agents/skills/spec-writer .claude/skills/spec-writer`
Expected: 命令静默成功。

- [ ] **Step 3: 验证链接生效**

Run: `ls -la .claude/skills/spec-writer && readlink .claude/skills/spec-writer`
Expected: `lrwxr-xr-x ...` 软链接 + 输出 `../../.agents/skills/spec-writer`。

- [ ] **Step 4: 跑现有测试，确认没破坏**

Run: `bun run test:specs`
Expected: 全绿。

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/spec-writer
git commit -m "feat(spec-writer): \u521b\u5efa .claude/skills \u7b26\u53f7\u94fe\u63a5"
```

### Task 3.2: spec-writer SKILL.md frontmatter + 骨架

**Files:**
- Create: `tests/spec-workflow/spec-writer-skill.test.ts`
- Create: `.agents/skills/spec-writer/SKILL.md`

- [ ] **Step 1: 写失败测试（frontmatter + 高层结构）**

创建 `tests/spec-workflow/spec-writer-skill.test.ts`：

```ts
import { test, expect } from "bun:test";
import { parseMarkdown, frontmatterField } from "./_helpers";

const SKILL = ".agents/skills/spec-writer/SKILL.md";

test("spec-writer SKILL.md frontmatter 字段完整", () => {
  const md = parseMarkdown(SKILL);
  expect(md.exists).toBe(true);
  expect(frontmatterField(md, "name")).toBe("spec-writer");
  expect(frontmatterField(md, "user-invocable")).toBe("false");
  // description 必须包含输入和输出契约关键词
  expect(md.frontmatter).toContain("description:");
  expect(md.frontmatter).toMatch(/PRD|需求/);
  expect(md.frontmatter).toMatch(/_drafts|drafts/);
});

test("spec-writer SKILL.md body 列出 6 个 Stage", () => {
  const md = parseMarkdown(SKILL);
  expect(md.headings).toContain("## 输入契约");
  expect(md.headings).toContain("## 执行流程");
  expect(md.headings).toContain("### Stage 1: 解析输入 + 分类 type");
  expect(md.headings).toContain("### Stage 2: 生成 slug");
  expect(md.headings).toContain("### Stage 3: 读 .claude 规范文件");
  expect(md.headings).toContain("### Stage 4: 按 type 选模板生成三件套");
  expect(md.headings).toContain("### Stage 5: 一致性自检");
  expect(md.headings).toContain("### Stage 6: 返回结构化结果");
  expect(md.headings).toContain("## 失败约定");
  expect(md.headings).toContain("## 返回值契约");
});

test("spec-writer SKILL.md 含 type 分类规则 0（user-specified 优先）", () => {
  const md = parseMarkdown(SKILL);
  expect(md.body).toContain("user_type");
  expect(md.body).toMatch(/规则\s*0|Rule\s*0/);
  expect(md.body).toContain("跳过");
});

test("spec-writer SKILL.md 含 slug 生成规则", () => {
  const md = parseMarkdown(SKILL);
  expect(md.body).toContain("中文");
  expect(md.body).toContain("小写");
  expect(md.body).toContain("ticket-");
});

test("spec-writer SKILL.md 含 Stage 4 α 方案约束", () => {
  const md = parseMarkdown(SKILL);
  expect(md.body).toContain("α");
  expect(md.body).toMatch(/一次大调用|同一回答/);
  expect(md.body).toContain("requirements.md");
  expect(md.body).toContain("design.md");
  expect(md.body).toContain("tasks.md");
});

test("spec-writer SKILL.md 含 Stage 5 最多 1 次修复约束", () => {
  const md = parseMarkdown(SKILL);
  expect(md.body).toContain("最多 1 次");
  expect(md.body).toContain("retry_count");
});

test("spec-writer SKILL.md 含 PROGRESS 输出约定", () => {
  const md = parseMarkdown(SKILL);
  expect(md.body).toContain("PROGRESS:");
});
```

- [ ] **Step 2: 跑测试，期望全部失败**

Run: `bun run test:specs`
Expected: 7 个新 test 全部失败。

- [ ] **Step 3: 创建 SKILL.md（完整内容）**

创建 `.agents/skills/spec-writer/SKILL.md`：

````markdown
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

**采用 α 方案：在同一回答里按顺序发出 3 个 Write tool call**（一次大 Claude 调用，三件套强关联生成，不要拆成 3 次独立调用）。

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
````

- [ ] **Step 4: 跑测试通过**

Run: `bun run test:specs`
Expected: 7 个 spec-writer-skill 测试全绿。

- [ ] **Step 5: Lint**

Run: `bun x ultracite check tests/spec-workflow/spec-writer-skill.test.ts`
Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add tests/spec-workflow/spec-writer-skill.test.ts .agents/skills/spec-writer/SKILL.md
git commit -m "feat(spec-writer): \u65b0\u589e SKILL.md \u4e3b\u6307\u4ee4\u53ca 6 \u4e2a Stage \u6d41\u7a0b"
```

---

## Stage 4: spec-archiver SKILL.md

**Stage 目标**：把 design.md §5 的 spec-archiver 主指令落地。比 spec-writer 简单（5 个 archive 子 Stage，无生成逻辑，只做搬运 / 写 meta / diff 检查）。

### Task 4.1: 建 spec-archiver 目录与符号链接

**Files:**
- Create: `.agents/skills/spec-archiver/` 目录
- Create: `.claude/skills/spec-archiver` 符号链接

- [ ] **Step 1: 创建目录**

Run: `mkdir -p .agents/skills/spec-archiver`
Expected: 静默成功。

- [ ] **Step 2: 创建符号链接**

Run: `ln -s ../../.agents/skills/spec-archiver .claude/skills/spec-archiver`
Expected: 静默成功。

- [ ] **Step 3: 验证**

Run: `readlink .claude/skills/spec-archiver`
Expected: `../../.agents/skills/spec-archiver`

- [ ] **Step 4: Commit**

注意：空目录 git 不会跟踪。这一步先不 commit，等 Task 4.2 写完 SKILL.md 一起 commit。跳过 commit。

### Task 4.2: spec-archiver SKILL.md

**Files:**
- Create: `tests/spec-workflow/spec-archiver-skill.test.ts`
- Create: `.agents/skills/spec-archiver/SKILL.md`

- [ ] **Step 1: 写失败测试**

创建 `tests/spec-workflow/spec-archiver-skill.test.ts`：

```ts
import { test, expect } from "bun:test";
import { parseMarkdown, frontmatterField } from "./_helpers";

const SKILL = ".agents/skills/spec-archiver/SKILL.md";

test("spec-archiver SKILL.md frontmatter 字段完整", () => {
  const md = parseMarkdown(SKILL);
  expect(md.exists).toBe(true);
  expect(frontmatterField(md, "name")).toBe("spec-archiver");
  expect(frontmatterField(md, "user-invocable")).toBe("false");
  expect(md.frontmatter).toContain("allowed-tools:");
  expect(md.frontmatter).toContain("Read");
  expect(md.frontmatter).toContain("Write");
  expect(md.frontmatter).toContain("Edit");
  expect(md.frontmatter).toContain("Bash");
  expect(md.frontmatter).toContain("Glob");
  expect(md.frontmatter).toContain("Grep");
});

test("spec-archiver SKILL.md body 列出 5 个 archive 子 Stage", () => {
  const md = parseMarkdown(SKILL);
  expect(md.headings).toContain("## 输入契约");
  expect(md.headings).toContain("## 执行流程");
  expect(md.headings).toContain("### archive-1: validate-path");
  expect(md.headings).toContain("### archive-2: move-drafts");
  expect(md.headings).toContain("### archive-3: write-meta");
  expect(md.headings).toContain("### archive-4: diff-claude");
  expect(md.headings).toContain("### archive-5: return-summary");
  expect(md.headings).toContain("## 返回值契约");
});

test("spec-archiver SKILL.md 含同日同 slug 硬失败规则", () => {
  const md = parseMarkdown(SKILL);
  expect(md.body).toContain("同日同 slug");
  expect(md.body).toMatch(/硬失败|FAILED/);
});

test("spec-archiver SKILL.md 含 git_commit_at_archive 字段", () => {
  const md = parseMarkdown(SKILL);
  expect(md.body).toContain("git_commit_at_archive");
  expect(md.body).toContain("git rev-parse HEAD");
});

test("spec-archiver SKILL.md 含 .claude diff 触发的 3 个标题", () => {
  const md = parseMarkdown(SKILL);
  expect(md.body).toContain("## 架构变更");
  expect(md.body).toContain("## 安全考虑");
  expect(md.body).toContain("## 编码约定变更");
  expect(md.body).toContain("ARCHITECTURE.md");
  expect(md.body).toContain("SECURITY.md");
  expect(md.body).toContain("CODING_GUIDELINES.md");
});

test("spec-archiver SKILL.md 含 diff apply 失败降级策略", () => {
  const md = parseMarkdown(SKILL);
  expect(md.body).toContain("降级");
  expect(md.body).toContain("warning");
  expect(md.body).toContain("不阻断");
});

test("spec-archiver SKILL.md 含 related_specs 最近 1 条规则", () => {
  const md = parseMarkdown(SKILL);
  expect(md.body).toContain("related_specs");
  expect(md.body).toContain("最近 1 条");
});

test("spec-archiver SKILL.md 含 PROGRESS 输出约定", () => {
  const md = parseMarkdown(SKILL);
  expect(md.body).toContain("PROGRESS:");
});
```

- [ ] **Step 2: 跑测试，期望全部失败**

Run: `bun run test:specs`
Expected: 8 个新 test 全部失败。

- [ ] **Step 3: 创建 SKILL.md**

创建 `.agents/skills/spec-archiver/SKILL.md`：

````markdown
---
name: spec-archiver
description: 把 specs/_drafts/<slug> 归档到 specs/YYYY-MM-DD-<slug>，写 meta.json，diff 检查 .claude 规范文件。被 spec-workflow subagent 顺序调用，不面向用户直接调用。
user-invocable: false
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
---

# spec-archiver

你是 spec-driven workflow 的归档者。被 `spec-workflow` subagent 在 spec-writer 成功后调用。**不主动激活**。

## 职责边界

只做三件事：

1. **搬运**：`specs/_drafts/<slug>/` → `specs/YYYY-MM-DD-<slug>/`
2. **写 meta.json**：归档元数据
3. **diff 检查 + 规范文件更新**：根据 design.md 的约定标题决定是否更新 `.claude/` 规范

**不做**：生成 spec、写代码、决定 slug/type、深度内容质量校验。

## 输入契约

调用方传入：

```yaml
drafts_path: specs/_drafts/<slug>/
slug: <spec-writer 已确定的 slug>
type: <backend | frontend | fullstack>
source_meta:
  source_type: <prd_only | design_only | prd_and_design | natural_language>
  prd_url: <URL 或 null>
  design_url: <URL 或 null>
  design_tool: <figma | figjam | figma-make | stitch | screenshot | null>
  user_type_specified: <backend | frontend | fullstack | null>
  prd_fetched_at: <ISO 时间戳 或 null>
spec_writer_stats:
  type_classification: <auto | user-specified>
  consistency_check: passed
  retry_count: <0 | 1>
```

## 执行流程

整个 skill 严格按 5 个 archive 子 Stage 执行。每个 Stage 开始前**单独输出一行** `PROGRESS: <描述>`。

### archive-1: validate-path

- 输出：`PROGRESS: 校验归档路径 + 存在性检查`
- 计算 `current_date = $(date +%Y-%m-%d)`（主机时区，Bash）
- `archive_path = specs/<current_date>-<slug>/`
- **冲突检查**：
  - 如果 `archive_path` 已存在 → **硬失败**：

    ```json
    {
      "status": "failed",
      "stage": "archive-1-validate-path",
      "reason": "同日同 slug 已归档：<archive_path>。若要覆盖请先手动删除该目录。",
      "partial_files": []
    }
    ```

  - Glob `specs/*-<slug>/` 不含当前日期，命中则记录最近 1 条作为 `related_specs`，输出 `PROGRESS: 检测到历史同 slug spec: <path>`。**只保留最近 1 条**（按目录名日期降序排，第 1 个就是最近）。
- **存在性检查**：对 `drafts_path` 下的 `requirements.md` / `design.md` / `tasks.md` 做检查
  - 任一缺失或大小为 0 → 硬失败：

    ```json
    {
      "status": "failed",
      "stage": "archive-1-validate-path",
      "reason": "三件套中 <file> 缺失或为空",
      "partial_files": []
    }
    ```

### archive-2: move-drafts

- 输出：`PROGRESS: mv _drafts → <archive_path>`
- Bash: `mv <drafts_path> <archive_path>`
- Glob 验证：`<archive_path>/requirements.md` 等三个文件齐备
- 失败 → 硬失败（archive-2-move-drafts）。**注意**：mv 失败可能留半成品状态，让 subagent 透传给用户手动处理

### archive-3: write-meta

- 输出：`PROGRESS: 写 meta.json`
- 调用 Bash 获取 `git rev-parse HEAD`，作为 `git_commit_at_archive` 字段（若仓库无 commit 或非 git 仓库则填 `null`，**不要因此失败**）
- 写 `<archive_path>/meta.json`，结构如下：

  ```json
  {
    "slug": "<slug>",
    "type": "<type>",
    "archived_at": "<ISO timestamp now>",
    "archived_path": "<archive_path>",
    "git_commit_at_archive": "<sha 或 null>",
    "source": {
      "source_type": "<from input>",
      "prd_url": "<from input>",
      "design_url": "<from input>",
      "design_tool": "<from input>",
      "user_type_specified": "<from input>",
      "prd_fetched_at": "<from input>"
    },
    "spec_writer": {
      "type_classification": "<from input>",
      "consistency_check": "passed",
      "retry_count": <from input>
    },
    "claude_updates": {
      "detected": false,
      "updated_files": [],
      "diff_summary": "",
      "error": null
    },
    "related_specs": [<最近 1 条历史 spec 路径，或空数组>]
  }
  ```

- 写 meta.json 失败 → 硬失败（archive-3-write-meta）。注意此时 mv 已成功但 meta.json 缺失，让用户手动补一个或重跑 archive-3

### archive-4: diff-claude

- 输出：`PROGRESS: diff 检查 .claude 规范文件`
- Read `<archive_path>/design.md`
- 检测以下 3 个**强约定标题**是否存在并提取章节内容：

  | design.md 标题 | 触发更新的 .claude 文件 |
  |---|---|
  | `## 架构变更` 或 `## Architecture Changes` | `.claude/ARCHITECTURE.md` |
  | `## 安全考虑` 或 `## Security Considerations` | `.claude/SECURITY.md` |
  | `## 编码约定变更` 或 `## Coding Guidelines Update` | `.claude/CODING_GUIDELINES.md` |

- 对每一个**触发**章节（章节内容不为"无"且非空）：
  1. Read 对应的 `.claude/<file>`
  2. 让 Claude 生成 unified diff，instruction："把 design.md 的 <heading> 章节的内容合并进 <claude_file>，保留现有结构，只追加/修改相关段落，输出标准 unified diff 格式"
  3. 尝试 apply patch（用 Edit 工具或 Bash patch 命令）
  4. **成功** → 把文件名加入 `claude_updates.updated_files`，把 diff 摘要追加到 `claude_updates.diff_summary`
  5. **失败** → **降级处理**（不阻断整个归档）：
     - `claude_updates.error = "diff apply failed for <claude_file>: <error>"`
     - 输出 `PROGRESS: ⚠️ <claude_file> diff 应用失败，已跳过，请手动同步`
     - 继续处理下一个章节

- **降级理由**：归档主体已经成功（目录和 meta.json 都写好了），`.claude/` 更新失败不影响当前 spec 的可用性。硬失败反而让用户困惑"我的 spec 到底归档没"。保留 error 信息到 meta.json + warning 给主线程，用户事后手动处理。

- 全部章节处理完后，**回写 meta.json**（用 Edit 工具更新 `claude_updates` 段）

### archive-5: return-summary

- 输出：`PROGRESS: 返回归档摘要`
- 组装返回值（参考 §返回值契约）

## PROGRESS 输出约定

每个 archive 子 Stage 开始前必须**单独输出一行** `PROGRESS: <描述>`。中间步骤可加细 `PROGRESS:` 行。不要把 `PROGRESS:` 和文件内容混在同一个 Write tool call 里。

## 返回值契约

**成功**：

```json
{
  "status": "success",
  "archived_path": "specs/2026-04-10-user-profile-page/",
  "meta_path": "specs/2026-04-10-user-profile-page/meta.json",
  "claude_updates": {
    "detected": true,
    "updated_files": [".claude/ARCHITECTURE.md"],
    "diff_summary": "新增 UserProfileService 到 Backend Services 列表",
    "error": null
  },
  "timeline": [
    ["00:00", "校验归档路径 + 存在性检查"],
    ["00:01", "mv _drafts → <archive_path>"],
    ["00:02", "写 meta.json"],
    ["00:04", "diff 检查 .claude"],
    ["00:12", "更新 .claude/ARCHITECTURE.md"]
  ]
}
```

**失败**：

```json
{
  "status": "failed",
  "stage": "<archive-N-name>",
  "reason": "<人类可读原因>",
  "partial_files": []
}
```

## 失败原子性约定

| Stage | 失败行为 |
|---|---|
| archive-1 | 硬失败，不动文件系统 |
| archive-2 | 硬失败，可能留半 mv 状态 → 透传给用户 |
| archive-3 | 硬失败，归档目录已存在但缺 meta.json，用户可手动补或重跑 |
| archive-4 | **降级**（记 error 到 meta.json，不阻断） |
| archive-5 | 不应失败 |

## 禁止行为

- 不读 URL，不联网
- 不修改 `specs/` 和 `.claude/<3 个规范文件>` 之外的项目代码
- 不 `git add` / `git commit`
- 不调用 Agent 工具
- 不调用其它 skill
- **不修改三件套内容**（spec-writer 已经定稿，spec-archiver 只搬运）
````

- [ ] **Step 4: 跑测试通过**

Run: `bun run test:specs`
Expected: 8 个 spec-archiver 测试全绿。

- [ ] **Step 5: Lint**

Run: `bun x ultracite check tests/spec-workflow/spec-archiver-skill.test.ts`
Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add .claude/skills/spec-archiver tests/spec-workflow/spec-archiver-skill.test.ts .agents/skills/spec-archiver/SKILL.md
git commit -m "feat(spec-archiver): \u65b0\u589e SKILL.md \u4e3b\u6307\u4ee4\u53ca 5 \u4e2a archive Stage"
```

---

## Stage 5: spec-workflow subagent

**Stage 目标**：把 design.md §3 的 subagent 定义落地。这是一个**薄编排层**，绑定 spec-writer + spec-archiver，负责接收 prompt → 顺序 invoke → 组装结构化输出。

### Task 5.1: 创建 .claude/agents/ 目录

**Files:**
- Create: `.claude/agents/` 目录

- [ ] **Step 1: 创建目录**

Run: `mkdir -p .claude/agents`
Expected: 静默成功。

- [ ] **Step 2: 验证**

Run: `ls -la .claude/agents`
Expected: 空目录。

- [ ] **Step 3: 不 commit**

空目录 git 不跟踪，跳过 commit，等 Task 5.2 一起 commit。

### Task 5.2: spec-workflow.md subagent

**Files:**
- Create: `tests/spec-workflow/spec-workflow-agent.test.ts`
- Create: `.claude/agents/spec-workflow.md`

- [ ] **Step 1: 写失败测试**

创建 `tests/spec-workflow/spec-workflow-agent.test.ts`：

```ts
import { test, expect } from "bun:test";
import { parseMarkdown, frontmatterField } from "./_helpers";

const AGENT = ".claude/agents/spec-workflow.md";

test("spec-workflow subagent frontmatter 字段完整", () => {
  const md = parseMarkdown(AGENT);
  expect(md.exists).toBe(true);
  expect(frontmatterField(md, "name")).toBe("spec-workflow");
  expect(md.frontmatter).toContain("description:");
  expect(md.frontmatter).toContain("tools:");
  expect(md.frontmatter).toContain("Read");
  expect(md.frontmatter).toContain("Write");
  expect(md.frontmatter).toContain("Edit");
  expect(md.frontmatter).toContain("Bash");
  expect(md.frontmatter).toContain("Skill");
  expect(md.frontmatter).toContain("Glob");
  expect(md.frontmatter).toContain("Grep");
  expect(md.frontmatter).toContain("skills:");
  expect(md.frontmatter).toContain("spec-writer");
  expect(md.frontmatter).toContain("spec-archiver");
});

test("spec-workflow subagent body 含输入契约 5 段", () => {
  const md = parseMarkdown(AGENT);
  expect(md.headings).toContain("## 输入契约");
  expect(md.body).toContain("## 需求来源");
  expect(md.body).toContain("## PRD 内容");
  expect(md.body).toContain("## 设计稿上下文");
  expect(md.body).toContain("## 用户补充");
  expect(md.body).toContain("## 你的任务");
});

test("spec-workflow subagent body 含 3 个 Step 编排逻辑", () => {
  const md = parseMarkdown(AGENT);
  expect(md.headings).toContain("## 执行流程");
  expect(md.headings).toContain("### Step 1: 调用 spec-writer");
  expect(md.headings).toContain("### Step 2: 调用 spec-archiver");
  expect(md.headings).toContain("### Step 3: 返回最终结果");
});

test("spec-workflow subagent body 含 SUCCESS / FAILED / PROGRESS 协议", () => {
  const md = parseMarkdown(AGENT);
  expect(md.body).toContain("SUCCESS");
  expect(md.body).toContain("FAILED");
  expect(md.body).toContain("PROGRESS:");
  expect(md.body).toContain("timeline");
});

test("spec-workflow subagent body 列出禁止行为", () => {
  const md = parseMarkdown(AGENT);
  expect(md.headings).toContain("## 禁止行为");
  expect(md.body).toContain("不读 URL");
  expect(md.body).toContain("不联网");
  expect(md.body).toContain("不派发其他 subagent");
  expect(md.body).toContain("不 git commit");
});

test("spec-workflow subagent body 强调失败不重试", () => {
  const md = parseMarkdown(AGENT);
  expect(md.headings).toContain("## 失败约定");
  expect(md.body).toMatch(/不自动重试|不重试/);
  expect(md.body).toMatch(/不部分回滚|不尝试部分回滚/);
});
```

- [ ] **Step 2: 跑测试，期望全部失败**

Run: `bun run test:specs`
Expected: 6 个新 test 全部失败。

- [ ] **Step 3: 创建 spec-workflow.md**

创建 `.claude/agents/spec-workflow.md`：

````markdown
---
name: spec-workflow
description: 处理 spec-driven workflow 完整流程 - 接收纯文本需求 + 源信息，调用 spec-writer 生成三件套到 _drafts，再调用 spec-archiver 归档并更新 .claude 规范。只被 /start-workflow 派发。
tools:
  - Read
  - Write
  - Edit
  - Bash
  - Skill
  - Glob
  - Grep
skills:
  - spec-writer
  - spec-archiver
---

# spec-workflow

你是 spec-driven workflow 的编排者。**只**被 `/start-workflow` slash command 派发，**不主动激活**。

你的角色是**薄编排层**：接收主线程构造好的纯文本输入，顺序调用 `spec-writer` 和 `spec-archiver`，把它们的返回值组装成结构化输出回给主线程。**不做任何业务理解** — 业务理解全部在 spec-writer 内部。

## 输入契约

主线程派发时给你一个固定 5 段格式的 prompt：

1. `## 需求来源` — `source_type` / `prd_url` / `design_url` / `design_tool` / `user_type` 等字段
2. `## PRD 内容` — 主线程从 Chrome 读取或用户自然语言（可能为 N/A）
3. `## 设计稿上下文` — 主线程从 figma MCP / Stitch / 截图提取（可能为 N/A）
4. `## 用户补充` — 可选
5. `## 你的任务` — 固定 2 步（invoke spec-writer → invoke spec-archiver → 输出结构化结果）

## 执行流程

### Step 1: 调用 spec-writer

输出：`PROGRESS: 加载 spec-writer skill`

用 `Skill` 工具 invoke `spec-writer`，把上面 1-4 段**原文**作为输入传入。

spec-writer 内部会：
- 识别 type（backend / frontend / fullstack；尊重用户 `user_type` 的显式指定）
- 生成 slug
- 读取 `.claude/ARCHITECTURE.md` / `SECURITY.md` / `CODING_GUIDELINES.md`
- 按 type 选模板生成三件套到 `specs/_drafts/<slug>/`
- 做一致性自检（最多 1 次自动修复）
- 返回 `{slug, type, drafts_path, source_meta, ...}`

**spec-writer 失败处理**：
- 返回 `{status: "failed", stage, reason, partial_files}` →
  - 输出 `FAILED` 顶层块（见 §返回结构）
  - 透传 `stage` 和 `reason`
  - **不**调用 spec-archiver
  - **不**重试

### Step 2: 调用 spec-archiver

输出：`PROGRESS: 加载 spec-archiver skill`

用 `Skill` 工具 invoke `spec-archiver`，传入：

```yaml
drafts_path: <从 spec-writer 返回值取>
slug: <从 spec-writer 返回值取>
type: <从 spec-writer 返回值取>
source_meta: <从 spec-writer 返回值取>
spec_writer_stats:
  type_classification: <从 spec-writer 返回值取>
  consistency_check: <从 spec-writer 返回值取>
  retry_count: <从 spec-writer 返回值取>
```

spec-archiver 内部会：
- validate-path（同日同 slug 冲突检查、存在性检查）
- move-drafts（mv _drafts → date-slug）
- write-meta（写 meta.json 含 git_commit_at_archive）
- diff-claude（按约定标题更新 .claude 规范，apply 失败时降级为 warning 不阻断）
- return-summary

**spec-archiver 失败处理**：
- 返回 `{status: "failed", stage, reason}` →
  - 输出 `FAILED` 顶层块
  - 透传 `stage` 和 `reason`
  - **不**重试

### Step 3: 返回最终结果

把 spec-writer 和 spec-archiver 的关键信息组装成结构化输出（见 §返回结构）。

## 返回结构

**成功路径**（顶格关键字 `SUCCESS`，方便主线程解析）：

```
PROGRESS: 加载 spec-writer skill
PROGRESS: 分类 type = fullstack
PROGRESS: 读取 .claude/ARCHITECTURE.md
PROGRESS: 读取 .claude/SECURITY.md
PROGRESS: 读取 .claude/CODING_GUIDELINES.md
PROGRESS: 生成 requirements.md
PROGRESS: 生成 design.md (fullstack 模板)
PROGRESS: 生成 tasks.md
PROGRESS: 三件套一致性自检
PROGRESS: 写入 specs/_drafts/<slug>/
PROGRESS: 加载 spec-archiver skill
PROGRESS: 归档到 specs/2026-04-10-<slug>/
PROGRESS: 写 meta.json
PROGRESS: diff 检查 .claude 规范文件
PROGRESS: 未检测到架构层变动，跳过规范更新

SUCCESS
archived_to: specs/2026-04-10-<slug>/
type: fullstack
slug: <slug>
source_type: prd_and_design
claude_updates: none
timeline:
  00:00 加载 spec-writer
  00:02 分类 + 读规范
  00:06 生成 requirements.md
  00:15 生成 design.md
  00:38 生成 tasks.md
  00:46 一致性自检
  00:48 _drafts 写入完成
  00:50 归档移动
  00:52 meta.json 写入
  00:54 diff 检查
总耗时: 54 秒
```

**失败路径**（顶格 `FAILED`）：

```
PROGRESS: 加载 spec-writer skill
PROGRESS: 分类 type = fullstack
PROGRESS: 读取 .claude/ARCHITECTURE.md

FAILED
stage: spec-writer:stage-3-read-norms
reason: 未找到 .claude/SECURITY.md，先运行 /bootstrap-claude-docs 创建规范文件
partial_files: []
```

**字段约定**：
- `archived_to` — 归档后的相对路径
- `claude_updates` — 取 `none` / `[<file list>]` / `error: <reason>` 三种之一
- `timeline` — 事后时间线，用户能看哪一步慢
- `partial_files` — spec-writer 已写但因失败留在 _drafts 的半成品文件路径列表

## 失败约定

- 任何步骤失败 → 立即返回 `FAILED: <原因>`
- **不自动重试**
- **不尝试部分回滚**（spec-writer 写了一半 → 文件留在 _drafts，等用户手动 review/清理）
- spec-writer / spec-archiver 内部失败也照此原则处理

## 禁止行为

- **不读 URL，不联网，不派发其他 subagent**
- **不改 .claude 规范文件以外的项目代码**（具体说：除了 spec-archiver 内部的 `.claude/{ARCHITECTURE,SECURITY,CODING_GUIDELINES}.md` 三个文件，其它一切不动）
- **不 git commit**
- **不修改 specs/_drafts/ 和 specs/YYYY-MM-DD-* 以外的路径**（`.claude/` 上述 3 文件除外）
````

- [ ] **Step 4: 跑测试通过**

Run: `bun run test:specs`
Expected: 6 个 spec-workflow-agent 测试全绿。

- [ ] **Step 5: Lint**

Run: `bun x ultracite check tests/spec-workflow/spec-workflow-agent.test.ts`
Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add tests/spec-workflow/spec-workflow-agent.test.ts .claude/agents/spec-workflow.md
git commit -m "feat(spec-workflow): \u65b0\u589e spec-workflow subagent \u5b9a\u4e49"
```

---

## Stage 6: /start-workflow slash command

**Stage 目标**：把 design.md §2 的主线程入口落地。这是 TG/用户接触的唯一入口。

### Task 6.1: /start-workflow.md slash command

**Files:**
- Create: `tests/spec-workflow/start-workflow-command.test.ts`
- Create: `.claude/commands/start-workflow.md`

- [ ] **Step 1: 写失败测试**

创建 `tests/spec-workflow/start-workflow-command.test.ts`：

```ts
import { test, expect } from "bun:test";
import { parseMarkdown, frontmatterField } from "./_helpers";

const COMMAND = ".claude/commands/start-workflow.md";

test("/start-workflow frontmatter 字段完整 + 工具白名单正确", () => {
  const md = parseMarkdown(COMMAND);
  expect(md.exists).toBe(true);
  expect(md.frontmatter).toContain("description:");
  expect(md.frontmatter).toContain("allowed-tools:");
  // 必须有的工具
  expect(md.frontmatter).toContain("Read");
  expect(md.frontmatter).toContain("Agent");
  expect(md.frontmatter).toContain("Bash");
  expect(md.frontmatter).toContain("mcp__Claude_in_Chrome__navigate");
  expect(md.frontmatter).toContain("mcp__Claude_in_Chrome__read_page");
  expect(md.frontmatter).toContain("mcp__Claude_in_Chrome__get_page_text");
  expect(md.frontmatter).toContain("mcp__figma__get_design_context");
  expect(md.frontmatter).toContain("mcp__figma__get_screenshot");
  expect(md.frontmatter).toContain("mcp__figma__get_figjam");
});

test("/start-workflow 显式不给 Write/Edit/WebFetch", () => {
  const md = parseMarkdown(COMMAND);
  // 通过分析 allowed-tools 段落而不是整个文件 — 避免 body 里描述时误判
  const allowedToolsSection = md.frontmatter ?? "";
  // Write 和 Edit 不应出现在 allowed-tools 中
  // （注意：这里只校验白名单段，design 文档可能在 body 里提及）
  const toolsLines = allowedToolsSection
    .split("\n")
    .filter((line) => line.trim().startsWith("- "));
  const tools = toolsLines.map((line) => line.replace(/^\s*-\s*/, "").trim());
  expect(tools).not.toContain("Write");
  expect(tools).not.toContain("Edit");
  expect(tools).not.toContain("WebFetch");
});

test("/start-workflow body 含输入解析逻辑", () => {
  const md = parseMarkdown(COMMAND);
  expect(md.headings).toContain("## 输入解析");
  expect(md.body).toContain("type=");
  expect(md.body).toContain("backend");
  expect(md.body).toContain("frontend");
  expect(md.body).toContain("fullstack");
  expect(md.body).toContain("figma.com");
  expect(md.body).toContain("classify_by_host");
});

test("/start-workflow body 含 URL 读取与降级", () => {
  const md = parseMarkdown(COMMAND);
  expect(md.headings).toContain("## URL 读取与降级");
  expect(md.body).toContain("L1");
  expect(md.body).toContain("L3");
  expect(md.body).toContain("Claude_in_Chrome");
  expect(md.body).toContain("sanity check");
});

test("/start-workflow body 含心跳输出与时间线", () => {
  const md = parseMarkdown(COMMAND);
  expect(md.headings).toContain("## TG 心跳");
  expect(md.body).toContain("→");
});

test("/start-workflow body 含 subagent 派发协议", () => {
  const md = parseMarkdown(COMMAND);
  expect(md.headings).toContain("## subagent 派发");
  expect(md.body).toContain("spec-workflow");
  expect(md.body).toContain("source_type");
  expect(md.body).toContain("user_type");
});

test("/start-workflow body 含结果转发与失败处理", () => {
  const md = parseMarkdown(COMMAND);
  expect(md.headings).toContain("## 结果转发");
  expect(md.body).toContain("SUCCESS");
  expect(md.body).toContain("FAILED");
  expect(md.body).toContain("bootstrap-claude-docs");
});
```

- [ ] **Step 2: 跑测试，期望全部失败**

Run: `bun run test:specs`
Expected: 7 个新 test 全部失败。

- [ ] **Step 3: 创建 start-workflow.md**

创建 `.claude/commands/start-workflow.md`：

````markdown
---
description: 启动 spec-driven workflow，从需求生成 requirements/design/tasks 三件套
allowed-tools:
  - Read
  - Agent
  - Bash
  - mcp__Claude_in_Chrome__navigate
  - mcp__Claude_in_Chrome__read_page
  - mcp__Claude_in_Chrome__get_page_text
  - mcp__Claude_in_Chrome__find
  - mcp__figma__get_design_context
  - mcp__figma__get_screenshot
  - mcp__figma__get_figjam
  - mcp__figma__get_metadata
  - mcp__figma__get_variable_defs
---

# /start-workflow

主线程入口：把用户需求（自然语言 / PRD URL / 设计稿 URL / 混合）转换成 spec 三件套并归档。

## 工具白名单设计

- **Read**：读项目文件，不写
- **Agent**：派发 `spec-workflow` subagent
- **Bash**：受限命令（Stitch 场景的 `curl -L`），**不**允许 `git` / `rm -rf` / `sudo`
- **Claude_in_Chrome**：L1 PRD URL 读取
- **figma MCP**：设计稿读取

**显式不给的工具**：
- `Write` / `Edit`：主线程不写文件，所有写在 subagent 内
- `WebFetch`：核心场景是内部登录态页面，L2 已被去掉

这是 TG 入口的**安全边界**：即使 prompt 被恶意注入，也调不出声明外的工具。

## 输入解析

第一步识别 `$ARGUMENTS` 形态并分类每个 token：

| 形态 | 示例 |
|---|---|
| 纯自然语言 | `/start-workflow 做一个头像上传功能` |
| 1 PRD URL | `/start-workflow https://jira.../PROJ-123` |
| 1 设计稿 URL | `/start-workflow https://figma.com/design/...` |
| PRD + 设计稿 | `/start-workflow <jira> <figma> 重点优化性能` |
| 多个同类 URL | `/start-workflow <jira-1> <jira-2>` （只用第 1 个） |
| 显式 type | `/start-workflow type=backend https://jira.../PROJ-123` |

**Token 分类伪代码**：

```
tokens = $ARGUMENTS.split()
prd_url = None
design_url = None
user_type = None
extra_tokens = []
ignored_urls = []

for tok in tokens:
  if tok.startswith('type='):
    value = tok[5:]
    if value in ('backend', 'frontend', 'fullstack'):
      user_type = value
    else:
      notify_tg(f"忽略无效 type 参数: {tok}，将回退到自动分类")
    continue

  if tok.startswith('http://') or tok.startswith('https://'):
    role = classify_by_host(tok)
    if role == 'design_source':
      if design_url is None: design_url = tok
      else: ignored_urls.append(tok)
    else:  # prd_source
      if prd_url is None: prd_url = tok
      else: ignored_urls.append(tok)
  else:
    extra_tokens.append(tok)

extra_description = ' '.join(extra_tokens)
```

**Host 分类规则**（`classify_by_host`）：

| Host 模式 | 角色 | 读取通道 |
|---|---|---|
| `figma.com/design/*` / `figma.com/file/*` | design_source (figma) | `mcp__figma__get_design_context` |
| `figma.com/board/*` | design_source (figjam) | `mcp__figma__get_figjam` |
| `figma.com/make/*` | design_source (figma-make) | `mcp__figma__get_design_context` |
| `stitch.withgoogle.com` | design_source (stitch) | Claude_in_Chrome 读页 + Bash `curl -L` 下载产物 |
| 其他任何域名 | prd_source | Claude_in_Chrome |

如果 `ignored_urls` 非空：

```
⚠️ 检测到 N 个额外 URL 已忽略，本版本只处理 1 个 PRD URL + 1 个设计稿 URL。
如需合并多个来源，请在用户补充描述里说明。
```

**`source_type` 规则**：
- `prd_only` — 只有 prd_url
- `design_only` — 只有 design_url
- `prd_and_design` — 两者都有
- `natural_language` — 两者都没有，只有 extra_tokens

## URL 读取与降级

**PRD URL 读取（L1 Claude_in_Chrome）**：

```
mcp__Claude_in_Chrome__navigate(prd_url)
  ↓
mcp__Claude_in_Chrome__read_page() 或 get_page_text()
  ↓
sanity check:
  - 文本长度 ≥ 200 字符？
  - 不含 "sign in" / "log in" / "login required" / "access denied" / "403" / "404" / "forbidden"？
  - title 不是 "Login" / "Error" / "Not Found" / "Forbidden"？
  - 看起来像需求内容？
  ↓
通过 → 作为 PRD 内容
失败 → 进入 L3
```

**设计稿 URL 读取**：

| design_tool | 工具 |
|---|---|
| figma | `mcp__figma__get_design_context` + `mcp__figma__get_screenshot` |
| figjam | `mcp__figma__get_figjam` |
| figma-make | `mcp__figma__get_design_context` |
| stitch | `mcp__Claude_in_Chrome__*` 读 Stitch 页 → 解析 Project ID / Screen ID → Bash `curl -L` 下载 |

**降级 L3**（任一源失败）：

```
TG 输出:
"无法自动读取 <prd | 设计稿> URL。原因: <具体原因>
请用以下任一方式补充:
  A. 直接回复该源的文字描述
  B. 回复该源的截图"

[主线程停下等用户回]

用户回复文字 → 作为该源的补充内容
用户回复图片 → 多模态解析图片文字 → 作为该源的补充内容
```

**两个源独立降级**：一个失败只影响该源的 L3 降级，另一个继续正常处理。两个源都拿到内容才进入 subagent 派发。

## TG 心跳

每个关键节点主动输出一行到 TG，让用户知道系统在做什么：

```
→ "收到需求，正在解析输入..."
→ "识别到 1 个 PRD URL + 1 个设计稿 URL"
→ "读取 PRD (Jira)..."
→ "✓ PRD 读取成功 (1.2KB)"
→ "读取设计稿 (Figma)..."
→ "✓ 设计稿读取成功 (含 3 个 frame)"
→ "派发 spec-workflow subagent..."
→ "⏳ 预计 30-90 秒，期间无中间输出"

[subagent 静默运行]

→ "✓ subagent 完成 (耗时 54 秒)"
→ "已归档到 specs/2026-04-10-<slug>/"
→ "<时间线>"
```

## subagent 派发

**前台同步模式**：

```
Agent(
  subagent_type="spec-workflow",
  description="生成 spec 三件套并归档",
  prompt=<下方固定格式>
)
```

**派发 prompt 固定格式**（subagent 靠这个结构解析输入）：

```
## 需求来源
source_type: <prd_only | design_only | prd_and_design | natural_language>
prd_url: <URL 或 N/A>
design_url: <URL 或 N/A>
design_tool: <figma | figjam | figma-make | stitch | screenshot | N/A>
user_type: <backend | frontend | fullstack | N/A>

## PRD 内容
<纯文本>

## 设计稿上下文
<纯文本 / 结构化描述 / N/A>

## 用户补充
<extra_description 或 N/A>

## 你的任务
1. 用 Skill 工具 invoke spec-writer, 传入上面全部输入段
2. 拿到 _drafts 路径后, 用 Skill 工具 invoke spec-archiver
3. 在 stdout 输出结构化最终结果

## 进度输出约定
每个关键步骤开始前单独输出一行:
  PROGRESS: <描述>

## 失败约定
任何步骤失败立即输出:
  FAILED: <原因>
不自动重试。
```

## 结果转发

subagent 返回后，按 `SUCCESS` / `FAILED` 顶层关键字解析，提取关键字段转发到 TG。

**SUCCESS 模板**：

```
✓ 完成
归档路径: <archived_to>
类型: <type>
源: <source 摘要>
.claude 规范更新: <claude_updates>

执行时间线:
  <timeline>
总耗时: <总秒数>

请 review 文件:
- <archived_to>/requirements.md
- <archived_to>/design.md
- <archived_to>/tasks.md
```

**FAILED 模板**：

```
❌ 失败
阶段: <stage>
原因: <reason>

建议:
- 若 stage 含 "stage-3-read-norms" → 提示运行 /bootstrap-claude-docs
- 其它 stage → 提示用户人工 review _drafts 下的半成品

已完成的步骤（从 PROGRESS 行抽取）:
  <已完成步骤列表>
```

**特殊提示**：如果 `FAILED` 的 `stage` 是 `spec-writer:stage-3-read-norms` 且 `reason` 提到 `.claude/`，TG 输出额外补一句：

```
建议: 先运行 /bootstrap-claude-docs 创建规范文件
(或手动创建 3 份规范后重试 /start-workflow)
```

## 禁止行为

- 不直接生成 spec 三件套（必须派发 subagent 完成）
- 不写 `.claude/` 规范文件（spec-archiver 的职责）
- 不 git commit
- 不绕过 subagent 直接调用 spec-writer / spec-archiver
- 不重试派发（subagent FAILED → 把错误透传给用户，让用户决定）
````

- [ ] **Step 4: 跑测试通过**

Run: `bun run test:specs`
Expected: 7 个 start-workflow-command 测试全绿。

- [ ] **Step 5: Lint**

Run: `bun x ultracite check tests/spec-workflow/start-workflow-command.test.ts`
Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add tests/spec-workflow/start-workflow-command.test.ts .claude/commands/start-workflow.md
git commit -m "feat(spec-workflow): \u65b0\u589e /start-workflow slash command"
```

---

## Stage 7: specs/ 目录骨架

**Stage 目标**：在仓库里建立 `specs/_drafts/` 占位目录 + `specs/README.md` 命名约定文档。这样 spec-writer 第一次写 `_drafts/<slug>/` 时目录已经存在，且任何人 clone 仓库都能看懂归档约定。

### Task 7.1: specs/README.md

**Files:**
- Create: `tests/spec-workflow/specs-scaffold.test.ts`
- Create: `specs/README.md`

- [ ] **Step 1: 写失败测试**

创建 `tests/spec-workflow/specs-scaffold.test.ts`：

```ts
import { test, expect } from "bun:test";
import { existsSync } from "node:fs";
import { parseMarkdown } from "./_helpers";

const README = "specs/README.md";
const DRAFTS_KEEP = "specs/_drafts/.gitkeep";

test("specs/README.md 含命名约定与 meta.json 字段说明", () => {
  const md = parseMarkdown(README);
  expect(md.exists).toBe(true);
  expect(md.headings).toContain("# specs/");
  expect(md.headings).toContain("## 目录约定");
  expect(md.headings).toContain("## 归档命名规则");
  expect(md.headings).toContain("## meta.json 字段");
  expect(md.body).toContain("YYYY-MM-DD-<slug>");
  expect(md.body).toContain("_drafts");
  expect(md.body).toContain("git_commit_at_archive");
});

test("specs/_drafts/.gitkeep 存在", () => {
  expect(existsSync(DRAFTS_KEEP)).toBe(true);
});
```

- [ ] **Step 2: 跑测试，期望 2 条失败**

Run: `bun run test:specs`
Expected: 2 个新 test 失败。

- [ ] **Step 3: 创建 specs/README.md**

```markdown
# specs/

本目录存放 spec-driven workflow 生成的需求规范三件套。所有文件由 `/start-workflow` 通过 `spec-workflow` subagent 自动生成与归档，**不**手动编辑结构。

## 目录约定

```
specs/
  README.md                       # 本文件
  _drafts/                        # spec-writer 临时输出区（生成中或归档前的半成品）
    <slug>/
      requirements.md
      design.md
      tasks.md
  YYYY-MM-DD-<slug>/              # spec-archiver 归档后的正式 spec
    requirements.md
    design.md
    tasks.md
    meta.json
```

**为什么分两个阶段**：

1. **原子性** — spec-writer 失败时半成品留在 `_drafts/`，不污染正式目录
2. **职责隔离** — spec-writer 只管"写"，spec-archiver 独占"归档决策"
3. **可检查** — spec-archiver 失败时 `_drafts/` 内容仍在，便于人工补救

## 归档命名规则

`specs/<YYYY-MM-DD>-<slug>/`：

- **日期** — spec-archiver 归档时的主机时区日期，由 `date +%Y-%m-%d` 取得
- **slug** — spec-writer 从需求标题推导。规则：
  - 中文字符保留原样
  - 英文字母小写
  - 标点 / 空格统一为 `-`，连续 `-` 合并
  - 长度 ≤ 40 个 Unicode 字符
  - 标题全是符号时 fallback 为 `ticket-<HHMMSS>`

**示例**：

```
specs/2026-04-10-用户个人资料页/
specs/2026-04-10-user-profile-page/
specs/2026-04-10-用户头像-upload/
specs/2026-04-10-api-接口重构/
```

## meta.json 字段

每个归档目录下的 `meta.json` 由 spec-archiver 写入，包含：

| 字段 | 含义 |
|---|---|
| `slug` | 同目录名后半段 |
| `type` | `backend` / `frontend` / `fullstack` 之一 |
| `archived_at` | spec-archiver 归档时的 ISO 时间戳 |
| `archived_path` | 目录相对路径 |
| `git_commit_at_archive` | 归档时 `git rev-parse HEAD` 的 sha；非 git 仓库或无 commit 时 `null` |
| `source.source_type` | `prd_only` / `design_only` / `prd_and_design` / `natural_language` |
| `source.prd_url` | 主线程读到的 PRD URL（或 `null`） |
| `source.design_url` | 主线程读到的设计稿 URL（或 `null`） |
| `source.design_tool` | `figma` / `figjam` / `figma-make` / `stitch` / `screenshot` / `null` |
| `source.user_type_specified` | 用户用 `type=` 显式指定的值，未指定时 `null` |
| `source.prd_fetched_at` | PRD 读取时的 ISO 时间戳 |
| `spec_writer.type_classification` | `auto` 或 `user-specified` |
| `spec_writer.consistency_check` | 当前固定 `passed`（失败时不会归档） |
| `spec_writer.retry_count` | 一致性自检的修复次数：`0` 或 `1` |
| `claude_updates.detected` | 是否触发了 `.claude/` 规范更新 |
| `claude_updates.updated_files` | 实际更新的 `.claude/<file>` 列表 |
| `claude_updates.diff_summary` | Claude 生成的 diff 摘要 |
| `claude_updates.error` | diff apply 失败时的错误（降级场景） |
| `related_specs` | 历史上最近一次同 slug 归档的路径，最多 1 条 |

## 工作流入口

- `/start-workflow <PRD URL> <design URL> <补充>` — 生成新 spec
- `/bootstrap-claude-docs` — 缺 `.claude/` 规范文件时初始化骨架

详见 `specs/2026-04-10-spec-workflow-mvp/design.md`。
```

- [ ] **Step 4: 创建 _drafts 占位**

Run: `mkdir -p specs/_drafts && touch specs/_drafts/.gitkeep`
Expected: 静默成功。

- [ ] **Step 5: 跑测试通过**

Run: `bun run test:specs`
Expected: 2 个新 test 全绿，全部测试也全绿。

- [ ] **Step 6: Commit**

```bash
git add tests/spec-workflow/specs-scaffold.test.ts specs/README.md specs/_drafts/.gitkeep
git commit -m "feat(specs): \u65b0\u589e specs/ \u76ee\u5f55\u9aa8\u67b6 + README"
```

---

## Stage 8: 端到端 smoke test

**Stage 目标**：在前面 7 个 stage 把所有 artifact 写完后，做一次**真人手动**的端到端测试，验证整条链路在真实 Claude Code 里跑得通。这一 stage 没有自动化测试 — 它的"测试"就是人类执行操作 + 观察输出 + 在本 plan 的 checkbox 上打勾。

**前置条件**：所有 stage 0-7 的 commit 都已完成，`bun run test:specs` 全绿。

### Task 8.1: 重启 Claude Code 让 .claude 配置生效

**Files:** 无

- [ ] **Step 1: 在 Claude Code 内重启会话**

新建一个 Claude Code 会话或运行 `/clear`。Claude Code 启动时扫描 `.claude/commands/` 和 `.claude/agents/` 目录注册新命令与 subagent。

- [ ] **Step 2: 验证 /start-workflow 和 /bootstrap-claude-docs 出现在 slash command 列表里**

在新会话里输入 `/` 触发命令补全，期望看到 `start-workflow` 和 `bootstrap-claude-docs` 两项。如果没看到，检查：
- `.claude/commands/start-workflow.md` 和 `.claude/commands/bootstrap-claude-docs.md` 文件存在
- frontmatter 解析正确（`bun run test:specs` 已经验证过结构）
- Claude Code 版本支持 `.claude/commands/` 目录

### Task 8.2: 跑 /bootstrap-claude-docs 创建 .claude 规范

**Files:**
- 由命令创建：`.claude/ARCHITECTURE.md` / `.claude/SECURITY.md` / `.claude/CODING_GUIDELINES.md`

- [ ] **Step 1: 在 Claude Code 内执行命令**

输入：`/bootstrap-claude-docs`

- [ ] **Step 2: 观察输出**

期望输出包含：
- `已创建: .claude/ARCHITECTURE.md`
- `已创建: .claude/SECURITY.md`
- `已创建: .claude/CODING_GUIDELINES.md`
- "下一步：编辑上述文件，填入真实项目信息"

- [ ] **Step 3: 验证文件实际写入**

Run（在 Claude Code 之外的 shell 或新一个 Bash tool 调用）: `ls -la .claude/`
Expected: 出现 3 个新文件，与 `.claude/skills/` `.claude/commands/` 等并列。

- [ ] **Step 4: 验证骨架内容正确**

Run: `head -5 .claude/ARCHITECTURE.md`
Expected: 第一行 `# Project Architecture`，第二行空，第三行以 `>` 开头的注释。

- [ ] **Step 5: 再跑一次命令验证幂等**

输入：`/bootstrap-claude-docs`（第二次）
Expected: 输出 3 行 `已存在，跳过: .claude/<file>`，**不**覆盖现有内容。

### Task 8.3: 给 .claude/*.md 填入真实项目信息

**Files:**
- Modify: `.claude/ARCHITECTURE.md`
- Modify: `.claude/SECURITY.md`
- Modify: `.claude/CODING_GUIDELINES.md`

- [ ] **Step 1: 编辑 .claude/ARCHITECTURE.md**

把骨架替换/补充为本仓库（Better-T-Stack）的真实信息：

- 技术栈：bun + TypeScript + React 19 + React Router 7 + Hono + Drizzle + Postgres + Cloudflare Workers
- 分层：apps/web (前端) + apps/server (后端) + packages/{auth,config,db,env,infra,ui}
- 核心模块：列出 packages 各自的职责
- 跨模块通信：HTTP（前 → 后）+ 直接 import（packages 之间）

具体内容由实施工程师按当前仓库实际情况填写，**不要超过 200 行**。

- [ ] **Step 2: 编辑 .claude/SECURITY.md**

按 better-auth + Cloudflare Workers + Postgres 的实际栈填写：
- 认证：better-auth (邮箱/密码 + OAuth)
- token 存储：cookie httpOnly
- 输入校验：zod (前后端共用 schema)
- 敏感数据：环境变量 + Cloudflare secret bindings

- [ ] **Step 3: 编辑 .claude/CODING_GUIDELINES.md**

- 命名风格：camelCase（已 ultracite 强制）
- 错误处理：throw Error 对象（已 ultracite 强制）
- 测试框架：bun:test
- 包管理器：bun

- [ ] **Step 4: Commit**

```bash
git add .claude/ARCHITECTURE.md .claude/SECURITY.md .claude/CODING_GUIDELINES.md
git commit -m "docs(claude): \u586b\u5145 ARCHITECTURE/SECURITY/CODING_GUIDELINES \u5b9e\u9645\u9879\u76ee\u4fe1\u606f"
```

### Task 8.4: 跑 /start-workflow 跑一个最小自然语言用例

**Files:**
- 由命令创建：`specs/<YYYY-MM-DD>-<slug>/{requirements.md,design.md,tasks.md,meta.json}`

- [ ] **Step 1: 执行命令**

输入（在 Claude Code 内）：

```
/start-workflow type=backend 给 server 加一个 /api/health 健康检查 endpoint，返回 {status: "ok", timestamp}
```

为什么用 `type=backend`：
- 验证用户显式 type 路径
- 用最简单的需求避免 Stage 4 生成耗时过长

- [ ] **Step 2: 观察心跳**

期望主线程依次输出：
- "收到需求，正在解析输入..."
- "识别到 0 个 PRD URL + 0 个设计稿 URL（自然语言模式）"
- "派发 spec-workflow subagent..."
- "⏳ 预计 30-90 秒"

- [ ] **Step 3: 等 subagent 完成**

期望最终输出 `SUCCESS` 块，含：
- `archived_to: specs/<today>-api-健康检查/` （或类似 slug）
- `type: backend`（用户显式指定）
- `claude_updates: none`（因为 design.md 的 3 个变更章节都会写"无"）
- `timeline:` 多行
- "总耗时: <N> 秒"

- [ ] **Step 4: 验证文件实际归档**

Run: `ls specs/`
Expected: 看到一个新的 `<today>-<slug>/` 目录。

Run: `ls specs/<today>-<slug>/`
Expected: `requirements.md` / `design.md` / `tasks.md` / `meta.json` 四个文件。

- [ ] **Step 5: 验证 meta.json 字段正确**

Run: `cat specs/<today>-<slug>/meta.json`
Expected: 包含
- `"type": "backend"`
- `"source": {"source_type": "natural_language", ...}`
- `"source.user_type_specified": "backend"`
- `"spec_writer.type_classification": "user-specified"`
- `"spec_writer.consistency_check": "passed"`
- `"spec_writer.retry_count": 0` 或 `1`
- `"claude_updates.detected": false`
- `"git_commit_at_archive": "<sha>"`
- `"related_specs": []`

- [ ] **Step 6: 验证三件套基本结构**

```bash
head -30 specs/<today>-<slug>/requirements.md
head -50 specs/<today>-<slug>/design.md
head -50 specs/<today>-<slug>/tasks.md
```

Expected：
- requirements.md 含 frontmatter（name, type, priority, source, created），含 `## 验收标准`
- design.md 含 backend 模板的 8 个章节（架构定位 / API 契约 / 数据模型 / 核心流程 / 架构变更 / 安全考虑 / 编码约定变更 / 性能与扩展性 / 错误处理与降级）
- design.md 的 `## 架构变更` / `## 安全考虑` / `## 编码约定变更` 三个章节内容应为 "无" 或简短描述
- tasks.md 含 Stage 1 / Stage 2 / 测试任务等结构

- [ ] **Step 7: 不 commit 这个 spec**

它是 smoke test 产物，不是真实 spec。Run: `git status` 确认它在工作目录但未 staged，然后留给实施工程师决定（删除 / 提交作为示例 / 留着作为后续真实 spec 的起点都可以）。

### Task 8.5: 验证失败路径（缺规范文件）

这个 task 验证 `/start-workflow` 在 `.claude/SECURITY.md` 缺失时是否正确报错并指引到 `/bootstrap-claude-docs`。

**Files:**
- 临时移走：`.claude/SECURITY.md`

- [ ] **Step 1: 临时移走 SECURITY.md**

Run: `mv .claude/SECURITY.md .claude/SECURITY.md.bak`

- [ ] **Step 2: 跑 /start-workflow 触发失败**

输入：`/start-workflow type=backend 测试缺规范文件场景`

- [ ] **Step 3: 观察 FAILED 输出**

期望主线程输出：
- `FAILED`
- `阶段: spec-writer:stage-3-read-norms` 或类似
- `原因: 未找到 .claude/SECURITY.md...`
- 建议提示包含 "运行 /bootstrap-claude-docs"

- [ ] **Step 4: 验证 _drafts 没留半成品**

Run: `ls specs/_drafts/`
Expected: 空（或只有 .gitkeep），因为 Stage 3 失败发生在 Stage 4 写文件之前。

- [ ] **Step 5: 恢复 SECURITY.md**

Run: `mv .claude/SECURITY.md.bak .claude/SECURITY.md`

- [ ] **Step 6: 不 commit**

无变更（恢复后状态与开始一致）。

### Task 8.6: 在 design.md §10 勾选完成项

**Files:**
- Modify: `specs/2026-04-10-spec-workflow-mvp/design.md` (§10)

- [ ] **Step 1: 编辑 §10 下一步段**

把 §10 的 3 个 checkbox 全部勾选（如果用户没有进一步反馈，前两个由本计划完成；第 3 个"按计划执行开发"也已完成）：

- [x] 用户 review 本 design.md
- [x] 调用 superpowers:writing-plans skill 输出实施计划
- [x] 按计划执行开发

- [ ] **Step 2: 跑全部测试最后确认**

Run: `bun run test:specs`
Expected: 所有 stage 的测试全绿。

- [ ] **Step 3: Commit**

```bash
git add specs/2026-04-10-spec-workflow-mvp/design.md
git commit -m "docs(spec): \u52fe\u9009 spec-workflow MVP design \u00a710 \u4e0b\u4e00\u6b65\u6e05\u5355"
```

---

## 全计划完成确认

完成所有 stage 后，最后验证：

- [ ] `bun run test:specs` 全绿（应有约 35+ test passed）
- [ ] `bun x ultracite check tests/spec-workflow/` 全绿
- [ ] `git log --oneline | head -30` 看到约 25 个 commit，按 stage 顺序排列
- [ ] `.claude/commands/` 下有 `start-workflow.md` 和 `bootstrap-claude-docs.md`
- [ ] `.claude/agents/` 下有 `spec-workflow.md`
- [ ] `.claude/skills/spec-writer` 和 `.claude/skills/spec-archiver` 是符号链接，`readlink` 指向 `.agents/skills/`
- [ ] `.agents/skills/spec-writer/` 含 `SKILL.md` + `templates/` (5 文件) + `checklists/consistency-check.md`
- [ ] `.agents/skills/spec-archiver/` 含 `SKILL.md`
- [ ] `.agents/skills/bootstrap-claude-docs/templates/` 含 3 份骨架
- [ ] `specs/README.md` 存在，`specs/_drafts/.gitkeep` 存在
- [ ] `package.json` 含 `test:specs` 脚本
- [ ] Stage 8 的端到端 smoke test 全部 step 已勾选

如果以上都满足，spec-workflow MVP 实施完成。下一个迭代（B 方案：task-executor）由后续 spec 启动。

---

## 注意事项汇总

### 工程师在执行本 plan 时容易踩的坑

1. **frontmatter 字段大小写敏感**：`name` / `description` / `allowed-tools` / `user-invocable` / `tools` / `skills` 全部小写。`User-Invocable` 不行。

2. **YAML 列表缩进**：`allowed-tools:` 下面的工具列表用 `  - <tool>` （两空格 + 短横线 + 空格），不是 tab。

3. **markdown 标题层级**：spec-writer SKILL.md 的 6 个 Stage 必须用 `### Stage N: <名>` 三级标题（因为 `## 执行流程` 是二级）。同理 spec-archiver 的 5 个 archive 子 stage 也是三级。spec-workflow subagent 的 3 个 Step 也是三级。

4. **符号链接的相对路径**：`.claude/skills/spec-writer -> ../../.agents/skills/spec-writer`。从 `.claude/skills/` 出发要往上两层（`..` 到 `.claude/`，再 `..` 到项目根），然后进 `.agents/skills/spec-writer`。

5. **测试文件 import 方式**：`import { test, expect } from "bun:test"`。不是 `vitest`，不是 `jest`。

6. **Bun.file vs node:fs**：本 plan 用 `node:fs` 的 `existsSync` 和 `readFileSync` 是因为它们是同步的，测试代码更简洁。Bun 完全支持 node:fs。

7. **bun:test 不支持 .skip / .only**：项目 lint 会拒绝（CLAUDE.md 明确禁止）。所有测试块用 `test()` 或 `it()`，不要加 `.skip`。

8. **Ultracite check 必须过**：每写完一个 .ts 测试文件就跑一次 `bun x ultracite check <file>`。常见问题：
   - 用 `for...of` 而不是 `.forEach`
   - 用 `const` 而不是 `let`
   - 函数返回类型显式标注（`: ParsedMarkdown`）
   - 不要用 `any`

9. **git 提交不写 Co-Authored-By**：用户全局偏好（CLAUDE.md），所有 commit 用纯净 message。

10. **commit message 用中文**：跟仓库现有 commit 风格一致（`docs(spec):` / `feat(spec-writer):` 等 conventional commit prefix + 中文描述）。

11. **空目录 git 不跟踪**：所以 `specs/_drafts/` 需要 `.gitkeep` 占位。`.claude/agents/` 在 Stage 5.1 创建后等到 5.2 写 spec-workflow.md 一起 commit。

12. **PROGRESS / SUCCESS / FAILED 是软约束**：design.md §3.8 已记录这是接受的软约束。Claude 在执行 SKILL.md / subagent 时按 prompt 指令输出，没有运行时强制。本 plan 的测试只验证文件里**写**了这些约定，不验证 Claude 实际**执行**时会输出。

13. **Stage 8 需要重启 Claude Code**：Claude Code 启动时扫描 `.claude/commands/` 和 `.claude/agents/`。新增配置后必须新会话或 `/clear` 才能识别。

14. **本 plan 不依赖 figma / Chrome MCP 实际可用**：所有静态测试都通过 markdown 解析完成。Stage 8 的 smoke test 用自然语言模式（无 URL）就能跑通。如果实施工程师后续想测试 URL 路径，需要先确保 MCP 配置正确（不在本 plan 范围）。

15. **Symlink 创建顺序**：先建 `.agents/skills/<name>/` 实体目录（哪怕只放一个 placeholder 文件），再建 `.claude/skills/<name>` 符号链接。空目录建立 symlink 也可以，但 git 不跟踪空目录所以提交时要确保实体目录里有内容。

### Plan 完成后的下一个 spec

`spec-workflow MVP` 完成后，下一个迭代（决策清单 #1 提到的 B 方案）是：

- **task-executor** skill：把 `tasks.md` 拆解到子任务并实际写代码
- **codex-reviewer + test-runner**：C 方案，跨模型协作验证

这两个不在本 plan 范围。
