# 自动隧道模块（apps/electron/src/main/lib/tunnel）

> 本目录是桌面端「自动隧道 → 自动 webhook」特性的实现（M0–M4 已完成）。修改本目录前先读本文件。
> 特性总览见 `docs/auto-tunnel-webhook.md`。

## 1. 模块职责：零手配的公网 webhook

桌面端用户在本机跑后端 API（`127.0.0.1:3001`），但 GitHub webhook 必须从公网回调进来。
没有公网地址时，用户要么手动开内网穿透、要么手动去每个仓库配 webhook URL —— 体验差且易错。

本模块的目标是**全自动**：应用登录后，主进程自动拉起一条 cloudflared 公网隧道，并把后端的
webhook 回调地址改成这条隧道地址、重建所有仓库的 webhook。用户什么都不用配，GitHub 事件
就能经隧道打回本机、再经实时通道刷新 UI。

## 2. 数据流图

```
App 登录（渲染端 realtime:connect IPC，已认证信号）
   │
   ▼
WebhookProxy.start()                      # 起本地反代，监听 127.0.0.1 临时端口（port 0）
   │  仅放行 /webhooks 前缀，其它一律 404 —— 安全闸门
   ▼  port
TunnelManager.start()                     # spawn cloudflared quick tunnel，--url 指向反代端口
   │  抓 *.trycloudflare.com URL → 轮询边缘就绪 → resolve publicUrl
   ▼  publicUrl
TunnelOrchestrator.applyPublicUrl(publicUrl)
   │  1) POST /settings/app-config/api-url { value: publicUrl }   # 写后端 API_URL（需 ADMIN）
   │  2) POST /repositories/batch-retry-webhooks                  # 受限并发逐仓库删旧建新 webhook
   ▼
GitHub 仓库 webhook 回调地址 = ${publicUrl}/webhooks/github
   │
   ▼
GitHub push/PR 事件 → cloudflared 边缘 → 本机反代（仅 /webhooks 放行）→ 本地 API /webhooks/github
   │
   ▼
后端处理事件 → 经实时通道（socket.io → IPC desktop:realtime）推给渲染进程 → UI 实时刷新
```

## 3. 四个文件各自职责

| 文件 | 职责 | 关键点 |
| :--- | :--- | :--- |
| `webhook-proxy.ts` | 公网→本地 API 的最小反向代理（纯 `node:http`） | 仅 `/webhooks` 前缀放行；先 `new URL()` 归一化再判前缀，挡 `/webhooks/../auth/me` 路径穿越；method/headers/raw body 原样透传（保 GitHub 验签所需 `x-hub-signature-256`）；监听回环临时端口 |
| `tunnel-manager.ts` | cloudflared quick tunnel 生命周期（纯 node） | spawn cloudflared、从输出抓 URL、轮询边缘就绪才置 running（早 resolve 会命中 cloudflare 错误页）；系统解析器解不出 `*.trycloudflare.com` 时用公共 DNS（1.1.1.1/8.8.8.8）解 IP 后按 IP 直连（Host/SNI 仍用原主机名）兜底；运行期异常退出在 maxRetries 内自动重启；`stop()`/`dispose()` SIGTERM→SIGKILL 清子进程；`restart()` = stop + start（供刷新复用） |
| `tunnel-orchestrator.ts` | 拿到公网 URL 后让后端 webhook 指向它（纯 node） | `setApiUrl`（写 API_URL）→ `rebuildAll`（批量重建）→ `rebuildOne`（单仓修复/测试）；统一 `applyPublicUrl` 串起前两步；`Authorization: Bearer <token>`，token **每次现取不缓存**；URL 去尾斜杠归一化；不抛异常，失败带 status/needsAdmin/原因返回 |
| `types.ts` | 四者共享的公共类型（纯类型） | `TunnelState` / `TunnelStatus` / `TunnelManagerOptions` / `WebhookProxyOptions` / `OrchestratorResult`。跨进程上报另用 shared 的 `DesktopTunnelStatus`（与 `TunnelStatus` 字段同构，可直接透传） |

所有文件**禁止 import electron**：cloudflared 路径解析、token 读取由调用方（`main.ts`）注入，以保持模块可独立
spawn/单测。electron 的 `app.isPackaged` / `session.cookies` 等 API 只出现在 `main.ts`。

## 4. 安全收口

- **反代只暴露 `/webhooks`**：隧道不直接指向本地 API（否则 `/auth/*`、`/repositories/*` 等内部接口
  全被公网可达）。反代对**归一化后的 pathname** 判前缀，其它路径一律 404、不转发。
- **归一化判定挡穿越**：`/webhooks/../auth/me` 会先被 `new URL()` 归一成 `/auth/me`，再判前缀 → 404。
  绝不能只对原始 `req.url` 做 `startsWith` 判定。`/webhooksXYZ` 这类前缀粘连也会被挡（只放行 `=== '/webhooks'`
  或 `startsWith('/webhooks/')`）。
- **反代监听回环**：`127.0.0.1` 临时端口，只对本机 cloudflared 可见，不被局域网直接访问。
- **raw body 透传**：用流 `pipe`、不解析 body，保住 GitHub 验签依赖的原始字节。
- **HMAC 验签仍在后端**：反代不做验签，只做路径闸门；签名校验由 `/webhooks/github` 后端按仓库粒度 secret 完成。

## 5. 生命周期

- **start**：渲染端登录后调 `realtime:connect` IPC → `main.ts` `startTunnelOrchestrationOnce()` 幂等触发
  `proxy.start()` → `TunnelManager.start()` → `orchestrator.applyPublicUrl()`。
  用 `tunnelStarted` flag 保证只起一次；失败时复位 flag，允许下次 `realtime:connect` 重试。
  `realtime:connect` 不 `await` 该链路（隧道启动慢，不阻塞 IPC 返回）。
- **dispose**：窗口 `'closed'` 时（紧挨 `realtimeBridge?.dispose()`）调 `disposeTunnel()` —
  `tunnelManager.dispose()`（kill cloudflared 子进程）+ `webhookProxy.stop()`（关反代）+ 复位 flag。
- 整条启动链路在 `main.ts` 里被 try/catch 包裹，**任何失败只 log，绝不崩 realtime 主流程**（降级：
  隧道挂掉不影响 realtime-bridge / local-git-watcher 继续工作）。

## 6. 刷新机制（M3）

用户可在 Settings「集成」Tab 的「实时连接（隧道）」状态卡点「刷新隧道」，主动重连拿新 URL 并重新同步后端。

- **IPC `tunnel:refresh`**（`main.ts` `refreshTunnel()`）：
  - **防抖**：距上次刷新 `< TUNNEL_REFRESH_DEBOUNCE_MS`（3s）直接忽略，返回当前快照。
  - 已有 `TunnelManager` → `restart()`（stop+start）拿新 URL → `orchestrator.applyPublicUrl()` 重新写 API_URL + 重建 webhook。
  - 尚未首启 → 复用 `startTunnelOrchestrationOnce()` 首启逻辑。
  - 全程 try/catch，失败返回 `{ state: 'error', error }`。
- **状态回推 `tunnel:status`**：`TunnelManager` 的 `onStatus` 回调（`main.ts` `onTunnelStatus`）把
  starting/running/error + publicUrl 实时 `webContents.send` 给渲染进程。隧道已 running 但 webhook 自动
  配置失败时（needsAdmin / 重建失败），`reportOrchestrationOutcome()` 额外推一条 `error` 降级提示
  （文案如「需要管理员权限，无法自动配置 webhook」「隧道已就绪，但 webhook 自动配置失败：…」），隧道本身仍可用。
- **preload**：暴露 `repoPulseDesktop.tunnel.refresh()` 与 `tunnel.onStatus(cb)`（命名空间隔离）。
- **Settings UI**（`apps/web/src/components/settings/integrations/TunnelStatusCard.tsx`）：
  状态徽标（idle/starting/running/error）+ 公网 URL + 刷新按钮；刷新走 TanStack Query `useMutation`，
  状态经 `tunnel.onStatus` 订阅实时更新；仅桌面运行时（`isDesktopRuntime()`）渲染，浏览器侧返回 null。

## 7. 编排契约与后端复用（调哪几个后端端点）

| 步骤 | 端点 | 鉴权 | 说明 |
| :--- | :--- | :--- | :--- |
| 写 API_URL | `POST /settings/app-config/api-url` body `{ value }` | **ADMIN** | value 必须匹配 `^https?://`；写进程级 DB AppConfig（运行时配置，无需重启/改 env）。403 → `needsAdmin` |
| 重建全部 webhook | `POST /repositories/batch-retry-webhooks`（无 body） | ADMIN | 对调用者名下 active 仓库逐个删旧建新；回调地址自动取 `${API_URL}/webhooks/github`；返回 `{total,succeeded,failed,failures}` |
| 重建单仓 webhook | `POST /repositories/:id/webhook` | — | `rebuildOne()`，供定向测试 / 单仓修复 |

token 用主进程 `session.cookies` 读 HttpOnly `access_token`（与 `realtime-bridge.readAccessToken`
同款），每次重读以适配 token 轮换。`apiBaseUrl` 复用 `process.env.REPO_PULSE_API_URL ?? 'http://127.0.0.1:3001'`。

**后端稳定性（M3，在 `apps/api/src/modules/repository/repository.service.ts`）**：

- **API_URL 运行时配置**：`/settings/app-config/api-url` 写 DB AppConfig（DB → env → default 三层来源），
  webhook 回调地址拼接时优先读它；隧道 URL 变化只需写库，无需重启后端或改环境变量。
- **batchRetryWebhooks 受限并发**：每个 `retryWebhook` 内部对 GitHub 发多次调用（delete+list+create），
  全量并发（70+ 仓库）极易触发 GitHub secondary rate limit / abuse detection。故收敛为分块串行：
  块内并发 `BATCH_RETRY_CONCURRENCY = 4`（`Promise.allSettled`），块间 `BATCH_RETRY_DELAY_MS = 300ms`
  延迟（最后一块不等）。不引第三方依赖（不用 p-limit），对外返回结构不变。
- **retryWebhook 孤儿修复**：删旧建新前先删 GitHub 上的旧 hook；**仅当删除确实成功、或 GitHub 返回 404
  （hook 已不存在）时才清空 DB `webhookId`**。若删除因瞬时错误失败仍清 id，旧 hook 会在 GitHub 残留且
  再也无法定位删除（隧道 URL 每次唯一，自愈仅按当前 URL 匹配，命中不了旧孤儿）；保留 id 可让下次
  retry 用同一 id 幂等重删。
- provisionWebhook 孤儿清理：create 成功或自愈成功后，调用 `pruneStaleGithubWebhooks` 列出该仓库全部
  webhook，删除所有 `config.url` 以 `/webhooks/github` 结尾（即本 app 注册）、但不是当前保留 id 的 hook。
  这补上了上一条遗留的缺口：隧道 URL 每次随机，旧 URL 的 hook 既不会被 create 命中（URL 不同，GitHub
  不报 "Hook already exists"），也不会被 retryWebhook 删除（DB 只存最新一个 id，旧 id 已丢失），过去会
  越积越多、全部指向已死隧道地址，GitHub 投递恒返回 502 failed to connect to host（同时出现在 GitHub
  仓库的 Recent Deliveries 与 app 的 webhook 状态卡）。清理为非致命：失败只记 warn，不影响 webhook 主流程；
  单次删除错误已被 `deleteWebhook` 内部吞掉，不中断循环。覆盖建仓 / retryWebhook / batchRetryWebhooks 所有入口。

## 8. 打包（M4）

- **二进制不入库**：cloudflared 由 `apps/electron/scripts/fetch-cloudflared.mjs` 按平台拉取到
  `apps/electron/resources/bin/`（见 `.gitignore`）。脚本按 `${platform}-${arch}` 选择官方 release 资产
  （darwin 为 .tgz 需解压，linux/win 为裸二进制 / .exe），下载后 `chmod 0755`（非 win），已存在则跳过（`--force` 重下）。
- **`pnpm fetch:cloudflared`**：手动/CI 拉二进制。`pnpm package` 脚本 = `fetch:cloudflared` → `build` → `electron-builder`，保证打包前二进制就位。
- **`extraResources`**（`package.json` build 段）：`resources/bin` → `bin`，打包后落在 `process.resourcesPath/bin/cloudflared`。
- **`resolveCloudflaredPath()`**（`main.ts`）：
  - 打包后：`path.join(process.resourcesPath, 'bin', binary)`。
  - dev：`path.join(app.getAppPath(), 'resources', 'bin', binary)`（dev 下 `getAppPath()` 指向 apps/electron）。
  - Windows 用 `cloudflared.exe`，其余用 `cloudflared`。
- **失败降级**：`needsAdmin` 或隧道启动/spawn 失败 → 推 `tunnel:status` error 提示用户；不影响 realtime 主流程。

## 9. 已知约束

- **隧道 URL 每次随机**：cloudflared quick tunnel 每次启动都换 `*.trycloudflare.com`，因此每次应用启动都要
  重写 API_URL + 重注册全部 webhook（这是 quick tunnel 的固有特性，非 bug）。需固定域名须改用命名隧道（需 CF 账号/配置）。
  重注册产生的旧 URL hook 由 provisionWebhook 的孤儿清理（见 §7）在下次 provision 时自动删除，不会在 GitHub 上无限累积。
- **trycloudflare 无 SLA**：quick tunnel 是 best-effort 免费临时隧道，cloudflare 不保证可用性/稳定性；
  生产场景应换命名隧道或自有公网入口。
- **写 API_URL 需 ADMIN**：非 ADMIN 用户被 403（`needsAdmin`），无法自动配 webhook，UI 给降级提示，需 ADMIN 操作。
- **受限网络 DNS**：部分网络的系统解析器对 `*.trycloudflare.com` 返回 NXDOMAIN；已用公共 DNS（1.1.1.1/8.8.8.8）
  解 IP 后按 IP 直连兜底（边缘就绪探测与冒烟脚本均如此）。但若网络连 cloudflare 边缘本身受阻则无解。
- **跨平台二进制**：`fetch-cloudflared` 只拉**当前**平台的二进制；要为其它平台出包，须在对应平台（或交叉）各自构建。

## 10. 测试脚本入口

| 脚本 | 作用 | 是否触网 |
| :--- | :--- | :--- |
| `apps/electron/scripts/tunnel-proxy-test.cjs` | 仅验证反代安全闸门（`/webhooks` 放行 + 挡 `/auth/me` / `/webhooks/../auth/me` 穿越 / `/webhooksXYZ` 前缀粘连），require 编译后的 `dist` 模块 | 否（仅本地，需本地 API 在 3001） |
| `apps/electron/scripts/tunnel-smoke.cjs` | 端到端冒烟：起反代 + 真起 cloudflared，验证 `/auth/me` 不被转发、`/webhooks/github` 能打到本地 API（受限网络用公共 DNS 兜底） | 是（真起隧道，约 10–20s） |
| `apps/electron/scripts/tunnel-orchestrate-test.cjs` | 编排集成测试：`TEST_TOKEN=<jwt> node ... <testUrl>` 仅测可逆的 `setApiUrl`（写 api-url 配置） | 是（打本地 API） |

运行前需先 `pnpm --filter @repo-pulse/electron build:main`（脚本 require 的是 `dist/` 编译产物）。

> 注意：**不要**随手跑会真实注册 webhook 的命令（`batch-retry-webhooks` / 单仓 retry / `rebuildAll` / `rebuildOne`），
> 那会改动用户 GitHub 仓库的实际 webhook 配置。`tunnel-orchestrate-test.cjs` 只测可逆的 `setApiUrl`；
> 冒烟脚本只走反代/隧道传输层，不调编排器的注册端点。
