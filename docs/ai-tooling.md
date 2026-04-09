# AI 编码助手配置说明

本项目由 [Better-T-Stack](https://github.com/AmanVarshney01/create-better-t-stack) 脚手架生成，为多个 AI 编码助手预置了统一的配置。

## 多工具配置对照表

| 工具 | 指令文件 | MCP 配置 | 编辑后 Hook |
|---|---|---|---|
| Claude Code | `.claude/CLAUDE.md` | `.mcp.json` | `.claude/settings.json` |
| Cursor | (需手动加 `.cursorrules`) | `.cursor/mcp.json` | `.cursor/hooks.json` |
| Codex (OpenAI) | `AGENTS.md` | `.codex/config.toml` | — |
| Gemini | `GEMINI.md` | — | — |
| VS Code Copilot | — | `.vscode/mcp.json` | — |

> `CLAUDE.md`、`AGENTS.md`、`GEMINI.md` 内容完全相同（Ultracite 编码规范）。
> MCP 服务器配置在多个文件中重复，只是格式不同（JSON / TOML），因为不同工具读取不同的配置文件。

## MCP 服务器

项目配置了 6 个 MCP 服务器，为 AI 助手提供外部工具和文档查询能力：

| 服务器 | 用途 |
|---|---|
| **better-t-stack** | Better-T-Stack 脚手架 MCP，支持添加 addon、创建项目等 |
| **context7** | 通用库/框架文档查询，优先于 web 搜索获取最新文档 |
| **cloudflare-docs** | Cloudflare 文档搜索 |
| **shadcn** | shadcn/ui 组件的搜索、查看、添加 |
| **neon** | Neon Serverless Postgres 数据库管理 |
| **better-auth** | Better Auth 认证库文档查询 |

## Skills 系统

Skills 是 AI 编码助手的"知识包"，让 AI 在写代码时自动遵循特定框架/库的最佳实践。

### 存放结构

```
.agents/skills/          # 实际文件存放目录
.claude/skills/          # 符号链接，指向 .agents/skills/
skills-lock.json         # 版本锁定（记录来源仓库和 hash）
```

`.claude/skills/` 下全部是指向 `.agents/skills/` 的符号链接，这样 Claude Code 和未来支持 skills 的其他代理都能共享同一份文件。

### 已安装的 9 个 Skills

| Skill | 来源仓库 | 作用 |
|---|---|---|
| **ai-sdk** | `vercel/ai` | Vercel AI SDK 用法指南（generateText、streamText 等） |
| **better-auth-best-practices** | `better-auth/skills` | Better Auth 认证库的配置和使用最佳实践 |
| **hono** | `yusukebe/hono-skill` | Hono Web 框架的路由、中间件、JSX、测试等 |
| **neon-postgres** | `neondatabase/agent-skills` | Neon Serverless Postgres 的连接、功能和本地开发 |
| **shadcn** | `shadcn/ui` | shadcn/ui 组件库的添加、搜索、调试、样式 |
| **ultracite** | `haydenbleasel/ultracite` | Ultracite 代码质量工具的用法 |
| **vercel-composition-patterns** | `vercel-labs/agent-skills` | React 组合模式（compound components、render props 等） |
| **vercel-react-best-practices** | `vercel-labs/agent-skills` | React/Next.js 性能优化最佳实践 |
| **web-design-guidelines** | `vercel-labs/agent-skills` | Web UI 设计、无障碍、UX 审查指南 |

### 兼容性

**目前只有 Claude Code 能消费 Skills。** Cursor 和 Codex 不支持 skills 机制，它们依赖 MCP 服务器和静态指令文件获取类似能力。

## Hook（编辑后自动格式化）

Claude Code 和 Cursor 都配置了编辑后 hook：每次 AI 修改文件后自动运行 `bun fix`（Ultracite 格式化），确保代码始终符合 Biome 规范。

- Claude Code: `.claude/settings.json` → `PostToolUse` hook
- Cursor: `.cursor/hooks.json` → `afterFileEdit` hook
