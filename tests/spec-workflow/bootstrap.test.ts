import { expect, test } from "bun:test";
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
