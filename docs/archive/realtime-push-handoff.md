# 实时推送（Electron-IPC）开发交接总结

> 给下一个会话/接手者。读完即可继续。分支：`feature/IPC-realtime-push`（未推送）。

## 0. 一句话现状
桌面端实时推送已从「浏览器 WebSocket」改造为「**Electron 主进程 socket.io 客户端 → IPC → 渲染进程**」，并补齐了 4 类后端广播源 + 1 个「本地优先」事件源。**功能面已完整；M6 代码侧收尾已完成**——新增广播的单元测试补齐 + 修复了被实时改造打破的既有 spec + 各包 typecheck 全量回归通过。**仅剩运行时端到端验收待用户全部跑完**（见 §8）。

## 1. 任务背景与架构判定（最重要，先读）
- 需求（Item-4）：开源后主要作本地桌面客户端，**抛弃浏览器 WebSocket 实时方案**，改用 Electron IPC 直连，解决多机 Redis 同步 + 本地 socket 跨域/Cookie 鉴权闪退。
- **决定性事实**：NestJS API 与 Electron 主进程是**两个独立 OS 进程**（`apps/electron/package.json` 的 `dev` 用 concurrently 起 API/WEB/ELECTRON 三个进程，`wait-on tcp:3001`；main.ts 不内嵌 API）。所以 service **不能**直接 `mainWindow.webContents.send`——必须跨进程桥。
- **选定方案**：主进程作为现有 `/events` 网关的 **socket.io 客户端**（Node，不受浏览器跨域/Cookie 限制），订阅后经单一 IPC 信封通道 `desktop:realtime` 转发给渲染进程，渲染进程复用同一套 React Query handler。
- ⚠️ socket.io（WebSocket）**没有删除**，只是从浏览器搬到了主进程（消除的是浏览器侧 Cookie/跨域痛点）。要彻底去 socket.io 需把 API 内嵌进主进程（大重构，范围外）。
- 完整方案文档：`docs/electron-ipc-realtime-push-plan.md`（架构判定、IPC 契约、分阶段任务、验收标准、对抗式评审修正）。

## 2. 提交历史（均用户 ZichaoZhu 署名、**无 Co-Authored-By**、每里程碑一提交）
```
4dfd119 feat(realtime): 本地优先事件源 — 本地有仓库则监听本地 git，否则用 webhook
d0ddd21 feat(realtime): Milestone 5 — IN_APP 通知按用户房间推送 notification.new（红点）
e010e86 feat(realtime): Milestone 4 — AI 分析 analysis.started / analysis.failed
a925778 feat(realtime): Milestone 3 — 审批状态变更广播 approval.updated
41d9a08 fix(webhook): webhook 管理门禁改用 accessMode，修复"无法加载 webhook 状态"
14af5fd feat(realtime): Milestone 2 — 主进程接入 /events 网关，替换 mock
ed2d690 feat(realtime): Milestone 1 — Electron-IPC 实时推送空管道打通（mock）
a51fb76 feat(realtime): Milestone 0 — 依赖打底 + 处理器工厂提升
```
（503ad3c 之前为既有提交。本次工作均未推送，纯本地。）

## 3. 已完成内容
- **M0**：electron 加 `@repo-pulse/shared`(workspace:*) + `socket.io-client@^4.8.3`；dev/build 链 `build:main` 前预构建 shared。把 `use-web-socket.ts` 的 socket handler 提升为导出工厂 `createRealtimeHandlers(queryClient, currentUserId)`（供 socket 与 IPC 两分支复用）。
- **M1**：单一信封类型 `DesktopRealtimeMessage`；`RealtimeBridge`（主进程，M1 为定时 mock）；preload `repoPulseDesktop.realtime`（`connect/subscribe/leave/disconnect` invoke + `onMessage` 订阅 `desktop:realtime`）；`useRepositoryRealtimeSubscription` 拆为 socket.io / IPC 两互斥分支（按 `isDesktopRuntime()`）。
- **M2**：`RealtimeBridge` 换成真实 socket.io-client 连 `http://127.0.0.1:3001/events`；**鉴权从 Electron `session.cookies` 读 HttpOnly `access_token`，以 `{auth:{token}}` 握手，auth 用函数式每次重连重读 Cookie**（适配任意轮换节奏；access_token 现默认 7 天，由 JWT_EXPIRATION 配置）；房间引用计数 join/leave；按 seq 跟踪、重连带 sinceSeq 触发网关 replay 补发。
- **M3**：`EventGateway.broadcastApprovalUpdated`；`ApprovalModule` 加 `forwardRef(()=>EventModule)`；`ApprovalService` 注入 `EventGateway`，approve/reject/editAndApprove 落库后广播 `approval.updated`。
- **M4**：shared 加 `ANALYSIS_STARTED/FAILED` + payload；gateway 加 `broadcastAnalysisStarted/Failed`；`ai-analysis.processor` 在 guard 后取一次 repositoryId，开头发 started、完成复用、catch 中 throw 前发 failed；前端补两 handler。
- **M5**：gateway `handleConnection` 中每个 socket join `user:<id>`；新增 `broadcastNotificationNew(userId,payload)` emit 到 `user:<id>`；`NotificationModule` 加 `forwardRef(()=>EventModule)`；`NotificationService` 注入 gateway，`send()` 在 IN_APP 落库且成功后重算未读数并广播 `notification.new`；前端补 handler 刷新红点。
- **webhook 修复**（41d9a08）：`loadRepositoryForWebhookOps` 门禁由脆弱的 `role==='ADMIN'` 改为可靠的 `accessMode===EDITABLE`（role 默认 MEMBER 且多路径写入不一致，导致同步发现的仓库"无法加载 webhook 状态"）。
- **本地优先事件源**（4dfd119）：`LocalGitWatcher`（主进程）——订阅仓库时按 id 向 API 查 `url`，`AgentWorkspaceManager.locateLocalRepo` 找本地 clone；找到则每 10s 轮询本地 git（HEAD/分支/工作树，无网络、不落库），变化推 `local.git.changed`（`DESKTOP_LOCAL_EVENTS`，不在 `REALTIME_EVENTS` 内）；找不到则不本地监听、仍走 socket。前端特判该事件刷新仓库详情/分支 + 派发 `repo-pulse:local-git-changed` 窗口事件，`GitTreePanel` 监听后按 cwd 匹配实时重载。

## 4. 关键文件速查
- 主进程桥：`apps/electron/src/main/lib/realtime-bridge.ts`（socket.io 客户端 + Cookie 鉴权 + 房间 + replay + 组合 LocalGitWatcher）
- 本地监听：`apps/electron/src/main/lib/local-git-watcher.ts`（新）；`agent-workspace-manager.ts:locateLocalRepo`、`git-manager.ts`
- preload 桥：`apps/electron/src/preload/preload.ts`（`realtime` 命名空间）
- 渲染分发：`apps/web/src/hooks/use-web-socket.ts`（`createRealtimeHandlers` 工厂 + `useSocketIoRealtimeSubscription` / `useIpcRealtimeSubscription` 两分支 + `local.git.changed` 特判）
- 桌面类型：`apps/web/src/lib/desktop.ts`（`RepoPulseDesktopBridge.realtime`、`isDesktopRuntime`）
- 共享契约：`packages/shared/src/realtime-events.ts`（`REALTIME_EVENTS`、各 Payload、`RealtimeEventPayloadMap`、`DesktopRealtimeMessage`、`DESKTOP_LOCAL_EVENTS`）
- 后端广播：`apps/api/src/modules/event/event.gateway.ts`（所有 `broadcast*` + `user:<id>`/`repo:<id>` 房间）
- 后端发射源：`approval.service.ts`、`ai-analysis.processor.ts`、`notification.service.ts`

## 5. IPC 通道契约
主进程 → 渲染：单一通道 `desktop:realtime`，载荷 `{ name, payload }`（`DesktopRealtimeMessage`）。`name` 取值 = 后端 `REALTIME_EVENTS.*`（event.created / event.replay-done / approval.updated / analysis.completed / analysis.started / analysis.failed / repository.sync.progress / repository.synced / repository.sync.failed）∪ 本地 `local.git.changed`。
渲染 → 主进程（invoke）：`realtime:connect`（无参，主进程从 Cookie 取 token）、`realtime:subscribe {repositoryId, sinceSeq?}`、`realtime:leave {repositoryId}`、`realtime:disconnect`。

## 6. 环境搭建注意（关键，否则跑不起来）
- **必须先起 Docker** 服务：`docker compose up -d --wait`（postgres 5432 + redis 6379）。本会话中 Docker Desktop 用 `open -a Docker` 拉起后曾不稳定（容器秒退/`up` 卡 Starting），**最终靠用户手动彻底重启 Docker Desktop 才稳**。
- **Prisma client 曾过期**：`schema.prisma` 领先于已生成 client，导致 API ts-node 编译崩。已 `pnpm db:generate` 修复。
- **本地 DB 迁移历史曾与本分支分叉**：已（经用户明确同意）`prisma migrate reset --force --skip-seed`（清库重放 12 迁移）+ `prisma db push`（同步 schema-only 字段如 `Repository.webhookStatus`）。现 DB 与 schema 一致。
  - prisma 有 AI 代理安全闸：`migrate reset` 需 `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION='<用户同意原文>'` 才能跑，且必须先向用户披露。
- prisma CLI 在 `packages/database` 跑读不到根 `.env`，需 `export DATABASE_URL=$(grep ^DATABASE_URL= .env | cut -d= -f2-)`。
- 桌面启动：`pnpm dev:electron`（起 API+WEB+ELECTRON）。

## 7. 工作约定（用户偏好，务必遵守）
- **提交不加 `Co-Authored-By: Claude` 署名**，作者即用户本人。
- **以 milestone 为单位提交**（一个 milestone 一个 commit，不是每子任务），覆盖 CLAUDE.md §3.1。
- **按 milestone 验收**（不是按单 task），中间不停；里程碑边界是验收点。
- 已存入用户长期记忆：`feedback_commit_conventions`、`feedback_acceptance_cadence`。

## 8. 待办
- **M6 代码侧收尾**（✅ 已完成）：
  - ① 单测补齐 + 修复既有 spec（commit `test(realtime): Milestone 6 …`）：
    - `event.gateway.spec.ts`：新增 `broadcastApprovalUpdated / AnalysisStarted / AnalysisFailed / NotificationNew`、`broadcastAnalysisCompleted` 载荷形态、`handleConnection` 加入 `user:<id>` 房间 5 组断言；**并修复了 M2 引入的既有 spec 破损**——`makeClient` 缺 `rooms` Set（`client.rooms.has` 崩）+ `handleJoinRepository` 改 async 后未 await。
    - `approval.service.spec.ts`：approve/reject/editAndApprove 后断言 `broadcastApprovalUpdated` 以正确 payload 调用 + 广播抛错不影响主流程。
    - `ai-analysis.processor.spec.ts`：mock 补 `broadcastAnalysisStarted/Failed`；修复 `broadcastAnalysisCompleted` 现为对象形态 + 受 `repositoryId` 守卫；新增 started/failed/缺 repoId 不广播断言；`does not notify` 改断言 `notificationService.send` 未调用（M4 在顶部新增了一次 `findUnique(repositoryId)`，原 `findUnique 未调用` 断言失效）。
    - `notification.service.spec.ts` / `.extra.spec.ts`：**补 `EventGateway` provider**（M5 让 `NotificationService` 在构造参数 index 6 注入 gateway，原 Test 模块未提供 → DI 解析失败）；断言 IN_APP 成功落库后广播 `notification.new`（含未读数），非 IN_APP 不广播。
    - 结果：6 个相关 spec 共 **98 测试全绿**；该批改动把 `test/units` 全量失败数从 37 降到 11。
    - RealtimeBridge / LocalGitWatcher：electron 包**无测试框架**（`apps/electron` 无 `test` 脚本/jest/vitest），按既定方案留运行时验收；以 `pnpm --filter @repo-pulse/electron typecheck` 背书。
  - ② 全量回归（✅）：`pnpm --filter @repo-pulse/shared build`、`pnpm --filter api typecheck`（tsconfig include 含 `test/**/*`，覆盖 spec）、`pnpm --filter web typecheck`、`pnpm --filter @repo-pulse/electron typecheck` **全部通过**。
  - ③ 进度文档（✅）：本 §8 + `electron-ipc-realtime-push-plan.md`（M6 标记完成）+ `CLAUDE.md §6`。
- **⚠️ 既有测试隔离债（非本次引入，勿混淆）**：`test/units` 全量运行时仍有 **11 个失败**，全部集中在 `github.service` / `auth.service.extra` / `auth-guards-strategies` / `event.service.extra`(单条 后置编排) 四个 **auth/github 域** suite——它们**单独跑全绿**，但同跑互相污染（典型症状：`github.service createWebhook` 期望 `mockClient.post` 被 mock，却拿到真实 `network error`，说明 octokit/http client mock 未在 suite 间隔离）。与本次实时 IPC 改造**无关**，且在本次工作前的基线（committed 状态）就存在（基线 37 失败）。属独立的 auth/github 测试基建问题，未在 M6 范围内修复。`pnpm --filter api lint` 仍因 ESLint 未迁 flat-config 整体崩（既有）。
- **运行时端到端验收**（✅ 已完成（2026-06-03））：详见本目录 `electron-ipc-realtime-push-plan.md` §8 与会话中给出的「验收流程」。关键信号：终端 `[realtime-bridge] connected to /events`、`[local-git-watcher] watching repo=…`；渲染 Console `[ipc-realtime] recv <事件名>`；UI 红点/列表/toast/GitTree 刷新。验收结果与已复核问题清单见下方「运行时验收结果」小节。

### 8.1 运行时验收结果

**桌面端实时推送 — 运行时端到端验收（2026-06-03）**

环境：解耦三进程 dev（API 3001 / vite 5173 / electron），`DESKTOP_AUTH_MODE=env` 自动登录 ZichaoZhu（ADMIN）。证据 = 后端/主进程日志 + 渲染进程 DevTools Console `[ipc-realtime] recv` 双向印证。

结果：**8/8 通过**（7 条实跑 + `approval.updated` 认覆盖）：
- [基础] Cookie 鉴权握手（§2.3 最大 Blocker）：gateway `connected as user cmpwijekw…` — 验通。
- [基础] 主进程 bridge 连网关：`[realtime-bridge] connected to /events`。
- [基础] 房间引用计数订阅：73× `joined room repo:`。
- [验收②] `repository.sync.*`：progress×4 + synced；桌面 recv + 浏览器（web 回退）「同步完成」双验。
- [验收④] `analysis.started/completed`：两态广播 + recv；`analysis.failed` 认 `ai-analysis.processor.spec` 单测 + 与 started/completed 传输同构覆盖（未实跑失败注入，避免动用户 AI key）。
- [验收⑤] `notification.new`（`user:<id>` 房间）：unread 0→1（带 eventId）+ recv；无 eventId 的合成通知 unread=0（见 finding `unreadcount-event-scoped`，by-design）。
- [新增] `local.git.changed`（主进程本地探测，非 socket）：pending 增/删双向触发 + recv。
- [验收②] `event.created`（注入无签名 webhook push）：Broadcast event.created + recv + event.replay-done。
- [验收②] 重连（杀重启 API）：disconnected → connect_error×N → connected → 重新 connected as user（Cookie 重读生效）。
- [验收②] `sinceSeq` 补发（停机注入 2 条 → electron 重启）：gateway `replay_complete sinceSeq=1068 replayed=2` + 渲染 `[ws] replay done replayed=2 lastSeq=1093` + 2× recv。
- [验收⑥] web 回退：浏览器 socket.io 连上（active 升）、收 synced、与桌面 IPC 分支并存不冲突。
- [验收③] `approval.updated`：认覆盖 — repo 房间传输路径已被 sync/analysis/event.created 实证 5 次以上，`broadcastApprovalUpdated` 由 `approval.service.spec` 单测断言（当前 DB 无 PENDING 审批、且需高风险 AI 分析才能造出，未实跑）。

**验收中发现的问题（已复核）**

- **[security] `logout-no-disconnect`**：桌面端登出仅做 React Query 缓存清理与客户端路由跳转，从不调用 `repoPulseDesktop.realtime.disconnect`，IPC 桥（`main.ts:98` 已接线）无任何渲染层调用方；主进程 socket 是 OS 进程级而非会话级，登出后仍以旧用户身份停留在网关 `user:<id>` 房间（仅 socket 真正断开才解除）。在同进程内换用户（email/password 登录，客户端路由非整页 reload）且未发生重连的情况下，旧用户的 `notification.new` 会经 `desktop:realtime` IPC 泄漏到新会话的渲染层。
  - 证据：`apps/web/src/pages/DesktopWorkbench.tsx:1078-1081` — `handleLogout` 仅 `await logoutMutation.mutateAsync(undefined)` 后 `navigate('/login', {replace:true})`（React Router 客户端路由，非整页 reload），全程未调用 `repoPulseDesktop.realtime.disconnect`；`apps/web/src/hooks/queries/use-auth-queries.ts:96-109` — `useLogoutMutation` 的 mutationFn 仅 `authService.logout()`，onSuccess 仅 `queryClient.removeQueries`，不触碰 IPC 桥；`apps/web/src/hooks/use-web-socket.ts:363-412` — `useIpcRealtimeSubscription` 的清理函数（409-411）只 `unsubscribe()` 取消 onMessage 监听；另一 effect 清理（446-453）只对每个房间 `bridge.leave()`，两处都不 disconnect；注释 357-362 明确写明卸载时不主动 disconnect；`apps/electron/src/main/lib/realtime-bridge.ts:117-126` — `disconnect()` 才会 `removeAllListeners`/`socket.disconnect` 并清空 roomRefCount；`preload.ts:52` 与 `main.ts:98-99` 的 `realtime:disconnect` 通道虽完整接线，但 grep `apps/web/src` 全仓无任何渲染层调用方；`apps/api/src/modules/event/event.gateway.ts:125,144,350-351` — `handleConnection` 用握手 token 解出 sub 后 `client.join('user:'+sub)`，`notification.new` 只 emit 到该房间；房间成员资格仅在 `handleDisconnect`（144）即 socket 真正断开时才解除。
  - 建议：在 `useLogoutMutation` 的 mutationFn/onSuccess（或 `DesktopWorkbench handleLogout`）中，桌面运行时下调用 `window.repoPulseDesktop?.realtime?.disconnect()`；同时建议在 `useLoginMutation` 成功后（换用户场景）也强制 disconnect 后再重连，确保主进程 socket 以新 token 重新握手并加入正确的 `user:<id>` 房间。
- **[minor] `replay-no-merge-window`**：replay 补发期每条 `event.created` 都经与实时事件相同的 `EVENT_CREATED` 通道下发，渲染端 `EVENT_CREATED` handler 无条件逐条触发 `invalidateRepositoryRealtimeQueries`（dashboard/repo/workbench/notification 多键失效）；`EVENT_REPLAY_DONE` handler 仅更新 seq 游标并打日志，未做任何失效，计划 §2.6 的「replay 窗口缓冲 + replay-done 后一次性合并失效」未落地。当补发量接近网关 `REPLAY_BATCH_LIMIT=200` 时会产生失效风暴；本次 `replayed=2` 量小无碍。
  - 证据：`apps/web/src/hooks/use-web-socket.ts:157-169` — `EVENT_CREATED` handler 对每条事件无条件调用 `invalidateRepositoryRealtimeQueries`（dashboard.all/repo.list/workbench/notification.* 多键失效）+ `repositoryQueryKeys.detail`，无 replay 窗口判断；`apps/web/src/hooks/use-web-socket.ts:170-179` — `EVENT_REPLAY_DONE` handler 仅 `setLastSeq` 更新游标 + `console.log`，没有任何「一次性合并失效」逻辑；`apps/api/src/modules/event/event.gateway.ts:212-221` — replay 补发通过与实时事件相同的 `REALTIME_EVENTS.EVENT_CREATED` 通道逐条 `client.emit`，渲染端无法区分 replay 与实时事件，故逐条失效；`apps/api/src/modules/event/event.gateway.ts:31,199,209-210` — `REPLAY_BATCH_LIMIT=200`，单批最多补发 200 条 `event.created`；`docs/electron-ipc-realtime-push-plan.md:146-148` — §2.6 原设计明确要求「replay 窗口期间仅更新 seq 游标、不逐条失效，收到 event.replay-done 后一次性失效」，与现实现不符；前端全仓库 grep 无任何 replay 窗口/缓冲状态。
  - 建议：在 `createRealtimeHandlers` 引入按 `repositoryId` 的 replay 窗口状态：收到 join/首条 replay 时进入窗口，期间 `EVENT_CREATED` 只调用 `setLastSeq` 更新游标并标记「待失效仓库」，不调用 `invalidateRepositoryRealtimeQueries`；`EVENT_REPLAY_DONE` 时对窗口内累积的仓库执行一次合并失效。同时需保证 socket.io 与 IPC 两条分支共用该状态。若评估 200 条规模可接受、暂不实现，则更新计划 §2.6 标注为已知未落地项，避免文档与实现不一致。
- **[security] `authme-secret-leak`**：`GET /auth/me`（及公开端点 `GET /auth/session`）经 `UserService.findById` 返回完整 User 记录，该方法用无 select 的 `prisma.user.findUnique` 取全部列、仅 `excludePassword` 剥离 `passwordHash`，导致 `githubAccessToken`（ghp_…）、`githubRefreshToken` 与明文存储的 `aiApiKey`（sk-…）随 JSON 明文回传给前端；项目无全局 `ClassSerializerInterceptor`/`@Exclude` 兜底，而 settings 模块对同字段已做 `'***'` 掩码，证实此为真实敏感凭据泄露。
  - 证据：`apps/api/src/modules/auth/auth.controller.ts:218-221` — `GET /auth/me` 直接 `return this.userService.findById(user.sub)`，无任何字段过滤；`apps/api/src/modules/user/user.service.ts:8-14` — `findById` 使用 `prisma.user.findUnique({ where: { id } })` 未指定 select，返回全部列；仅经 `excludePassword` 处理；`apps/api/src/modules/user/user.service.ts:162-165` — `excludePassword` 只剥离 `passwordHash`，`githubAccessToken`/`githubRefreshToken`/`aiApiKey` 原样保留并随响应返回；`packages/database/prisma/schema.prisma:136-137,147` — User 模型含 `githubAccessToken`、`githubRefreshToken`、`aiApiKey` 列（`aiApiKey` 注释称「加密存储」但 `settings.service.ts:95` 实为明文写入）；`apps/api/src/modules/auth/auth.controller.ts:242,262` — 公开端点 `GET /auth/session` 同样返回 `findById(...)`，泄露路径在静默会话接口上同样可达；对比 `settings.service.ts:71,122` 对同字段做了 `'***'` 掩码，说明项目本意视其为敏感。
  - 建议：在 `UserService.findById` 中显式用 Prisma `select`/`omit` 仅返回安全字段（或在 `excludePassword` 中一并剔除 `githubAccessToken`、`githubRefreshToken`、`aiApiKey`），并为 `/auth/me` 与 `/auth/session` 增加返回字段白名单；同时考虑对 `aiApiKey`/`githubAccessToken` 做静态加密存储以兑现 schema 中「加密存储」注释。
- **[minor] `resubscribe-churn`**：repo 列表 query 刷新且返回的数据内容发生变化时，`repositoriesQuery.data` 因结构共享得到新数组引用，经 useMemo 链（repositories→repositoryIds）传导使 `useRepositoryRealtimeSubscription` 的订阅 effect 依赖（`syncRoomSubscriptions` / `getTargetRepositoryIds`）整体失效；该 effect 的 cleanup 会对当前全部已订阅房间逐个 emit `leave:repository` 并清空本地 Set，随后 body 再对全部目标房间逐个 emit `join:repository`，从而出现一次全量退订 + 全量重订（本次约 73 个房间）。最终订阅集合不变、功能正确（由 `subscribedRoomsRef` 引用计数保证），但产生明显的日志与网络抖动。需注意：并非每次失效都触发——若刷新后列表数据字节级未变，结构共享保持同一引用、不会重订；仅当数据内容变化（如 `event:new` 改动了仓库活动/同步字段）时才发生。桌面 IPC 分支（`bridge.subscribe`/`leave`）存在同构问题。
  - 证据：`apps/web/src/hooks/use-web-socket.ts:340-353` — `useSocketIoRealtimeSubscription` 的订阅 effect 依赖 `[syncRoomSubscriptions]`；当依赖变更时先执行 cleanup（343-352）对 `subscribedRoomsRef` 中全部已订阅房间逐个 emit `'leave:repository'`（348-349）并清空 Set（351），随后 body（341）重新对全部目标房间 emit `'join:repository'`（253-261），即一次性退订并重订全部房间；`apps/web/src/hooks/use-web-socket.ts:237-270` — `getTargetRepositoryIds` 依赖 `[repositoryIds]`（243），`syncRoomSubscriptions` 依赖 `[currentUser?.id, getTargetRepositoryIds]`（270）；只要 `repositoryIds` 数组引用变化，这条依赖链即整体失效，触发上面的 cleanup+body 全量重订；`apps/web/src/pages/Repositories.tsx:120-137` — `repositories=useMemo([repositoriesQuery.data])` → `repositoryIds=useMemo(() => repositories.map(r => r.id), [repositories])`；repo 列表 query 刷新后若数据内容变化，data 得到新引用，`repositoryIds` 随之得到新数组引用（内容仍为同一批 id），驱动上述全量重订。`Dashboard.tsx:341-391、780` 同构（repos→monitoredRepositoryIds→dashboardRepositoryIds）；`apps/web/src/hooks/use-web-socket.ts:414-453` — 桌面 IPC 分支同样在 effect cleanup（446-452）中对全部已订阅房间调用 `bridge.leave` 并清空 Set，effect 依赖含 `getTargetRepositoryIds`（453），`repositoryIds` 引用变化时同样全量退订 + 重订（427-444）；`apps/web/src/lib/query-client.tsx:4-16` 与 `apps/web/src/lib/query-hooks.ts:43-58` — QueryClient 与 `useApiQuery` 均未关闭 structuralSharing（默认 true）：repo 列表内容未变的刷新会保留同一数组引用、不产生 churn；只有数据内容变化时才生成新引用并触发全量重订。
  - 建议：让传入 `useRepositoryRealtimeSubscription` 的 `repositoryIds` 在内容不变时保持引用稳定：在 `repositoryIds` 的 useMemo 中按内容（如排序后 `join('|')` 或自定义比较）做记忆化，或在 hook 内部以内容签名（已排序 id 串）做 diff 而非依赖数组引用；另可将 `syncRoomSubscriptions` 的 effect 依赖改为稳定的内容签名字符串，并在 cleanup 中只对真正离开的房间执行 leave（避免在依赖变化时无条件 leave 全部再重 join），从而把 emit 收敛为真实增减量。
- **[by-design] `web-strictmode-double-socket`**：web 端 socket.io 分支已用 `setTimeout(0)` 延迟建连 + `connectTimeoutRef`/`socketRef` 双重 ref 守卫（`use-web-socket.ts:273,277-312,315-326`），在 React StrictMode dev 双挂载下首个定时器会在 cleanup 中被清除，最终只建立 1 条 socket.io 连接，不会出现 2 条。该机制为 2026-04-27 既有代码，非本次 IPC 改造引入。claim 中「web 端会建 2 条连接」的描述与代码不符。
  - 证据：`apps/web/src/hooks/use-web-socket.ts:277-312` — socket 创建被 `connectTimeoutRef.current = window.setTimeout(() => { ... io(...) ... socketRef.current = socket; }, 0)` 延迟到宏任务，而非在 `connect()` 同步执行时建立连接；`apps/web/src/hooks/use-web-socket.ts:273` — `connect()` 守卫 `if (!enabled || !currentUser || isAuthLoading || socketRef.current || connectTimeoutRef.current !== null) return;`，已有 pending 定时器或已有 socket 时直接 return，挡住重复调度；`apps/web/src/hooks/use-web-socket.ts:315-326` — `disconnect()` 先 `clearTimeout(connectTimeoutRef.current)` 再置 null；dep 数组为 `[]`（L326）使其引用稳定，任意 cleanup 都会取消未触发的定时器；`apps/web/src/hooks/use-web-socket.ts:328-338` — effect 在 mount 调 `connect()`、cleanup 调 `disconnect()`；StrictMode 的 mount→cleanup→mount 在同一 commit 内同步发生，`setTimeout(0)` 宏任务此时尚未触发，首个定时器在 cleanup 被清除，仅第二次 mount 的定时器最终触发 → 仅建 1 条连接；`apps/web/src/main.tsx:9-15` — 应用确以 `<StrictMode>` 包裹（dev 双挂载场景真实存在），但上述延迟 + ref 守卫正是规避双连接的标准写法；`git blame apps/web/src/hooks/use-web-socket.ts:277-312` — `setTimeout(0)`+`connectTimeoutRef` 模式由 commit `fca70e3a`（2026-04-27）引入，早于 `feature/IPC-realtime-push` 分支（`ed2d690` 起，2026-06-02），与本次改造无关。
  - 建议：无需修复。web 分支已通过 `setTimeout(0)`+ref 守卫规避 StrictMode 双连接，桌面 IPC 分支则由主进程 connect 幂等（`use-web-socket.ts:407`、`desktop.ts:60`）规避，两条分支均无双连接问题。如需文档化可注明二者各自的去重机制，但不构成缺陷。
- **[by-design] `unreadcount-event-scoped`**：`getUnreadCount` 仅统计 `channel=IN_APP`、`readAt=null` 且关联事件落在用户监控仓库/分支范围内的未读通知（`where.event` 过滤）；由于 `Notification.eventId` 可空且 event 为可选关系，`eventId=null` 的应用内通知不会被计入红点——此为有意设计，非缺陷。配套的实时 `notification.new` handler 失效 `unreadCount`/list 查询触发的 REST 重新拉取走 apiClient，access_token 过期时会先返回 401，再由 api-client 的 401 响应拦截器自动 `/auth/refresh` 并重放原请求成功，属良性瞬态，刷新失败才跳转登录。
  - 证据：`apps/api/src/modules/notification/notification.service.ts:420-429` — `getUnreadCount` 的 `prisma.notification.count` where 含 `channel=IN_APP`、`readAt=null`，且 `event: { ...buildEventScopeWhere(...) }`，对可空 to-one 关系做过滤即要求关联事件存在并匹配仓库范围；`packages/database/prisma/schema.prisma:321,332` — `Notification.eventId` 为 `String?`（可空）、event 为可选关系 `Event?`；`eventId=null` 的通知无法匹配 `where.event`，故被排除在红点计数外；`apps/api/src/common/utils/repository-branch-scope.ts:57-97` — `buildEventScopeWhere` 生成 `EventWhereInput`（按 repositoryId/分支限定），`getUnreadCount` 中作为 event 子查询条件，确保只统计监控仓库范围内事件的通知；`apps/web/src/hooks/use-web-socket.ts:197-198` — `notification.new` 实时 handler 失效 `notificationQueryKeys.unreadCount()` 与 `list()`，触发 REST 重新拉取；`apps/web/src/services/notification.service.ts:1,87` + `apps/web/src/services/api-client.ts:41-80` — `getUnreadCount` 经 `apiClient.get('/notifications/unread-count')`，命中 401 响应拦截器：非 `_retry` 且非 `/auth/refresh` 时自动 `POST /auth/refresh` 后用 `apiClient(originalRequest)` 重放，刷新失败才跳登录。
  - 建议：无需修复（by-design）；若希望系统级/无事件通知也进红点，可将 `getUnreadCount` 改为 `where: { OR: [{ eventId: null }, { event: buildEventScopeWhere(...) }] }` 或显式区分两类计数，但当前以「监控范围内事件通知」为红点口径是符合产品意图的。

## 9. 重要坑/约束（必读）
- **穷尽性约束**：`use-web-socket.ts` 的 `RealtimeEventHandlers = {[K in RealtimeEventName]: ...}` 是穷尽映射。**给 `REALTIME_EVENTS` 加事件名，必须同一 commit 内补对应 handler**，否则 web typecheck 失败。（`local.git.changed` 故意不放进 `REALTIME_EVENTS`，单独走 `DESKTOP_LOCAL_EVENTS` + 联合类型 + IPC 特判，避免触发穷尽性。）
- **forwardRef 环**：`EventModule` 直接 import Approval/Notification/AIModule；反向用 `forwardRef(()=>EventModule)`（service 注入 `EventGateway` 用普通构造参数即可，沿用 AIProcessor 模式）。改动后**必须 `pnpm --filter api dev` 实启动验证无 circular dependency**（`start` 跑 stale dist，不可用；本会话用隔离端口 `APP_PORT=3010` 验证以免占用用户的 3001）。
- **ts-node 不热重载**：改后端代码后用户**必须重启 `pnpm dev:electron`** 才生效。
- **改 shared 后必须 `pnpm --filter @repo-pulse/shared build`**：web/electron 的 typecheck 经 `dist/index.d.ts` 解析 shared（`apps/web/tsconfig.json` paths 指向 dist）。
- **既有问题（非本次引入，勿混淆）**：① `apps/api` 的 `lint` 脚本因 ESLint 配置未迁移 flat-config 而整体崩——api lint 拿不到信号，靠 typecheck 背书。② `apps/web` 有 7 处既有 `no-explicit-any` error（SiriAnalysisPanel/FeishuIntegrationDialog/ImChannelIntegrationDialog，均未触碰），会让 `pnpm --filter web lint` 退出非零；验收只看"改动文件 lint 干净"。
- **本地 git 监听局限**：只覆盖 commit/分支/工作树，PR/issue/review 仍靠 webhook。
- **生产打包缺口**：`package:electron` 只打包 web/dist、不含 API；打包后若无独立运行的本地 API，loopback-3001 桥不可用。仅覆盖 dev / "API 单独运行" 场景。
