# 桌面端自动隧道 + 自动 Webhook

> 状态：M0–M4 代码完成。实现细节见 `apps/electron/src/main/lib/tunnel/CLAUDE.md`。

## 1. 为什么需要它

Repo-Pulse 桌面端是一个**本地优先的开源客户端**：后端 API 跑在用户本机（`127.0.0.1:3001`），没有公网服务器。
但要实时收到**远程 GitHub** 仓库的 push / PR 事件，GitHub 必须能从公网回调一个 webhook URL —— 本机回环地址
GitHub 显然够不着。

传统做法要用户手动开内网穿透工具、再逐个仓库去 GitHub 配 webhook URL，体验差且 URL 一变就失效。

本特性把这一切**零手配自动化**：应用登录后，桌面端主进程自动起一条临时公网隧道，并自动把后端 webhook
回调地址配成隧道地址、重建所有仓库的 webhook。用户什么都不用配。

## 2. 架构 / 数据流

```
App 登录（渲染端 realtime:connect IPC，已认证信号）
   │
   ▼
WebhookProxy.start()            # 本地反代，监听 127.0.0.1 临时端口；仅放行 /webhooks，其它 404
   │  port
   ▼
TunnelManager.start()          # spawn cloudflared quick tunnel（--url 指向反代端口）
   │  抓 *.trycloudflare.com → 轮询边缘就绪 → publicUrl
   ▼
TunnelOrchestrator.applyPublicUrl(publicUrl)
   │  1) POST /settings/app-config/api-url { value: publicUrl }   （写后端 API_URL，需可编辑仓库权限）
   │  2) POST /repositories/batch-retry-webhooks                  （受限并发逐仓库删旧建新 webhook）
   ▼
GitHub 仓库 webhook 回调 = ${publicUrl}/webhooks/github
   │
   ▼  GitHub push/PR 事件
cloudflared 边缘 → 本机反代（仅 /webhooks 放行）→ 本地 API /webhooks/github（HMAC 验签）
   │
   ▼
后端处理 → 实时通道（socket.io → IPC desktop:realtime）→ 渲染进程 → UI 实时刷新
```

四个核心文件（`apps/electron/src/main/lib/tunnel/`）：

| 文件 | 职责 |
| :--- | :--- |
| `webhook-proxy.ts` | 公网→本地 API 的最小反向代理，安全闸门（仅 `/webhooks`） |
| `tunnel-manager.ts` | cloudflared quick tunnel 生命周期 + 边缘就绪探测 + 受限网络 DNS 兜底 |
| `tunnel-orchestrator.ts` | 拿到公网 URL 后写后端 API_URL + 批量重建 webhook |
| `types.ts` | 三者共享的公共类型 |

编排链路在主进程 `main.ts` 串起，模块本身不 import electron（路径/token 由 `main.ts` 注入），便于独立测试。

## 3. 用户体感

- **打开即就绪**：登录后隧道自动拉起并配好 webhook，无需任何手动配置。
- **Settings 可见状态**：在 Settings →「集成」Tab 的「实时连接（隧道）」状态卡，能看到隧道状态徽标
  （未启动 / 连接中 / 已连接 / 错误）与当前公网 URL。
- **一键刷新**：点「刷新隧道」即可重连拿新 URL 并自动同步到所有仓库；状态实时更新。
- **失败有提示**：若隧道起来了但自动配 webhook 失败（如当前用户没有可编辑仓库权限），状态卡会给出可读的降级提示，
  隧道本身仍可用。

## 4. 运行 / 验收方式

1. 开发模式启动：`pnpm dev:electron`（会先起后端 API + web，再编译并起 Electron）。
2. 首次登录后，主进程自动启动隧道编排。观察终端日志：
   - `[tunnel-manager] running publicUrl=https://xxx.trycloudflare.com`
   - `[main] tunnel orchestration complete: {...}`（含 webhook 重建计数）
3. 在 Settings →「集成」Tab，「实时连接（隧道）」卡应显示 **已连接（running）** + 公网 URL。
4. 在某个已接入的 GitHub 仓库 push 一次提交 → 桌面端应**经隧道实时刷新**（事件出现在 UI）。
5. （可选）点「刷新隧道」验证重连：拿到新 URL，状态卡更新，webhook 重新同步。

> 二进制就位：首次需 `pnpm --filter @repo-pulse/electron fetch:cloudflared` 拉取 cloudflared（`pnpm package` 会自动先拉）。

## 5. 已知约束 / 局限

- **隧道 URL 每次随机**：cloudflared quick tunnel 每次启动换一个 `*.trycloudflare.com`，因此每次启动都要
  重写 API_URL + 重注册全部 webhook（quick tunnel 固有特性）。固定域名需改用命名隧道（需 CF 账号/配置）。
  重注册遗留的旧 URL webhook 会在下次 provision 时被自动清理（见第 8.1 节），不会在 GitHub 上累积成孤儿。
- **trycloudflare 无 SLA**：免费临时隧道，best-effort，不保证可用性 / 稳定性；生产应换命名隧道或自有公网入口。
- **写 API_URL 权限**：只看当前用户是否拥有至少一个 active 可编辑仓库，不看 `ADMIN` / `MEMBER` 等全局角色。没有可编辑仓库时返回 403（`needsWebhookPermission`），UI 给降级提示。
- **受限网络 DNS**：部分网络系统解析器对 `*.trycloudflare.com` 返回 NXDOMAIN；已用公共 DNS（1.1.1.1/8.8.8.8）
  解 IP 后按 IP 直连兜底。但网络连 cloudflare 边缘本身受阻则无解。
- **跨平台二进制**：`fetch-cloudflared` 只拉当前平台二进制；要为其它平台出包，须在对应平台各自构建。

## 6. 安全

- **只暴露 `/webhooks`**：隧道不直接指向本地 API，而是指向反代；反代对**归一化后的 pathname**判前缀，
  其它路径（`/auth/*`、`/repositories/*` 等内部接口）一律 404，绝不转发。
- **防路径穿越**：`/webhooks/../auth/me` 先被 `new URL()` 归一成 `/auth/me` 再判前缀 → 404；`/webhooksXYZ`
  这类前缀粘连也被挡。
- **HMAC 验签**：反代只做路径闸门、不解析 body；GitHub 签名校验由后端 `/webhooks/github` 按仓库粒度 secret
  完成，验签依赖的原始字节（raw body）被反代用流 `pipe` 原样透传保留。
- **反代监听回环**：`127.0.0.1` 临时端口，仅对本机 cloudflared 可见，不被局域网直接访问。
- **token 不缓存**：编排器调后端带 `Authorization: Bearer`，token 每次从主进程会话 HttpOnly Cookie 现取，适配轮换。

## 7. M0–M4 提交对应

| 里程碑 | 提交 | 内容 |
| :--- | :--- | :--- |
| M0 | `43fc2cb` build(electron) | cloudflared 获取脚本（`fetch-cloudflared.mjs`）+ 二进制 gitignore |
| M1 | `c0c95bb` feat(electron) | `tunnel-manager` / `webhook-proxy` / `types`：隧道管理器 + 仅暴露 `/webhooks` 的安全反代 |
| M2 | `99149f5` feat(electron) | `tunnel-orchestrator` + `main.ts` 在 `realtime:connect` 时幂等启动编排：隧道就绪后写 api-url + 重建 webhook |
| M3 | `8c34718` feat(electron/api) | 隧道刷新 IPC/UI（`tunnel:refresh` 防抖 + `tunnel:status` 回推 + Settings 状态卡）+ 后端 webhook 批量限速（并发 4 + 块间 300ms）+ 孤儿修复 |
| M4 | `8dbec5d` build(electron) | 打包 cloudflared 进 app（`extraResources` + `package` 先 fetch + `resolveCloudflaredPath`）+ 失败降级提示 |

## 8. webhook 生命周期补强

本节记录 M0–M5 之后、针对真机端到端排查暴露的三个问题所做的修复，均位于后端 `apps/api`。

### 8.1 孤儿 webhook 自动清理

问题：隧道 URL 每次启动随机变化。旧 URL 的 webhook 既不会被 create 命中（URL 不同，GitHub 不报 "Hook already exists"），也不会被 retryWebhook 删除（DB 只保存最新一个 webhookId，旧 id 被覆盖后已丢失）。结果旧 hook 在 GitHub 上越积越多，全部指向已失效的隧道地址，GitHub 投递恒返回 502 connection_error / failed to connect to host。这条 502 会同时出现在 GitHub 仓库 Settings → Webhooks → Recent Deliveries 和 app 的 webhook 状态卡（显示「GitHub 上不存在 / Not Found」之类）。

修复：`provisionWebhook`（`apps/api/src/modules/repository/repository.service.ts`）在 create 成功或自愈成功后，调用新增的 `pruneStaleGithubWebhooks`：列出该仓库全部 webhook，删除所有 `config.url` 以 `/webhooks/github` 结尾（即本 app 注册）但不是当前保留 id 的 hook。清理为非致命操作，失败只记 warn，不影响主流程；覆盖建仓、retryWebhook、batchRetryWebhooks 所有入口。

效果：每次重启重注册后，旧 URL 的孤儿被自动删除，GitHub 上每个仓库最终只保留当前隧道 URL 对应的那一个 active webhook。

### 8.2 webhook 事件标记来源

问题：webhook 落库的事件 metadata 不含来源标记，无法从 DB 区分某条事件是经 webhook 实时投递、还是手动同步 / 历史同步（同步来源分别记为 repository_sync、legacy_history_sync）。排查实时链路是否真正投递成功时缺少依据。

修复：`apps/api/src/modules/event/event.processor.ts` 在创建事件时给 metadata 注入 source='webhook'。此后可直接按 metadata.source 判定事件来源。

### 8.3 空仓库 409 日志降级

问题：对从未有过 commit 的空仓库，GitHub 对 list 类接口（commits / branches / pulls / issues）返回 409「Git Repository is empty」。`apps/api/src/modules/repository/services/github.service.ts` 原以 error 级别记录，对正常的空仓状态造成误导性告警噪音；同步本身正常完成、返回空数组、不中断。

修复：新增 `isEmptyRepositoryError` 判别 409；getCommits / getBranches / getPullRequests / getIssues 四处 catch 对空仓 409 改用 debug 级别，其余错误仍记 error。仅日志级别变化，返回值与同步流程不变。
