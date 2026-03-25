# Repo-Pulse 全新迭代执行计划 (v2.0)

> **文档说明**：本计划是对原有项目的全面梳理与重新规划。基于当前项目的实现现状（Phase 2 尚未闭环），我们发现了诸多架构缺陷与工程规范执行不到位的问题。本计划将提供**粒度极低、约束严格、目标明确**的重构与渐进式开发指南，确保 AI Agent (Claude Code) 能够稳步推进。

## 1. 核心架构问题诊断

通过对现有代码库的深度审查，我们发现以下四个维度的核心问题，这些问题必须在进入新功能开发前得到彻底解决。

### 1.1 认证与安全机制薄弱
目前前端的认证体系存在严重的安全隐患和体验断层。`api-client.ts` 直接将 Access Token 和 Refresh Token 存储在 `localStorage` 中，极易受到 XSS 攻击。同时，刷新 Token 的逻辑与 Axios 拦截器强耦合，且未处理并发刷新问题。此外，环境变量 `APP_URL` 语义分裂，在后端配置 `env.validation.ts` 中既被用作 API 地址，又被当成前端回调地址，导致 GitHub OAuth 回调重定向混乱。

### 1.2 Webhook 链路未闭环
`WebhookService` 当前的实现无法支撑多仓库的独立验签。代码中全局使用 `WEBHOOK_SECRET`，而未从请求上下文中提取特定仓库的专属 Secret。更严重的是，签名验证直接使用了 `JSON.stringify(payload)`，由于 NestJS 默认的 `body-parser` 已经解析并可能改变了原始 JSON 格式，这种验签方式在真实环境中必定失败。此外，处理完 Webhook 事件后，后端缺乏向前端推送实时消息的 WebSocket Gateway 机制。

### 1.3 前端规范执行不到位
尽管项目中存在 `frontend-style-guide.md`，但实际代码（如 `index.css`）大量违背了规范。全局样式中引入了未授权的 `Montserrat` 字体，且充斥着大量硬编码的十六进制颜色（如 `--github-bg: #0d1117`）和自定义类名（如 `.card-github`, `.btn-x`）。同时，核心页面（如 `Repositories.tsx`）仍然使用原始的 `useState` 和 `useEffect` 进行数据请求，完全没有利用已安装的 `@tanstack/react-query`。

### 1.4 服务层职责边界模糊
前端的 `repository.service.ts` 和 `event.service.ts` 存在职责重叠，事件获取逻辑被分散在两处。后端的模块间依赖也不够清晰，未能充分利用 Monorepo 架构下 `packages/shared` 的类型共享优势。

---

## 2. 渐进式执行阶段划分

为了确保交付质量，后续开发必须严格按照以下阶段和节点推进。**Agent 在执行时，必须完成当前阶段的所有子任务并通过测试，方可进入下一阶段。**

### 阶段一：基础设施加固与重构（预计耗时：3天）
本阶段的核心目标是清理技术债，修复阻塞核心业务流的底层问题。

| 任务编号 | 任务名称 | 详细执行要求 | 验收标准 |
| :--- | :--- | :--- | :--- |
| **1.1** | 环境变量语义分离 | 在 `.env` 和 `env.validation.ts` 中，废弃 `APP_URL`，明确拆分为 `FRONTEND_URL` 和 `API_URL`。更新 `main.ts` 中的 CORS 配置。 | 配置验证通过，服务正常启动。 |
| **1.2** | HttpOnly Cookie 改造 | 修改 `AuthController`，在登录和 OAuth 回调时，将 Token 写入 `HttpOnly` Cookie。移除前端 `api-client.ts` 中读取 `localStorage` 的逻辑，开启 `withCredentials: true`。 | 登录后浏览器 Application 面板可见 HttpOnly Cookie，刷新页面保持登录状态。 |
| **1.3** | Webhook 精准验签 | 在 NestJS 中配置 Raw Body 中间件（如使用 `express.json({ verify: ... })`）。修改 `WebhookService`，根据 Payload 提取仓库外部 ID，查询数据库获取对应的 `webhookSecret` 进行 HMAC SHA256 验签。 | 构造模拟 Webhook 请求，签名验证成功。 |
| **1.4** | 样式基座清理 | 彻底重写 `index.css`。移除 `Montserrat` 字体，严格使用系统默认字体或 Inter。清理所有非标准的 `--github-*` 变量，仅保留 `frontend-style-guide.md` 中定义的语义化 HSL 变量。 | 界面无样式报错，颜色符合规范。 |

### 阶段二：实时数据流闭环（预计耗时：4天）
本阶段的目标是打通从 GitHub/GitLab 事件产生到前端界面实时更新的完整链路。

| 任务编号 | 任务名称 | 详细执行要求 | 验收标准 |
| :--- | :--- | :--- | :--- |
| **2.1** | WebSocket Gateway 搭建 | 在 `apps/api` 中创建 `EventGateway`，配置 Socket.io。实现基于 JWT 的连接认证，并支持按 `repositoryId` 加入专属 Room。 | 前端可通过 Socket.io 成功连接并订阅特定仓库频道。 |
| **2.2** | 消息队列联动 | 完善 `EventProcessor`，在成功处理并落库 Webhook 事件后，调用 `EventGateway` 向对应的仓库 Room 广播 `event:new` 消息。 | 触发 Webhook 后，后端日志显示广播成功。 |
| **2.3** | React Query 迁移 | 重构前端数据层。使用 `useQuery` 替换 `Repositories.tsx` 中的 `useEffect`，实现数据缓存。封装 `useWebSocket` Hook，在收到新事件时调用 `queryClient.invalidateQueries` 刷新列表。 | 界面能自动响应 Webhook 事件并更新列表，无需手动刷新。 |

### 阶段三：AI 核心引擎接入（预计耗时：5天）
本阶段将实现产品的核心差异化价值：对代码变更的智能分析。

| 任务编号 | 任务名称 | 详细执行要求 | 验收标准 |
| :--- | :--- | :--- | :--- |
| **3.1** | AI 抽象层完善 | 在 `packages/ai-sdk` 中实现 OpenAI 和 Anthropic 的标准适配器。定义统一的 Prompt 模板，要求模型输出结构化的风险评估和摘要。 | 单元测试通过，能成功调用大模型 API。 |
| **3.2** | 异步分析工作流 | 创建 `ai-analysis` BullMQ 队列。当 `EventProcessor` 接收到 `PR_OPENED` 或 `PUSH` 事件时，触发 AI 分析任务。将结果存入 `AIAnalysis` 表。 | PR 事件发生后，数据库中成功生成分析记录。 |
| **3.3** | 前端流式呈现 | 在后端实现基于 SSE (Server-Sent Events) 的流式输出接口。前端开发 AI Insight 卡片，实现打字机效果展示分析过程。 | 前端可实时看到 AI 生成的摘要和风险提示。 |

### 阶段四：团队协同与通知（预计耗时：4天）
本阶段侧重于产品的商业化功能延伸。

| 任务编号 | 任务名称 | 详细执行要求 | 验收标准 |
| :--- | :--- | :--- | :--- |
| **4.1** | 规则引擎实现 | 实现 `FilterModule`，允许用户基于正则表达式、事件类型或 AI 风险等级配置拦截和通知规则。 | 可通过 API 成功创建和触发过滤规则。 |
| **4.2** | 审批流与拦截 | 针对高风险事件，实现人工审批流程。在界面上提供“通过/拒绝”操作，并记录审批日志。 | 高风险事件被正确标记为“待审批”状态。 |
| **4.3** | 多渠道通知 | 接入 Nodemailer（邮件）和企业微信/钉钉 Webhook。根据用户偏好，将 AI 摘要和审批请求推送到指定渠道。 | 成功接收到格式化的测试通知。 |

---

## 3. 对 Claude Code 的严格执行约束

为了保证代码质量和架构一致性，Agent 在执行任务时**必须**遵守以下准则：

1. **单步提交原则**：每个阶段的每个子任务（如任务 1.1）完成后，必须进行独立的 Git 提交。禁止将多个不相关的修改混在一个 Commit 中。
2. **测试先行**：在修改核心链路（如 Auth、Webhook 验签）时，必须先编写或更新对应的单元测试（Jest），确保测试覆盖率不下降。
3. **类型绝对安全**：前后端交互的数据结构必须在 `packages/shared/src/types` 中定义。严禁在代码中使用 `any` 类型。
4. **禁止过度设计**：严格按照当前阶段的任务描述执行，不要提前实现下一阶段的功能，也不要引入计划外的新依赖库。
5. **日志与可观测性**：在所有异步任务（BullMQ）、外部 API 调用（GitHub/AI）和异常捕获处，必须使用 NestJS 的 `Logger` 记录详尽的上下文信息。
