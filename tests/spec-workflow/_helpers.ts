import { existsSync, readFileSync } from "node:fs";

export interface ParsedMarkdown {
  body: string;
  content: string;
  exists: boolean;
  frontmatter: string | null;
  headings: string[];
}

const FRONTMATTER_REGEX = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
const HEADING_REGEX = /^#{1,6}\s+.+$/gm;

export function parseMarkdown(path: string): ParsedMarkdown {
  if (!existsSync(path)) {
    return {
      exists: false,
      content: "",
      frontmatter: null,
      body: "",
      headings: [],
    };
  }
  const content = readFileSync(path, "utf8");
  const fmMatch = content.match(FRONTMATTER_REGEX);
  const frontmatter = fmMatch ? fmMatch[1] : null;
  const body = fmMatch ? fmMatch[2] : content;
  const headings = body.match(HEADING_REGEX) ?? [];
  return {
    exists: true,
    content,
    frontmatter,
    body,
    headings: headings.map((h) => h.trim()),
  };
}

export function frontmatterField(
  parsed: ParsedMarkdown,
  field: string
): string | null {
  if (!parsed.frontmatter) {
    return null;
  }
  const lineRegex = new RegExp(`^${field}:\\s*(.+)$`, "m");
  const match = parsed.frontmatter.match(lineRegex);
  return match ? match[1].trim() : null;
}
