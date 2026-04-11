# spec-writer 一致性自检 checklist

> 此 checklist 由 spec-writer 在 Stage 5 加载并对照 _drafts 下的三件套逐条判断。
> 任何一项违反即记录为 violation。出现 violation 后允许做最多 1 次有针对性修复（仅重写违反项对应的单个文件），仍违反则整体 FAILED。

## Cross-file consistency

- [ ] requirements.md 的每一条验收标准都在 design.md 里有对应章节覆盖
- [ ] design.md 的每一个 API/endpoint/组件/页面，在 tasks.md 里都有对应的实现任务
- [ ] tasks.md 里没有引用 design.md 之外的"凭空任务"
- [ ] requirements.md frontmatter 的 type 与 design.md 选用的模板一致
- [ ] source 字段在 requirements.md frontmatter 里如实记录了 PRD 和设计稿 URL

## Internal consistency

- [ ] requirements.md 的"范围外"明确列出了不做的事
- [ ] design.md 的每个章节都不为空（模板里的 placeholder 都被替换了）
- [ ] tasks.md 的任务顺序符合 type 规则
    - backend: 模型 → migration → API → 业务逻辑 → 测试
    - frontend: 页面骨架 → 组件 → 数据接入 → 交互 → a11y → 测试
    - fullstack: Backend 全部完成 → Frontend
- [ ] tasks.md 里没有 "TODO" / "FIXME" / "<placeholder>" 等未填充的标记

## Metadata

- [ ] requirements.md 的 frontmatter 包含: name, type, priority, source, created
- [ ] 三件套文件名和路径都在 specs/_drafts/<slug>/ 下

## 修复约定

- 单次修复只允许重写违反项对应的那一个文件（不重跑 Stage 4 整体生成）
- 修复后必须重新跑完整 checklist
- 若仍有违反 → spec-writer 返回 `{status: "failed", stage: "stage-5-consistency-check", reason: "consistency check failed after 1 retry, violations: [...]"}`
