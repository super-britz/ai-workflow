---
description: 启动 spec-driven workflow，从需求生成 requirements/design/tasks 三件套
allowed-tools:
  - Read
  - Agent
  - Bash
  - mcp__Claude_in_Chrome__navigate
  - mcp__Claude_in_Chrome__read_page
  - mcp__Claude_in_Chrome__get_page_text
  - mcp__Claude_in_Chrome__find
  - mcp__figma__get_design_context
  - mcp__figma__get_screenshot
  - mcp__figma__get_figjam
  - mcp__figma__get_metadata
  - mcp__figma__get_variable_defs
---

# /start-workflow

主线程入口：把用户需求（自然语言 / PRD URL / 设计稿 URL / 混合）转换成 spec 三件套并归档。

## 工具白名单设计

- **Read**：读项目文件，不写
- **Agent**：派发 `spec-workflow` subagent
- **Bash**：受限命令（Stitch 场景的 `curl -L`），**不**允许 `git` / `rm -rf` / `sudo`
- **Claude_in_Chrome**：L1 PRD URL 读取
- **figma MCP**：设计稿读取

**显式不给的工具**：
- `Write` / `Edit`：主线程不写文件，所有写在 subagent 内
- `WebFetch`：核心场景是内部登录态页面，L2 已被去掉

这是 TG 入口的**安全边界**：即使 prompt 被恶意注入，也调不出声明外的工具。

## 输入解析

第一步识别 `$ARGUMENTS` 形态并分类每个 token：

| 形态 | 示例 |
|---|---|
| 纯自然语言 | `/start-workflow 做一个头像上传功能` |
| 1 PRD URL | `/start-workflow https://jira.../PROJ-123` |
| 1 设计稿 URL | `/start-workflow https://figma.com/design/...` |
| PRD + 设计稿 | `/start-workflow <jira> <figma> 重点优化性能` |
| 多个同类 URL | `/start-workflow <jira-1> <jira-2>` （只用第 1 个） |
| 显式 type | `/start-workflow type=backend https://jira.../PROJ-123` |

**Token 分类伪代码**：

```
tokens = $ARGUMENTS.split()
prd_url = None
design_url = None
user_type = None
extra_tokens = []
ignored_urls = []

for tok in tokens:
  if tok.startswith('type='):
    value = tok[5:]
    if value in ('backend', 'frontend', 'fullstack'):
      user_type = value
    else:
      notify_tg(f"忽略无效 type 参数: {tok}，将回退到自动分类")
    continue

  if tok.startswith('http://') or tok.startswith('https://'):
    role = classify_by_host(tok)
    if role == 'design_source':
      if design_url is None: design_url = tok
      else: ignored_urls.append(tok)
    else:  # prd_source
      if prd_url is None: prd_url = tok
      else: ignored_urls.append(tok)
  else:
    extra_tokens.append(tok)

extra_description = ' '.join(extra_tokens)
```

**Host 分类规则**（`classify_by_host`）：

| Host 模式 | 角色 | 读取通道 |
|---|---|---|
| `figma.com/design/*` / `figma.com/file/*` | design_source (figma) | `mcp__figma__get_design_context` |
| `figma.com/board/*` | design_source (figjam) | `mcp__figma__get_figjam` |
| `figma.com/make/*` | design_source (figma-make) | `mcp__figma__get_design_context` |
| `stitch.withgoogle.com` | design_source (stitch) | Claude_in_Chrome 读页 + Bash `curl -L` 下载产物 |
| 其他任何域名 | prd_source | Claude_in_Chrome |

如果 `ignored_urls` 非空：

```
⚠️ 检测到 N 个额外 URL 已忽略，本版本只处理 1 个 PRD URL + 1 个设计稿 URL。
如需合并多个来源，请在用户补充描述里说明。
```

**`source_type` 规则**：
- `prd_only` — 只有 prd_url
- `design_only` — 只有 design_url
- `prd_and_design` — 两者都有
- `natural_language` — 两者都没有，只有 extra_tokens

## URL 读取与降级

**PRD URL 读取（L1 Claude_in_Chrome）**：

```
mcp__Claude_in_Chrome__navigate(prd_url)
  ↓
mcp__Claude_in_Chrome__read_page() 或 get_page_text()
  ↓
sanity check:
  - 文本长度 ≥ 200 字符？
  - 不含 "sign in" / "log in" / "login required" / "access denied" / "403" / "404" / "forbidden"？
  - title 不是 "Login" / "Error" / "Not Found" / "Forbidden"？
  - 看起来像需求内容？
  ↓
通过 → 作为 PRD 内容
失败 → 进入 L3
```

**设计稿 URL 读取**：

| design_tool | 工具 |
|---|---|
| figma | `mcp__figma__get_design_context` + `mcp__figma__get_screenshot` |
| figjam | `mcp__figma__get_figjam` |
| figma-make | `mcp__figma__get_design_context` |
| stitch | `mcp__Claude_in_Chrome__*` 读 Stitch 页 → 解析 Project ID / Screen ID → Bash `curl -L` 下载 |

**降级 L3**（任一源失败）：

```
TG 输出:
"无法自动读取 <prd | 设计稿> URL。原因: <具体原因>
请用以下任一方式补充:
  A. 直接回复该源的文字描述
  B. 回复该源的截图"

[主线程停下等用户回]

用户回复文字 → 作为该源的补充内容
用户回复图片 → 多模态解析图片文字 → 作为该源的补充内容
```

**两个源独立降级**：一个失败只影响该源的 L3 降级，另一个继续正常处理。两个源都拿到内容才进入 subagent 派发。

## TG 心跳

每个关键节点主动输出一行到 TG，让用户知道系统在做什么：

```
→ "收到需求，正在解析输入..."
→ "识别到 1 个 PRD URL + 1 个设计稿 URL"
→ "读取 PRD (Jira)..."
→ "✓ PRD 读取成功 (1.2KB)"
→ "读取设计稿 (Figma)..."
→ "✓ 设计稿读取成功 (含 3 个 frame)"
→ "派发 spec-workflow subagent..."
→ "⏳ 预计 30-90 秒，期间无中间输出"

[subagent 静默运行]

→ "✓ subagent 完成 (耗时 54 秒)"
→ "已归档到 specs/2026-04-10-<slug>/"
→ "<时间线>"
```

## subagent 派发

**前台同步模式**：

```
Agent(
  subagent_type="spec-workflow",
  description="生成 spec 三件套并归档",
  prompt=<下方固定格式>
)
```

**派发 prompt 固定格式**（subagent 靠这个结构解析输入）：

```
## 需求来源
source_type: <prd_only | design_only | prd_and_design | natural_language>
prd_url: <URL 或 N/A>
design_url: <URL 或 N/A>
design_tool: <figma | figjam | figma-make | stitch | screenshot | N/A>
user_type: <backend | frontend | fullstack | N/A>

## PRD 内容
<纯文本>

## 设计稿上下文
<纯文本 / 结构化描述 / N/A>

## 用户补充
<extra_description 或 N/A>

## 你的任务
1. 用 Skill 工具 invoke spec-writer, 传入上面全部输入段
2. 拿到 _drafts 路径后, 用 Skill 工具 invoke spec-archiver
3. 在 stdout 输出结构化最终结果

## 进度输出约定
每个关键步骤开始前单独输出一行:
  PROGRESS: <描述>

## 失败约定
任何步骤失败立即输出:
  FAILED: <原因>
不自动重试。
```

## 结果转发

subagent 返回后，按 `SUCCESS` / `FAILED` 顶层关键字解析，提取关键字段转发到 TG。

**SUCCESS 模板**：

```
✓ 完成
归档路径: <archived_to>
类型: <type>
源: <source 摘要>
.claude 规范更新: <claude_updates>

执行时间线:
  <timeline>
总耗时: <总秒数>

请 review 文件:
- <archived_to>/requirements.md
- <archived_to>/design.md
- <archived_to>/tasks.md
```

**FAILED 模板**：

```
❌ 失败
阶段: <stage>
原因: <reason>

建议:
- 若 stage 含 "stage-3-read-norms" → 提示运行 /bootstrap-claude-docs
- 其它 stage → 提示用户人工 review _drafts 下的半成品

已完成的步骤（从 PROGRESS 行抽取）:
  <已完成步骤列表>
```

**特殊提示**：如果 `FAILED` 的 `stage` 是 `spec-writer:stage-3-read-norms` 且 `reason` 提到 `.claude/`，TG 输出额外补一句：

```
建议: 先运行 /bootstrap-claude-docs 创建规范文件
(或手动创建 3 份规范后重试 /start-workflow)
```

## 禁止行为

- 不直接生成 spec 三件套（必须派发 subagent 完成）
- 不写 `.claude/` 规范文件（spec-archiver 的职责）
- 不 git commit
- 不绕过 subagent 直接调用 spec-writer / spec-archiver
- 不重试派发（subagent FAILED → 把错误透传给用户，让用户决定）
