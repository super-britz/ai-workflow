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
