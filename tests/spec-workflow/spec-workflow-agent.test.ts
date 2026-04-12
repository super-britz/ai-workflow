import { expect, test } from "bun:test";
import { frontmatterField, parseMarkdown } from "./_helpers";

const AGENT = ".claude/agents/spec-workflow.md";

// Regex literals at module level (Biome useTopLevelRegex rule)
const NO_RETRY_REGEX = /不自动重试|不重试/;
const NO_ROLLBACK_REGEX = /不部分回滚|不尝试部分回滚/;

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
  expect(md.body).toMatch(NO_RETRY_REGEX);
  expect(md.body).toMatch(NO_ROLLBACK_REGEX);
});
