# Repo-Pulse - Claude Code 项目指导

## 项目概述
Repo-Pulse 是一个 AI 驱动的代码仓库监控与管理平台。
- 前端: React 19 + TypeScript 5.9 + Vite 7.2 + shadcn/ui + Tailwind CSS 3.4
- 后端: NestJS + TypeScript + Prisma + PostgreSQL + Redis
- 桌面端: Electron
- AI: 多模型抽象层 (OpenAI/Claude/Ollama)
- Monorepo: pnpm workspaces + Turborepo

## 项目结构
- `apps/web/` - React 前端应用
- `apps/api/` - NestJS 后端 API
- `apps/desktop/` - Electron 桌面端（待搭建）
- `packages/shared/` - 前后端共享类型和工具
- `packages/database/` - Prisma 数据库包
- `packages/ai-sdk/` - AI 多模型抽象层
- `docs/` - 项目文档

## 关键约束

### 前端开发
- **必须遵守** `/docs/frontend-style-guide.md` 中的所有规则
- 颜色仅使用 CSS 变量（--background, --primary, --github-* 等），禁止硬编码
- 组件优先使用 shadcn/ui (New York 风格)，图标统一使用 lucide-react
- 样式只用 Tailwind CSS 类，禁止内联 style 和 !important
- 动画微交互用 Tailwind transition (duration-200 ease-out)，复杂动画用 GSAP
- 所有文案走 i18n 系统，中文优先
- 状态管理: 服务端状态用 TanStack Query，客户端状态用 Zustand
- 暗黑主题为唯一主题，不需要亮色模式切换

### 后端开发
- NestJS 模块化架构，每个功能领域一个模块
- Prisma 作为唯一 ORM，Schema 定义在 packages/database/
- 异步任务通过 BullMQ 队列处理
- API 统一响应格式: `{ code: number, data: T, message: string, timestamp: string }`
- 全局守卫: JwtAuthGuard, RolesGuard, ThrottlerGuard
- 全局管道: ValidationPipe (基于 class-validator + class-transformer)
- 日志: NestJS Logger + Winston

### 数据库
- PostgreSQL 为主数据库，Redis 用于缓存和消息队列
- 所有模型 id 使用 cuid()
- 时间字段统一 createdAt/updatedAt
- 关联使用 Prisma 关系定义，禁止原生 SQL 拼接

### AI 服务
- 通过 packages/ai-sdk 统一接口调用
- 支持 OpenAI (GPT-4o)、Anthropic (Claude Sonnet)、Ollama (本地模型)
- 支持模型切换和 fallback 链
- 流式输出通过 SSE (Server-Sent Events)
- 分析结果结构化存储到 AIAnalysis 表

### 实时通信
- WebSocket 使用 Socket.io，通过 NestJS Gateway
- 事件类型: event:new, analysis:progress, analysis:complete, approval:new, notification:new, dashboard:update
- SSE 用于 AI 流式输出: GET /ai/stream/:taskId

### 代码规范
- TypeScript strict mode，禁止 any
- 中文优先的 i18n
- 函数式组件 + hooks，禁止 class 组件
- 文件命名: kebab-case 文件名，PascalCase 组件/类名，camelCase 函数/变量名
- 导入路径使用 @ 别名 (如 @/components, @/lib/utils)

## 常用命令
- `pnpm dev` - 启动所有开发服务
- `pnpm dev:web` - 仅启动前端 (Vite dev server)
- `pnpm dev:api` - 仅启动后端 (NestJS)
- `pnpm build` - 构建所有包
- `pnpm db:migrate` - 运行数据库迁移
- `pnpm db:generate` - 生成 Prisma Client
- `pnpm db:studio` - 打开 Prisma Studio
- `pnpm lint` - ESLint 代码检查
- `pnpm test` - 运行测试 (Vitest 前端, Jest 后端)
- `pnpm typecheck` - TypeScript 类型检查

## Agent 使用指南
项目配置了 18 个专用 agent（位于 .claude/agents/），适用场景：
- 前端开发 → frontend-developer, ui-designer
- 后端开发 → backend-developer, api-designer
- 数据库 → sql-pro
- 全栈 → fullstack-developer, typescript-pro
- WebSocket → websocket-engineer
- 桌面端 → electron-pro
- AI 工程 → ai-engineer, llm-architect, prompt-engineer
- 调试 → debugger, error-detective
- 测试 → test-automator
- 代码审查 → code-reviewer
- 性能优化 → performance-engineer
- 安全审计 → security-auditor

## 文档参考
- `/docs/frontend-style-guide.md` - 前端样式约束（必读）
- `/docs/project-plan.md` - 完整项目搭建计划

