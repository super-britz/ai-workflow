import { expect, test } from "bun:test";
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

const DESIGN_FRONTEND =
  ".agents/skills/spec-writer/templates/design-frontend.md";

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

const DESIGN_FULLSTACK =
  ".agents/skills/spec-writer/templates/design-fullstack.md";

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
