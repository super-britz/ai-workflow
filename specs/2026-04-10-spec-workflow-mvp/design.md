---
name: spec-workflow MVP
status: in-progress (design)
type: meta-workflow
source: 用户需求讨论（brainstorming 阶段）
created: 2026-04-10
---

# spec-workflow MVP - Design

本文档设计一个 **spec-driven workflow 系统**，通过 TG 触发、Claude Code 主线程编排、subagent 封装的方式，把用户需求一次性转换为 `requirements.md + design.md + tasks.md` 三件套，并自动归档到 `specs/` 目录。

> 这是"第一个迭代"的 MVP 设计，对应范围决策 **A 方案**（见下方决策清单）。后续迭代会扩展到 B（task-executor）、C（codex-reviewer + test-runner）。

---

## 范围与决策清单

在进入详细设计前，先列出已经达成一致的关键决策，便于后续章节参照：

| # | 维度 | 决策 |
|---|---|---|
| 1 | 迭代范围 | **A 方案（MVP）**：`spec-writer` + `spec-archiver` + `/start-workflow`，只跑通"需求 → 规范 → 归档" |
| 2 | 需求类型分流 | **Z 方案**：单 `spec-writer` skill 内部按 `type: backend / frontend / fullstack` 分流，使用不同 design 模板和 tasks 排序 |
| 3 | skill 职责划分 | **β 方案**：两个 skill 串联（`spec-writer` 生成，`spec-archiver` 归档），关注点分离 |
| 4 | 分层机制 | **Subagent 封装**：新建 `spec-workflow` subagent，绑定两个底层 skill，主线程 context 只看得到 subagent 入口 |
| 5 | URL 读取位置 | **主线程**（不在 subagent），便于降级时和用户对话式补充 |
| 6 | URL 降级策略 | L1 `Claude_in_Chrome` → L3 用户手动补充（文字或截图）。**去掉 L2 WebFetch**，因为核心场景是内部登录态页面 |
| 7 | 双源融合 | 支持 1 个 PRD URL + 1 个设计稿 URL 的组合。设计稿走 `figma MCP` 或 Stitch |
| 8 | subagent 运行模式 | **D 方案**：前台同步 + 派发前心跳提示 + 事后时间线。不用后台轮询 |
| 9 | 失败策略 | subagent 任何步骤失败 → 立即返回 `FAILED:` + 原因，**不自动重试**，不做部分回滚 |
| 10 | 进度输出 | 主线程每个关键节点即时输出到 TG。subagent 运行期间静默，结束后展示 `PROGRESS:` 轨迹 + 时间线 |

---

## 第 1 节：整体架构 + 文件结构

### 1.1 核心流程图

```
                         TG 消息
                           │
                           ▼
                  /start-workflow <输入>
                           │
      ┌────────────────────┴────────────────────┐
      │           主线程（Opus）                 │
      │                                          │
      │  1. 解析输入类型 (URL / 自然语言 / 混合)  │
      │  2. URL 分类: PRD / 设计稿                │
      │  3. 各源独立读取:                         │
      │     - PRD → Claude_in_Chrome              │
      │     - 设计稿 → figma MCP / Stitch         │
      │  4. 失败 → L3 用户手动补充                │
      │  5. 派发 spec-workflow subagent (前台)    │
      │  6. 接收结果 → 转发 TG                    │
      └────────────────────┬────────────────────┘
                           │
                           ▼
      ┌───────────────────────────────────────┐
      │     spec-workflow subagent            │
      │     （独立 context，绑定 2 个 skill） │
      │                                       │
      │  tools: Read/Write/Edit/Bash/Skill    │
      │         /Glob/Grep                    │
      │                                       │
      │  职责: 编排 spec-writer → spec-archiver│
      │  失败: 立即 FAILED, 不重试             │
      └──────────────────┬────────────────────┘
                         │
          ┌──────────────┴──────────────┐
          ▼                             ▼
    [spec-writer]               [spec-archiver]
      ├─ 分类 type               ├─ _drafts → specs/YYYY-MM-DD-<slug>/
      ├─ 读 .claude 规范         ├─ 写 meta.json
      ├─ 按模板生成三件套        ├─ diff 判断是否更新 .claude
      ├─ 一致性自检              └─ 返回归档路径 + 更新摘要
      └─ 写入 specs/_drafts/<slug>/
```

### 1.2 文件结构

```
.claude/
  commands/
    start-workflow.md        ← slash command prompt (新增)
  agents/
    spec-workflow.md         ← subagent 定义 (新增)
  skills/                    ← 符号链接 → .agents/skills/ (已存在)
  ARCHITECTURE.md            ← 项目架构规范 (新增, bootstrap 阶段创建)
  SECURITY.md                ← 安全规范 (新增)
  CODING_GUIDELINES.md       ← 编码规范 (新增)
  CLAUDE.md                  ← 已存在（Ultracite 规范）
  settings.json              ← 已存在

.agents/
  skills/
    spec-writer/             ← 新增
      SKILL.md               ← user-invocable: false
      templates/
        requirements.md      ← 通用需求模板
        backend.md           ← design.md 后端章节模板
        frontend.md          ← design.md 前端章节模板
        fullstack.md         ← design.md 全栈章节模板
        tasks.md             ← 通用任务模板
    spec-archiver/           ← 新增
      SKILL.md               ← user-invocable: false

specs/                       ← 归档根目录 (新增)
  README.md                  ← 命名规则 + 归档格式说明
  _drafts/                   ← spec-writer 临时输出区
    <slug>/
      requirements.md
      design.md
      tasks.md
  2026-04-10-user-profile/   ← spec-archiver 归档后的示例
    requirements.md
    design.md
    tasks.md
    meta.json                ← type / source / 时间戳 / .claude 更新摘要
```

**为什么分 `_drafts/` 和正式目录两阶段**：

1. **原子性**：spec-writer 生成失败（比如一致性自检没过）时，`_drafts/` 里的半成品不会污染正式的 `specs/`
2. **职责隔离**：spec-writer 只管"生成"，不需要知道命名约定和归档元数据格式；spec-archiver 独占"归档决策"
3. **可检查**：如果 spec-archiver 失败，`_drafts/` 里的内容还在，方便 debug 和手动补救

### 1.3 组件清单

| 组件 | 层级 | 数量 | 状态 |
|---|---|---|---|
| Slash command | `.claude/commands/` | 1 | ✅ 新增 `start-workflow.md` |
| Subagent | `.claude/agents/` | 1 | ✅ 新增 `spec-workflow.md` |
| Skills | `.agents/skills/` | 2 | ✅ 新增 `spec-writer` + `spec-archiver` |
| 规范文件 | `.claude/` | 3 | ✅ 新增 ARCHITECTURE / SECURITY / CODING_GUIDELINES |
| 归档目录 | `specs/` | 1 | ✅ 新增根目录 + `_drafts/` + `README.md` |

### 1.4 数据流一句话总结

> **主线程**负责 "输入 → 纯文本" + "结果 → TG"，**subagent** 负责 "纯文本 → 三件套 → 归档"，两者通过 Agent 工具的标准 prompt/return 机制通信，底层 skill 对主线程 context 完全透明。

---

## 第 2 节：主线程流程详细设计

### 2.1 `/start-workflow` slash command

**文件**：`.claude/commands/start-workflow.md`

**frontmatter**：

```yaml
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
```

**工具白名单设计原则**：

- **Read**: 读主线程需要的项目文件（不写）
- **Agent**: 派发 `spec-workflow` subagent
- **Bash**: 只允许受限命令（Stitch 场景下的 `curl -L` 下载产物），不允许 `git` / `rm -rf` / `sudo`
- **Claude_in_Chrome**: L1 URL 读取（PRD）
- **figma MCP**: 设计稿读取
- **显式不给的工具**：`Write` / `Edit`（主线程不写文件，所有写操作在 subagent 内完成）；`WebFetch`（L2 已被去掉）

这是 TG 入口的**安全边界**：即使 prompt 被恶意注入，也调不出声明外的工具。

### 2.2 输入解析逻辑

主线程第一步识别输入形态并分类每个 token：

| 形态 | 示例 | 处理 |
|---|---|---|
| 纯自然语言 | `/start-workflow 做一个头像上传功能，支持裁剪` | 直接组装 subagent 输入 |
| 1 PRD URL | `/start-workflow https://jira.example.com/browse/PROJ-123` | 走 PRD 读取路径 |
| 1 设计稿 URL | `/start-workflow https://www.figma.com/design/abc/...` | 走设计稿读取路径 |
| PRD + 设计稿 | `/start-workflow <jira-url> <figma-url> 重点优化性能` | 双源融合 |
| 多个同类 URL | `/start-workflow <jira-url-1> <jira-url-2>` | 只处理第 1 个，TG 提示"已忽略 N 个同类 URL" |
| **显式指定 type** | `/start-workflow type=backend https://jira.../PROJ-123` | 跳过 spec-writer 自动分类，强制使用指定 type |

**显式指定 type（可选）**：用户可以在 `/start-workflow` 后的任意位置加一个 `type=<backend\|frontend\|fullstack>` 参数，主线程识别后透传给 subagent，spec-writer 收到后**跳过自动分类，直接用用户指定的 type**。

```
/start-workflow type=backend https://jira.../PROJ-123
/start-workflow type=frontend 做一个头像上传功能
/start-workflow https://jira.../PROJ-1 https://figma.com/design/abc type=fullstack 重点关注性能
```

只有 `backend` / `frontend` / `fullstack` 三个值有效，其他值视为无效并在 TG 提示用户 + 回退到自动分类。

**URL 分类规则**（按 host 匹配）：

| Host 模式 | 角色 | 读取通道 |
|---|---|---|
| `figma.com/design/*` / `figma.com/file/*` | design_source (figma) | `mcp__figma__get_design_context` |
| `figma.com/board/*` | design_source (figjam) | `mcp__figma__get_figjam` |
| `figma.com/make/*` | design_source (figma-make) | `mcp__figma__get_design_context` |
| `stitch.withgoogle.com` | design_source (stitch) | Claude_in_Chrome 读页面 + `curl -L` 下载产物 |
| 其他任何域名 | prd_source | Claude_in_Chrome |

**Token 分类算法**（简化版伪代码）：

```
tokens = $ARGUMENTS.split()
prd_url = None
design_url = None
user_type = None           # 用户显式指定的 type
extra_tokens = []
ignored_urls = []

for tok in tokens:
  if tok.startswith('type='):
    value = tok[5:]
    if value in ('backend', 'frontend', 'fullstack'):
      user_type = value
    else:
      # 无效值，提示用户后忽略
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

extra_description = ' '.join(extra_tokens)  # 用户补充文字
```

如果 `ignored_urls` 非空，主线程在派发 subagent 前先在 TG 输出：
```
⚠️ 检测到 N 个额外 URL 已忽略，本版本只处理 1 个 PRD URL + 1 个设计稿 URL。
如需合并多个来源，请在用户补充描述里说明。
```

### 2.3 URL 读取与降级

**PRD URL 读取（L1 Claude_in_Chrome）**：

```
navigate(prd_url)
  ↓
read_page() 或 get_page_text()
  ↓
sanity check:
  - 文本长度 ≥ 200 字符？
  - 不含 "sign in" / "log in" / "login required" / "access denied" / "403" / "404" / "forbidden"？
  - title 不是 "Login" / "Error" / "Not Found" / "Forbidden"？
  - 看起来像需求内容而不是营销页 / 导航页？（Claude 判断）
  ↓
通过 → 作为 PRD 内容
失败 → 进入 L3
```

**设计稿 URL 读取**：

根据 `design_tool` 走不同路径：

| design_tool | 工具 | 返回内容 |
|---|---|---|
| figma | `get_design_context` + `get_screenshot` | 参考代码 + hints + token + 截图（多模态） |
| figjam | `get_figjam` | FigJam 白板结构化内容 |
| figma-make | `get_design_context` | Figma Make 生成的内容 |
| stitch | Claude_in_Chrome 读 Stitch 页 → 解析 Project ID / Screen ID → `curl -L` 下载 HTML + 截图 | 原始 HTML / 截图 |

**降级 L3**（任一源失败）：

```
TG 输出:
"无法自动读取 <prd | 设计稿> URL。原因: <具体原因>
请用以下任一方式补充:
  A. 直接回复该源的文字描述
  B. 回复该源的截图"

[主线程停下等用户回]

用户回复文字 → 作为该源的补充内容
用户回复图片 → Claude 多模态解析图片文字 → 作为该源的补充内容
```

**两个源独立降级**：一个源失败只影响该源的 L3 降级，另一个源继续正常处理。两个源都拿到内容才进入 subagent 派发。

### 2.4 主线程进度输出（TG 心跳）

每个关键节点主线程主动输出到 TG，让用户知道系统在做什么：

```
/start-workflow https://jira.example.com/browse/PROJ-123 https://figma.com/design/abc/...

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
→ "已归档到 specs/2026-04-10-user-profile/"
→ "
执行时间线:
  00:00 → 分类 type
  00:02 → 读 .claude 规范
  ...
  00:54 → 归档完成
"
→ "请 review 归档文件，发现问题回复指示，重新 /start-workflow"
```

**心跳的三个目的**：

1. **存在感**：让用户知道主线程没卡死
2. **可解释性**：每一步的状态让用户能判断是哪里慢 / 哪里错
3. **可回撤**：派发 subagent 前的心跳提示里暗示用户"可回 /cancel 中断"（虽然 MVP 不实现 /cancel，但用户心理有预期）

### 2.5 subagent 派发与通信

**派发方式**：前台同步模式

```
Agent(
  subagent_type="spec-workflow",
  description="生成 spec 三件套并归档",
  prompt=<2.6 定义的固定格式>
)
```

前台同步的理由（见决策清单 #8）：
- TG 对话本来就是异步（用户发起 → 等）
- 后台 + 轮询模式的 token 成本几乎翻倍，且 loop 逻辑复杂
- 30-90 秒的等待用户能接受，只要心跳提示到位

### 2.6 subagent 的输入 prompt 格式

主线程构造的 prompt 有固定结构，subagent 靠这个结构解析输入：

```
## 需求来源
source_type: <prd_only | design_only | prd_and_design | natural_language>
prd_url: <URL 或 N/A>
design_url: <URL 或 N/A>
design_tool: <figma | figjam | figma-make | stitch | screenshot | N/A>
user_type: <backend | frontend | fullstack | N/A>   # 用户显式指定的 type，N/A 时让 spec-writer 自动分类

## PRD 内容
<从 Chrome 读取的纯文本 / 用户自然语言 / 截图提取结果>

## 设计稿上下文
<figma get_design_context 返回的参考代码 + hints + token 定义
 / FigJam 白板内容
 / Stitch 下载的 HTML 结构
 / 截图的文字描述
 / N/A 如果没有>

## 用户补充
<用户在 /start-workflow 后面追加的描述，若无则 N/A>

## 你的任务
1. 用 Skill 工具 invoke spec-writer, 传入上面全部输入
2. 拿到 _drafts 路径后，用 Skill 工具 invoke spec-archiver
3. 在 stdout 输出结构化最终结果 (见 §3.4)

## 进度输出约定
每个关键步骤开始前单独输出一行:
  PROGRESS: <描述>

## 失败约定
任何步骤失败立即输出:
  FAILED: <原因>
不自动重试。
```

**为什么必须严格格式化**：

1. subagent 是独立 context，看不到主线程对话历史，**必须自己携带全部必要信息**
2. 段落标题（`## 需求来源` / `## PRD 内容` 等）让 subagent 能稳定解析
3. `source_type` / `design_tool` / `user_type` 等字段让 subagent 不需要再做一次输入分类

### 2.7 结果转发给用户

subagent 返回后，主线程按 §3.4 的输出格式解析，然后把**关键信息**转发到 TG：

```
主线程收到 subagent stdout:
  PROGRESS: ...
  PROGRESS: ...
  SUCCESS
  archived_to: specs/2026-04-10-user-profile/
  type: fullstack
  ...
  timeline: ...

主线程提取并格式化后发到 TG:
  ✓ 完成
  归档路径: specs/2026-04-10-user-profile/
  类型: fullstack
  源: PRD + Figma 双源融合
  .claude 规范更新: 无

  执行时间线:
    00:00 → 分类 type
    00:02 → 读规范
    ...
    00:54 → 归档
  总耗时: 54 秒

  请 review 文件:
  - specs/2026-04-10-user-profile/requirements.md
  - specs/2026-04-10-user-profile/design.md
  - specs/2026-04-10-user-profile/tasks.md
```

失败时类似：

```
主线程收到:
  PROGRESS: ...
  FAILED
  stage: spec-writer
  reason: 未找到 .claude/SECURITY.md

主线程转发到 TG:
  ❌ 失败
  阶段: spec-writer
  原因: 未找到 .claude/SECURITY.md

  建议: 先运行 /bootstrap-claude-docs 创建规范文件
  (或手动创建 3 份规范后重试 /start-workflow)

  已完成的步骤:
    ✓ 分类 type = fullstack
    ✓ 读取 ARCHITECTURE.md
    (停在 SECURITY.md)
```

### 2.8 第 2 节决策状态

| # | 决策点 | 结论 |
|---|---|---|
| 1 | Bash 工具的最小权限 | ✅ 接受软约束：Claude Code 没有命令级白名单，只能靠 prompt 约束。MVP 信任此约束 |
| 2 | Stitch 场景的完整实现 | ✅ 接受软降级：Stitch MCP 未连通时运行时降级到 L3（用户截图） |
| 3 | `/bootstrap-claude-docs` 是否纳入 MVP | ✅ 已在 §7 解决：作为 MVP 的一部分，独立 slash command 形式 |

---

## 第 3 节：spec-workflow subagent 详细设计

### 3.1 subagent 文件位置与 frontmatter

**文件**：`.claude/agents/spec-workflow.md`

```yaml
---
name: spec-workflow
description: 处理 spec-driven workflow 完整流程 - 接收纯文本需求 + 源信息，调用 spec-writer 生成三件套到 _drafts，再调用 spec-archiver 归档并更新 .claude 规范。只被 /start-workflow 派发。
tools:
  - Read
  - Write
  - Edit
  - Bash
  - Skill
  - Glob
  - Grep
skills:
  - spec-writer
  - spec-archiver
---
```

**tools 白名单的思路**：

| 工具 | 为什么要 |
|---|---|
| `Read` | 读 `.claude/ARCHITECTURE.md` / 模板 / `_drafts` 文件 |
| `Write` | 写三件套到 `_drafts/` + `meta.json` |
| `Edit` | spec-writer 自检后可能需要修改已写的文件 |
| `Bash` | `mv` / `cp` / `diff` 做归档和增量更新 |
| `Skill` | 加载 `spec-writer` / `spec-archiver` 的 SKILL.md |
| `Glob` / `Grep` | spec-archiver 判断 `.claude` 规范是否需要更新时要对比文件 |

**明确不给的工具**：

- ❌ MCP 浏览器工具 / figma / curl — URL 读取在主线程完成，subagent 只处理纯文本
- ❌ `Agent` 工具 — 不允许嵌套派发 subagent，保持调用链扁平
- ❌ `WebFetch` / `WebSearch` — 不联网，全部用主线程已经准备好的输入

**`skills:` frontmatter 字段**：subagent 被派发时，这两个 skill 的 SKILL.md 自动加载进 subagent 的独立 context，主线程看不到（跟 `codex:codex-rescue` 的 `codex-cli-runtime` 是同一套机制）。

### 3.2 subagent body（prompt）结构

```markdown
# spec-workflow

你是 spec-driven workflow 的编排者。只被 /start-workflow slash command 派发，不主动激活。

## 输入契约

你会收到一个固定格式的 prompt，包含以下 5 段：
1. `## 需求来源` - PRD URL / 设计稿 URL / 源类型
2. `## PRD 内容` - 主线程从 Chrome 读取或用户自然语言
3. `## 设计稿上下文` - 主线程从 figma MCP / Stitch / 截图提取（可能为空）
4. `## 用户补充` - 可选
5. `## 你的任务` - 固定 2 步

## 执行流程

### Step 1: 调用 spec-writer

用 Skill 工具 invoke spec-writer, 传入上面全部输入段。

spec-writer 会:
- 识别 type (backend / frontend / fullstack)
- 读取 .claude/ARCHITECTURE.md / SECURITY.md / CODING_GUIDELINES.md
- 按 type 选模板生成三件套到 specs/_drafts/<slug>/
- 做一致性自检
- 返回 _drafts 路径和 type

每个关键步骤开始前单独输出一行:
  PROGRESS: <描述>

### Step 2: 调用 spec-archiver

用 Skill 工具 invoke spec-archiver, 传入 _drafts 路径和 type。

spec-archiver 会:
- 按命名约定移到 specs/YYYY-MM-DD-<slug>/
- 写 meta.json
- diff 判断是否要增量更新 .claude/ 规范文件
- 返回归档路径和更新摘要

### Step 3: 返回最终结果

结构化返回给主线程 (见 §3.4)。

## 失败约定

任何步骤失败 → 立即返回 FAILED: <原因>, 不自动重试, 不尝试部分回滚。
spec-writer / spec-archiver 内部失败时也照此原则。

## 禁止行为

- 不读 URL, 不联网, 不派发其他 subagent
- 不改 .claude 规范文件以外的项目代码
- 不 git commit
- 不修改 specs/_drafts/ 和 specs/YYYY-MM-DD-* 以外的路径 (.claude 规范文件除外)
```

### 3.3 subagent 的输入 prompt（来自主线程）

主线程派发时构造的 prompt 模板（和 §2.6 一致）：

```
## 需求来源
source_type: <prd_only | design_only | prd_and_design | natural_language>
prd_url: <URL 或 N/A>
design_url: <URL 或 N/A>
design_tool: <figma | figjam | figma-make | stitch | screenshot | N/A>

## PRD 内容
<纯文本>

## 设计稿上下文
<纯文本 / 结构化描述 / N/A>

## 用户补充
<可选>

## 你的任务
1. 用 Skill 工具 invoke spec-writer, 传入上面全部输入
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

### 3.4 subagent 输出格式

**成功路径**：

```
PROGRESS: 加载 spec-writer skill
PROGRESS: 分类 type = fullstack
PROGRESS: 读取 .claude/ARCHITECTURE.md
PROGRESS: 读取 .claude/SECURITY.md
PROGRESS: 读取 .claude/CODING_GUIDELINES.md
PROGRESS: 生成 requirements.md
PROGRESS: 生成 design.md (fullstack 模板)
PROGRESS: 生成 tasks.md
PROGRESS: 三件套一致性自检
PROGRESS: 写入 specs/_drafts/user-profile/
PROGRESS: 加载 spec-archiver skill
PROGRESS: 归档到 specs/2026-04-10-user-profile/
PROGRESS: 写 meta.json
PROGRESS: diff 检查 .claude 规范文件
PROGRESS: 未检测到架构层变动，跳过规范更新

SUCCESS
archived_to: specs/2026-04-10-user-profile/
type: fullstack
slug: user-profile
source_type: prd_and_design
claude_updates: none
timeline:
  00:00 加载 spec-writer
  00:02 分类 + 读规范
  00:06 生成 requirements.md
  00:15 生成 design.md
  00:38 生成 tasks.md
  00:46 一致性自检
  00:48 _drafts 写入完成
  00:50 归档移动
  00:52 meta.json 写入
  00:54 diff 检查
总耗时: 54 秒
```

**失败路径**：

```
PROGRESS: 加载 spec-writer skill
PROGRESS: 分类 type = fullstack
PROGRESS: 读取 .claude/ARCHITECTURE.md

FAILED
stage: spec-writer
reason: 未找到 .claude/SECURITY.md，先运行 /bootstrap-claude-docs 创建规范文件
partial_files: []
```

**设计原则**：

- 成功和失败都用**顶格关键字**（`SUCCESS` / `FAILED`），主线程好解析
- `PROGRESS:` 是 subagent 内部轨迹，主线程返回给用户时可以选择**全部展示**或**只展示关键几条**
- `timeline:` 是 §2.5 决定的"事后时间线"，用户能看哪一步慢
- `partial_files:` 列出 subagent 已经写但因为失败而留在 `_drafts/` 的半成品，方便用户/debug

### 3.5 spec-writer 与 spec-archiver 的通信协议

subagent 里是**顺序 invoke** 两个 skill，通过 **文件系统 + 返回值** 传递数据：

```
subagent
  │
  │ Skill("spec-writer", input=<prompt 的前 4 段>)
  │   └─ spec-writer 内部:
  │        - 写 specs/_drafts/<slug>/requirements.md
  │        - 写 specs/_drafts/<slug>/design.md
  │        - 写 specs/_drafts/<slug>/tasks.md
  │        - 返回: {slug, type, drafts_path, source_meta}
  │
  │ Skill("spec-archiver", input={drafts_path, type, source_meta})
  │   └─ spec-archiver 内部:
  │        - mv specs/_drafts/<slug>/ → specs/YYYY-MM-DD-<slug>/
  │        - 写 meta.json
  │        - diff + 可能更新 .claude/
  │        - 返回: {archived_path, claude_updates}
  │
  └─ 组装最终结构化输出
```

**协议要点**：

- spec-writer 只负责"写到 _drafts + 返回描述信息"
- spec-archiver 只负责"搬运 + 归档决策"
- 两者**不共享 context 以外的状态**，全部通过文件系统和返回值通信
- subagent 在中间做"连接者"，把 spec-writer 的返回值拼成 spec-archiver 的输入

### 3.6 子步骤失败的传递原则

spec-writer 和 spec-archiver 内部自己也会有"生成子步骤失败"的情况（比如"生成 design.md 时 Claude 发现 ARCHITECTURE.md 里没定义某个服务"）。

**处理原则**：

- skill 内部失败 → skill 返回结构化错误（`{status: "failed", stage, reason}`）
- subagent 拿到失败返回 → 立即打印 `FAILED` 顶层行 + 透传子 skill 的错误细节
- subagent **不尝试部分成功**（比如"requirements 和 tasks 生成了但 design 失败" → 仍然整体 FAILED）

这符合决策清单 #9 的"直接报错退出，不自动重试"原则，也避免了半成品状态污染 `specs/`。

### 3.7 设计决策：type 分类放在 spec-writer 而不是 subagent

两个选择的对比：

| | type 分类在 subagent | type 分类在 spec-writer |
|---|---|---|
| subagent 复杂度 | 高（要读需求内容做判断） | 低（纯编排） |
| skill 职责 | spec-writer 被动接受 type | spec-writer 自己分类 |
| 分类规则可维护性 | 规则写在 subagent body 里 | 规则写在 spec-writer SKILL.md 里 |
| 未来扩展 | 加新 type 要改 subagent | 加新 type 只改 spec-writer |

**选择后者**（spec-writer 内部分类）。理由：

- subagent 是薄编排层，不应该有"需求理解"这种重脑力逻辑
- 分类本身就是 spec-writer 第一步的工作（读需求 → 判断 type → 选模板），不应该拆开
- spec-writer 是可独立迭代的单元，把分类放进去它可测 / 可改

### 3.8 第 3 节决策状态

| # | 决策点 | 结论 |
|---|---|---|
| 1 | tools 白名单完整性 | ✅ 起步够用：当前 7 个工具覆盖 spec 流程；遇到具体缺失再扩展 |
| 2 | `skills:` frontmatter 字段可用性 | ✅ 实施阶段验证 + 备选方案已定：若不支持则改用 subagent body 内显式 Skill 调用 |
| 3 | `PROGRESS:` / `SUCCESS` / `FAILED` 自定义输出协议 | ✅ 接受软约束：通过 prompt 强约定 + 主线程容错解析 |
| 4 | 路径写权限的软约束 | ✅ 接受软约束：靠 prompt 禁止行为 + 人工 review，Claude Code 没有路径白名单机制 |

---

## 第 4 节：spec-writer skill 内部设计

spec-writer 是整个 MVP 的"大脑"，负责把 subagent 传入的结构化输入转换为三件套。

### 4.1 SKILL.md frontmatter 与文件结构

**目录**：`.agents/skills/spec-writer/`

```
.agents/skills/spec-writer/
├── SKILL.md                  ← 主指令，被 subagent invoke 时加载
├── templates/
│   ├── requirements.md       ← 通用需求骨架（§6 会写出完整内容）
│   ├── backend.md            ← design.md 后端模板
│   ├── frontend.md           ← design.md 前端模板
│   ├── fullstack.md          ← design.md 全栈模板
│   └── tasks.md              ← 通用任务骨架
└── checklists/
    └── consistency-check.md  ← §4.7 的一致性自检 checklist
```

**SKILL.md frontmatter**：

```yaml
---
name: spec-writer
description: 把结构化需求输入（PRD + 设计稿 + 用户补充）转换为 specs/_drafts/<slug>/ 下的三件套（requirements/design/tasks），按 backend/frontend/fullstack 选模板。只被 spec-workflow subagent invoke，不主动激活。
user-invocable: false
---
```

**关键字段**：

- `user-invocable: false`：Claude 不会把这个 skill 的 description 加入日常对话的 skill 索引。只能由绑定它的 subagent（`spec-workflow`）或显式 `Skill("spec-writer", ...)` 调用触发
- description 里明确写**输入契约**（"结构化需求输入 PRD + 设计稿 + 用户补充"）和**输出契约**（"三件套到 _drafts"），让 subagent 知道怎么调

### 4.2 执行流程（6 个阶段）

spec-writer 在 SKILL.md body 里定义固定的 6 步流程：

```
[Stage 1] 解析输入 + 分类 type
   │
   ▼
[Stage 2] 生成 slug (从需求标题推导)
   │
   ▼
[Stage 3] 读 .claude/ARCHITECTURE.md + SECURITY.md + CODING_GUIDELINES.md
   │     (缺任何一份 → 立即 FAILED)
   │
   ▼
[Stage 4] 按 type 选模板，生成三件套到 specs/_drafts/<slug>/
   │     - requirements.md (通用模板)
   │     - design.md (backend/frontend/fullstack 模板)
   │     - tasks.md (通用模板但顺序按 type 定)
   │
   ▼
[Stage 5] 一致性自检 (§4.7 的 checklist)
   │     - 失败 → 最多 1 次尝试修复 → 仍失败则 FAILED
   │
   ▼
[Stage 6] 返回 {slug, type, drafts_path, source_meta}
```

每个 Stage 开始前输出 `PROGRESS:` 一行。

**关于 Stage 5 的"最多 1 次修复"**：这是对"不自动重试"原则的**一个例外**。理由：

- 一致性自检发现的是"自己生成的三件套内部不一致"（比如 tasks.md 引用了 design.md 里不存在的 API），这是 spec-writer 自己可以修复的错误
- 修复 = 重新生成有问题的单个文件，不是重跑整个流程
- 限 1 次：避免"改一处引入两处"的无限循环

**Stage 3 的严格性**：三份规范文件缺任何一份就 FAILED。不做"缺了就跳过"这种降级 — 规范文件是 design 的依据，缺了生成出的 design 就是空中楼阁。兜底方案见 §7 bootstrap。

### 4.3 Type 分类规则

spec-writer 的 Stage 1 要做"这是 backend / frontend / fullstack 哪一类"的判断。规则写在 SKILL.md 里，让 Claude 按顺序匹配：

```
分类规则（按顺序匹配第一个命中的规则）：

0. 如果 user_type 非 N/A (用户在 /start-workflow 里显式指定)
   → 直接使用 user_type，跳过下面所有自动判断
   → PROGRESS: type = <user_type> (user-specified)

1. 如果 design_source 非 N/A (含 figma / stitch / figjam 等)
   → 必然涉及前端
   → 如果 PRD 内容里提到数据库 / API / 认证 / 后端服务
       → type = fullstack
   → 否则
       → type = frontend

2. 如果 PRD 内容里包含以下关键词
   ["API", "endpoint", "database", "schema", "迁移", "认证",
    "授权", "后端", "服务", "queue", "cron", "webhook"]
   且不包含 ["页面", "组件", "UI", "样式", "响应式", "按钮"]
   → type = backend

3. 如果 PRD 内容里包含以下关键词
   ["页面", "组件", "UI", "样式", "响应式", "交互", "表单",
    "按钮", "弹窗", "路由"]
   且不包含 ["API", "endpoint", "database"]
   → type = frontend

4. 混合或无法明确判断
   → type = fullstack (默认)
```

**用户显式指定 type 的优先级**：

- 规则 0 是**最高优先级**。只要用户在 `/start-workflow` 里传了 `type=backend/frontend/fullstack`，spec-writer 完全信任用户，不做任何校验
- 即使用户指定的 type 和自动分类判断明显不一致（比如用户传 `type=backend` 但输入里含 figma 设计稿），也以用户为准
- 例外场景交给用户自己负责：如果你给了 figma 设计稿却声明 `type=backend`，那么生成的 design.md 里不会有"前端章节"，figma 的上下文也只会被当作额外背景信息参考

**这个设计的价值**：解决 §4.9 #1 的"边界 type"问题 — 对于 DevOps / 文档 / 数据迁移这类不在 3 种 type 内的情况，用户可以通过 `type=backend` 或 `type=fullstack` 显式选一个最接近的，而不是依赖兜底。

**"fullstack 作为默认"的理由**：

- fullstack 模板包含前后端两部分 + 共享契约章节，信息最全
- 如果 spec-writer 判断错了（实际是纯后端，被判成 fullstack），输出的 design 只是多了前端章节，**不会丢信息**
- 反过来判成 backend 却实际需要前端就会**丢失前端设计**，损失更大

**分类写入 requirements.md frontmatter**：

```yaml
---
name: <从输入提取的需求标题>
type: <backend | frontend | fullstack>
priority: <P0 | P1 | P2，默认 P1>
source:
  type: <prd_only | design_only | prd_and_design | natural_language>
  prd_url: <URL 或 null>
  design_url: <URL 或 null>
created: 2026-04-10
---
```

后续 spec-archiver 和未来的 task-executor / codex-reviewer 都能读这个 frontmatter 做差异化处理。

### 4.4 读取 `.claude/` 规范文件的方式

用户最初的需求里说"如果 Claude Code 只认 CLAUDE.md，其他规范文件通过 @ 引用"。**这里有个概念澄清**：

`@file.md` 引用是 **Claude Code 用户消息层**的预处理特性：

- 用户在对话里输入 `@xxx.md` → Claude Code 把文件内容 inline 展开到用户消息里
- **SKILL.md / AGENT.md / commands/*.md 都不经过这层预处理**，里面写 `@.claude/ARCHITECTURE.md` 就是一串字面字符，不会被替换

所以无论是否分层、是否在 subagent 里，SKILL.md 里的 `@` 都不起作用。**只能用 `Read` 工具在运行时加载**。

**正确做法**：skill 直接用 `Read` 工具读取文件，写进 SKILL.md 的 Stage 3 步骤：

```markdown
### Stage 3: 读取 .claude 规范文件

依次用 Read 工具加载:

1. Read: .claude/ARCHITECTURE.md
2. Read: .claude/SECURITY.md
3. Read: .claude/CODING_GUIDELINES.md

全部成功 → 把内容拼接成 "project_norms" 变量，作为 Stage 4 模板渲染的输入之一

任一失败（文件不存在、读取出错）→ 立即返回:
  {status: "failed", stage: "stage-3-read-norms", reason: "未找到 .claude/<filename>"}
```

**每次跑都要重新 Read 一次**，这是必要开销：规范文件更新后立即生效，不需要"重启 skill"或类似操作。

### 4.5 Slug 生成规则

`slug` 是三件套归档目录名的一部分（`specs/YYYY-MM-DD-<slug>/`）。规则：

```
从需求标题推导 slug:
1. 移除标点和特殊符号（保留中英文、数字、空格、连字符）
2. 中文字符保留原样
3. 英文字母统一转小写
4. 空格统一为 "-"
5. 连续的 "-" 合并为一个
6. 首尾的 "-" 去掉
7. 长度 ≤ 40 字符（按 Unicode 字符数，不是 byte 数）
8. 如果最终为空（比如标题全是符号）→ ticket-<HHMMSS>
```

**示例**：

| 原始标题 | slug |
|---|---|
| `用户个人资料页` | `用户个人资料页` |
| `User Profile Page` | `user-profile-page` |
| `Add OAuth Login (Google)` | `add-oauth-login-google` |
| `用户头像 Upload` | `用户头像-upload` |
| `API 接口重构` | `api-接口重构` |
| `@#$%` | `ticket-143022` |

**归档目录示例**：

```
specs/2026-04-10-用户个人资料页/
specs/2026-04-10-user-profile-page/
specs/2026-04-10-用户头像-upload/
specs/2026-04-10-api-接口重构/
```

**为什么不用 UUID**：slug 要人类可读，方便归档目录眼看就知道是哪个需求。

**Slug 冲突处理**：

- spec-writer 生成 slug 后，检查 `specs/_drafts/<slug>/` 是否已存在
- 冲突 → 追加 `-2` / `-3` 后缀直到找到空位
- 这是 `_drafts` 层面的冲突；归档阶段（`specs/YYYY-MM-DD-<slug>/`）的日期前缀基本消除了冲突可能性

**两个潜在坑**（非 blocker）：

1. **macOS 文件系统大小写默认不敏感**，git 和 Linux CI 大小写敏感。MVP 阶段在 macOS 单机跑没问题，将来团队协作或上 CI 要注意
2. **中文路径**在 git / bash / VS Code 里都没问题，极少数老工具可能不识别。本地 macOS 用无忧

### 4.6 三件套生成的调用约定

Stage 4 要生成三个文件。采用 **α 方案：一次大 Claude 调用，在同一回答里按顺序发出 3 个 Write tool call**：

```
Stage 4 开始:
  PROGRESS: 开始生成三件套

  构造完整的"生成上下文":
    - project_norms (Stage 3 读到的规范)
    - input_summary (PRD + 设计稿 + 用户补充)
    - type (Stage 1 判断的)
    - slug (Stage 2 生成的)

  加载 3 个模板文件（Read 工具）:
    - templates/requirements.md
    - templates/{type}.md  ← backend/frontend/fullstack 选一个
    - templates/tasks.md

  在同一 Claude 回答内按顺序写三个文件:
    PROGRESS: 生成 requirements.md
    Write: specs/_drafts/<slug>/requirements.md
    PROGRESS: 生成 design.md
    Write: specs/_drafts/<slug>/design.md
    PROGRESS: 生成 tasks.md
    Write: specs/_drafts/<slug>/tasks.md
```

**α 方案（一次大调用）vs β 方案（三次独立步骤）对比**：

| 维度 | α 一次大调用 | β 三次独立步骤 |
|---|---|---|
| 三件套关联度 | **强**（同一思考过程，后一个文件引用前一个） | 弱（每次重新加载上下文） |
| 失败恢复 | 差（中间失败回滚复杂） | 好（每步独立） |
| token 成本 | 低（一次 context 加载） | 高（三次 context 传递） |
| 与 Stage 5 "单文件修复" 的契合 | 匹配（自检重写某个文件即可） | 尴尬（单文件已独立） |

**选 α** 的核心理由：三件套的**内部一致性 > 失败恢复灵活度**。MVP 阶段宁可失败重跑整个 Stage 4，也不要三件套之间逻辑脱节。

**为什么顺序很重要**：

- requirements.md 先写 → 确定用户故事和验收标准
- design.md 基于 requirements 写 → design 的章节要能覆盖每个验收标准
- tasks.md 基于 design 写 → 每个 task 对应 design 里的一个具体实现点

这个顺序让 Claude 在同一个 context 里逐层展开，后一个文件能引用前一个的内容。**不要倒过来**（会导致 tasks 里引用不存在的 design 章节）。

### 4.7 一致性自检 checklist

Stage 5 自检的目的：发现三件套内部的**逻辑不一致**。

`checklists/consistency-check.md` 的内容（大纲）：

```markdown
# spec-writer 一致性自检 checklist

## Cross-file consistency

- [ ] requirements.md 的每一条验收标准都在 design.md 里有对应章节覆盖
- [ ] design.md 的每一个 API/endpoint/组件/页面，在 tasks.md 里都有对应的实现任务
- [ ] tasks.md 里没有引用 design.md 之外的"凭空任务"
- [ ] requirements.md frontmatter 的 type 与 design.md 选用的模板一致
- [ ] source 字段在 requirements.md frontmatter 里如实记录了 PRD 和设计稿 URL

## Internal consistency

- [ ] requirements.md 的"范围外"明确列出了不做的事
- [ ] design.md 的每个章节都不为空（模板里的 placeholder 都被替换了）
- [ ] tasks.md 的任务顺序符合 §4.6 的 type 规则
    - backend: 模型 → migration → API → 业务逻辑 → 测试
    - frontend: 页面骨架 → 组件 → 数据接入 → 交互 → a11y → 测试
    - fullstack: Backend 全部完成 → Frontend
- [ ] tasks.md 里没有 "TODO" / "FIXME" / "<placeholder>" 等未填充的标记

## Metadata

- [ ] requirements.md 的 frontmatter 包含: name, type, priority, source, created
- [ ] 三件套文件名和路径都在 specs/_drafts/<slug>/ 下
```

**自检执行方式**：

- Claude 读三个生成的文件，对照 checklist 一项项判断
- 发现违反 → 记录违反项
- 全部通过 → `PROGRESS: 一致性自检通过`，进入 Stage 6
- 有违反 → `PROGRESS: 自检发现 N 项违反，尝试修复`
  - 只修复违反项对应的那一个文件（重写该文件）
  - 修复后再跑一次自检
  - 仍有违反 → `FAILED: consistency check failed after 1 retry, violations: [...]`

### 4.8 spec-writer 返回值契约

spec-writer 被 subagent 调用完成后，返回一个结构化对象（Skill 工具的返回值）：

**成功**：

```
{
  "status": "success",
  "slug": "user-profile-page",
  "type": "fullstack",
  "drafts_path": "specs/_drafts/user-profile-page/",
  "files": [
    "specs/_drafts/user-profile-page/requirements.md",
    "specs/_drafts/user-profile-page/design.md",
    "specs/_drafts/user-profile-page/tasks.md"
  ],
  "source_meta": {
    "source_type": "prd_and_design",
    "prd_url": "https://jira.example.com/browse/PROJ-123",
    "design_url": "https://www.figma.com/design/abc/..."
  },
  "consistency_check": "passed",
  "timings": {
    "stage-1-classify": 2.1,
    "stage-2-slug": 0.3,
    "stage-3-norms": 1.5,
    "stage-4-generate": 28.7,
    "stage-5-check": 5.2
  }
}
```

**失败**：

```
{
  "status": "failed",
  "stage": "stage-3-read-norms",
  "reason": "未找到 .claude/SECURITY.md",
  "partial_files": []
}
```

subagent 收到后：

- `status == "success"` → 进入 spec-archiver 调用
- `status == "failed"` → 立刻打印 subagent 的 `FAILED` 顶层块，透传这里的 `stage` 和 `reason`

### 4.9 第 4 节决策状态

| # | 决策点 | 结论 |
|---|---|---|
| 1 | Slug 中英文混合规则 | ✅ 已定（§4.5）：中文保留、英文小写、连字符连接 |
| 2 | 用户显式指定 type | ✅ 已定（§4.3 规则 0）：`type=<backend\|frontend\|fullstack>`，优先级最高 |
| 3 | spec-writer 静默自主分类 | ✅ 已定：用户未指定时 spec-writer 静默判断，不中断询问 |
| 4 | Stage 4 生成方式 | ✅ 已定（§4.6）：α 一次大调用，三件套强关联 |
| 5 | 边界 type 场景（DevOps / 文档 / 数据迁移） | ✅ 已定：由用户通过 `type=` 显式指定最接近的一个，否则 fullstack 兜底 |
| 6 | 一致性自检失败后的"最多 1 次修复" | ✅ 已定：接受 1 次硬上限的修复例外，详见 §4.7.1 |
| 7 | 规范文件缺失的处理 | ✅ 已定（§7）：方案 A 严格失败 + 独立 `/bootstrap-claude-docs` 命令 |

#### 4.7.1 一致性自检的"最多 1 次修复"例外

**结论**：自检 failed → 允许 spec-writer 看着 checklist 失败项做**1 次有针对性修复** → 修复后再自检 → 仍 failed 则整体 FAILED。

**为什么破例**（与"硬失败不重试"的整体原则区分）：

- **失败性质不同**：自检 failed 通常是**格式问题**（占位符没填、标题层级写错、tasks 引用了不存在的需求 ID），不是"业务逻辑错误"。这类问题对 Claude 来说有明确修复路径
- **修复成本远低于重跑**：1 次定向修复 ≈ 几千 token，整体 Stage 4 重跑 ≈ 几万 token
- **1 次硬上限避免无限循环**：如果 1 次修复仍失败，说明 Claude 在这一轮的 context 里无法自我纠正，重跑也未必更好 → 直接 FAILED 让上游决定
- **审计可见**：meta.json 的 `spec_writer.retry_count` 字段会记录是否触发了修复，方便后续统计

---

## 5. spec-archiver skill 内部设计

### 5.1 职责边界

spec-archiver 只做三件事：

1. **搬运**：`specs/_drafts/<slug>/` → `specs/YYYY-MM-DD-<slug>/`
2. **写 meta.json**：记录归档元数据，供后续检索和审计
3. **diff 检查 + 规范文件更新**：如果本次 spec 引入了需要沉淀到 `.claude/` 的新架构/安全/规范决策，Claude 生成 diff 后写回 `.claude/` 对应文件

它**不负责**：

- 生成 spec 三件套（spec-writer 的职责）
- 实际写代码（后续 development 步骤的职责）
- 决定 slug 或 type（spec-writer 已经定好）
- 深度校验三件套内容质量（spec-writer Stage 5 自检已完成，spec-archiver 只做"文件是否存在且非空"的轻量检查）

### 5.2 skill frontmatter

```yaml
---
name: spec-archiver
description: 把 specs/_drafts/<slug> 归档到 specs/YYYY-MM-DD-<slug>，写 meta.json，diff 检查 .claude 规范文件。被 spec-workflow subagent 顺序调用，不面向用户直接调用。
user-invocable: false
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
---
```

关键点：

- `user-invocable: false` — 和 spec-writer 对齐，只能被 subagent 调用
- 需要 `Bash` 做目录移动（`mv`）、日期获取（`date +%Y-%m-%d`）、获取 git HEAD（`git rev-parse HEAD`）
- 需要 `Glob` 检查归档冲突和历史同 slug spec

### 5.3 输入契约

subagent 调用 spec-archiver 时传入：

```yaml
drafts_path: specs/_drafts/<slug>/
slug: user-profile-page
type: fullstack
source_meta:
  source_type: prd_and_design
  prd_url: https://jira.../PROJ-123
  design_url: https://figma.com/design/abc
  design_tool: figma
  user_type_specified: null           # 若用户显式指定了 type 则填入对应值，否则 null
  prd_fetched_at: 2026-04-10T14:23:10Z
spec_writer_stats:
  type_classification: auto           # auto | user-specified
  consistency_check: passed
  retry_count: 0
```

### 5.4 归档路径生成规则

```
1. current_date = $(date +%Y-%m-%d)       # 主机时区
2. archive_path = specs/<current_date>-<slug>/

3. 冲突检查：
   a. 如果 specs/<current_date>-<slug>/ 已存在
      → FAILED (stage: archive-1-validate-path,
                reason: "同日同 slug 已归档，若要覆盖请先手动删除")
   b. Glob: specs/*-<slug>/ （不含当前日期）
      → 如果有命中，记录最近 1 条作为 related_specs
      → PROGRESS: 检测到历史同 slug spec: <path>

4. mv specs/_drafts/<slug>/ → specs/<current_date>-<slug>/
5. Glob 验证 mv 成功（目标目录下三件套齐备）
```

**为什么同日同 slug 直接失败而不是自动改名**：短时间内重复归档同一个 spec 往往是手快/误触，失败更安全。真要重做，用户手动删旧的再跑一次即可。

**为什么 related_specs 只留最近 1 条**：一个长期迭代的 feature 会累积很多归档，全部列出来会让 meta.json 越滚越大。最近 1 条已经足够让用户"顺藤摸瓜"找到链式历史，不需要 spec-archiver 维护完整图谱。

### 5.5 归档前轻量存在性检查

spec-writer 的 Stage 5 已经做了一致性自检，但 spec-archiver 仍然要做一次**防御性检查**：

```
Stage archive-2 (move-drafts) 前置条件：
  for file in ['requirements.md', 'design.md', 'tasks.md']:
    path = drafts_path + file
    if not exists(path) or size(path) == 0:
      FAILED (stage: archive-1-validate-path,
              reason: "三件套中 <file> 缺失或为空")
```

**只检查存在性和非空**，不检查内容质量 — 避免和 spec-writer 职责重叠。这一步主要防止"spec-writer 声称成功但文件系统异常"这种极端情况。

### 5.6 meta.json 格式

```json
{
  "slug": "user-profile-page",
  "type": "fullstack",
  "archived_at": "2026-04-10T14:25:33Z",
  "archived_path": "specs/2026-04-10-user-profile-page/",
  "git_commit_at_archive": "a1b2c3d4e5f6...",
  "source": {
    "source_type": "prd_and_design",
    "prd_url": "https://jira.../PROJ-123",
    "design_url": "https://figma.com/design/abc",
    "design_tool": "figma",
    "user_type_specified": null,
    "prd_fetched_at": "2026-04-10T14:23:10Z"
  },
  "spec_writer": {
    "type_classification": "auto",
    "consistency_check": "passed",
    "retry_count": 0
  },
  "claude_updates": {
    "detected": false,
    "updated_files": [],
    "diff_summary": "",
    "error": null
  },
  "related_specs": []
}
```

**字段解释**：

| 字段 | 说明 |
|---|---|
| `git_commit_at_archive` | 归档那一刻的 `git rev-parse HEAD`。方便后续"这份 spec 对应当时的哪个代码状态"追溯 |
| `source.user_type_specified` | 若用户用 `type=` 显式指定了，这里记录对应值；否则 `null` |
| `spec_writer.type_classification` | `auto` 或 `user-specified`，和 `user_type_specified` 配合使用 |
| `claude_updates.error` | 若 diff 应用失败，这里记录错误原因（见 §5.7） |
| `related_specs` | 最多 1 条：历史上最近一次相同 slug 的归档路径 |

### 5.7 diff 检查 .claude 规范文件

这是 spec-archiver 最重的一步，核心思路：**按约定标题触发 + Claude 生成 unified diff + 尝试 apply**。

#### 5.7.1 触发规则（方案 A：标题匹配）

spec-archiver 只在 design.md 出现以下**强约定标题**时触发对应规范文件更新：

| design.md 标题 | 触发更新的 .claude 文件 |
|---|---|
| `## 架构变更` 或 `## Architecture Changes` | `.claude/ARCHITECTURE.md` |
| `## 安全考虑` 或 `## Security Considerations` | `.claude/SECURITY.md` |
| `## 编码约定变更` 或 `## Coding Guidelines Update` | `.claude/CODING_GUIDELINES.md` |

**为什么选方案 A 而不是"Claude 自主判断"**：

- 方案 A 可预测、可测试、可审计 — 没写这些标题就不会误报
- 强制要求 spec-writer 的 backend/frontend/fullstack 模板**必须**包含这些章节（没变更时写"无"），让约定稳定落地
- 方案 B（Claude 自主判断）灵活但不确定性高，MVP 阶段不值得承担这个复杂度

#### 5.7.2 每个触发章节的处理流程

```
for (heading, claude_file) in triggered_sections:
  section_content = extract_section(design.md, heading)
  if section_content == "无" or empty:
    continue  # 约定了但本次没有变更

  existing = read(claude_file)

  # 让 Claude 生成 unified diff
  diff = claude.generate_diff(
    base=existing,
    instruction=f"把 design.md 的 <{heading}> 章节的内容合并进 {claude_file}，"
                f"保留现有结构，只追加/修改相关段落，输出标准 unified diff 格式"
  )

  # 尝试应用
  try:
    apply_patch(claude_file, diff)
    updated_files.append(claude_file)
    diff_summary += summarize(diff)
  except PatchApplyError as e:
    # 降级处理：不阻断整个归档
    claude_updates.error = f"diff apply failed for {claude_file}: {e}"
    PROGRESS: ⚠️ {claude_file} diff 应用失败，已跳过，请手动同步
    continue
```

#### 5.7.3 diff 应用失败的降级策略

**降级而不是失败**的理由：

- 归档本身已经成功（目录和 meta.json 都写好了）
- `.claude/` 更新失败不影响当前 spec 的可用性
- 硬失败反而会让用户困惑"我的 spec 到底归档没"
- 保留 error 信息到 meta.json + TG warning，用户可以事后手动处理

**TG 提醒格式**（由 subagent 转发）：

```
⚠️ spec 已归档，但 .claude/ARCHITECTURE.md 自动更新失败：
   <error reason>
请手动同步 design.md 的「## 架构变更」章节到 .claude/ARCHITECTURE.md
```

### 5.8 返回值契约

**成功路径**：

```json
{
  "status": "success",
  "archived_path": "specs/2026-04-10-user-profile-page/",
  "meta_path": "specs/2026-04-10-user-profile-page/meta.json",
  "claude_updates": {
    "detected": true,
    "updated_files": [".claude/ARCHITECTURE.md"],
    "diff_summary": "新增 UserProfileService 到 Backend Services 列表",
    "error": null
  },
  "timeline": [
    ["00:00", "校验归档路径 + 存在性检查"],
    ["00:01", "mv _drafts → 2026-04-10-user-profile-page"],
    ["00:02", "写 meta.json"],
    ["00:04", "diff 检查 .claude"],
    ["00:12", "更新 .claude/ARCHITECTURE.md"]
  ]
}
```

**失败路径**：

```json
{
  "status": "failed",
  "stage": "archive-1-validate-path",
  "reason": "同日同 slug 已归档：specs/2026-04-10-user-profile-page/",
  "partial_files": []
}
```

subagent 收到后：

- `status == "success"` → 组装顶层 `SUCCESS` 块并透传 claude_updates
- `status == "failed"` → 打印顶层 `FAILED`，透传 stage 和 reason

### 5.9 子 Stage 划分

| Stage | 名称 | 关键动作 | 可能失败原因 | 失败后行为 |
|---|---|---|---|---|
| archive-1 | validate-path | 冲突检查、存在性检查、related_specs 探测 | 同日同 slug、三件套缺失 | 硬失败，不 mv |
| archive-2 | move-drafts | `mv _drafts/<slug> → <date>-<slug>` | 文件系统权限、磁盘空间 | 硬失败 |
| archive-3 | write-meta | 写 meta.json（含 git HEAD） | 写入异常 | 硬失败，但 mv 已成功不回滚 |
| archive-4 | diff-claude | 检测 design.md 约定标题、Claude 生成 diff、apply | diff apply 失败 | **降级**（记 error，不阻断） |
| archive-5 | return-summary | 组装返回值 | - | - |

**失败原子性约定**：

- archive-1 失败 → 完全没动文件系统，安全
- archive-2 失败 → 可能留半 mv 状态（极端情况），让 subagent 透传原因给用户手动处理
- archive-3 失败 → 归档目录已存在但没有 meta.json，用户可以手动补一个或重跑 archive-3
- archive-4 失败（diff apply）→ **降级**而非阻断，meta.json 里记 error
- archive-4 失败（其他异常如 Claude 生成 diff 失败）→ 同样降级

### 5.10 第 5 节决策状态

**已定决策**：

| # | 决策点 | 结论 |
|---|---|---|
| 1 | diff 检查触发方式 | ✅ 方案 A：约定标题匹配，强制 spec-writer 模板包含指定标题 |
| 2 | diff apply 失败处理 | ✅ 降级为 warning，不阻断归档，meta.json 记 error |
| 3 | related_specs 数量 | ✅ 只保留最近 1 条 |
| 4 | 归档前存在性检查 | ✅ 做轻量检查（文件存在 + 非空），不检查内容质量 |
| 5 | meta.json 是否记 git HEAD | ✅ 加 `git_commit_at_archive` 字段 |
| 6 | 同日同 slug 冲突 | ✅ 硬失败，不自动改名 |

**剩余待确认**：

_（§5 暂无待确认点，所有决策已锁定）_

---

## 6. 三件套模板设计

### 6.1 模板清单

spec-writer Stage 4 需要读取的模板文件：

```
skills/spec-writer/templates/
  ├── requirements.md           # 需求模板（三种 type 共用）
  ├── tasks.md                  # 任务模板（三种 type 共用）
  ├── design-backend.md         # backend 专用 design 模板
  ├── design-frontend.md        # frontend 专用 design 模板
  └── design-fullstack.md       # fullstack 专用 design 模板
```

**为什么只有 design.md 按 type 分，其他两个共用**：

- `requirements.md` — 需求描述聚焦"做什么 / 为谁做 / 验收条件"，与技术栈无关
- `tasks.md` — 任务拆分结构（阶段 → 任务 → 步骤 → 验收）跨 type 通用
- `design.md` — 前后端的技术方案章节差异巨大，必须分开模板

### 6.2 requirements.md 模板

```markdown
# Requirements: <feature name>

## 需求概述

<1-2 段落，说明要解决什么问题、为谁解决、关键背景>

## 用户故事

作为 <角色>
我希望 <能力>
以便 <收益>

## 验收标准

- [ ] AC1: <可测试的具体条件>
- [ ] AC2: ...

## 范围边界

### 本次包含

- ...

### 本次不包含（Out of Scope）

- ...

## 依赖与前置

- 依赖的其他 feature / 服务 / 数据
- 需要的前置准备

## 开放问题

- [ ] Q1: <待 design 阶段解决的问题>
```

### 6.3 tasks.md 模板

```markdown
# Tasks: <feature name>

## 任务总览

本次 feature 共拆分为 N 个阶段，约 M 个任务。

## Stage 1: <阶段名>

### Task 1.1: <任务名>

**目标**：<一句话>

**步骤**：
1. ...
2. ...

**验收**：
- [ ] <可验证的条件>

**预估**：<S / M / L>

**依赖**：<前置 task ID 或 N/A>

### Task 1.2: ...

## Stage 2: ...

## 测试任务

### Task T.1: 单元测试
### Task T.2: 集成测试

## 风险与回滚

- 风险 1：<描述 + 缓解>
- 回滚策略：<步骤>
```

### 6.4 design-backend.md 模板

```markdown
# Design: <feature name> (Backend)

## 架构定位

<在整体架构中的位置，引用 .claude/ARCHITECTURE.md 的哪些模块>

## API 契约

### <Endpoint 名>

- Method: POST
- Path: /api/v1/...
- Request: <结构>
- Response: <结构>
- Error codes: <列表>

## 数据模型

### <Entity 名>

- 字段 / 类型 / 约束
- 索引策略

## 核心流程

<sequence 描述或伪代码>

## 架构变更

<若无，写"无">
<若有，必须是 .claude/ARCHITECTURE.md 可以吸收的 diff-friendly 格式>

## 安全考虑

<认证、授权、输入校验、敏感数据处理>
<若无额外考虑，写"无">

## 编码约定变更

<若无，写"无">

## 性能与扩展性

- 预期 QPS / 延迟
- 扩展瓶颈点

## 错误处理与降级

- 关键错误路径
- 降级策略
```

### 6.5 design-frontend.md 模板

```markdown
# Design: <feature name> (Frontend)

## 页面与路由

- 路由: /profile/:id
- 入口来源: <从哪些页面进来>

## 组件拆分

### <Component 名>

- props / state
- 子组件
- 引用的共享组件

## 状态管理

- 本地状态 / 全局状态 / 服务端状态
- 数据流向

## 接口调用

- 依赖的后端 endpoint
- 错误 / loading / empty 三态处理

## 样式与主题

- 设计稿来源 (figma URL / 截图)
- 设计令牌引用

## 架构变更

<若无，写"无">

## 安全考虑

<XSS、权限、敏感数据前端处理>
<若无额外考虑，写"无">

## 编码约定变更

<若无，写"无">

## 可访问性

- 键盘导航 / ARIA / 对比度

## 性能

- 首屏关键指标
- 懒加载 / 代码分割策略
```

### 6.6 design-fullstack.md 模板

```markdown
# Design: <feature name> (Fullstack)

## 架构定位
## 端到端流程

<整体数据流 + 关键调用顺序>

## 前后端契约

### <API 名>

- Method / Path
- Request / Response / Error

## 后端部分

### 数据模型
### 核心流程
### 性能与扩展性

## 前端部分

### 页面与路由
### 组件与状态
### UX 注意事项

## 架构变更

<若无，写"无">

## 安全考虑

<跨前后端的安全设计>
<若无额外考虑，写"无">

## 编码约定变更

<若无,写"无">

## 前后端联调策略

- Mock / Stub 策略
- 联调顺序
- 环境差异处理
```

### 6.7 模板的三条铁律

1. **三个强制章节必须存在**：`## 架构变更` / `## 安全考虑` / `## 编码约定变更`
   - 即使本次没有变更也要写"无"
   - spec-archiver §5.7 的 diff 检查依赖这些标题存在才能触发

2. **章节标题统一用 `##` 二级标题**
   - spec-archiver 和 Stage 5 自检都用正则按层级匹配标题
   - 标题层级错乱会导致 diff 漏触发或自检假阳性

3. **占位符统一用 `<xxx>` 尖括号**
   - spec-writer 生成时一眼能看出"这里要填内容"
   - Stage 5 一致性自检扫描成品里残留的 `<xxx>` → 发现就算自检失败

### 6.8 第 6 节决策状态

**已定决策**：

| # | 决策点 | 结论 |
|---|---|---|
| 1 | requirements/tasks 是否按 type 分 | ✅ 共用一套模板，只有 design.md 分 3 种 |
| 2 | 三个强制章节（架构/安全/编码约定）约束 | ✅ 必须存在，无则写"无"，供 spec-archiver 触发 diff |
| 3 | 占位符格式 | ✅ `<xxx>` 尖括号，Stage 5 自检扫描残留 |
| 4 | 模板章节层级 | ✅ 统一用 `##`，便于正则匹配 |
| 5 | 模板文件放置位置 | ✅ `skills/spec-writer/templates/` 下 5 个文件 |

**剩余待确认**：

_（§6 暂无待确认点）_

---

## 7. .claude 规范文件 bootstrap

### 7.1 背景

§4.9 的第 2 个待确认点是"规范文件缺失怎么办"：

- **方案 A**（严格失败）：spec-writer Stage 3 发现 `.claude/ARCHITECTURE.md` 等文件缺失 → 直接 FAILED
- **方案 B**（降级继续）：缺文件时写"空规范 + 警告"继续生成
- **方案 C**（自动 bootstrap）：触发另一个 skill 自动创建规范文件模板

§7 选择 **方案 A + 独立 bootstrap 命令** 的组合，既保持 spec-writer 的职责单一，又给用户明确的修复路径。

### 7.2 方案：A + 独立 bootstrap 命令

流程：

- spec-writer 遇到缺失文件 → FAILED
- 主线程透传错误到 TG："请先运行 `/bootstrap-claude-docs` 创建规范文件模板"
- 用户运行 `/bootstrap-claude-docs` → 创建 `.claude/` 下 3 个文件的骨架模板
- 用户填充规范文件内容（或保留默认骨架）→ 重跑 `/start-workflow`

**为什么不选方案 C（spec-writer 自动 bootstrap）**：

- spec-writer 的职责是"写 spec"，不是"初始化项目规范"
- 自动创建空规范 + 继续生成 spec = 用户得到一份"基于空规范"的 spec，质量不可控
- 让用户主动意识到"这个项目还没有规范"比偷偷创建更健康

### 7.3 /bootstrap-claude-docs 命令定义

```yaml
---
name: bootstrap-claude-docs
description: 在 .claude/ 下创建 ARCHITECTURE.md / SECURITY.md / CODING_GUIDELINES.md 三个规范文件的骨架模板。已存在的文件跳过，不覆盖。
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
---
```

**命令体逻辑**：

```
1. 检查 .claude/ 目录是否存在,不存在则 mkdir -p
2. 对每个规范文件 (ARCHITECTURE.md / SECURITY.md / CODING_GUIDELINES.md):
   a. Glob .claude/<file>
   b. 若已存在 → 打印 "已存在,跳过"
   c. 若不存在 → 从 skills/bootstrap-claude-docs/templates/<file> Read → Write 到 .claude/<file>
3. 输出总结:
   - 创建的文件列表
   - 跳过的文件列表
   - 下一步提示 ("请填充规范文件,然后重新运行 /start-workflow")
```

### 7.4 三个规范文件的骨架模板

#### 7.4.1 ARCHITECTURE.md 骨架

```markdown
# Project Architecture

> 本文件定义项目的整体架构决策。spec-writer 在生成 design.md 时会引用这里的定义。

## 技术栈

- 语言:
- 框架:
- 数据库:
- 部署:

## 分层架构

<描述项目的分层结构，例如 API / Service / Repository / DB>

## 核心模块

### <Module Name>

- 职责:
- 边界:
- 依赖:

## 模块间依赖关系

<描述或图示>

## 命名约定

- 服务命名:
- 模块命名:
- API 路径:

## 跨模块通信

- 同步调用:
- 异步事件:

## 数据一致性策略

- <描述>
```

#### 7.4.2 SECURITY.md 骨架

```markdown
# Security Guidelines

> 本文件定义项目的安全约定。spec-writer 在生成 design.md 的"安全考虑"章节时会参照这里。

## 认证

- 认证方式:
- token 存储:
- 过期策略:

## 授权

- 模型 (RBAC / ABAC / 其他):
- 权限粒度:

## 输入校验

- 校验层级:
- 校验工具:

## 敏感数据处理

- 脱敏规则:
- 加密字段:
- 日志脱敏:

## 安全相关的第三方服务

- <服务名>: <用途 + 约束>

## 已知风险与缓解

- <风险>: <缓解措施>
```

#### 7.4.3 CODING_GUIDELINES.md 骨架

```markdown
# Coding Guidelines

> 本文件定义项目的编码约定。spec-writer 在生成 design.md 和 tasks.md 时会参照这里。

## 语言风格

- 命名风格 (camelCase / snake_case 等):
- 文件组织:
- 注释约定:

## 错误处理

- 错误类型:
- 错误传播:
- 日志级别使用:

## 日志

- 日志格式:
- 日志字段约定:
- 敏感字段过滤:

## 测试

- 测试框架:
- 覆盖率要求:
- Mock 策略:

## 代码审查

- PR 模板:
- 审查要点:
- 合并策略:

## 依赖管理

- 包管理器:
- 新增依赖的审批流程:
```

### 7.5 spec-writer Stage 3 失败 → bootstrap 闭环流程

```
用户: /start-workflow 做个用户头像上传
  │
  ▼
spec-workflow subagent
  │
  ▼
spec-writer Stage 3: 读 .claude/ARCHITECTURE.md
  │
  ├─ 文件不存在
  ▼
FAILED
stage: spec-writer:stage-3-read-norms
reason: |
  未找到 .claude/ARCHITECTURE.md
  请先运行 /bootstrap-claude-docs 创建规范文件模板,
  然后填充项目架构信息,再重新运行 /start-workflow
  │
  ▼
主线程 → TG 提示
  │
  ▼
用户: /bootstrap-claude-docs
  │
  ▼
创建 .claude/{ARCHITECTURE,SECURITY,CODING_GUIDELINES}.md
  │
  ▼
用户手动填充或保留默认骨架
  │
  ▼
用户: /start-workflow 做个用户头像上传   ← 重跑
```

### 7.6 bootstrap 边界场景

| 场景 | 处理 |
|---|---|
| `.claude/` 目录不存在 | 自动 `mkdir -p .claude/` |
| 3 个文件里只有 1 个存在 | 创建缺失的 2 个，已存在的跳过 |
| 3 个文件全部存在 | 全部跳过，打印"所有规范文件已存在，无需 bootstrap" |
| `.claude/` 存在但写入权限不足 | 硬失败，提示用户检查文件系统权限 |
| 模板文件自身缺失（skills 安装损坏） | 硬失败，提示重新安装 skill |

### 7.7 文件结构

```
skills/bootstrap-claude-docs/
  ├── SKILL.md                          # 命令逻辑（参考 §7.3）
  └── templates/
      ├── ARCHITECTURE.md               # §7.4.1 骨架
      ├── SECURITY.md                   # §7.4.2 骨架
      └── CODING_GUIDELINES.md          # §7.4.3 骨架
```

**备注**：`bootstrap-claude-docs` 是 slash command 形式（放在 `.claude/commands/` 或等价位置），不是 subagent 调用的 skill；但为了复用"命令 + 模板资源"的组织习惯，把资源也放在 `skills/bootstrap-claude-docs/templates/` 下，由命令 body 内的 Read/Write 使用。

### 7.8 第 7 节决策状态

**已定决策**：

| # | 决策点 | 结论 |
|---|---|---|
| 1 | 缺失规范文件的处理方式 | ✅ 方案 A（严格失败）+ 独立 `/bootstrap-claude-docs` 命令 |
| 2 | bootstrap 覆盖策略 | ✅ 已存在的文件跳过，不覆盖 |
| 3 | 模板的默认内容 | ✅ 3 个文件各有骨架大纲，用户自己填充具体内容 |
| 4 | 为什么不让 spec-writer 自动 bootstrap | ✅ 职责分离，让用户显式感知"项目规范未初始化" |
| 5 | bootstrap 命令的资源位置 | ✅ `skills/bootstrap-claude-docs/templates/` |

**剩余待确认**：

_（§7 暂无待确认点）_

---

## 8. 全文决策汇总

| 章节 | 主要决策点 | 结论 |
|---|---|---|
| §1 | 架构分层与文件结构 | 主线程 → spec-workflow subagent → spec-writer + spec-archiver skill |
| §2 | 主线程输入分类与 URL 处理 | 按 host 分类 + 忽略多余同类 URL + 可选 `type=` 参数 |
| §2 | subagent 调用协议 | 结构化 prompt，包含 source_type / prd_url / design_url / user_type 等字段 |
| §3 | subagent 输出格式 | 顶格 `SUCCESS` / `FAILED` + `PROGRESS:` 轨迹 + 事后 timeline |
| §3 | 子步骤失败传递 | 整体 FAILED，不尝试部分成功 |
| §3 | type 分类位置 | 放在 spec-writer 而非 subagent |
| §4 | spec-writer 6 步流程 | 加载分类 → 读规范 → 生成三件套 → 自检 → 写 drafts → 返回 |
| §4 | type 分类规则 | 规则 0 (user-specified) > 设计稿命中 > 数据层关键词 > fullstack 兜底 |
| §4 | slug 生成 | 中文保留 + 英文小写 + 连字符 + 长度 ≤ 40 |
| §4 | Stage 4 生成方式 | α 方案：一次大 Claude 调用 |
| §5 | spec-archiver 职责 | 搬运 + meta.json + .claude diff 检查 |
| §5 | 归档冲突 | 同日同 slug 硬失败 |
| §5 | .claude diff 触发 | 方案 A 约定标题匹配，apply 失败降级为 warning |
| §5 | related_specs | 只记录最近 1 条 |
| §6 | 模板数量与分层 | requirements/tasks 共用，design 按 type 分 3 种 |
| §6 | 模板铁律 | 强制章节 + 统一 `##` 层级 + `<xxx>` 占位符 |
| §7 | 规范文件缺失 | 方案 A（严格失败）+ 独立 `/bootstrap-claude-docs` 命令 |

---

## 9. 跨节待定项收口

经过 §2.8 / §3.8 / §4.9 / §5.10 / §6.8 / §7.8 各节决策状态汇总，**所有原本的待确认项均已锁定**：

| 来源 | 原待确认点 | 最终结论 |
|---|---|---|
| §2.8 | Bash 工具最小权限 | ✅ 接受软约束 |
| §2.8 | Stitch 场景软降级 | ✅ 接受 |
| §2.8 | bootstrap 命令是否纳入 MVP | ✅ 纳入（详见 §7） |
| §3.8 | tools 白名单完整性 | ✅ 起步够用，遇缺再扩 |
| §3.8 | `skills:` frontmatter 可用性 | ✅ 实施阶段验证 + 备选方案已定 |
| §3.8 | 自定义输出协议 | ✅ 接受软约束 |
| §3.8 | 路径写权限软约束 | ✅ 接受软约束 |
| §4.9 | Slug 中英文混合规则 | ✅ 中文保留 + 英文小写 + 连字符 |
| §4.9 | 用户显式指定 type | ✅ `type=` 参数优先级最高 |
| §4.9 | spec-writer 静默自主分类 | ✅ 不询问 |
| §4.9 | Stage 4 生成方式 | ✅ α 方案 |
| §4.9 | 边界 type 场景 | ✅ 由用户用 `type=` 兜底 |
| §4.9 | 一致性自检 1 次修复例外 | ✅ 接受（见 §4.7.1） |
| §4.9 | 规范文件缺失处理 | ✅ 方案 A + bootstrap 命令（§7） |
| §5.10 | spec-archiver 6 项决策 | ✅ 全部锁定 |
| §6.8 | 模板 5 项决策 | ✅ 全部锁定 |
| §7.8 | bootstrap 5 项决策 | ✅ 全部锁定 |

**结论**：design 阶段决策已全部收敛，可进入实施计划阶段。

---

## 10. 下一步

- [ ] 用户 review 本 design.md（重点关注 §4.7.1 的"1 次修复例外"是否同意）
- [ ] 调用 `superpowers:writing-plans` skill 输出实施计划
- [ ] 按计划执行开发（不在本 spec 范围内）
