# Repo-Pulse 工作总结（2026-05-24）

本轮工作集中在 feature/Real-time-push 分支，分三段推进：实时推送链路稳定化（M0-M5）、Webhook UX 自动化（WH1-WH3）、API_URL 运行时可配置。整体目标是把"GitHub 事件实时推到桌面端"这条链路从可用做到端到端自动化。

## 1. 本次目标

1. 让仓库事件从 GitHub 推送进来到桌面端展示这条链路稳定可用，包括多实例广播、断线补发、可观测性。
2. 用户从添加仓库到收到事件全程不离开应用，不再需要手动配 webhook、改 .env、重启服务。
3. cloudflared 公网 URL 每次重启会变这件事不再要求用户改环境变量并重启 API。

## 2. 主要改动汇总

### 2.1 实时推送链路稳定化（M0、M2-M5）

#### 2.1.1 事件协议统一与精准刷新（M0）

1. 新增 packages/shared/src/realtime-events.ts，定义 5 个事件常量与类型化 payload。
2. 后端 EventGateway 接入类型化签名，前端 WebSocket handler 用路由表分发。
3. 去掉无意义的 preferences 缓存失效，减少误刷新。

关键文件：

1. apps/api/src/modules/event/event.gateway.ts
2. apps/web/src/hooks/use-web-socket.ts
3. packages/shared/src/realtime-events.ts

#### 2.1.2 仓库同步异步化与进度推送（M2）

1. 仓库历史同步从同步阻塞改为 BullMQ 异步任务。
2. 分阶段广播进度（commits / prs / issues / done）。
3. 前端 Zustand store 接收进度并渲染百分比。

关键文件：

1. apps/api/src/modules/repository/repository-sync.processor.ts
2. apps/api/src/modules/repository/repository.service.ts
3. apps/web/src/stores/sync-progress.store.ts

#### 2.1.3 Socket.io Redis 适配器（M3）

1. 引入 socket.io-redis-adapter，使用 Redis db=1 做 pub/sub。
2. 启动时根据 REDIS_URL 自动注入适配器，支持多 API 实例下的房间广播。

关键文件：

1. apps/api/src/adapters/redis-io.adapter.ts
2. apps/api/src/main.ts

#### 2.1.4 离线补发（M4）

1. Event 表加 seq BigInt @default(autoincrement()) 单调序号。
2. handleJoinRepository 支持 sinceSeq 参数，按序号回放遗漏事件。
3. 前端 localStorage 持久化 lastSeq，重连时带过去。
4. 全局 BigInt JSON 序列化补丁，避免序列化崩溃。

关键文件：

1. apps/api/src/modules/event/event.gateway.ts
2. apps/api/src/main.ts
3. apps/web/src/lib/event-seq.ts
4. packages/database/prisma/schema.prisma

#### 2.1.5 可观测性与重连订阅修复（M5）

1. 新增 Prometheus 风格 /metrics 端点，暴露 4 个核心指标（连接数、订阅数、广播量、处理耗时）。
2. EventGateway 9 个生命周期钩子打点。
3. 修复 disconnect 时 subCount 跟踪不准的问题（不再依赖 client.rooms）。
4. 前端 subscribedRoomsRef 在重连时清缓存，避免幽灵订阅。

关键文件：

1. apps/api/src/modules/observability/metrics.service.ts
2. apps/api/src/modules/observability/metrics.controller.ts
3. apps/api/src/modules/event/event.gateway.ts
4. apps/web/src/hooks/use-web-socket.ts

### 2.2 Webhook UX 自动化（WH1-WH3）

实时链路打通后发现一个产品痛点：用户添加仓库到收到事件之间，webhook 配置环节体验极差。OAuth scope 不全导致后端自动创建静默失败，前端没有 webhook 管理界面，存量用户的所有仓库 webhookId 都是 null。本段工作把这一段做成完全自助闭环。

#### 2.2.1 后端基础（WH1）

1. GitHub OAuth scope 数组补上 admin:repo_hook，让 OAuth 用户拿到的 token 真正有创建 webhook 的权限。
2. RepositoryService.create() 返回挂上 webhookStatus 与 webhookError 字段，识别 401/403/404 并归类为 INSUFFICIENT_SCOPE / NOT_FOUND / FAILED。
3. create 路径下把 GitHub 返回的 404 矫正为 INSUFFICIENT_SCOPE，因为 GitHub 对"无 admin 权限"的仓库返回 404 而非 403。
4. 抽出 provisionWebhook 公共方法，供后续 retry 复用。
5. 修复隐藏 bug：RepositoryController.create 之前没把 user.githubAccessToken 传给 service，导致 webhook 创建用全局 token 完全没权限。
6. 新增 GET /:id/webhook、POST /:id/webhook/retry、POST /:id/webhook/test 三个管理端点，均带 ADMIN role 校验。
7. shared 包新增 WebhookStatus 枚举（ACTIVE / INSUFFICIENT_SCOPE / NOT_FOUND / FAILED / NOT_CONFIGURED）供前后端共用。

关键文件：

1. apps/api/src/modules/auth/strategies/github.strategy.ts
2. apps/api/src/modules/repository/repository.service.ts
3. apps/api/src/modules/repository/repository.controller.ts
4. apps/api/src/modules/repository/services/github.service.ts
5. packages/shared/src/types/index.ts

#### 2.2.2 前端管理界面 + 状态持久化 + 自愈（WH2）

1. 新增 useWebhookStatusQuery / useRetryWebhookMutation / useTestWebhookMutation 三个 hook。
2. 仓库详情页加 Webhook 配置区块，包含状态徽章、URL 与 Secret（带遮罩切换 + 复制）、重试与测试按钮。
3. 仓库列表里 webhookId 为 null 的仓库在右下角显示橙色警告徽章，悬停提示点击进入详情页修复。
4. Repository schema 加 webhookStatus 与 webhookError 持久化字段，getWebhookStatus 优先读 DB。修复了刷新页面后失去 INSUFFICIENT_SCOPE 语义的退化问题。
5. provisionWebhook 加自愈分支：遇到 GitHub 返回 422 "Hook already exists" 时，自动 list webhooks 找到 URL 匹配的旧 hook，删除后用当前 DB 的 secret 重建。这种情况通常发生在 cloudflared URL 变更后，旧 webhookId 在 DB 里丢失但 GitHub 上还在。

关键文件：

1. apps/web/src/hooks/queries/use-webhook-queries.ts
2. apps/web/src/services/repository.service.ts
3. apps/web/src/pages/DesktopWorkbench.tsx
4. apps/api/src/modules/repository/repository.service.ts
5. apps/api/src/modules/repository/services/github.service.ts
6. packages/database/prisma/schema.prisma

#### 2.2.3 重新授权与自动重试（WH3）

1. webhook 区块在 status === INSUFFICIENT_SCOPE 时显示"重新授权 GitHub 权限"按钮。
2. 按钮在 desktop 模式下用 openExternal 跳系统浏览器（Electron 应用不嵌 GitHub 同意页），在 web 模式下走 window.location 直接跳。
3. GithubAuthGuard 在 /auth/github 入口路径从 query 取 return 参数写入 oauth_return_url cookie，限制必须以 / 开头防 open redirect。
4. GitHub callback 处理时读 cookie 后清掉，重定向到 ${returnPath}?webhook_recheck=1 让前端自动触发 retry。
5. RepositoryWebhookSection 检测 URL 上的 webhook_recheck=1 自动调 retry mutation 并清除参数。

关键文件：

1. apps/api/src/modules/auth/guards/github-auth.guard.ts
2. apps/api/src/modules/auth/auth.controller.ts
3. apps/web/src/services/auth.service.ts
4. apps/web/src/pages/DesktopWorkbench.tsx

### 2.3 API_URL 运行时可配置

之前 API_URL（webhook 公网入口）写死在 .env，cloudflared 重启给的 URL 一变就要改 .env 加重启 API。本段把 API_URL 改成在 Settings 集成 tab 里可改且立即生效，并提供批量同步到 GitHub 的能力。

1. 新建 AppConfig 表（key-value 设计），持久化全局配置。
2. 新建 AppConfigService，读取策略为 DB → env → 默认值 三层 fallback。模块标 @Global() 可全局注入，不需要每个模块手动 import。
3. RepositoryService 的两处 API_URL 读取（provisionWebhook、getWebhookStatus）改为 await this.appConfigService.get('API_URL', fallback)，不再直接读 ConfigService。
4. SettingsController 加 GET /settings/app-config/api-url 与 POST /settings/app-config/api-url。后者用 @Roles('ADMIN') 装饰器 + 显式 if 检查双重保险，并强制 URL 必须以 http(s):// 开头。
5. RepositoryService 新增 batchRetryWebhooks(userId)，遍历用户作为 ADMIN 的 active 仓库并行调 retryWebhook，返回 {total, succeeded, failed, failures[]}。
6. 新端点 POST /repositories/batch-retry-webhooks 供前端调用。
7. 前端 Settings 集成 tab 在第三方账号 Card 与 API Keys Card 之间插入 Webhook URL 配置 Card：输入框 + 来源徽章（数据库/环境变量/默认值）+ 实际 webhook URL 复制按钮 + 保存 + 批量重建按钮。
8. 保存成功后自动弹 AlertDialog 询问是否批量重建，确认后调 batchRetryWebhooks 并在 Dialog 内显示结果，失败仓库列表可见。
9. 顺手修：handleGithubEnvTokenAuth 自动把 user.role 升 ADMIN。desktop 模式下用 .env GITHUB_TOKEN 登录的就是本机开发者，本就该是 ADMIN，否则 ADMIN-only 端点在 desktop 模式下完全用不了。

关键文件：

1. packages/database/prisma/schema.prisma
2. apps/api/src/modules/app-config/app-config.module.ts
3. apps/api/src/modules/app-config/app-config.service.ts
4. apps/api/src/app.module.ts
5. apps/api/src/modules/repository/repository.controller.ts
6. apps/api/src/modules/repository/repository.service.ts
7. apps/api/src/modules/settings/settings.controller.ts
8. apps/api/src/modules/settings/settings.service.ts
9. apps/api/src/modules/auth/auth.service.ts
10. apps/web/src/pages/Settings.tsx
11. apps/web/src/services/settings.service.ts

## 3. 联调与验证

### 3.1 静态检查

1. pnpm --filter api typecheck 全绿。
2. pnpm --filter web typecheck 全绿。
3. pnpm --filter @repo-pulse/shared build 全绿。
4. pnpm --filter @repo-pulse/database db:push 成功，Prisma Client 已重生成。
5. grep -rn "configService.get<string>('API_URL'" apps/api/src/ 命中 0 处，确认 API_URL 不再有直接 env 读取残留。

### 3.2 端到端冒烟（场景 1：新仓库从零接入）

1. GitHub 新建空仓库 ZichaoZhu/WH3.2。
2. 桌面端添加该仓库，POST /repositories Response 携带 webhookStatus: ACTIVE 与非空 webhookId。
3. 详情页 webhook 区块徽章显示绿色"已配置（GitHub 上有效）"，仓库列表无警告徽章。
4. 点"发送测试"按钮，GitHub 仓库 Settings → Webhooks → Recent Deliveries 1-3 秒内出现新 ping，绿勾。
5. 本地 git push 一个 commit 到该仓库，5 秒内桌面端消息流出现 PUSH 事件。API 终端日志显示完整链路：WebhookService Queued → EventProcessor Processing → EventService event_created → EventGateway Broadcast event.created → NotificationService notification_sent → AIService AI analysis completed → EventGateway Broadcast analysis.completed。

### 3.3 端到端冒烟（场景 2：自愈与权限识别）

1. 自己仓库 ZichaoZhu/DL4CV_assignment 之前因 cloudflared URL 变更出现 422 Hook already exists 失败，点"重新创建"后自动 list webhooks → 删旧 → 重建，状态恢复 ACTIVE。
2. 别人仓库 AccumulateMore/CV 创建时返回 INSUFFICIENT_SCOPE，徽章显示橙色"权限不足，请重新授权"，按钮区出现"重新授权 GitHub 权限"。

### 3.4 端到端冒烟（场景 3：API_URL 配置）

1. Settings 集成 tab 看到新 Webhook URL Card，输入框默认值来自 env，徽章显示"环境变量"。
2. 修改为新 URL 保存，徽章变为"数据库（已自定义）"，弹 AlertDialog 询问批量重建。
3. 点开始重建后 Dialog 切换到结果视图，显示成功/失败数。
4. 重启 dev:electron 后值仍为修改后的 URL，持久化生效。

## 4. 本轮增量价值

1. 实时推送链路从 0.1 工程师可用做到面向用户可用。M0-M5 解决了协议混乱、同步阻塞、单实例广播、断线漏事件、缺指标五个真实问题。
2. webhook 配置环节从"假完成"做到端到端自助闭环。新用户从零接入只需 3 步（GitHub 登录 → 选仓库 → 看到事件），完全不离开应用。
3. cloudflared URL 易变的运维痛点缓解。本机开发者重新启动 tunnel 后，只要在 Settings 改一行 + 点批量重建按钮，所有仓库 webhook 自动同步到新 URL，不需要重启 API。
4. 配置层基础设施。AppConfig 表 + AppConfigService 为后续其它运行时配置（GITHUB_CALLBACK_URL、FRONTEND_URL 等）的迁移留了可复用的入口。
5. 顺带的安全改进：GithubAuthGuard 的 return 参数加 isSafeReturnPath 校验防 open redirect；settings 端点 @Roles + 显式 if 双重保险防权限漏判。

## 5. 现阶段状态与后续建议

### 5.1 当前状态

1. feature/Real-time-push 分支共 9 个功能 commit（M0、M2-M5、WH1-WH3、API_URL）已全部完成并通过 typecheck。
2. 桌面端能用本机 cloudflared 完整跑通 GitHub push → 消息流出现新事件的链路。
3. 已知未实现项：M1（房间订阅鉴权）阶段性跳过，因为当前阶段桌面端单用户场景不必要。

### 5.2 后续建议

1. 修复一个已发现的安全问题：apps/api 在 SyncService 处理空仓库 409 错误时，logger.error(error) 把整个 axios error 对象 dump 出来，里头包含 OAuth Bearer token 明文。建议在 logger middleware 加 token 脱敏，避免日志投屏或归档时泄露。
2. apps/api/package.json 的 dev 脚本是 ts-node 无 watch，后端代码改动不会自动重启。建议把 apps/electron/package.json 的 dev 串里 pnpm --filter @repo-pulse/api dev 改为 dev:watch（nest start --watch），提升 dev 体验。
3. SyncService 对空仓库的错误日志噪音过大（axios error 对象原样打印百行）。建议改成 logger.error(error.message)。
4. AppConfig 表已经留好扩展位，下一步可把 GITHUB_CALLBACK_URL、FRONTEND_URL 等也迁移到运行时配置，进一步降低 .env 依赖。
5. desktop env 登录自动升 ADMIN 是顺手修，长期来看 desktop 模式与用户角色体系的语义关系（是否多用户 desktop 实例需要区分）值得评审。
6. WH3 的"重新授权 → 自动 retry"完整闭环在 desktop 模式下不可达（浏览器与 Electron 应用不共享 URL），目前 fallback 是用户手动回应用点"重新创建"。如果需要 desktop 闭环，需要注册自定义协议（如 repopulse://）让浏览器跳回 Electron 应用。
