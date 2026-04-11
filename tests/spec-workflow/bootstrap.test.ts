import { expect, test } from "bun:test";
import { frontmatterField, parseMarkdown } from "./_helpers";

const SKIP_FILE_REGEX = /已存在.*跳过|跳过.*已存在/;

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
  expect(md.body).toMatch(SKIP_FILE_REGEX);
});
