import { expect, test } from "bun:test";
import { frontmatterField, parseMarkdown } from "./_helpers";

const SKILL = ".agents/skills/spec-archiver/SKILL.md";
const HARD_FAIL_REGEX = /硬失败|FAILED/;

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
  expect(md.body).toMatch(HARD_FAIL_REGEX);
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
