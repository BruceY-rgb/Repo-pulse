# Repo-Pulse 迭代执行计划 (v2.0)

> **文档说明**：本计划基于 Repo-Pulse 当前实现状态（Phase 2 部分完成）重新制定。主要针对现有架构的不足、登录体验、Webhook 机制、消息传输和前端交互体验等核心问题提供具体的重构指导和后续渐进式开发步骤。Claude Code 在执行任务时请严格参照本计划和 `CLAUDE.md` 的约束。

## 一、 当前架构问题与重构策略

基于对当前代码库的分析，项目目前处于 MVP 阶段的基础设施搭建和初期功能实现中，但存在一些阻碍后续扩展的关键架构问题。

### 1.1 认证与登录体验重构

**当前问题**：
前端采用传统的 Token + `localStorage` 存储模式，存在 XSS 安全风险；GitHub OAuth 回调重定向地址依赖含糊的环境变量 `APP_URL`；后端通过私有属性获取用户服务，代码不够健壮；缺乏 Token 自动续期机制。

**重构策略**：
- **安全存储**：将 Access Token 和 Refresh Token 迁移至 `HttpOnly` Cookie 中存储，前端仅在内存中保留用户基本信息状态。
- **OAuth 流程优化**：前后端分离架构下，明确区分 `FRONTEND_URL` 和 `API_URL` 环境变量。OAuth 登录成功后，后端通过重定向到前端特定的回调路由，并通过 URL 参数或短效授权码交换机制将状态同步给前端。
- **状态同步**：实现静默刷新机制，利用 Axios 拦截器在 Access Token 过期前自动通过 Refresh Token 续期，提升用户无感体验。

### 1.2 Webhook 与消息传输机制修复

**当前问题**：
Webhook 验证使用全局 `WEBHOOK_SECRET`，未实现按仓库维度的独立验证；注册 Webhook 时依赖全局 `GITHUB_TOKEN`，未利用用户自身的 OAuth Token；GitHub 签名验证直接使用 `JSON.stringify(payload)`，未保留原始请求体导致验签失败；BullMQ 消费者逻辑不完整；WebSocket 网关缺失。

**重构策略**：
- **精准验签**：配置 NestJS 中间件以捕获 Webhook 路由的 Raw Body，确保 GitHub HMAC 签名验证的准确性。
- **仓库隔离**：重构 `WebhookService`，根据请求路径或 Payload 提取仓库标识，使用数据库中存储的该仓库专属 `webhookSecret` 进行验签。
- **权限修复**：在仓库绑定和 Webhook 注册环节，提取当前用户的 GitHub OAuth Token，以用户身份调用 GitHub API，确保权限范围正确。
- **实时传输**：引入 `@nestjs/websockets` 和 `socket.io`，建立 `EventGateway`，在 `EventProcessor` 成功处理事件后，向特定频道（如 `repo:{id}`）广播消息。

### 1.3 仓库管理界面体验升级

**当前问题**：
前端数据获取依赖基础的 `useState` / `useEffect`，缺乏缓存和自动重试；大量硬编码中文文案，违背 i18n 规范；颜色使用未完全遵循语义化 CSS 变量；交互层次单一，缺乏细粒度的反馈状态。

**重构策略**：
- **状态管理升级**：全面接入 TanStack Query (`@tanstack/react-query`) 处理服务端状态，实现数据的自动缓存、后台刷新和乐观更新。
- **规范对齐**：彻底清理硬编码文本，接入 `react-i18next`；严格审查 Tailwind 类名，确保仅使用 `frontend-style-guide.md` 中定义的 `--primary`、`--github-*` 等语义化变量。
- **交互丰富化**：为仓库列表增加骨架屏加载状态；细化同步操作的反馈；引入空状态插画；增加仓库事件流的侧边栏或详情页视图，提升信息获取效率。

---

## 二、 渐进式开发阶段划分

为确保 Claude Code 能够有序执行，将后续开发任务划分为以下粒度明确的阶段。每个阶段必须独立测试并提交，不可跨阶段混合开发。

### Phase 2.1: 基础设施加固与安全修复（当前最高优先级）

本阶段致力于解决阻碍核心链路跑通的底层问题。

- **任务 1：Raw Body 中间件配置**
  - 在 `main.ts` 或专属中间件中配置 `express.json({ verify: ... })`，为 `/webhooks/*` 路由保留原始请求体缓冲。
- **任务 2：Webhook 验签逻辑重构**
  - 修改 `WebhookService.verifyGithubSignature`，使用 Raw Body 缓冲进行 HMAC SHA256 计算。
  - 修改 `WebhookService` 逻辑，从请求中提取仓库 ID，查询数据库获取对应的 `webhookSecret` 进行验签。
- **任务 3：认证流程重构**
  - 修改 `AuthModule`，在登录和 OAuth 回调中将 Token 写入 `HttpOnly` Cookie。
  - 增加 `/auth/refresh` 接口的 Cookie 支持。
  - 梳理 `.env`，明确 `FRONTEND_URL` 和 `API_URL`。

### Phase 2.2: 实时通信与事件流闭环

本阶段目标是让用户能实时看到仓库发生的变更。

- **任务 1：WebSocket 网关搭建**
  - 创建 `EventGateway`，配置 Socket.io，实现客户端连接认证和频道订阅（基于仓库 ID 或工作空间）。
- **任务 2：消息队列闭环**
  - 完善 `EventProcessor`，在成功标准化并存储事件后，调用 `EventGateway` 广播事件更新。
- **任务 3：前端实时订阅**
  - 在前端建立 WebSocket 连接管理 Hook (`useWebSocket`)。
  - 在 Dashboard 和 Repositories 页面监听事件推送，结合 TanStack Query 的 `queryClient.setQueryData` 或 `invalidateQueries` 更新 UI。

### Phase 2.3: 前端交互与体验重塑

本阶段专注于解决用户感知最强的界面问题。

- **任务 1：TanStack Query 迁移**
  - 重构 `Repositories.tsx`，移除 `useState` / `useEffect`，使用 `useQuery` 和 `useMutation` 管理仓库列表和同步操作。
- **任务 2：i18n 与样式规范化**
  - 提取 `Repositories.tsx` 中的所有中文文案至 i18n 资源文件。
  - 替换所有非语义化的 Tailwind 颜色类，严格遵守 `frontend-style-guide.md`。
- **任务 3：视图扩展**
  - 新增仓库详情视图（或抽屉式面板），展示该仓库最近的 Event 列表和同步状态。

### Phase 3: AI 分析引擎（核心业务）

本阶段开始实现产品的核心差异化价值。

- **任务 1：AI SDK 抽象层**
  - 在 `packages/ai-sdk` 中实现统一接口，支持 OpenAI/Claude API 调用。
  - 实现基于 Prompt 模板的变更摘要和风险评估逻辑。
- **任务 2：AI 分析工作流**
  - 创建 `ai-analysis` BullMQ 队列。
  - 当 `EventProcessor` 识别到高价值事件（如 PR_OPENED, PUSH）时，触发 AI 分析任务。
  - 将分析结果结构化存储至 `AIAnalysis` 表。
- **任务 3：流式输出与前端呈现**
  - 实现 SSE (Server-Sent Events) 接口，允许前端实时获取 AI 分析的打字机效果。
  - 在前端开发 AI 洞察卡片组件，展示风险等级、摘要和修复建议。

### Phase 4: 团队协同与高级功能

- **任务 1：过滤与订阅引擎**
  - 实现 `FilterModule`，允许用户根据关键词、事件类型配置订阅规则。
- **任务 2：审批工作流**
  - 实现基于高风险 AI 分析结果的审批拦截机制。
- **任务 3：多渠道通知**
  - 接入邮件服务（Nodemailer）和钉钉/飞书 Webhook 机器人，根据用户偏好推送摘要。

---

## 三、 给 Claude Code 的执行指导

当 Claude Code 执行上述任务时，请遵循以下原则：

1. **查阅规范**：在编写任何前端组件前，必须先读取 `/docs/frontend-style-guide.md`，确保颜色、排版和组件使用符合规范。
2. **渐进式提交**：每个细分任务（如 Phase 2.1 的任务 1）完成后，应进行独立的 Git 提交，并附带清晰的 Commit Message。
3. **类型安全**：前后端交互必须依赖 `packages/shared` 或约定的类型定义，严禁使用 `any`。
4. **测试验证**：修改 Webhook 和认证逻辑等核心链路时，应编写或更新对应的单元测试，确保边界条件得到处理。
5. **日志记录**：在关键的业务节点（如队列消费、AI 调用、Webhook 接收）保留充足的 `Logger` 输出，以便于调试。
