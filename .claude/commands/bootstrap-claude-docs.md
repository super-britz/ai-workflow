---
name: bootstrap-claude-docs
description: 在 .claude/ 下创建 ARCHITECTURE.md / SECURITY.md / CODING_GUIDELINES.md 三个规范文件的骨架模板。已存在的文件跳过，不覆盖。
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
---

# /bootstrap-claude-docs

为当前仓库初始化 `.claude/` 下的 3 份规范骨架，供后续 `spec-writer` 在生成 design.md 时引用。

## 行为约定

- **不覆盖**已存在的文件 — 如果 `.claude/ARCHITECTURE.md`、`.claude/SECURITY.md`、`.claude/CODING_GUIDELINES.md` 已存在，则跳过、保留原内容
- 只创建缺失的文件
- 全程不修改 `.claude/CLAUDE.md`、`.claude/settings.json` 或任何其它无关文件
- 不 git commit，留给用户自己决定何时提交

## 执行步骤

1. **检查 `.claude/` 目录**
   - Bash: `mkdir -p .claude`（幂等，已存在不会报错）

2. **依次处理 3 个目标文件**，对每一个 `<file>`（`ARCHITECTURE.md` / `SECURITY.md` / `CODING_GUIDELINES.md`）：

   a. Glob 检查 `.claude/<file>` 是否已存在
   b. **若已存在** → 在输出里记一行 `已存在，跳过: .claude/<file>`，进入下一个文件
   c. **若不存在** →
      - Read `.agents/skills/bootstrap-claude-docs/templates/<file>` 加载骨架
      - Write `.claude/<file>`，内容为骨架原文
      - 在输出里记一行 `已创建: .claude/<file>`

3. **输出汇总**

   ```
   bootstrap-claude-docs 完成

   已创建:
     - <列表>
   已存在跳过:
     - <列表>

   下一步:
   1. 编辑上述文件，填入真实的项目架构 / 安全 / 编码约定
   2. 重新运行 /start-workflow
   ```

## 边界场景

| 场景 | 处理 |
|---|---|
| `.claude/` 不存在 | `mkdir -p .claude` 自动创建 |
| 3 份模板里某 1 份在 `.agents/skills/bootstrap-claude-docs/templates/` 缺失 | 报错并指出缺失文件，提示重新拉取 skill |
| `.claude/` 存在但写权限不足 | 报错，提示检查文件系统权限 |
| 全部 3 份目标文件都已存在 | 输出 "所有规范文件已存在，无需 bootstrap" |

## 禁止行为

- 不要写 `.claude/CLAUDE.md`、`.claude/settings.json`、`.claude/settings.local.json`
- 不要 git add / git commit
- 不要写 `.agents/` 或 `specs/` 下任何文件
- 不要联网，不调用 Agent / WebFetch
