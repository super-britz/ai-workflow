# 工作流环境说明

本文档描述 AI Workflow 系统依赖的**基础设施层**：所有插件、运行时、浏览器集成、MCP 服务器的来源与配置位置，以及新环境如何复刻。

> 本文档只涉及**环境准备**，不涉及工作流本身（skill / slash command / spec 流程）。workflow 层待后续补充。
> 关于 Better-T-Stack 项目的基础 AI 工具（多工具配置、项目级 MCP、Skills），详见 [ai-tooling.md](./ai-tooling.md)。

## 层级划分

环境组件分两层：

| 层级 | 范围 | 配置位置 | 随 git 提交 |
|---|---|---|---|
| 用户级 | Claude Code 全局 | `~/.claude/`、`~/Library/Application Support/Claude/` | 否 |
| 项目级 | 仅当前 repo | `.mcp.json`、`.claude/`、`.agents/` | 是 |

换机器时，项目级配置跟 git 一起到；用户级配置需要重新搭一次（见文末复刻步骤）。

## 组件总览

| 组件 | 层级 | 状态 | 用途 |
|---|---|---|---|
| Superpowers 插件 | 用户级 | 已启用 | brainstorming / writing-plans / TDD 等流程 skills |
| Telegram 插件 | 用户级 | 已启用 | TG ↔ Claude session 双向消息转发 |
| Codex 插件 | 用户级 | 已启用 | 提供 codex:codex-rescue subagent |
| Codex CLI | 用户级 | 0.116.0 | GPT-5.4 驱动的第二 AI 代理 |
| Codex companion runtime | 用户级 | direct 模式 | Claude ↔ Codex 的胶水层 |
| OpenAI 登录态 | 用户级 | 已认证 | Codex CLI 调用 GPT-5.4 所需 |
| Claude_in_Chrome | 用户级 | 桌面 App 内置 | 浏览器自动化（读 URL、点击、截图） |
| chrome-devtools MCP | 用户级 | 未连接（可选） | 备选 CDP 调试通道，本工作流不使用 |
| 9 个技术栈 skills | 项目级 | 已安装 | Hono / React / Drizzle / Better Auth 等最佳实践 |
| 6 个 MCP 服务器 | 项目级 | 见 ai-tooling.md | 文档查询 / shadcn / Neon 等 |
| Biome PostToolUse hook | 项目级 | 已启用 | 编辑后自动 `bun fix` |

## Claude Code 插件（用户级）

启用位置：`~/.claude/settings.json` → `enabledPlugins`。

```json
"enabledPlugins": {
  "telegram@claude-plugins-official": true,
  "superpowers@claude-plugins-official": true,
  "codex@openai-codex": true
}
```

插件的来源仓库：

- `telegram@claude-plugins-official` / `superpowers@claude-plugins-official` → [anthropics/claude-plugins-official](https://github.com/anthropics/claude-plugins-official)
- `codex@openai-codex` → [openai/codex-plugin-cc](https://github.com/openai/codex-plugin-cc)

本地插件缓存目录：`~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/`

### superpowers

提供流程型 skills：`brainstorming`、`writing-plans`、`executing-plans`、`test-driven-development`、`systematic-debugging`、`requesting-code-review`、`using-git-worktrees` 等。

本工作流使用它的 `brainstorming → writing-plans → executing-plans` 流程做 spec 驱动开发。

### telegram

将 TG bot 收到的消息转发到一个 Claude Code session，Claude 的输出也会回到 TG 对话。**这是天然的双向通道**，不需要额外的 webhook 或 sh 脚本。

工作流中的用途：

- **触发**：用户在 TG 发 `/start-workflow <URL|描述>`，Claude Code 收到后执行对应 slash command
- **通知 / 审批**：workflow 需要用户确认时，Claude 在 session 里直接输出"请回复 approve/reject"，用户在 TG 回复即可，无需额外通道

### codex

插件内容：

| 文件 | 内容 |
|---|---|
| `agents/codex-rescue.md` | `codex:codex-rescue` subagent 定义 |
| `skills/codex-rescue/` | `codex:rescue` skill（用户可调用） |
| `skills/codex-cli-runtime/` | 内部 skill，描述 codex-companion 调用规范 |
| `skills/gpt-5-4-prompting/` | Codex prompt 优化 skill |
| `scripts/codex-companion.mjs` | 运行时胶水脚本 |
| `commands/` | `/codex:setup`、`/codex:status`、`/codex:rescue` 等 slash commands |

## Codex 双模型协作

### 调用链

```
Claude Code（Opus 4.6）
  │ Agent 工具，subagent_type: "codex:codex-rescue"
  ▼
codex:codex-rescue subagent
  │ Bash: node codex-companion.mjs task "<prompt>"
  ▼
codex-companion.mjs（Node.js 胶水）
  │ 调起本地 Codex CLI
  ▼
Codex CLI（GPT-5.4，可通过 --model 切换）→ 读写文件 / 执行命令
  │
  ▼
stdout 原样返回给 Claude
```

Codex **不是** MCP 服务器，也不是外部 API 调用。它是**本地子进程**，通过 Claude Code 的 Agent 工具原生派发，运行在用户机器上。

### 验证命令

在 Claude Code 里执行：

```
/codex:setup
```

预期输出：

```json
{
  "ready": true,
  "node":  { "available": true, "detail": "v22.22.0" },
  "npm":   { "available": true, "detail": "10.9.4" },
  "codex": { "available": true, "detail": "codex-cli 0.116.0; advanced runtime available" },
  "auth":  { "available": true, "loggedIn": true },
  "sessionRuntime": { "mode": "direct" },
  "reviewGateEnabled": false
}
```

### Review Gate（可选，本工作流不启用）

`/codex:setup --enable-review-gate` 会在每次 Claude session 停止前强制要求 Codex review。

**本工作流不启用**：review 只在 workflow 内部的 `codex-reviewer` 环节明确触发，日常 session 结束不需要全局钩子，否则会干扰其他操作。

## 浏览器自动化（Claude_in_Chrome）

**这不是 MCP 服务器，是 Claude 桌面 App 的内置能力。**

### 开关位置

```json
// ~/Library/Application Support/Claude/claude_desktop_config.json
{
  "preferences": {
    "allowAllBrowserActions": true
  }
}
```

打开后，Claude Code session 中自动出现 `mcp__Claude_in_Chrome__*` 工具：`navigate`、`get_page_text`、`read_page`、`find`、`form_input`、`javascript_tool`、`read_console_messages`、`read_network_requests` 等。

底层是 Claude 专有的浏览器通道（不是 CDP），连接的是用户正在使用的 Chrome 实例——**可复用浏览器已有的登录态**，这正是读取 Jira / Confluence 等内网 URL 的关键。

### 工作流中的用途

- 读取需要登录态的 URL（Jira / Confluence / Notion / 内部 wiki 等）
- 抓取网页截图供 design 阶段使用
- 实时查看页面 console / network 辅助调试

### 与 chrome-devtools MCP 的区别

| | Claude_in_Chrome | chrome-devtools MCP |
|---|---|---|
| 来源 | 桌面 App 内置 | `claude mcp add` 手动注册 |
| 协议 | Claude 专有浏览器通道 | Chrome DevTools Protocol (CDP) |
| 目标 | 用户正在使用的 Chrome | 独立启动的 Chrome 实例 |
| 当前状态 | 可用 | 未连接 |
| 本工作流使用 | 是（首选） | 否 |

两者解决的是不同场景：`Claude_in_Chrome` 贴近用户当前浏览器上下文，`chrome-devtools` 贴近无头调试。**本工作流只使用前者**。

## 项目级配置

### MCP 服务器

6 个项目级 MCP 服务器（`better-t-stack`、`context7`、`cloudflare-docs`、`shadcn`、`neon`、`better-auth`），配置在 `.mcp.json`。详见 [ai-tooling.md](./ai-tooling.md)。

### 技术栈 Skills

9 个框架最佳实践 skills（Hono / React / Drizzle / Better Auth / Ultracite 等），存放在 `.agents/skills/`，通过 `.claude/skills/` 符号链接暴露给 Claude Code。详见 [ai-tooling.md](./ai-tooling.md)。

### Hooks

`.claude/settings.json`：

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          { "type": "command", "command": "bun fix --skip=correctness/noUnusedImports" }
        ]
      }
    ]
  }
}
```

每次 Claude 写或改文件后自动跑 `bun fix`（Ultracite 格式化）。

**工作流层不需要额外的 hook**：

- TG 通知用 Claude 直接在 session 里输出（telegram 插件反向转发到 TG 对话）
- 审批 gate 用"Claude 停下等用户回 approve/reject"实现
- 无需任何 shell 脚本 hook

## 新环境复刻步骤（用户级）

换机器后，克隆 repo 只能恢复项目级配置。以下用户级配置需要重做：

1. 安装 Claude Code CLI 和桌面 App
2. 开启桌面 App 的浏览器自动化：编辑 `~/Library/Application Support/Claude/claude_desktop_config.json`，添加 `"preferences": { "allowAllBrowserActions": true }`
3. 编辑 `~/.claude/settings.json`，在 `enabledPlugins` 启用三个插件（telegram、superpowers、codex）
4. 安装 Codex CLI：`npm i -g @openai/codex`
5. 登录 OpenAI：`codex login`
6. 在 Claude Code 里跑 `/codex:setup`，确认输出 `"ready": true`
7. 配置 Telegram bot token（通过 `/telegram:configure` 或手动设置）

完成后，用户级环境就和原机器对齐了。
