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
