# ai-workflow

本项目基于 [Better-T-Stack](https://github.com/AmanVarshney01/create-better-t-stack) 创建，采用现代 TypeScript 技术栈，集成了 React、React Router、Hono 等技术。

## 技术特性

- **TypeScript** - 类型安全，提升开发体验
- **React Router** - React 声明式路由
- **TailwindCSS** - 原子化 CSS，快速构建 UI
- **共享 UI 包** - shadcn/ui 基础组件位于 `packages/ui`
- **Hono** - 轻量高性能的服务端框架
- **Bun** - 运行时环境
- **Drizzle** - TypeScript 优先的 ORM
- **PostgreSQL** - 数据库引擎
- **身份认证** - Better-Auth
- **Turborepo** - 优化的 Monorepo 构建系统
- **Biome** - 代码检查与格式化

## 快速开始

首先，安装依赖：

```bash
bun install
```

## 数据库配置

本项目使用 PostgreSQL 配合 Drizzle ORM。

1. 确保已搭建好 PostgreSQL 数据库。
2. 更新 `apps/server/.env` 文件中的 PostgreSQL 连接信息。

3. 将数据表结构推送到数据库：

```bash
bun run db:push
```

然后，启动开发服务器：

```bash
bun run dev
```

在浏览器中打开 [http://localhost:5173](http://localhost:5173) 查看 Web 应用。
API 服务运行在 [http://localhost:3000](http://localhost:3000)。

## UI 自定义

本技术栈中的 React Web 应用通过 `packages/ui` 共享 shadcn/ui 基础组件。

- 在 `packages/ui/src/styles/globals.css` 中修改设计令牌和全局样式
- 在 `packages/ui/src/components/*` 中更新共享基础组件
- 在 `packages/ui/components.json` 和 `apps/web/components.json` 中调整 shadcn 别名或样式配置

### 添加更多共享组件

在项目根目录运行以下命令，向共享 UI 包添加更多基础组件：

```bash
npx shadcn@latest add accordion dialog popover sheet table -c packages/ui
```

导入共享组件的方式：

```tsx
import { Button } from "@ai-workflow/ui/components/button";
```

### 添加应用专属组件

如需添加应用专属的组件块（而非共享基础组件），请在 `apps/web` 目录下运行 shadcn CLI。

## 部署（Cloudflare + Alchemy）

- 开发环境：cd apps/web && bun run alchemy dev
- 部署上线：cd apps/web && bun run deploy
- 销毁环境：cd apps/web && bun run destroy

更多详情请参阅 [使用 Alchemy 部署到 Cloudflare 指南](https://www.better-t-stack.dev/docs/guides/cloudflare-alchemy)。

## Git Hooks 与格式化

- 格式化与代码检查修复：`bun run check`

## 项目结构

```
ai-workflow/
├── apps/
│   ├── web/         # 前端应用（React + React Router）
│   └── server/      # 后端 API（Hono）
├── packages/
│   ├── ui/          # 共享 shadcn/ui 组件与样式
│   ├── auth/        # 身份认证配置与逻辑
│   └── db/          # 数据库表结构与查询
```

## 可用脚本

- `bun run dev`：启动所有应用的开发模式
- `bun run build`：构建所有应用
- `bun run dev:web`：仅启动 Web 应用
- `bun run dev:server`：仅启动服务端
- `bun run check-types`：检查所有应用的 TypeScript 类型
- `bun run db:push`：推送数据表结构变更到数据库
- `bun run db:generate`：生成数据库客户端/类型
- `bun run db:migrate`：运行数据库迁移
- `bun run db:studio`：打开数据库管理界面
- `bun run check`：运行 Biome 格式化与代码检查
