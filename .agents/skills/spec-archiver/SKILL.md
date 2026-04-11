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

# spec-archiver

你是 spec-driven workflow 的归档者。被 `spec-workflow` subagent 在 spec-writer 成功后调用。**不主动激活**。

## 职责边界

只做三件事：

1. **搬运**：`specs/_drafts/<slug>/` → `specs/YYYY-MM-DD-<slug>/`
2. **写 meta.json**：归档元数据
3. **diff 检查 + 规范文件更新**：根据 design.md 的约定标题决定是否更新 `.claude/` 规范

**不做**：生成 spec、写代码、决定 slug/type、深度内容质量校验。

## 输入契约

调用方传入：

```yaml
drafts_path: specs/_drafts/<slug>/
slug: <spec-writer 已确定的 slug>
type: <backend | frontend | fullstack>
source_meta:
  source_type: <prd_only | design_only | prd_and_design | natural_language>
  prd_url: <URL 或 null>
  design_url: <URL 或 null>
  design_tool: <figma | figjam | figma-make | stitch | screenshot | null>
  user_type_specified: <backend | frontend | fullstack | null>
  prd_fetched_at: <ISO 时间戳 或 null>
spec_writer_stats:
  type_classification: <auto | user-specified>
  consistency_check: passed
  retry_count: <0 | 1>
```

## 执行流程

整个 skill 严格按 5 个 archive 子 Stage 执行。每个 Stage 开始前**单独输出一行** `PROGRESS: <描述>`。

### archive-1: validate-path

- 输出：`PROGRESS: 校验归档路径 + 存在性检查`
- 计算 `current_date = $(date +%Y-%m-%d)`（主机时区，Bash）
- `archive_path = specs/<current_date>-<slug>/`
- **冲突检查**：
  - 如果 `archive_path` 已存在 → **硬失败**：

    ```json
    {
      "status": "failed",
      "stage": "archive-1-validate-path",
      "reason": "同日同 slug 已归档：<archive_path>。若要覆盖请先手动删除该目录。",
      "partial_files": []
    }
    ```

  - Glob `specs/*-<slug>/` 不含当前日期，命中则记录最近 1 条作为 `related_specs`，输出 `PROGRESS: 检测到历史同 slug spec: <path>`。**只保留最近 1 条**（按目录名日期降序排，第 1 个就是最近）。
- **存在性检查**：对 `drafts_path` 下的 `requirements.md` / `design.md` / `tasks.md` 做检查
  - 任一缺失或大小为 0 → 硬失败：

    ```json
    {
      "status": "failed",
      "stage": "archive-1-validate-path",
      "reason": "三件套中 <file> 缺失或为空",
      "partial_files": []
    }
    ```

### archive-2: move-drafts

- 输出：`PROGRESS: mv _drafts → <archive_path>`
- Bash: `mv <drafts_path> <archive_path>`
- Glob 验证：`<archive_path>/requirements.md` 等三个文件齐备
- 失败 → 硬失败（archive-2-move-drafts）。**注意**：mv 失败可能留半成品状态，让 subagent 透传给用户手动处理

### archive-3: write-meta

- 输出：`PROGRESS: 写 meta.json`
- 调用 Bash 获取 `git rev-parse HEAD`，作为 `git_commit_at_archive` 字段（若仓库无 commit 或非 git 仓库则填 `null`，**不要因此失败**）
- 写 `<archive_path>/meta.json`，结构如下：

  ```json
  {
    "slug": "<slug>",
    "type": "<type>",
    "archived_at": "<ISO timestamp now>",
    "archived_path": "<archive_path>",
    "git_commit_at_archive": "<sha 或 null>",
    "source": {
      "source_type": "<from input>",
      "prd_url": "<from input>",
      "design_url": "<from input>",
      "design_tool": "<from input>",
      "user_type_specified": "<from input>",
      "prd_fetched_at": "<from input>"
    },
    "spec_writer": {
      "type_classification": "<from input>",
      "consistency_check": "passed",
      "retry_count": <from input>
    },
    "claude_updates": {
      "detected": false,
      "updated_files": [],
      "diff_summary": "",
      "error": null
    },
    "related_specs": [<最近 1 条历史 spec 路径，或空数组>]
  }
  ```

- 写 meta.json 失败 → 硬失败（archive-3-write-meta）。注意此时 mv 已成功但 meta.json 缺失，让用户手动补一个或重跑 archive-3

### archive-4: diff-claude

- 输出：`PROGRESS: diff 检查 .claude 规范文件`
- Read `<archive_path>/design.md`
- 检测以下 3 个**强约定标题**是否存在并提取章节内容：

  | design.md 标题 | 触发更新的 .claude 文件 |
  |---|---|
  | `## 架构变更` 或 `## Architecture Changes` | `.claude/ARCHITECTURE.md` |
  | `## 安全考虑` 或 `## Security Considerations` | `.claude/SECURITY.md` |
  | `## 编码约定变更` 或 `## Coding Guidelines Update` | `.claude/CODING_GUIDELINES.md` |

- **存在性前置检查**：对于每个触发的 `.claude/<file>`，若其不存在，跳过该文件，把该条写入 `claude_updates.error`（例："`.claude/ARCHITECTURE.md` 不存在，跳过 diff 应用"），不创建新文件。

- 对每一个**触发**章节（章节内容不为"无"且非空）：
  1. Read 对应的 `.claude/<file>`
  2. 让 Claude 生成 unified diff，instruction："把 design.md 的 <heading> 章节的内容合并进 <claude_file>，保留现有结构，只追加/修改相关段落，输出标准 unified diff 格式"
  3. apply 优先用 Edit 工具；若 Edit 失败再尝试 Bash `patch` 命令；两者均失败才触发降级。
  4. **成功** → 把文件名加入 `claude_updates.updated_files`，把 diff 摘要追加到 `claude_updates.diff_summary`
  5. **失败** → **降级处理**（不阻断整个归档）：
     - `claude_updates.error = "diff apply failed for <claude_file>: <error>"`
     - 输出 `PROGRESS: ⚠️ <claude_file> diff 应用失败，已跳过，请手动同步`
     - 继续处理下一个章节

- **降级理由**：归档主体已经成功（目录和 meta.json 都写好了），`.claude/` 更新失败不影响当前 spec 的可用性。硬失败反而让用户困惑"我的 spec 到底归档没"。保留 error 信息到 meta.json + warning 给主线程，用户事后手动处理。

- **汇总 detected 字段**：若 `claude_updates.updated_files` 非空，将 `claude_updates.detected` 字段置为 `true`；否则保持 `false`。

- 全部章节处理完后，**回写 meta.json**（用 Edit 工具更新 `claude_updates` 段）

### archive-5: return-summary

- 输出：`PROGRESS: 返回归档摘要`
- 组装返回值（参考 §返回值契约）

## PROGRESS 输出约定

每个 archive 子 Stage 开始前必须**单独输出一行** `PROGRESS: <描述>`。中间步骤可加细 `PROGRESS:` 行。不要把 `PROGRESS:` 和文件内容混在同一个 Write tool call 里。

## 返回值契约

**成功**：

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
    ["00:01", "mv _drafts → <archive_path>"],
    ["00:02", "写 meta.json"],
    ["00:04", "diff 检查 .claude"],
    ["00:12", "更新 .claude/ARCHITECTURE.md"]
  ]
}
```

**失败**：

```json
{
  "status": "failed",
  "stage": "<archive-N-name>",
  "reason": "<人类可读原因>",
  "partial_files": []
}
```

## 失败原子性约定

| Stage | 失败行为 |
|---|---|
| archive-1 | 硬失败，不动文件系统 |
| archive-2 | 硬失败，可能留半 mv 状态 → 透传给用户 |
| archive-3 | 硬失败，归档目录已存在但缺 meta.json，用户可手动补或重跑 |
| archive-4 | **降级**（记 error 到 meta.json，不阻断） |
| archive-5 | 不应失败 |

## 禁止行为

- 不读 URL，不联网
- 不修改 `specs/` 和 `.claude/<3 个规范文件>` 之外的项目代码
- 不 `git add` / `git commit`
- 不调用 Agent 工具
- 不调用其它 skill
- **不修改三件套内容**（spec-writer 已经定稿，spec-archiver 只搬运）
