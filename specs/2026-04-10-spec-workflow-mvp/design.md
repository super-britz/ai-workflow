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
extra_tokens = []
ignored_urls = []

for tok in tokens:
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
3. `source_type` / `design_tool` 等字段让 subagent 不需要再做一次输入分类

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

### 2.8 第 2 节待确认点

1. **Bash 工具的最小权限**：主线程 allowed-tools 里保留了 `Bash`（Stitch 场景要 `curl -L`）。Claude Code 的 Bash 工具不支持"命令白名单"级细粒度控制，只能靠 prompt 约束。你接受吗？
2. **Stitch 场景的完整实现**：Stitch MCP 当前连接未验证通过，第一版在 design 里保留了 Stitch 路径，但运行时可能退化到 L3（用户截图）。这个"软降级"OK 吗？
3. **`.claude/` 规范文件缺失的处理**：§2.7 失败示例里 subagent 因为缺 `SECURITY.md` 而 FAILED，主线程提示"运行 /bootstrap-claude-docs"。这个 slash command 是否要作为 MVP 的一部分，还是留到后续迭代？

---

<!-- §3 将在后续 commit 中追加 -->
