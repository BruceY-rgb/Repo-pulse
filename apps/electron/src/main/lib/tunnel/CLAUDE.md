# 自动隧道模块（apps/electron/src/main/lib/tunnel）

> 本目录是桌面端「自动隧道 → 自动 webhook」特性的实现。修改本目录前先读本文件。

## 1. 模块职责：零手配的公网 webhook

桌面端用户在本机跑后端 API（`127.0.0.1:3001`），但 GitHub webhook 必须从公网回调进来。
没有公网地址时，用户要么手动开内网穿透、要么手动去每个仓库配 webhook URL —— 体验差且易错。

本模块的目标是**全自动**：应用登录后，主进程自动拉起一条 cloudflared 公网隧道，并把后端的
webhook 回调地址改成这条隧道地址、重建所有仓库的 webhook。用户什么都不用配，GitHub 事件
就能经隧道打回本机。

## 2. 数据流图

```
App 登录（渲染端 realtime:connect IPC）
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
   │  2) POST /repositories/batch-retry-webhooks                  # 逐仓库删旧建新 webhook
   ▼
GitHub 仓库 webhook 回调地址 = ${publicUrl}/webhooks/github
   │
   ▼
GitHub push/PR 事件 → cloudflared 边缘 → 本机反代（仅 /webhooks 放行）→ 本地 API /webhooks/github
```

## 3. 三个文件各自职责

| 文件 | 职责 | 关键点 |
| :--- | :--- | :--- |
| `webhook-proxy.ts` | 公网→本地 API 的最小反向代理（纯 `node:http`） | 仅 `/webhooks` 前缀放行；先 `new URL()` 归一化再判前缀，挡 `/webhooks/../auth/me` 路径穿越；method/headers/raw body 原样透传（保 GitHub 验签所需 `x-hub-signature-256`）；监听回环临时端口 |
| `tunnel-manager.ts` | cloudflared quick tunnel 生命周期（纯 node） | spawn cloudflared、从输出抓 URL、轮询边缘就绪才置 running（早 resolve 会命中 cloudflare 错误页）；系统解析器解不出 `*.trycloudflare.com` 时用公共 DNS（1.1.1.1/8.8.8.8）兜底直连；运行期异常退出自动重启（maxRetries 内）；`dispose()` SIGTERM→SIGKILL 清子进程 |
| `tunnel-orchestrator.ts` | 拿到公网 URL 后让后端 webhook 指向它（纯 node） | 调两个后端端点；`Authorization: Bearer <token>`，token **每次现取不缓存**；URL 去尾斜杠归一化；不抛异常，失败带 status/原因返回 |
| `types.ts` | 三者共享的公共类型（纯类型） | `TunnelState` / `TunnelStatus` / `TunnelManagerOptions` / `WebhookProxyOptions` / `OrchestratorResult` |

所有文件**禁止 import electron**：路径解析、token 读取由调用方（`main.ts`）注入，以保持模块可独立
spawn/单测。electron 的 `app.isPackaged` / `session.cookies` 等 API 只出现在 `main.ts`。

## 4. 安全收口

- **反代只暴露 `/webhooks`**：隧道不直接指向本地 API（否则 `/auth/*`、`/repositories/*` 等内部接口
  全被公网可达）。反代对**归一化后的 pathname** 判前缀，其它路径一律 404、不转发。
- **归一化判定挡穿越**：`/webhooks/../auth/me` 会先被 `new URL()` 归一成 `/auth/me`，再判前缀 → 404。
  绝不能只对原始 `req.url` 做 `startsWith` 判定。
- **反代监听回环**：`127.0.0.1` 临时端口，只对本机 cloudflared 可见，不被局域网直接访问。
- **raw body 透传**：用流 `pipe`、不解析 body，保住 GitHub 验签依赖的原始字节。

## 5. 生命周期

- **start**：渲染端登录后调 `realtime:connect` IPC → `main.ts` 幂等触发
  `proxy.start()` → `TunnelManager.start()` → `orchestrator.applyPublicUrl()`。
  用 `tunnelStarted` flag 保证只起一次；失败时复位 flag，允许下次 `realtime:connect` 重试。
- **dispose**：窗口 `'closed'` 时（紧挨 `realtimeBridge?.dispose()`）调 `disposeTunnel()` —
  `tunnelManager.dispose()`（kill cloudflared 子进程）+ `webhookProxy.stop()`（关反代）+ 复位 flag。
- 整条启动链路在 `main.ts` 里被 try/catch 包裹，**任何失败只 log，绝不崩 realtime 主流程**。

## 6. 编排契约（调哪两个后端端点）

| 步骤 | 端点 | 鉴权 | 说明 |
| :--- | :--- | :--- | :--- |
| 写 API_URL | `POST /settings/app-config/api-url` body `{ value }` | **ADMIN** | value 必须匹配 `^https?://`；写进程级 DB AppConfig。403 → `needsAdmin` |
| 重建全部 webhook | `POST /repositories/batch-retry-webhooks`（无 body） | ADMIN | 对调用者名下 active 仓库逐个删旧建新；回调地址自动取 `${API_URL}/webhooks/github`；返回 `{total,succeeded,failed,failures}` |
| 重建单仓 webhook | `POST /repositories/:id/webhook` | — | `rebuildOne()`，供定向测试 / 单仓修复 |

token 用主进程 `session.cookies` 读 HttpOnly `access_token`（与 `realtime-bridge.readAccessToken`
同款），每次重读以适配 15 分钟轮换。`apiBaseUrl` 复用 `process.env.REPO_PULSE_API_URL ?? 'http://127.0.0.1:3001'`。

## 7. 已知坑（标注 M3 处理）

- **隧道 URL 每次随机**：cloudflared quick tunnel 每次启动都换 `*.trycloudflare.com`，因此每次应用
  启动都要重写 API_URL + 重注册全部 webhook。**M3**：固定域名（命名隧道）以避免每次重注册。
- **孤儿 webhook**：每次 `batch-retry-webhooks` 是「删旧建新」；若 GitHub 侧删除失败、或上次进程异常
  退出，会在仓库里留下指向已失效隧道的旧 webhook。**M3**：清理/对账机制。
- **GitHub auto-disable**：GitHub 对连续投递失败的 webhook 会自动停用；旧隧道地址失效后的失败投递可能
  触发停用。**M3**：检测并恢复 disabled webhook。
- **批量限速**：仓库多时 `batch-retry-webhooks` 会对 GitHub API 发大量删/建请求，可能触发 secondary
  rate limit。**M3**：批量节流 / 退避重试。

## 8. 测试脚本入口

| 脚本 | 作用 | 是否触网 |
| :--- | :--- | :--- |
| `apps/electron/scripts/tunnel-proxy-test.cjs` | 仅验证反代安全闸门（`/webhooks` 放行 + 挡路径穿越），require 编译后的 `dist` 模块 | 否（仅本地，需本地 API 在 3001） |
| `apps/electron/scripts/tunnel-smoke.cjs` | 端到端冒烟：起反代 + 真起 cloudflared，验证 `/auth/me` 不被转发、`/webhooks/github` 能打到本地 API | 是（真起隧道，约 10–20s） |

运行前需先 `pnpm --filter @repo-pulse/electron build:main`（脚本 require 的是 `dist/` 编译产物）。

> 注意：**不要**随手跑会真实注册 webhook 的命令（`batch-retry-webhooks` / 单仓 retry），那会改动用户
> GitHub 仓库的实际 webhook 配置。冒烟脚本只走反代/隧道传输层，不调编排器的注册端点。
