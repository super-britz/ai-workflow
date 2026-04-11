import { expect, test } from "bun:test";
import { frontmatterField, parseMarkdown } from "./_helpers";

test("parseMarkdown 对不存在的文件返回 exists=false", () => {
  const result = parseMarkdown("tests/spec-workflow/__nope__.md");
  expect(result.exists).toBe(false);
  expect(result.headings).toEqual([]);
});

test("parseMarkdown 解析现有 design.md", () => {
  const result = parseMarkdown("specs/2026-04-10-spec-workflow-mvp/design.md");
  expect(result.exists).toBe(true);
  expect(result.frontmatter).not.toBeNull();
  expect(result.headings.length).toBeGreaterThan(20);
});

test("frontmatterField 提取 design.md 的 type 字段", () => {
  const result = parseMarkdown("specs/2026-04-10-spec-workflow-mvp/design.md");
  expect(frontmatterField(result, "type")).toBe("meta-workflow");
});
