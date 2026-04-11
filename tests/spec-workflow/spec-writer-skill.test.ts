import { expect, test } from "bun:test";
import { frontmatterField, parseMarkdown } from "./_helpers";

const SKILL = ".agents/skills/spec-writer/SKILL.md";
const FRONTMATTER_PRD_REGEX = /PRD|需求/;
const FRONTMATTER_DRAFTS_REGEX = /_drafts|drafts/;
const RULE_0_REGEX = /规则\s*0|Rule\s*0/;
const ALPHA_SCHEME_REGEX = /一次大调用|同一回答/;

test("spec-writer SKILL.md frontmatter 字段完整", () => {
  const md = parseMarkdown(SKILL);
  expect(md.exists).toBe(true);
  expect(frontmatterField(md, "name")).toBe("spec-writer");
  expect(frontmatterField(md, "user-invocable")).toBe("false");
  // description 必须包含输入和输出契约关键词
  expect(md.frontmatter).toContain("description:");
  expect(md.frontmatter).toMatch(FRONTMATTER_PRD_REGEX);
  expect(md.frontmatter).toMatch(FRONTMATTER_DRAFTS_REGEX);
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
  expect(md.body).toMatch(RULE_0_REGEX);
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
  expect(md.body).toMatch(ALPHA_SCHEME_REGEX);
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
