# Repo-Pulse - Claude Code 执行契约与项目指导

> **警告**：本文档是 Claude Code 在本仓库执行任务的最高优先级契约。每次启动新会话或接受新指令时，**必须**首先阅读本文档。

## 1. 项目架构与上下文
Repo-Pulse 是一个 AI 驱动的代码仓库监控与管理平台，采用 Monorepo 架构。
- **前端** (`apps/web`): React 19 + TypeScript 5.9 + Vite 7.2 + shadcn/ui + Tailwind CSS 3.4
- **后端** (`apps/api`): NestJS + TypeScript + Prisma + PostgreSQL + Redis
- **共享包**: `@repo-pulse/shared` (类型/常量), `@repo-pulse/database` (Prisma schema), `@repo-pulse/ai-sdk` (AI 模型适配层)
- **包管理器**: pnpm workspaces + Turborepo

## 2. 渐进式开发步长与执行约束
为了防止 AI 产生幻觉、偏离目标或引入难以追踪的 Bug，你必须遵循以下“微步长”执行原则：

### 2.1 执行步长定义
每次接受用户的宏观任务时，你必须将其拆解为以下微步长，并在每一步完成后向用户汇报或独立提交：
1. **分析阶段**：读取相关代码文件，明确依赖关系。
2. **计划阶段**：列出具体要修改的文件和预期的变更内容。
3. **执行阶段**：修改代码。**每次只修改一个逻辑相关的功能点（如：只改一个接口，或只改一个组件）**。
4. **验证阶段**：运行对应的类型检查、Lint 或测试。
5. **提交阶段**：使用明确的 Conventional Commits 规范进行 git commit。

### 2.2 验证要求
在修改任何代码后，**严禁**直接进入下一个开发任务。你必须通过 `shell` 运行以下命令验证你的修改：
- 如果修改了前端：运行 `pnpm --filter web typecheck` 和 `pnpm --filter web lint`
- 如果修改了后端：运行 `pnpm --filter api typecheck` 和 `pnpm --filter api lint`
- 如果修改了共享包：必须运行 `pnpm build` 确保依赖该包的应用能够正常编译。

## 3. 严格的工程规范

### 3.1 前端约束
- **样式红线**：**绝对禁止**在 Tailwind 中使用硬编码的十六进制颜色（如 `bg-[#0d1117]`）或未在规范中定义的任意值。**只能使用** `frontend-style-guide.md` 中定义的 CSS 变量（如 `bg-background`, `text-primary`）。
- **组件复用**：优先使用 `apps/web/src/components/ui/` 下已有的 shadcn 组件。如果需要新组件，先确认是否可以通过组合现有组件实现。
- **状态管理**：服务端数据获取**必须**使用 TanStack Query (`useQuery`, `useMutation`)，严禁在业务组件中使用 `useEffect` 配合 `useState` 拉取数据。全局 UI 状态使用 Zustand。
- **类型安全**：前后端交互的 Payload 和 Response 接口**必须**从 `@repo-pulse/shared` 中导入，禁止在前端重新定义后端已有类型，严禁使用 `any`。

### 3.2 后端约束
- **配置分离**：明确区分 `FRONTEND_URL` 和 `API_URL`。处理 OAuth 回调或生成发给前端的链接时，必须使用 `FRONTEND_URL`。
- **安全优先**：处理认证时，优先使用 HttpOnly Cookie 存储敏感 Token。处理 Webhook 时，必须基于原始请求体（Raw Body）进行签名验证，并按仓库粒度获取 Secret。
- **数据库操作**：所有数据库交互必须通过 Prisma Client。更新 Schema (`packages/database/prisma/schema.prisma`) 后，**必须**运行 `pnpm db:generate` 和 `pnpm db:migrate`。

## 4. Agent 调用时机与分工

项目中配置了多种专用 Agent（位于 `.claude/agents/`），在处理复杂任务时，你应该明确自己的角色边界，并在需要时建议用户切换 Agent：

| Agent 名称 | 触发时机 / 适用场景 |
| :--- | :--- |
| `frontend-developer` | 处理 React 组件、Tailwind 样式、TanStack Query 数据流。 |
| `backend-developer` | 处理 NestJS 控制器、服务逻辑、BullMQ 队列消费者。 |
| `sql-pro` | 涉及复杂的 Prisma Schema 设计、数据库迁移或慢查询优化。 |
| `websocket-engineer` | 处理 Socket.io Gateway 搭建、事件广播机制、前端实时订阅。 |
| `ai-engineer` | 开发或优化 `ai-sdk`、调整 Prompt 模板、处理 SSE 流式输出。 |
| `security-auditor` | 修复 Webhook 验签漏洞、XSS/CSRF 防护、认证流程重构。 |
| `code-reviewer` | 在完成一个 Phase 的开发后，进行整体代码质量和规范审查。 |

## 5. 核心参考文档
在进行任何实际开发前，你**必须**阅读以下文档以获取具体的业务目标和规范：
1. `/docs/project-plan-v2.md` - **当前最高优先级的迭代计划**。包含了详细的阶段划分、当前架构缺陷的修复方案以及具体的验收标准。**你必须严格按照该文档的 Phase 顺序执行，不可跳跃。**
2. `/docs/frontend-style-guide.md` - 前端样式红线和交互规范。
