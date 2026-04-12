import { expect, test } from "bun:test";
import { parseMarkdown } from "./_helpers";

const COMMAND = ".claude/commands/start-workflow.md";
const BULLET_REGEX = /^\s*-\s*/;

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
  const tools = toolsLines.map((line) => line.replace(BULLET_REGEX, "").trim());
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
