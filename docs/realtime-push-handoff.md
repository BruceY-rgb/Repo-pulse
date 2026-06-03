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
- **M2**：`RealtimeBridge` 换成真实 socket.io-client 连 `http://127.0.0.1:3001/events`；**鉴权从 Electron `session.cookies` 读 HttpOnly `access_token`，以 `{auth:{token}}` 握手，auth 用函数式每次重连重读 Cookie**（适配 15min 轮换）；房间引用计数 join/leave；按 seq 跟踪、重连带 sinceSeq 触发网关 replay 补发。
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
- **运行时端到端验收**（用户尚未全部跑完）：详见本目录 `electron-ipc-realtime-push-plan.md` §8 与会话中给出的「验收流程」。关键信号：终端 `[realtime-bridge] connected to /events`、`[local-git-watcher] watching repo=…`；渲染 Console `[ipc-realtime] recv <事件名>`；UI 红点/列表/toast/GitTree 刷新。

## 9. 重要坑/约束（必读）
- **穷尽性约束**：`use-web-socket.ts` 的 `RealtimeEventHandlers = {[K in RealtimeEventName]: ...}` 是穷尽映射。**给 `REALTIME_EVENTS` 加事件名，必须同一 commit 内补对应 handler**，否则 web typecheck 失败。（`local.git.changed` 故意不放进 `REALTIME_EVENTS`，单独走 `DESKTOP_LOCAL_EVENTS` + 联合类型 + IPC 特判，避免触发穷尽性。）
- **forwardRef 环**：`EventModule` 直接 import Approval/Notification/AIModule；反向用 `forwardRef(()=>EventModule)`（service 注入 `EventGateway` 用普通构造参数即可，沿用 AIProcessor 模式）。改动后**必须 `pnpm --filter api dev` 实启动验证无 circular dependency**（`start` 跑 stale dist，不可用；本会话用隔离端口 `APP_PORT=3010` 验证以免占用用户的 3001）。
- **ts-node 不热重载**：改后端代码后用户**必须重启 `pnpm dev:electron`** 才生效。
- **改 shared 后必须 `pnpm --filter @repo-pulse/shared build`**：web/electron 的 typecheck 经 `dist/index.d.ts` 解析 shared（`apps/web/tsconfig.json` paths 指向 dist）。
- **既有问题（非本次引入，勿混淆）**：① `apps/api` 的 `lint` 脚本因 ESLint 配置未迁移 flat-config 而整体崩——api lint 拿不到信号，靠 typecheck 背书。② `apps/web` 有 7 处既有 `no-explicit-any` error（SiriAnalysisPanel/FeishuIntegrationDialog/ImChannelIntegrationDialog，均未触碰），会让 `pnpm --filter web lint` 退出非零；验收只看"改动文件 lint 干净"。
- **本地 git 监听局限**：只覆盖 commit/分支/工作树，PR/issue/review 仍靠 webhook。
- **生产打包缺口**：`package:electron` 只打包 web/dist、不含 API；打包后若无独立运行的本地 API，loopback-3001 桥不可用。仅覆盖 dev / "API 单独运行" 场景。
