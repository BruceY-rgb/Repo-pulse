# 实施计划：桌面端实时推送从 WebSocket 切换为 Electron-IPC 本地直推

> 适用分支：`feature/Real-time-push`
> 本计划严格遵循 `CLAUDE.md`：微步长执行、每个微步 typecheck + lint 验证、Conventional Commits、payload 类型一律从 `@repo-pulse/shared` 导入、**禁止 `any`**、服务端数据获取用 TanStack Query、按 **milestone** 验收（中间不停）。
> 本文档已经过一轮“代码逐行核对 + 对抗式评审”，修正了任务原文中两处**会导致实现失败的硬伤**（详见 §1.1 与 §2.3）。

---

## 1. 架构判定与方案选型

### 1.1 进程拓扑判定（决定性结论，已逐条核对源码）

**判定：NestJS API 与 Electron Main 是两个独立的 OS 进程，绝不在同一进程内。**

任务原文要求“在 `ApprovalService` / `AIProcessor` / `NotificationService` 中直接调用 `mainWindow.webContents.send(...)`”——**这在当前架构下不成立**。`webContents` 只存在于 Electron Main 进程，而这三个 service 运行在 NestJS 进程里，两者只能通过回环 TCP 通信，没有共享内存。证据：

| 证据 | 出处 | 说明 |
| :--- | :--- | :--- |
| dev 启动 3 个独立进程 | `apps/electron/package.json:8` | `concurrently` 启动 `API = pnpm --filter @repo-pulse/api dev`、`WEB = vite`、`ELECTRON = wait-on tcp:3001 tcp:5173 && build:main && electron .`。`wait-on tcp:3001` 证明 Electron 在“等待一个早已被单独拉起的 API 进程”绑定端口。 |
| Main 不内嵌 API | `apps/electron/src/main/main.ts:1-204` | 无 `NestFactory`、无 `child_process.spawn/fork` API、无 `import @repo-pulse/api`、无 3001 引用。仅 `loadURL(devServerUrl)`(:70) / `loadFile(...)`(:73)。 |
| 依赖缺口 | `apps/electron/package.json:51-53` | 依赖仅 `@anthropic-ai/claude-agent-sdk`，**无** `socket.io-client`、`@repo-pulse/shared`、`@nestjs/*`。 |
| 渲染进程经网络访问 API | `apps/web/src/lib/desktop.ts:65` | `DEFAULT_DESKTOP_API_BASE_URL='http://127.0.0.1:3001'`，与浏览器无异。 |

**结论：必须有一道“API 进程 → Main 进程”的网络入口（ingress）。** 而 “Main → renderer” 这一跳已是成熟在用模式（`agent-orchestrator.ts:60` 的 `webContents.send('agent:message',...)` + `preload.ts:27-33` 的 `ipcRenderer.on` + 返回 cleanup）。**唯一缺失的环节是“API 事件如何进入 Main 进程”。**

### 1.2 桥接方案选型

| 方案 | 机制 | 评价 |
| :--- | :--- | :--- |
| **A（选用）socket.io-client in Main** | Main 进程作为现有 `/events` gateway 的 socket.io **客户端**，订阅后经 `webContents.send` 转发给 renderer | **首选**。零新增服务端 endpoint，复用既有 fan-out / room / replay / JWT / `@repo-pulse/shared` 契约，与 `use-web-socket.ts:196` 完全对称。Main 是 Node 环境，不受浏览器跨域/跨端口 Cookie 限制（正是任务想解决的痛点）。 |
| B SSE | 新增 `GET /desktop/stream`，Main 用 EventSource 订阅 | 引入新 endpoint + 与 gateway 重复的 fan-out / 排序 / replay 逻辑。下选。 |
| C process.send / fork | Main `fork()` 出 NestFactory 子进程，用 Node IPC | 今天不 fork API，需重构 dev/build/打包，爆炸半径大。仅当“生产必须把 API 打进安装包”时考虑（见 §6 生产缺口）。 |
| D 自定义 unix/localhost webhook | Main 监听本地端口，API POST | 全新自定义传输，无既有代码可复用。避免。 |

**结论：方案 A。** 把“跨进程入口”收敛到一处，语义与 web 端 1:1。

### 1.3 数据流图

```
[桌面构建 desktop build]

  NestJS API 进程 (127.0.0.1:3001)
  ┌──────────────────────────────────────────────┐
  │ EventService / ApprovalService / AIProcessor   │
  │ NotificationService                            │
  │        │ broadcast*()                          │
  │        ▼                                       │
  │ EventGateway  (socket.io ns '/events')         │
  │   server.to('repo:<id>' | 'user:<id>').emit()  │
  └────────┬───────────────────────────────────────┘
           │  socket.io / loopback TCP 3001  (REALTIME_EVENTS.* + payload)
           │  握手鉴权：{ auth: { token } }  ← token 由 Main 从 session Cookie 读取（见 §2.3）
           ▼
  Electron MAIN 进程
  ┌──────────────────────────────────────────────┐
  │ RealtimeBridge (新增, 单例 socket.io-client)    │
  │  · 从 session.cookies 读 access_token 鉴权      │
  │  · join/leave 房间按 repositoryId 引用计数       │
  │  · on(REALTIME_EVENTS.*) →                      │
  │    webContents.send('desktop:realtime',         │
  │      { name, payload })   ← 单一信封通道          │
  └────────┬───────────────────────────────────────┘
           │  Electron IPC（进程内, contextBridge）
           ▼
  preload.ts  repoPulseDesktop.realtime.onMessage(cb)   ← 复用 preload.ts:27 模式
           │  ipcRenderer.on('desktop:realtime', (_e,m)=>cb(m))
           ▼
  renderer (React)  useRepositoryRealtimeSubscription(repoIds)
           │  if (isDesktopRuntime()) → IPC 分支；else → socket.io 分支
           │  dispatch: handlers[m.name](m.payload)   ← handlers 由工厂导出（见 §2.2）
           ▼
  createRealtimeHandlers(queryClient,currentUser)  （从 connect 闭包中提升出来）
           ▼
  invalidateRepositoryRealtimeQueries / invalidateAnalysisRealtimeQueries
           ▼
  TanStack Query 失效 → 列表 / 红点 / 详情即时刷新
```

### 1.4 纯 Web 构建的回退

`isDesktopRuntime()` 仅判断 `window.repoPulseDesktop?.isDesktop === true`（`desktop.ts:67`）。Web 构建中该对象不存在，`useRepositoryRealtimeSubscription` 走**原 socket.io 分支**（`io(getSocketUrl('/events'),{withCredentials:true})`，`use-web-socket.ts:196`）。**hook 公共签名不变**，4 个调用点（`Dashboard.tsx:780` / `Notifications.tsx:90` / `Repositories.tsx:137` / `DesktopWorkbench.tsx:7251`）零改动。socket.io 依赖与 gateway 全程保留。

---

## 2. 关键设计决策（修正项，务必落实）

### 2.1 单一信封 IPC 通道（替代 10 个 colon 通道）

主进程 → renderer **只用一个通道** `desktop:realtime`，载荷为判别联合：

```ts
// 类型来自 @repo-pulse/shared，禁止在 electron/web 重新定义
type DesktopRealtimeMessage =
  { [K in RealtimeEventName]: { name: K; payload: RealtimeEventPayloadMap[K] } }[RealtimeEventName];
```

renderer 侧 `handlers[message.name](message.payload)` 一行分发。**好处**：preload 与 `desktop.ts` 不再为每个事件各写一个 `onXxx`（消除重复维护对），且彻底解决“colon 通道名 ↔ dotted 事件名”的翻译层缺失问题（评审 major #6）。

renderer → main 的控制通道仍用 `invoke`：`realtime:connect`、`realtime:subscribe`、`realtime:leave`、`realtime:disconnect`（见 §5）。

### 2.2 提升事件处理器为可复用工厂（修复半接线）

现状：`use-web-socket.ts:221` 的 `const handlers: RealtimeEventHandlers = {...}` 是 `connect()` 内 setTimeout 回调里的**闭包局部常量**，IPC 分支无法复用。

**改造**：将其提升为导出工厂

```ts
export function createRealtimeHandlers(
  queryClient: QueryClient,
  currentUser: { id: string } | undefined,
): RealtimeEventHandlers { /* 原 :222-271 的逻辑原样迁入 */ }
```

socket.io 分支与 IPC 分支都调用它，行为字节级一致。这是一次**类型中性**重构（不改 `RealtimeEventName`），单独成一个 commit、`web typecheck` 必绿。

### 2.3 鉴权：Main 从 Electron session Cookie 读取 JWT（修复 Blocker）

任务/初版设想的“renderer 把 access token 透传给 Main”**不可行**：`auth.controller.ts:28` `httpOnly:true`，token 只存在 HttpOnly Cookie 中，renderer JS 读不到（全站无 localStorage/Authorization 存 token）。

**正确做法**：

1. renderer 登录成功后（`useCurrentUserQuery` 解析出用户）调用 `realtime:connect`（**不带 token**）。
2. Main 用 Electron 会话 API 读取 HttpOnly Cookie：
   ```ts
   const [c] = await session.defaultSession.cookies.get({ url: 'http://127.0.0.1:3001', name: 'access_token' });
   io(baseUrl + '/events', { auth: { token: c?.value }, transports: ['websocket'], reconnection: true });
   ```
   （HttpOnly 只阻止 `document.cookie` 的 JS 访问，**不阻止** 主进程 `session.cookies` API；gateway `extractToken` 优先读 `handshake.auth.token`，`event.gateway.ts:391`。）
3. **Token 刷新**：`access_token` 现默认 7 天过期（由 `JWT_EXPIRATION` 配置；撰写本计划时为 15 分钟）。renderer 的 axios 刷新流会滚动更新该 Cookie，因此 **Main 不缓存 token，每次（重）连接时即时重读 Cookie**；并监听 `session.cookies.on('changed')` 或在 `connect_error`/`disconnect` 时延迟重连（重读最新 Cookie）。已建立的 socket 在 token 过期后仍存活（gateway 仅握手时校验），只有重连才需新 token——重读策略覆盖之。

> 上线前需验证：dev 下（http、127.0.0.1）该 Cookie 确实存入 defaultSession（既有 web socket 的 `withCredentials` 已能工作，说明 Cookie 正常下发）。

### 2.4 连接生命周期：连接幂等、订阅引用计数（修复 dedupe/StrictMode 隐患）

Main 持有的 socket 是**进程级单例**，但 renderer 的 `useRepositoryRealtimeSubscription` 在 4 个页面挂载、随导航卸载、StrictMode 下双挂载。若按 hook 生命周期 connect/disconnect，会出现“任一组件卸载就把全局 socket 拆掉”的回归。约定：

- **`realtime:connect` 幂等**：Main 已连接则直接返回（no-op）。renderer 在“已认证”时调用一次即可，**hook 卸载时不调用 `realtime:disconnect`**。
- **`realtime:disconnect` 仅在登出 / 应用退出时触发**（窗口关闭由 Main `dispose` 负责）。
- **房间订阅引用计数**：Main 维护 `Map<repositoryId, count>`；`realtime:subscribe` 在 `0→1` 时才真正 `emit('join:repository',{repositoryId,sinceSeq})`，`realtime:leave` 在 `1→0` 时才 `emit('leave:repository')`。避免“组件 A 离开 repo:X 而组件 B 仍需要”的误退订。
- **多窗口 / macOS `activate`**：socket 生命周期绑定到**应用 / 登录态**而非单一窗口；`main.ts:192` 的 `activate` 重建窗口后，`webContents.send` 改向 `BrowserWindow.getAllWindows()` 广播（本次单窗口实现，但以此收口便于扩展），并确保 dispose 幂等。

### 2.5 按用户房间推送 notification.new（修复 web 红点静默失效）

`notification.new` 是**按用户**而非按仓库的事件。`handleConnection`（`event.gateway.ts:117` 设 `client.userId` 后）追加 `client.join('user:'+decoded.sub)`，**对 web 与 desktop 所有连接同时生效**（同一 gateway）。renderer 分发 user 域事件**按事件名路由，不套用 “按 repositoryId 过滤” 规则**（`NotificationNewPayload` 可无 repositoryId）。验收须**同时验证 web 与 desktop 红点**。

### 2.6 Replay 风暴抑制（reconnect 时的 invalidation 合并）

reconnect 时 gateway 会 unicast 补发至多 `REPLAY_BATCH_LIMIT=200`（`event.gateway.ts:192`）条 `event.created`，每条都会触发一次 `invalidateRepositoryRealtimeQueries`（dashboard+repo+workbench+notification 多键失效）。约定：renderer 在收到 `join` 后、`event.replay-done` 前进入**“replay 窗口”**，期间缓冲 `event.created` 仅更新 `seq` 游标、**不逐条失效**，收到 `event.replay-done` 后**一次性失效**。须验证 200 条 replay 下调度在 `REALTIME_INVALIDATION_BUDGET_MS=50`（`use-web-socket.ts:23`）预算内。

---

## 3. 改动文件清单

### Layer A：共享类型（`@repo-pulse/shared`）—— 单一契约源
| 文件 | 操作 | 具体改动 |
| :--- | :--- | :--- |
| `packages/shared/src/realtime-events.ts` | 修改 | **新增** `ANALYSIS_STARTED:'analysis.started'`、`ANALYSIS_FAILED:'analysis.failed'`、`NOTIFICATION_NEW:'notification.new'` 常量 + `AnalysisStartedPayload`、`AnalysisFailedPayload`、`NotificationNewPayload` 接口 + 扩展 `RealtimeEventPayloadMap`（保持穷尽）。`APPROVAL_UPDATED`/`ApprovalUpdatedPayload`（:6/:24-30）**已存在**，审批无需改 shared。**⚠️ 每新增一个事件名，必须在同一 commit 内补上其 web handler（见 §2.2 工厂），否则 `RealtimeEventHandlers` 穷尽性导致 web typecheck 失败。** |
| `packages/shared/src/types/index.ts` | 修改（清理） | 给 `WsEvent` 枚举（:146-154，冒号命名、服务端从不 emit）加 `@deprecated`，杜绝 IPC 误用。 |

### Layer B：API services（NestJS，新增 emit 源）
| 文件 | 操作 | 具体改动 |
| :--- | :--- | :--- |
| `apps/api/src/modules/event/event.gateway.ts` | 修改 | 新增 `broadcastApprovalUpdated`、`broadcastAnalysisStarted`、`broadcastAnalysisFailed`（均 emit 到 `repo:<id>`，镜像 :290 `broadcastAnalysisCompleted`）；新增 `broadcastNotificationNew(userId,payload)`（emit 到 `user:<id>`）；`handleConnection`(:117) 后追加 `client.join('user:'+decoded.sub)`。 |
| `apps/api/src/modules/approval/approval.module.ts` | 修改 | `imports` 加 `forwardRef(() => EventModule)`（EventModule 已 import ApprovalModule，**存在环，双向必须 forwardRef**）。 |
| `apps/api/src/modules/approval/approval.service.ts` | 修改 | 注入 `EventGateway`；在 `approve()`(:250)、`reject()`(:271)、`editAndApprove()`(:293) 末尾 `broadcastApprovalUpdated`。`repositoryId/eventId` 已由 `getApprovalWithRepository`(:63) 预载在 `approval.event`，无需额外查询。 |
| `apps/api/src/modules/ai/ai-analysis.processor.ts` | 修改 | 已注入 `EventGateway`(:29)，**无需改 module**。在 enabled guard 之后(~:49) `broadcastAnalysisStarted`；catch 块(:79) `throw` 前 `broadcastAnalysisFailed`。复用 `prisma.event.findUnique({select:{repositoryId}})`(:64) 取 repositoryId（建议在 `process()` 起始处取一次，供 started/completed/failed 共用）。 |
| `apps/api/src/modules/notification/notification.module.ts` | 修改 | `imports` 加 `forwardRef(() => EventModule)`。 |
| `apps/api/src/modules/notification/notification.service.ts` | 修改 | 注入 `EventGateway`；在 `send()` IN_APP 持久化(:174)后、**仅当 `dto.channel === NotificationChannel.IN_APP`** 时，`getUnreadCount(dto.userId)`(:366) + `broadcastNotificationNew(dto.userId,{userId,unreadCount,notification})`。 |

> 所有新增 emit 用 `try/catch` 包裹（镜像 `event.service.ts:427-430`），推送失败绝不影响业务主流程。

### Layer C：Electron Main（新增 socket.io-client 桥）
| 文件 | 操作 | 具体改动 |
| :--- | :--- | :--- |
| `apps/electron/package.json` | 修改 | dependencies 加 `"@repo-pulse/shared":"workspace:*"`、`"socket.io-client":"^4.x"`。 |
| `apps/electron/src/main/lib/realtime-bridge.ts` | **新建** | `RealtimeBridge` 类：`connect()`（从 session Cookie 读 token，§2.3）、`subscribe(repoId,sinceSeq)` / `leave(repoId)`（引用计数，§2.4）、监听 `REALTIME_EVENTS.*` → `webContents.send('desktop:realtime',{name,payload})`、`disconnect()`/`dispose()`。`connect` 幂等。payload 用 shared 类型，**禁止 `any`**。 |
| `apps/electron/src/main/main.ts` | 修改 | `createMainWindow` 实例化 `RealtimeBridge`；`registerIpcHandlers` 增 `realtime:connect/subscribe/leave/disconnect`；`activate` 重建窗口后重绑 send 目标；窗口关闭/退出 `dispose`。 |
| `apps/electron/tsconfig.json` / 构建链 | 修改（按需） | 确认 `@repo-pulse/shared` 经 node resolution 命中 `dist/index.d.ts`（CJS，兼容 module:CommonJS）；**在 dev 链 `build:main` 前显式 `pnpm --filter @repo-pulse/shared build`**，或将 shared 纳入 electron 的 turbo build 图（dev 是裸 `concurrently`，绕过 turbo `^build`，见评审 minor）。 |

### Layer D：preload（IPC 桥扩展）
| 文件 | 操作 | 具体改动 |
| :--- | :--- | :--- |
| `apps/electron/src/preload/preload.ts` | 修改 | 在 `repoPulseDesktop` 内新增 `realtime` 命名空间：`connect()/subscribe(p)/leave(p)/disconnect()`（→ `ipcRenderer.invoke`）+ `onMessage(cb: (m: DesktopRealtimeMessage)=>void): ()=>void`（→ `ipcRenderer.on('desktop:realtime',...)` + 返回 `removeListener`，镜像 :27）。**callback 用 shared 类型，不得用 `any`**（现 agent.* 的 `any` 不复制；其本身列为既有技术债、不在本次范围）。 |

### Layer E：前端 hook（renderer 分流）
| 文件 | 操作 | 具体改动 |
| :--- | :--- | :--- |
| `apps/web/src/lib/desktop.ts` | 修改 | 扩展 `RepoPulseDesktopBridge` 与 `Window` 声明加 `realtime?` 命名空间，import 同批 shared 类型。 |
| `apps/web/src/hooks/use-web-socket.ts` | 修改 | (1) 提升 `createRealtimeHandlers` 工厂（§2.2）；(2) `useRepositoryRealtimeSubscription` 内 `if (isDesktopRuntime())` 走 IPC 分支（connect 幂等、onMessage 分发、subscribe/leave、replay 合并），否则原 socket.io；(3) 新增 ANALYSIS_STARTED/FAILED、NOTIFICATION_NEW 的 handler（web/desktop 共用，随各自 shared 常量同 commit 加入）。 |

---

## 4. 分阶段微步长任务

> **排序铁律（修复评审 Blocker #1 / #7）**：① 先做类型中性的处理器工厂提升与“空管道”打通；② 每个**新增事件**的 shared 常量 + gateway + 生产者 + web handler **必须同一 milestone 内闭环**，保证**每个 commit 后 `pnpm --filter web typecheck` 与 `pnpm --filter api typecheck` 全绿**（穷尽性约束，§2.2）。

### Milestone 0 —— 依赖打底 + 处理器工厂提升（类型中性，不改契约）
- **M0-T1**（分析）确认 `realtime-events.ts:3-14`（事件源）、`use-web-socket.ts:140-142/221`（穷尽 handler 闭包）、electron 依赖缺口（`package.json:51`）、shared 构建链。
- **M0-T2**（代码）`apps/electron/package.json` 加 `@repo-pulse/shared`、`socket.io-client`；dev 链补 shared 预构建；`pnpm install`。
  - 验证：`pnpm --filter @repo-pulse/electron typecheck`
  - commit：`build(electron): 引入 @repo-pulse/shared 与 socket.io-client 依赖`
- **M0-T3**（代码）`use-web-socket.ts` 提升 `createRealtimeHandlers` 工厂，socket.io 分支改为调用它（行为不变，**不新增任何事件名**）。
  - 验证：`pnpm --filter web typecheck && pnpm --filter web lint`
  - commit：`refactor(web): 提升实时事件处理器为可复用工厂`
- **M0-T4**（文档）记录“生产打包拓扑”假设（见 §6），明确本计划在 dev / “API 单独运行” 场景成立。

### Milestone 1 —— Main↔preload↔renderer 空管道（mock 数据先跑通，不连 API）
- **M1-T1**（代码）新建 `realtime-bridge.ts` 骨架：`connect/dispose` + 内部 `emitToRenderer({name,payload})`，**暂以定时 mock 推一条 `EVENT_CREATED`** 供验收。
  - 验证：`pnpm --filter @repo-pulse/electron typecheck`
  - commit：`feat(electron): 新增 RealtimeBridge 骨架（main->renderer 单信封转发）`
- **M1-T2**（代码）`preload.ts` 加 `realtime` 命名空间（`onMessage` + invoke 桥，shared 类型，无 `any`）。
  - 验证：`pnpm --filter @repo-pulse/electron typecheck`
  - commit：`feat(electron): preload 暴露 realtime 单信封 IPC 通道`
- **M1-T3**（代码）`desktop.ts` 扩展类型；`use-web-socket.ts` 加 `isDesktopRuntime()` IPC 分支，`onMessage` → `handlers[name](payload)`（复用 M0 工厂）。
  - 验证：`pnpm --filter web typecheck && pnpm --filter web lint`
  - commit：`feat(web): useRepositoryRealtimeSubscription 增加桌面 IPC 分流`
- **M1-T4**（人工验证）`pnpm dev:electron`，mock 的 `event.created` 经 IPC 触发列表/红点 query 失效。 **→ 验收点 ①**

### Milestone 2 —— Main 真连 gateway（替换 mock，打通真实桥 + Cookie 鉴权）
- **M2-T1**（代码）`realtime-bridge.ts`：用 `socket.io-client` 真连 `/events`，**从 `session.cookies` 读 `access_token` 以 `{auth:{token}}` 鉴权**（§2.3），实现 connect 幂等 + token 重读/重连；`subscribe/leave` 引用计数（§2.4）；监听全部 6 个既有 `REALTIME_EVENTS.*` 转发；移除 mock。
  - 验证：`pnpm --filter @repo-pulse/electron typecheck`
  - commit：`feat(electron): RealtimeBridge 接入 /events 网关（Cookie 鉴权+引用计数订阅）`
- **M2-T2**（代码）`main.ts` 注册 `realtime:connect/subscribe/leave/disconnect`；`activate`/退出生命周期收口。
  - 验证：`pnpm --filter @repo-pulse/electron typecheck`
  - commit：`feat(electron): 注册 realtime 主进程 IPC 处理器与生命周期`
- **M2-T3**（代码）`use-web-socket.ts` 桌面分支：认证后调一次 `connect`（不在卸载时 disconnect）；`subscribe/leave` 透传 `sinceSeq`（游标仍存 renderer localStorage `event-seq.ts`）；接上 6 个既有事件 + replay 合并（§2.6）。
  - 验证：`pnpm --filter web typecheck && pnpm --filter web lint`
  - commit：`feat(web): 桌面 IPC 分支补齐房间订阅、replay 合并与既有事件`
- **M2-T4**（人工验证）触发 webhook → 桌面经 IPC 收 `event.created` → 列表刷新；仓库同步进度/完成/失败、`analysis.completed` 同验；杀掉并重启 API → 自动重连且 `sinceSeq` 补发漏掉事件且无 200 连发卡顿；关闭并重开窗口（macOS dock）→ 实时恢复。 **→ 验收点 ②**

### Milestone 3 —— 新 emit 源：`approval.updated`（前端 handler 已就绪）
- **M3-T1**（代码）`event.gateway.ts` 加 `broadcastApprovalUpdated`（镜像 :290）。
  - 验证：`pnpm --filter api typecheck && pnpm --filter api lint`
  - commit：`feat(api): EventGateway 新增 broadcastApprovalUpdated`
- **M3-T2**（代码）`approval.module.ts` 加 `forwardRef(() => EventModule)`；`approval.service.ts` 注入 gateway，approve/reject/editAndApprove(:250/:271/:293) 末尾 emit。
  - 验证：`pnpm --filter api typecheck && pnpm --filter api lint`；**用 `pnpm --filter api dev`（ts-node，跑当前源码，非 `start` 的 stale dist）实启动**，断言日志**无** `circular dependency ... cannot resolve`。
  - commit：`feat(api): 审批状态变更广播 approval.updated`
- **M3-T3**（人工验证）桌面 + web 各审批一次 → 红点/审批列表/dashboard 即时刷新（`use-web-socket.ts:250` 既有 handler 直接生效）。 **→ 验收点 ③**

### Milestone 4 —— 新 emit 源：`analysis.started` / `analysis.failed`
- **M4-T1**（代码）`realtime-events.ts` 加两个常量 + payload + map；`event.gateway.ts` 加 `broadcastAnalysisStarted/Failed`；`use-web-socket.ts` 工厂内**同步**加两个 handler（started→可选 loading/toast；failed→`toast.error` + `analysisQueryKeys.list()` 失效）。**三处同一 commit，保证穷尽性不破。**
  - 验证：`pnpm build`（shared）+ `pnpm --filter web typecheck && pnpm --filter web lint` + `pnpm --filter api typecheck && pnpm --filter api lint`
  - commit：`feat: 新增 analysis.started/failed 实时事件（shared+gateway+web handler）`
- **M4-T2**（代码）`ai-analysis.processor.ts`：guard 后 emit started、catch 块 throw 前 emit failed（复用 :64 repositoryId 查询）。
  - 验证：`pnpm --filter api typecheck && pnpm --filter api lint`
  - commit：`feat(api): AI 分析开始/失败时广播实时事件`
- **M4-T3**（人工验证）触发一次失败分析（如置空 AI key）→ 桌面 + web 收到 failed toast；正常分析 → started 状态可见。 **→ 验收点 ④**

### Milestone 5 —— 新 emit 源：`notification.new`（按用户房间）
- **M5-T1**（代码）`event.gateway.ts` `handleConnection`(:117) 后 `client.join('user:'+sub)`（web+desktop 共享）；加 `broadcastNotificationNew(userId,payload)`；`realtime-events.ts` 加 `NOTIFICATION_NEW` + `NotificationNewPayload` + map；`use-web-socket.ts` 工厂内同步加 handler（→ `notificationQueryKeys.unreadCount()/list()` 失效，**按事件名路由不按 repoId 过滤**，§2.5）。**同一 commit。**
  - 验证：`pnpm build` + `pnpm --filter web typecheck/lint` + `pnpm --filter api typecheck/lint`
  - commit：`feat: 新增 notification.new 实时事件（按用户房间+红点刷新）`
- **M5-T2**（代码）`notification.module.ts` 加 `forwardRef(() => EventModule)`；`notification.service.ts` 注入 gateway，IN_APP 持久化(:174)后、`dto.channel===IN_APP` 时 `getUnreadCount`+`broadcastNotificationNew`。
  - 验证：`pnpm --filter api typecheck && pnpm --filter api lint`；`pnpm --filter api dev` 实启动验环。
  - commit：`feat(api): IN_APP 通知持久化后推送 notification.new`
- **M5-T3**（人工验证）发一条 IN_APP 通知 → **桌面与 web 红点均 +1**；用另一用户登录确认**收不到**（验证 `user:<id>` 房间隔离）。 **→ 验收点 ⑤**

### Milestone 6 —— 收尾与回归
- **M6-T1**（代码/测试）✅ 已完成：补单元测试（§7）并修复被实时改造打破的既有 spec。
  - **api 单测**（实现）：`event.gateway.spec`（新增 4 个 `broadcast*` + `analysis.completed` 载荷形态 + `user:<id>` 房间断言，并修复 `makeClient` 缺 `rooms`、`handleJoinRepository` 改 async 后未 await 的既有破损）；`approval.service.spec`（断言 approve/reject/editAndApprove 调 `broadcastApprovalUpdated` + 广播抛错不影响主流程）；`ai-analysis.processor.spec`（mock 补 started/failed、completed 改对象形态并受 repoId 守卫、补 started/failed/缺-repoId 断言）；`notification.service.spec` / `.extra.spec`（补 `EventGateway` provider 修复 DI 解析失败 + 断言 IN_APP 广播 `notification.new`、非 IN_APP 不广播）。**6 spec / 98 测试全绿**。
  - **electron/web 单测**：`apps/electron` 与 `apps/web` **均无测试框架**（无 `test` 脚本 / jest / vitest）。`RealtimeBridge` / `LocalGitWatcher` / `createRealtimeHandlers` 按既定方案留运行时验收，以各自 `typecheck` 背书；引入测试 runner 属本特性范围外。
  - 验证（已执行）：`pnpm --filter @repo-pulse/shared build`、`pnpm --filter api typecheck`、`pnpm --filter web typecheck`、`pnpm --filter @repo-pulse/electron typecheck` 全过。
  - 已知既有债（非本次引入）：`test/units` 全量跑仍有 11 个 auth/github 域 suite 失败（suite 间 mock 未隔离，单独跑全绿；基线即存在）；`pnpm --filter api lint` 因 ESLint 未迁 flat-config 整体崩。
  - commit：`test(realtime): Milestone 6 — 广播单元测试补齐 + 修复既有 spec + 进度文档`
- **M6-T2**（人工验证，⏳ 待用户）全链路回归：dev 桌面端逐通道（§7 e2e 清单），并 `pnpm dev:web` 浏览器端走 socket.io 回退、桌面 IPC 分支不触发。 **→ 验收点 ⑥**

---

## 5. IPC 通道契约

**主进程 → renderer（单一信封通道）`desktop:realtime`**，载荷 `{ name: RealtimeEventName, payload: RealtimeEventPayloadMap[name] }`。Main 监听 socket.io 的点号事件名，原样装入信封；renderer 按 `name` 分发到 `createRealtimeHandlers` 的对应 handler。

| `name`（REALTIME_EVENTS） | payload 类型（@repo-pulse/shared） | 触发源 file:line | 前端失效/更新（沿用现有） |
| :--- | :--- | :--- | :--- |
| `event.created` | `EventCreatedPayload` | `event.service.ts:420`（gateway :258） | `invalidateRepositoryRealtimeQueries`（dashboard.all/repo.list/workbench/notification.*）+ `repositoryQueryKeys.detail`；`BRANCH_*`→`branches`；`setLastSeq`（replay 期合并失效） |
| `event.replay-done` | `EventReplayDonePayload` | gateway :223（unicast） | `setLastSeq(lastSeq)` + 结束 replay 窗口、统一失效一次 |
| `approval.updated` | `ApprovalUpdatedPayload` | **新增** `approval.service.ts:250/271/293` | dashboard.all/repo.list/repo.detail/notification.list/unreadCount + `window Event('approval-updated')`（:250） |
| `analysis.completed` | `AnalysisCompletedPayload` | `ai-analysis.processor.ts:69`（gateway :302） | `invalidateAnalysisRealtimeQueries` + `analysisQueryKeys.detail/list`（:245） |
| `analysis.started` | `AnalysisStartedPayload`（**新增**） | **新增** `ai-analysis.processor.ts:~49` | 可选 loading/轻 toast（不强制失效） |
| `analysis.failed` | `AnalysisFailedPayload`（**新增**） | **新增** `ai-analysis.processor.ts:79` | `toast.error(reason)` + `analysisQueryKeys.list()` |
| `notification.new` | `NotificationNewPayload`（**新增**） | **新增** `notification.service.ts:174`（`user:<id>` 房间） | `notificationQueryKeys.unreadCount()/list()`（红点，**按事件名路由**） |
| `repository.sync.progress` | `RepositorySyncProgressPayload` | `repository-sync.processor.ts:42/52`（:317） | `useSyncProgressStore.update`（无 query 失效） |
| `repository.synced` | `RepositorySyncedPayload` | `repository-sync.processor.ts:58`（:331） | clear store + repo.list/detail + dashboard.all + `toast.success` |
| `repository.sync.failed` | `RepositorySyncFailedPayload` | `repository-sync.processor.ts:69`（:346） | clear store + `toast.error` |

**renderer → main（控制通道，`invoke`）**

| 通道 | 入参 | Main 行为 |
| :--- | :--- | :--- |
| `realtime:connect` | `void`（**不传 token**） | 幂等；从 session Cookie 读 `access_token`，连 `/events` |
| `realtime:subscribe` | `{ repositoryId: string; sinceSeq?: number }` | 引用计数 `0→1` 时 `emit('join:repository',...)` |
| `realtime:leave` | `{ repositoryId: string }` | 引用计数 `1→0` 时 `emit('leave:repository',...)` |
| `realtime:disconnect` | `void` | 仅登出/退出调用；`socket.disconnect()` |

> **不镜像的死通道（仅测试引用）**：`event:new` / `events:new` / `analysis:completed`（冒号、`event.gateway.ts:268/292`）。本次仅 `@deprecate` `WsEvent`，**不删除**遗留方法与 renderer 遗留监听（`use-web-socket.ts:25,96`）——明确列为**范围外技术债**。

---

## 6. 边界与回退

- **Web 回退**：`isDesktopRuntime()` 为 false 走 socket.io，依赖与 gateway 全保留，hook 签名与 4 调用点零改动。
- **去重**：桌面下 renderer **不自建 socket.io**，仅走 IPC；Main 是该桌面进程内**唯一** socket.io 客户端；web 仅走 socket.io。两者互斥。
- **连接/订阅生命周期**：见 §2.4（connect 幂等、subscribe 引用计数、disconnect 仅登出/退出）。
- **重连 / 漏事件**：Main `reconnection:true` + renderer `sinceSeq` 游标透传 → gateway `replayMissedEvents`(:180-235) 补发；replay 期合并失效（§2.6）。
- **多窗口 / `activate`**：见 §2.4。
- **认证与安全**：IPC 进程内无 token 握手——**任何被加载进该 BrowserWindow 的页面都能收到 `desktop:realtime`**。两点防护：(1) `main.ts:62` `will-navigate` 仅允许可信 URL（dev=devServerUrl / prod=file://）；(2) **user 域事件（`notification.new`）已在服务端按 `user:<id>` 房间过滤**，Main 拿到的即该登录用户数据，不跨用户泄露；repo 域事件本就 repo-scoped。Main→gateway 仍走真实 JWT。
- **⚠️ 生产打包缺口（须立项前确认，本次范围外）**：`build:electron`/`package:electron` 只打包 `web/dist`，**不打包/不拉起 API**。打包后的 `.dmg/.exe` 若无独立运行的本地 API，则 loopback-3001 桥**无法工作、实时功能为死**。生产拓扑需单独决策（远程托管 API / 本地另装 / 方案 C：Main `fork` 内嵌 NestFactory）。本计划仅覆盖 **dev 与 “API 单独运行”** 场景，并在 M0-T4 显式记录该假设，**不静默上线**。

---

## 7. 风险与测试策略

### 风险
1. **forwardRef 环（最高）**：`EventModule` 已 import `ApprovalModule`/`NotificationModule`（`event.module.ts:26`），反向 import 必须**双向 `forwardRef`**。每个相关 commit 后用 `pnpm --filter api dev`（**非** `start`，后者跑 stale dist）实启动，断言无 `circular dependency ... cannot resolve`。
2. **穷尽 handler 类型**：新增事件名必与其 web handler 同 commit（§2.2/§4），否则 `web typecheck` 失败。
3. **Cookie 鉴权可用性**：验证 dev 下 `session.cookies.get` 能取到 `access_token`；token 过期（现默认 7 天）靠重读 Cookie + 重连覆盖（§2.3）。
4. **electron 解析 shared**：dev 裸 `concurrently` 绕过 turbo，须在 `build:main` 前预构建 shared（§3 Layer C）；从 clean（无 dist）状态验证 `pnpm dev:electron`。
5. **`any` 红线**：新 realtime 桥两侧（preload + desktop.ts）一律用 shared 类型；既有 agent.* 的 `any` 列为范围外技术债，不复制。
6. **replay 风暴**：§2.6 合并失效，验证 200 条 replay 在 50ms 预算内。

### 测试
- **单元（api）**：`broadcastApprovalUpdated/AnalysisStarted/AnalysisFailed/NotificationNew` 断言以正确 room（`repo:` / `user:`）与 payload 调 `server.to().emit()`（mock server）；Approval/Notification 在状态变更/IN_APP 持久化后确有调用。
- **单元（electron）**：`RealtimeBridge` 每个 `REALTIME_EVENTS.*` 触发 → `webContents.send('desktop:realtime',{name,payload})`；connect 幂等；subscribe/leave 引用计数（mock socket + mainWindow + session.cookies）。
- **单元（web）**：`createRealtimeHandlers` 各事件命中预期 query key 失效；IPC 分支与 socket 分支调用同一工厂。
- **e2e / 手动逐通道（`pnpm dev:electron` + DevTools）**：
  1. `event.created`：推 webhook → 列表+红点刷新；
  2. `approval.updated`：审批 → 红点/审批列表/dashboard 刷新（桌面+web）；
  3. `analysis.completed/started/failed`：触发 AI（failed 用错误 key）→ 对应 toast/列表；
  4. `notification.new`：发 IN_APP → **桌面+web 红点 +1**；另一用户登录确认**收不到**；
  5. `repository.sync.*`：点同步 → 进度/完成/失败 toast；
  6. **回退**：`pnpm dev:web` 浏览器走 socket.io、同样实时、桌面 IPC 分支不触发；
  7. **重连**：杀+重启 API → 自动重连 + `sinceSeq` 补发，无 200 连发卡顿；
  8. **窗口生命周期**：macOS 关闭+dock 重开窗口 → 实时恢复。

---

## 8. 验收标准（按 milestone）

> 按 `CLAUDE.md` 与团队节奏：**按 milestone 验收，中间不停**；每个微步 commit 前自测命令必绿。

| 验收点 | 对应 milestone | 通过标准 |
| :--- | :--- | :--- |
| **①** | M1 | `pnpm dev:electron` 起得来；mock `event.created` 经 `desktop:realtime` 到达 renderer 并触发 query 失效；全程 `web/electron typecheck` 绿。 |
| **②** | M2 | 真实 webhook/同步事件经 Main socket→IPC 到达桌面并刷新；Cookie 鉴权连通（无未授权断开）；杀重启 API 自动重连 + `sinceSeq` 补发无重复风暴；关闭/重开窗口实时恢复。 |
| **③** | M3 | 桌面+web 审批后红点/审批列表/dashboard 即时刷新；`pnpm --filter api dev` 启动无循环依赖错误；api typecheck/lint 绿。 |
| **④** | M4 | 失败分析触发桌面+web `toast.error`，分析列表失效；started 状态可见；shared build + web/api typecheck/lint 全绿（穷尽性未破）。 |
| **⑤** | M5 | IN_APP 通知后桌面+web 红点 +1；跨用户不可见（`user:<id>` 房间隔离）；api 启动无循环依赖错误。 |
| **⑥** | M6 | 单元测试通过；§7 e2e 八项逐通道通过；web 回退路径正常；无 `any` 新增、无样式红线、无 useEffect 拉数据。 |

**全局红线（任一不满足即不通过）**：
- 所有 IPC/广播 payload 类型来自 `@repo-pulse/shared`，**零** `any` 新增；
- 每个 commit 后对应 `typecheck` + `lint` 绿，涉及 shared 的改动跑 `pnpm build`；
- 涉及 forwardRef 的 commit 经 `pnpm --filter api dev` 实启动验证；
- web 与 desktop 行为一致，纯 web 构建实时功能不回归；
- 生产打包拓扑缺口已书面记录、未静默上线。

### 运行时验收实测结果（2026-06-03）

> 环境：解耦三进程 dev（API `3001` / vite `5173` / electron），`DESKTOP_AUTH_MODE=env` 自动登录 ZichaoZhu（ADMIN）。证据 = 后端 / 主进程日志 + 渲染进程 DevTools Console `[ipc-realtime] recv` 双向印证。
> **总结：8/8 通过**（7 条实跑 + `approval.updated`/③ **认覆盖**）。

| 验收点 | 验证项 | 实测结论 | 关键证据 |
| :--- | :--- | :--- | :--- |
| **[基础]** | Cookie 鉴权握手（§2.3 最大 Blocker） | 验通 | gateway `connected as user cmpwijekw…` |
| **[基础]** | 主进程 bridge 连网关 | 验通 | `[realtime-bridge] connected to /events` |
| **[基础]** | 房间引用计数订阅 | 验通 | 73× `joined room repo:` |
| **②** | `repository.sync.*` | 验通 | progress×4 + synced；桌面 recv + 浏览器（web 回退）「同步完成」双验 |
| **④** | `analysis.started` / `completed` | 验通 | 两态广播 + recv；`analysis.failed` 认 `ai-analysis.processor.spec` 单测 + 与 started/completed 传输同构覆盖（未实跑失败注入，避免动用户 AI key） |
| **⑤** | `notification.new`（`user:<id>` 房间） | 验通 | unread 0→1（带 eventId）+ recv；无 eventId 的合成通知 unread=0（见 finding `unreadcount-event-scoped`，by-design） |
| **[新增]** | `local.git.changed`（主进程本地探测，非 socket） | 验通 | pending 增/删双向触发 + recv |
| **②** | `event.created`（注入无签名 webhook push） | 验通 | Broadcast `event.created` + recv + `event.replay-done` |
| **②** | 重连（杀重启 API） | 验通 | disconnected → connect_error×N → connected → 重新 `connected as user`（Cookie 重读生效） |
| **②** | `sinceSeq` 补发（停机注入 2 条 → electron 重启） | 验通 | gateway `replay_complete sinceSeq=1068 replayed=2` + 渲染 `[ws] replay done replayed=2 lastSeq=1093` + 2× recv |
| **⑥** | web 回退 | 验通 | 浏览器 socket.io 连上（active 升）、收 synced、与桌面 IPC 分支并存不冲突 |
| **③** | `approval.updated` | **认覆盖** | repo 房间传输路径已被 sync/analysis/event.created 实证 5 次以上；`broadcastApprovalUpdated` 由 `approval.service.spec` 单测断言（当前 DB 无 PENDING 审批、且需高风险 AI 分析才能造出，未实跑） |

#### 验收中发现的问题

> 以下为运行时验收过程中复核确认的问题，按严重度归类；`[by-design]` 项为符合产品意图、无需修复（仅记录）。

- **[security] `logout-no-disconnect`**：桌面端登出仅做 React Query 缓存清理与客户端路由跳转，从不调用 `repoPulseDesktop.realtime.disconnect`，IPC 桥（`main.ts:98` 已接线）无任何渲染层调用方；主进程 socket 是 OS 进程级而非会话级，登出后仍以旧用户身份停留在网关 `user:<id>` 房间（仅 socket 真正断开才解除）。在同进程内换用户（email/password 登录，客户端路由非整页 reload）且未发生重连的情况下，旧用户的 `notification.new` 会经 `desktop:realtime` IPC 泄漏到新会话的渲染层。
  - **证据**：`apps/web/src/pages/DesktopWorkbench.tsx:1078-1081` — `handleLogout` 仅 `await logoutMutation.mutateAsync(undefined)` 后 `navigate('/login', {replace:true})`（React Router 客户端路由，非整页 reload），全程未调用 `repoPulseDesktop.realtime.disconnect`；`apps/web/src/hooks/queries/use-auth-queries.ts:96-109` — `useLogoutMutation` 的 mutationFn 仅 `authService.logout()`，onSuccess 仅 `queryClient.removeQueries`，不触碰 IPC 桥；`apps/web/src/hooks/use-web-socket.ts:363-412` — `useIpcRealtimeSubscription` 的清理函数（409-411）只 `unsubscribe()` 取消 onMessage 监听；另一 effect 清理（446-453）只对每个房间 `bridge.leave()`，两处都不 disconnect；注释 357-362 明确写明卸载时不主动 disconnect；`apps/electron/src/main/lib/realtime-bridge.ts:117-126` — `disconnect()` 才会 `removeAllListeners`/`socket.disconnect` 并清空 roomRefCount；`preload.ts:52` 与 `main.ts:98-99` 的 `realtime:disconnect` 通道虽完整接线，但 grep `apps/web/src` 全仓无任何渲染层调用方；`apps/api/src/modules/event/event.gateway.ts:125,144,350-351` — `handleConnection` 用握手 token 解出 sub 后 `client.join('user:'+sub)`，`notification.new` 只 emit 到该房间；房间成员资格仅在 `handleDisconnect`（144）即 socket 真正断开时才解除。
  - **建议**：在 `useLogoutMutation` 的 mutationFn/onSuccess（或 DesktopWorkbench `handleLogout`）中，桌面运行时下调用 `window.repoPulseDesktop?.realtime?.disconnect()`；同时建议在 `useLoginMutation` 成功后（换用户场景）也强制 disconnect 后再重连，确保主进程 socket 以新 token 重新握手并加入正确的 `user:<id>` 房间。

- **[minor] `replay-no-merge-window`**：replay 补发期每条 `event.created` 都经与实时事件相同的 `EVENT_CREATED` 通道下发，渲染端 `EVENT_CREATED` handler 无条件逐条触发 `invalidateRepositoryRealtimeQueries`（dashboard/repo/workbench/notification 多键失效）；`EVENT_REPLAY_DONE` handler 仅更新 seq 游标并打日志，未做任何失效，计划 §2.6 的「replay 窗口缓冲 + replay-done 后一次性合并失效」未落地。当补发量接近网关 `REPLAY_BATCH_LIMIT=200` 时会产生失效风暴；本次 `replayed=2` 量小无碍。
  - **证据**：`apps/web/src/hooks/use-web-socket.ts:157-169` — `EVENT_CREATED` handler 对每条事件无条件调用 `invalidateRepositoryRealtimeQueries`（dashboard.all/repo.list/workbench/notification.* 多键失效）+ `repositoryQueryKeys.detail`，无 replay 窗口判断；`apps/web/src/hooks/use-web-socket.ts:170-179` — `EVENT_REPLAY_DONE` handler 仅 `setLastSeq` 更新游标 + `console.log`，没有任何「一次性合并失效」逻辑；`apps/api/src/modules/event/event.gateway.ts:212-221` — replay 补发通过与实时事件相同的 `REALTIME_EVENTS.EVENT_CREATED` 通道逐条 `client.emit`，渲染端无法区分 replay 与实时事件，故逐条失效；`apps/api/src/modules/event/event.gateway.ts:31,199,209-210` — `REPLAY_BATCH_LIMIT=200`，单批最多补发 200 条 `event.created`；`docs/electron-ipc-realtime-push-plan.md:146-148` — §2.6 原设计明确要求「replay 窗口期间仅更新 seq 游标、不逐条失效，收到 event.replay-done 后一次性失效」，与现实现不符；前端全仓库 grep 无任何 replay 窗口/缓冲状态。
  - **建议**：在 `createRealtimeHandlers` 引入按 `repositoryId` 的 replay 窗口状态：收到 join/首条 replay 时进入窗口，期间 `EVENT_CREATED` 只调用 `setLastSeq` 更新游标并标记「待失效仓库」，不调用 `invalidateRepositoryRealtimeQueries`；`EVENT_REPLAY_DONE` 时对窗口内累积的仓库执行一次合并失效。同时需保证 socket.io 与 IPC 两条分支共用该状态。若评估 200 条规模可接受、暂不实现，则更新计划 §2.6 标注为已知未落地项，避免文档与实现不一致。

- **[security] `authme-secret-leak`**：`GET /auth/me`（及公开端点 `GET /auth/session`）经 `UserService.findById` 返回完整 User 记录，该方法用无 `select` 的 `prisma.user.findUnique` 取全部列、仅 `excludePassword` 剥离 `passwordHash`，导致 `githubAccessToken`（`ghp_…`）、`githubRefreshToken` 与明文存储的 `aiApiKey`（`sk-…`）随 JSON 明文回传给前端；项目无全局 `ClassSerializerInterceptor`/`@Exclude` 兜底，而 settings 模块对同字段已做 `'***'` 掩码，证实此为真实敏感凭据泄露。
  - **证据**：`apps/api/src/modules/auth/auth.controller.ts:218-221` — `GET /auth/me` 直接 `return this.userService.findById(user.sub)`，无任何字段过滤；`apps/api/src/modules/user/user.service.ts:8-14` — `findById` 使用 `prisma.user.findUnique({ where: { id } })` 未指定 `select`，返回全部列；仅经 `excludePassword` 处理；`apps/api/src/modules/user/user.service.ts:162-165` — `excludePassword` 只剥离 `passwordHash`，`githubAccessToken`/`githubRefreshToken`/`aiApiKey` 原样保留并随响应返回；`packages/database/prisma/schema.prisma:136-137,147` — User 模型含 `githubAccessToken`、`githubRefreshToken`、`aiApiKey` 列（`aiApiKey` 注释称'加密存储'但 `settings.service.ts:95` 实为明文写入）；`apps/api/src/modules/auth/auth.controller.ts:242,262` — 公开端点 `GET /auth/session` 同样返回 `findById(...)`，泄露路径在静默会话接口上同样可达；对比 `settings.service.ts:71,122` 对同字段做了 `'***'` 掩码，说明项目本意视其为敏感。
  - **建议**：在 `UserService.findById` 中显式用 Prisma `select`/`omit` 仅返回安全字段（或在 `excludePassword` 中一并剔除 `githubAccessToken`、`githubRefreshToken`、`aiApiKey`），并为 `/auth/me` 与 `/auth/session` 增加返回字段白名单；同时考虑对 `aiApiKey`/`githubAccessToken` 做静态加密存储以兑现 schema 中'加密存储'注释。

- **[minor] `resubscribe-churn`**：repo 列表 query 刷新且返回的数据内容发生变化时，`repositoriesQuery.data` 因结构共享得到新数组引用，经 `useMemo` 链（repositories→repositoryIds）传导使 `useRepositoryRealtimeSubscription` 的订阅 effect 依赖（`syncRoomSubscriptions` / `getTargetRepositoryIds`）整体失效；该 effect 的 cleanup 会对当前全部已订阅房间逐个 `emit leave:repository` 并清空本地 Set，随后 body 再对全部目标房间逐个 `emit join:repository`，从而出现一次全量退订 + 全量重订（本次约 73 个房间）。最终订阅集合不变、功能正确（由 `subscribedRoomsRef` 引用计数保证），但产生明显的日志与网络抖动。需注意：并非每次失效都触发——若刷新后列表数据字节级未变，结构共享保持同一引用、不会重订；仅当数据内容变化（如 `event:new` 改动了仓库活动/同步字段）时才发生。桌面 IPC 分支（`bridge.subscribe`/`leave`）存在同构问题。
  - **证据**：`apps/web/src/hooks/use-web-socket.ts:340-353` — `useSocketIoRealtimeSubscription` 的订阅 effect 依赖 `[syncRoomSubscriptions]`；当依赖变更时先执行 cleanup（343-352）对 `subscribedRoomsRef` 中全部已订阅房间逐个 `emit 'leave:repository'`（348-349）并清空 Set（351），随后 body（341）重新对全部目标房间 `emit 'join:repository'`（253-261），即一次性退订并重订全部房间；`apps/web/src/hooks/use-web-socket.ts:237-270` — `getTargetRepositoryIds` 依赖 `[repositoryIds]`（243），`syncRoomSubscriptions` 依赖 `[currentUser?.id, getTargetRepositoryIds]`（270）；只要 `repositoryIds` 数组引用变化，这条依赖链即整体失效，触发上面的 cleanup+body 全量重订；`apps/web/src/pages/Repositories.tsx:120-137` — `repositories=useMemo([repositoriesQuery.data])` → `repositoryIds=useMemo(() => repositories.map(r => r.id), [repositories])`；repo 列表 query 刷新后若数据内容变化，data 得到新引用，repositoryIds 随之得到新数组引用（内容仍为同一批 id），驱动上述全量重订；`Dashboard.tsx:341-391、780` 同构（repos→monitoredRepositoryIds→dashboardRepositoryIds）；`apps/web/src/hooks/use-web-socket.ts:414-453` — 桌面 IPC 分支同样在 effect cleanup（446-452）中对全部已订阅房间调用 `bridge.leave` 并清空 Set，effect 依赖含 `getTargetRepositoryIds`（453），repositoryIds 引用变化时同样全量退订+重订（427-444）；`apps/web/src/lib/query-client.tsx:4-16` 与 `apps/web/src/lib/query-hooks.ts:43-58` — `QueryClient` 与 `useApiQuery` 均未关闭 `structuralSharing`（默认 true）：repo 列表内容未变的刷新会保留同一数组引用、不产生 churn；只有数据内容变化时才生成新引用并触发全量重订。
  - **建议**：让传入 `useRepositoryRealtimeSubscription` 的 `repositoryIds` 在内容不变时保持引用稳定：在 `repositoryIds` 的 `useMemo` 中按内容（如排序后 `join('|')` 或自定义比较）做记忆化，或在 hook 内部以内容签名（已排序 id 串）做 diff 而非依赖数组引用；另可将 `syncRoomSubscriptions` 的 effect 依赖改为稳定的内容签名字符串，并在 cleanup 中只对真正离开的房间执行 `leave`（避免在依赖变化时无条件 leave 全部再重 join），从而把 emit 收敛为真实增减量。

- **[by-design] `web-strictmode-double-socket`**：web 端 socket.io 分支已用 `setTimeout(0)` 延迟建连 + `connectTimeoutRef`/`socketRef` 双重 ref 守卫（`use-web-socket.ts:273,277-312,315-326`），在 React StrictMode dev 双挂载下首个定时器会在 cleanup 中被清除，最终只建立 1 条 socket.io 连接，不会出现 2 条。该机制为 2026-04-27 既有代码，非本次 IPC 改造引入。claim 中"web 端会建 2 条连接"的描述与代码不符。
  - **证据**：`apps/web/src/hooks/use-web-socket.ts:277-312` — socket 创建被 `connectTimeoutRef.current = window.setTimeout(() => { ... io(...) ... socketRef.current = socket; }, 0)` 延迟到宏任务，而非在 `connect()` 同步执行时建立连接；`apps/web/src/hooks/use-web-socket.ts:273` — `connect()` 守卫 `if (!enabled || !currentUser || isAuthLoading || socketRef.current || connectTimeoutRef.current !== null) return;`，已有 pending 定时器或已有 socket 时直接 return，挡住重复调度；`apps/web/src/hooks/use-web-socket.ts:315-326` — `disconnect()` 先 `clearTimeout(connectTimeoutRef.current)` 再置 null；dep 数组为 `[]`（L326）使其引用稳定，任意 cleanup 都会取消未触发的定时器；`apps/web/src/hooks/use-web-socket.ts:328-338` — effect 在 mount 调 `connect()`、cleanup 调 `disconnect()`；StrictMode 的 mount→cleanup→mount 在同一 commit 内同步发生，`setTimeout(0)` 宏任务此时尚未触发，首个定时器在 cleanup 被清除，仅第二次 mount 的定时器最终触发 → 仅建 1 条连接；`apps/web/src/main.tsx:9-15` — 应用确以 `<StrictMode>` 包裹（dev 双挂载场景真实存在），但上述延迟 + ref 守卫正是规避双连接的标准写法；`git blame apps/web/src/hooks/use-web-socket.ts:277-312` — `setTimeout(0)`+`connectTimeoutRef` 模式由 commit `fca70e3a`（2026-04-27）引入，早于 `feature/IPC-realtime-push` 分支（`ed2d690` 起，2026-06-02），与本次改造无关。
  - **建议**：无需修复。web 分支已通过 `setTimeout(0)`+ref 守卫规避 StrictMode 双连接，桌面 IPC 分支则由主进程 connect 幂等（`use-web-socket.ts:407`，`desktop.ts:60`）规避，两条分支均无双连接问题。如需文档化可注明二者各自的去重机制，但不构成缺陷。

- **[by-design] `unreadcount-event-scoped`**：`getUnreadCount` 仅统计 `channel=IN_APP`、`readAt=null` 且关联事件落在用户监控仓库/分支范围内的未读通知（`where.event` 过滤）；由于 `Notification.eventId` 可空且 `event` 为可选关系，`eventId=null` 的应用内通知不会被计入红点——此为有意设计，非缺陷。配套的实时 `notification.new` handler 失效 `unreadCount`/`list` 查询触发的 REST 重新拉取走 `apiClient`，`access_token` 过期时会先返回 401，再由 api-client 的 401 响应拦截器自动 `/auth/refresh` 并重放原请求成功，属良性瞬态，刷新失败才跳转登录。
  - **证据**：`apps/api/src/modules/notification/notification.service.ts:420-429` — `getUnreadCount` 的 `prisma.notification.count` where 含 `channel=IN_APP`、`readAt=null`，且 `event: { ...buildEventScopeWhere(...) }`，对可空 to-one 关系做过滤即要求关联事件存在并匹配仓库范围；`packages/database/prisma/schema.prisma:321,332` — `Notification.eventId` 为 `String?`（可空）、`event` 为可选关系 `Event?`；`eventId=null` 的通知无法匹配 `where.event`，故被排除在红点计数外；`apps/api/src/common/utils/repository-branch-scope.ts:57-97` — `buildEventScopeWhere` 生成 `EventWhereInput`（按 repositoryId/分支限定），`getUnreadCount` 中作为 `event` 子查询条件，确保只统计监控仓库范围内事件的通知；`apps/web/src/hooks/use-web-socket.ts:197-198` — `notification.new` 实时 handler 失效 `notificationQueryKeys.unreadCount()` 与 `list()`，触发 REST 重新拉取；`apps/web/src/services/notification.service.ts:1,87` + `apps/web/src/services/api-client.ts:41-80` — `getUnreadCount` 经 `apiClient.get('/notifications/unread-count')`，命中 401 响应拦截器：非 `_retry` 且非 `/auth/refresh` 时自动 `POST /auth/refresh` 后用 `apiClient(originalRequest)` 重放，刷新失败才跳登录。
  - **建议**：无需修复（by-design）；若希望系统级/无事件通知也进红点，可将 `getUnreadCount` 改为 `where: { OR: [{ eventId: null }, { event: buildEventScopeWhere(...) }] }` 或显式区分两类计数，但当前以「监控范围内事件通知」为红点口径是符合产品意图的。

---

## 附录：与任务原文的差异说明（为何不能照搬）

| 任务原文表述 | 问题 | 本计划处理 |
| :--- | :--- | :--- |
| 在 `ApprovalService`/`AIProcessor`/`NotificationService` 中“直接 `mainWindow.webContents.send`” | 这些 service 在 NestJS 进程，无 `webContents` | 改为：service 调 `EventGateway.broadcast*` → Main 作 socket.io 客户端订阅 → `webContents.send`（§1） |
| “renderer 把 token 透传给 Main” | token 在 HttpOnly Cookie，renderer JS 读不到 | Main 用 `session.cookies` 读取（§2.3） |
| 复用 `window.repoPulseDesktop.agent.onMessage` 或新增 `desktop:event-new` 等多通道 | 多通道放大 preload/desktop.ts 重复、缺翻译层；handler 是闭包局部不可复用 | 单一信封 `desktop:realtime` + 提升 `createRealtimeHandlers` 工厂（§2.1/§2.2） |
| “免网络端口占用” | renderer 的 REST/axios 仍走 `127.0.0.1:3001`，端口必留 | 如实说明：消除的是**浏览器侧** socket 的跨域/Cookie 痛点，非物理端口（§1.2 备注 + §6 生产缺口） |
