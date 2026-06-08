<p align="center">
  <img src="public/logo.png" alt="Repo-Pulse Logo" width="96" />
</p>

<h1 align="center">Repo-Pulse</h1>

<p align="center">
  面向开发团队的 AI 仓库监督桌面工作台。
  <br />
  把仓库事件、审批、通知、报告、AI 分析和 Agent 操作整合进会话式工作流。
</p>

<p align="center">
  <img alt="Node.js 20+" src="https://img.shields.io/badge/Node.js-20%2B-2f855a?style=for-the-badge&logo=node.js&logoColor=white" />
  <img alt="React 19" src="https://img.shields.io/badge/React-19-2563eb?style=for-the-badge&logo=react&logoColor=white" />
  <img alt="Electron 42" src="https://img.shields.io/badge/Electron-42-1f2937?style=for-the-badge&logo=electron&logoColor=white" />
  <img alt="NestJS 11" src="https://img.shields.io/badge/NestJS-11-c2410c?style=for-the-badge&logo=nestjs&logoColor=white" />
</p>

<p align="center">
  <a href="#启动开发环境">启动开发环境</a>
  ·
  <a href="#桌面端-workbench">桌面端 Workbench</a>
  ·
  <a href="#当前进度dev-electron">当前进度</a>
  ·
  <a href="#权限与消息分流约定">权限分流</a>
  ·
  <a href="#当前重点待办">当前待办</a>
</p>

---

## 项目定位

当前 `dev-electron` 分支的重点是桌面端体验：把 Repo-Pulse 从传统 Dashboard 型产品，重构为类似 Slack / 飞书 / Discord 的仓库会话工作台。

<table>
  <tr>
    <td width="33%">
      <strong>Chat Workbench</strong>
      <br />
      仓库即会话，事件即消息。Push、PR、Issue、Release、审批和报告都进入消息流。
    </td>
    <td width="33%">
      <strong>Permission-aware Agent</strong>
      <br />
      只有具备写权限的仓库才能触发审批、PR、Agent 等真实修改操作。
    </td>
    <td width="33%">
      <strong>Watch Feed</strong>
      <br />
      未加入监控范围的接入仓库以信息流方式展示，帮助用户发现值得关注的变化。
    </td>
  </tr>
</table>

## 当前方向

- **桌面端优先**：Electron 承载桌面应用，Web 前端仍作为主要渲染层。
- **会话式工作台**：仓库是会话，Push、PR、Issue、Release、审批、通知和报告摘要都是消息。
- **权限分层**：有写权限的仓库可以执行审批、PR、Agent 等真实操作；只读监控仓库只展示消息和分析。
- **关注动态**：接入系统但未加入监控范围的仓库进入 Watch Feed，用信息流方式查看生态动态。
- **本地优先实时链路**：桌面端通过 Electron 主进程连接后端实时网关，再经 IPC 推送到渲染进程；本地 Git 仓库变化优先走本地 watcher。
- **零手配 Webhook**：桌面端自动拉起 cloudflared quick tunnel，并在隧道 URL 就绪后自动同步 GitHub webhook。
- **复用旧功能**：Dashboard、Reports、Repositories、Settings 继续复用原 Web 页面，通过 Workbench 路由嵌入桌面工作流。

## 当前进度（dev-electron）

截至 2026-06-08，`dev-electron` 已经从早期 Dashboard 产品推进到桌面端工作台形态。下面是当前主干口径：

| 模块 | 当前状态 |
| :--- | :--- |
| Electron 桌面壳 | 已接入主进程、preload bridge、桌面启动脚本与打包流程；开发入口为 `pnpm dev:electron`。 |
| Workbench 会话 | 已具备仓库会话、统一 Conversation Message API、未读边界、详情抽屉、审批/Agent 入口和仓库 Git 状态侧栏。 |
| 权限分流 | 已按可操作仓库 / 只读监控仓库分流，前端用 `canOperate` 控制真实修改入口，后端仓库服务返回当前用户视角能力字段。 |
| Watch Feed | 已接入真实关注动态 API，支持分页、收藏、忽略、搜索、噪音过滤和按 Issue / PR / Push / Release 等类型筛选。 |
| 实时推送 | 已完成 Electron 主进程 socket.io 客户端 → `desktop:realtime` IPC → React Query handler 的桌面实时链路；Web 环境仍保留 socket.io 回退。 |
| 本地 Git 事件 | 已接入 LocalGitWatcher；本地 clone 存在时优先监听 HEAD、分支和工作区变化，推送 `local.git.changed` 刷新 Git 面板。 |
| 自动隧道 / Webhook | 已完成 cloudflared quick tunnel、仅暴露 `/webhooks` 的本地反代、隧道状态 IPC、Settings 状态卡和批量重建 webhook。 |
| AI 分析 | 已有 AI Provider 抽象层、异步分析队列、analysis.started / completed / failed 实时事件，以及前端分析面板。 |
| Agent 会话 | 已接入桌面端 Agent session 视图、运行/停止、工具调用日志、权限确认卡、GitTree 入口和按仓库维护 session 的 UI 状态。 |
| 测试与验证 | Web 类型检查可用；实时 IPC 相关后端单测和跨包 typecheck 已在交接文档中完成验收。全量 lint / test 仍存在既有测试隔离与 lint 债务。 |

## Monorepo 结构

```text
apps/
  api/        NestJS API, GitHub 集成, WebSocket, 审批和通知服务
  electron/   Electron 主进程、打包配置和桌面端启动脚本
  web/        React + Vite 前端，包含 Web 页面和 Desktop Workbench
packages/
  ai-sdk/     AI Provider 抽象层
  database/   Prisma schema 与客户端导出
  shared/     共享类型与常量
docs/         规划、设计文档和 UI 原型
scripts/      本地启动、停止和基础服务脚本
```

## 技术栈

<table>
  <tr>
    <td><strong>Runtime</strong></td>
    <td>Node.js 20+, pnpm workspace, Turbo</td>
  </tr>
  <tr>
    <td><strong>Desktop</strong></td>
    <td>Electron 42, electron-builder</td>
  </tr>
  <tr>
    <td><strong>Frontend</strong></td>
    <td>React 19, Vite 7, React Query, Tailwind CSS, Radix UI</td>
  </tr>
  <tr>
    <td><strong>Backend</strong></td>
    <td>NestJS 11, Socket.IO, BullMQ</td>
  </tr>
  <tr>
    <td><strong>Data</strong></td>
    <td>Prisma, PostgreSQL, Redis</td>
  </tr>
</table>

## 桌面端 Workbench

桌面端主入口是 `/workbench`。应用在 Electron 中会自动进入桌面工作台；Web 环境仍保留传统路由。

### 主要视图

<table>
  <tr>
    <td width="24%"><strong>今日工作台</strong></td>
    <td>聚合高优先级消息、待审批、未读事件和 Agent 待确认操作。</td>
  </tr>
  <tr>
    <td><strong>仓库会话</strong></td>
    <td>单仓库消息流，支持 Markdown 消息、详情抽屉、审批按钮、Agent 入口、Webhook 状态和 Git 状态侧栏。</td>
  </tr>
  <tr>
    <td><strong>关注动态</strong></td>
    <td>未进入监控范围的仓库事件流，支持分页、收藏、忽略、搜索、噪音过滤和事件类型筛选。</td>
  </tr>
  <tr>
    <td><strong>仓库看板</strong></td>
    <td>复用原 Dashboard；从仓库会话进入时会自动带上当前仓库范围。</td>
  </tr>
  <tr>
    <td><strong>报告中心</strong></td>
    <td>复用原 Reports，用于生成和查看仓库报告。</td>
  </tr>
  <tr>
    <td><strong>Agent 会话</strong></td>
    <td>按仓库维护 Agent session，展示运行日志、工具调用、权限确认、停止/重试和 GitTree 发起任务入口。</td>
  </tr>
  <tr>
    <td><strong>设置</strong></td>
    <td>复用原 Settings，放在主工作流之外。</td>
  </tr>
</table>

### 桌面布局

```text
┌────────────┬────────────────────────┬──────────────────────────────────────┐
│ Primary    │ Repository Sessions    │ Main Workbench                        │
│ Rail       │ chat-only, collapsible  │ chat / feed / dashboard / reports     │
└────────────┴────────────────────────┴──────────────────────────────────────┘
```

### 导航约定

- 一级侧边栏是产品级导航，包含仓库会话、关注动态、Agent、设置和登录用户信息。
- 二级侧边栏只在聊天相关页面显示，即今日工作台和仓库会话。
- 二级侧边栏支持展开、收起和宽度拖拽。
- 二级侧边栏收起后保留仓库头像栏、未读提示、右键菜单和添加仓库入口。
- 非聊天页面不显示二级侧边栏，让 Dashboard、Reports、Settings 等页面获得完整宽度。

### 实时链路

桌面端默认不让浏览器渲染进程直接持有实时连接，而是使用：

```text
API /events Gateway
  → Electron 主进程 RealtimeBridge（socket.io client）
  → desktop:realtime IPC
  → Web 渲染层 React Query handler
```

同一套 handler 同时服务桌面 IPC 和 Web socket.io 回退，保证 Dashboard、仓库列表、会话消息、通知红点、审批、AI 分析和同步进度刷新口径一致。

本地有 clone 的仓库还会启用 `LocalGitWatcher`，直接监听本地 HEAD、分支和工作区变化，通过 `local.git.changed` 刷新 Git 状态面板；没有本地 clone 时继续依赖远端 webhook 事件。

### 自动隧道与 Webhook

桌面端是本地优先客户端，后端默认运行在 `127.0.0.1:3001`。为了让 GitHub 能回调本机 webhook，Electron 主进程会在登录后的实时连接阶段幂等启动自动隧道编排：

```text
WebhookProxy（仅放行 /webhooks）
  → cloudflared quick tunnel
  → 写入后端 API_URL
  → 批量重建 GitHub webhook
```

Settings 的集成页会显示隧道状态和公网 URL，并提供刷新隧道入口。详细设计与约束见 `docs/auto-tunnel-webhook.md`。

## 权限与消息分流约定

Workbench 中的仓库会话分为两类：

<table>
  <thead>
    <tr>
      <th>会话类型</th>
      <th>来源</th>
      <th>能力边界</th>
      <th>前端表现</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><strong>可操作仓库</strong></td>
      <td>当前 GitHub 账号具备 owner / admin / maintain / write 权限</td>
      <td>可以执行审批、PR、Agent、同步、报告和看板等工作流</td>
      <td>显示 Agent、审批、PR 操作入口</td>
    </tr>
    <tr>
      <td><strong>只读监控仓库</strong></td>
      <td>用户主动加入监控范围，但当前账号没有写权限或系统不允许修改</td>
      <td>只展示 Push、PR、Issue、Release、Security、通知和 AI 分析消息</td>
      <td>隐藏真实修改按钮，仅保留分析、查看、移出监控等操作</td>
    </tr>
  </tbody>
</table>

前端隐藏按钮不是安全边界。后端所有写操作接口必须校验当前用户对目标仓库的权限。

后端仓库相关接口应返回当前用户视角下的权限上下文：

```ts
type RepositoryAccessLevel =
  | 'owner'
  | 'admin'
  | 'maintain'
  | 'write'
  | 'triage'
  | 'read'
  | 'none';

interface RepositoryAccessContext {
  accessLevel: RepositoryAccessLevel;
  canOperate: boolean;
  isEditable: boolean;
  isMonitored: boolean;
}
```

Chat 仓库列表接口按分组字段区分可操作仓库和只读监控仓库：

```ts
type ChatRepositoryKind = 'editable' | 'monitored-readonly';

interface ChatRepository {
  id: string;
  fullName: string;
  kind: ChatRepositoryKind;
  canOperate: boolean;
  latestMessageAt: string | null;
  latestMessagePreview: string | null;
  unreadCount: number;
}
```

关注动态使用独立 Feed API，展示“已接入系统但未加入监控范围”的仓库消息，并支持事件类型过滤：

```text
全部 / Issue / PR / Push / Release / Security
```

## 本地环境

根目录需要 `.env`。基础配置示例：

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/repo_pulse
REDIS_URL=redis://localhost:6379
APP_PORT=3001
FRONTEND_URL=http://localhost:5173
API_URL=http://localhost:3001
```

桌面端可以使用本地 `GITHUB_TOKEN` 登录：

```env
DESKTOP_AUTH_MODE=env
GITHUB_TOKEN=ghp_xxx
```

如果使用 OAuth 登录，需要配置：

```env
GITHUB_CLIENT_ID=xxx
GITHUB_CLIENT_SECRET=xxx
DESKTOP_AUTH_MODE=oauth
```

## 安装依赖

```bash
corepack enable
pnpm install
pnpm --filter @repo-pulse/database db:generate
```

如果当前环境不方便全局启用 Corepack，可以继续使用本地 Corepack 目录：

```powershell
$env:COREPACK_HOME="$PWD\.corepack"
corepack pnpm install
corepack pnpm --filter @repo-pulse/database db:generate
```

## 基础服务

API 依赖 PostgreSQL 和 Redis。可以使用仓库内的 `docker-compose.yml`：

```bash
docker compose up -d
```

默认地址：

- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`

如果 Redis 未启动，API 仍可能启动，但 BullMQ 会持续输出连接错误。

## 启动开发环境

<table>
  <tr>
    <td width="33%"><strong>桌面端开发</strong></td>
    <td><code>pnpm dev:electron</code></td>
  </tr>
  <tr>
    <td><strong>Web 前端</strong></td>
    <td><code>pnpm dev:web</code></td>
  </tr>
  <tr>
    <td><strong>API 后端</strong></td>
    <td><code>pnpm dev:api</code></td>
  </tr>
  <tr>
    <td><strong>Electron 打包</strong></td>
    <td><code>pnpm package:electron</code></td>
  </tr>
</table>

### 一键启动桌面端

```bash
pnpm dev:electron
```

该命令会并行启动：

- API: `http://localhost:3001`
- Web/Vite: `http://127.0.0.1:5173`
- Electron 桌面应用
- Electron 主进程实时桥接和自动隧道编排（登录后触发）

桌面端默认使用：

```text
FRONTEND_URL=http://127.0.0.1:5173
DESKTOP_AUTH_MODE=env
```

如果需要验证远端 GitHub webhook 实时回调，首次运行前先准备 cloudflared 二进制：

```bash
pnpm --filter @repo-pulse/electron fetch:cloudflared
```

### 分别启动 Web 和 API

```bash
pnpm dev:api
pnpm dev:web
```

### Windows 本地脚本

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run-local.ps1
```

停止：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\stop-local.ps1
```

## 构建与打包

构建所有包：

```bash
pnpm build
```

构建 Electron：

```bash
pnpm build:electron
```

打包桌面应用：

```bash
pnpm package:electron
```

Electron 打包产物默认输出到：

```text
apps/electron/release/
```

## 常用验证命令

共享类型构建：

```bash
pnpm --filter @repo-pulse/shared build
```

前端类型检查：

```bash
pnpm --filter @repo-pulse/web typecheck
```

前端指定文件 lint：

```bash
pnpm --filter @repo-pulse/web exec eslint src/pages/DesktopWorkbench.tsx src/pages/Dashboard.tsx
```

后端构建：

```bash
pnpm --filter @repo-pulse/api build
```

Electron 类型检查：

```bash
pnpm --filter @repo-pulse/electron typecheck
```

## 当前重点待办

- **安全收口**：`/auth/me`、`/auth/session` 等用户信息接口需要只返回安全字段，避免 GitHub token / AI key 等敏感字段透传到前端。
- **桌面登出链路**：登出或切换用户时需要调用 `repoPulseDesktop.realtime.disconnect()`，避免主进程实时连接继续停留在旧用户房间。
- **Replay 合并刷新**：实时 replay 补发目前仍按 `event.created` 逐条触发查询失效；需要在 replay 窗口内合并刷新，避免大量补发时产生失效风暴。
- **订阅抖动优化**：仓库列表内容变化时，实时订阅可能出现全量 leave + join；需要按稳定 ID 签名做增量 diff。
- **打包运行策略**：Electron 打包产物目前包含 Web 资源和桌面壳，仍依赖本地 API 独立运行；生产形态需要明确 API 随 App 启动或外部部署方案。
- **Workbench 拆分**：`DesktopWorkbench.tsx` 已承载大量视图和业务逻辑，需要逐步拆成会话列表、消息流、Agent 面板、Watch Feed 等子组件。
- **测试 / lint 债务**：Web 全量 lint 仍有既有 `any` 和 hooks warnings；后端部分 auth/github 单测存在同跑污染，需要单独收敛。
- **IM 通道补完**：飞书 / 企业微信 / 钉钉等 IM 通道已有配置和框架，仍需补齐真实投递、验签和运行时验收。

## 设计原则

- 桌面端优先保证高密度、可扫描、低干扰。
- Chat 是处理工作，Watch Feed 是消费信息，两者不要混用真实操作能力。
- 旧 Web 页面尽量通过路由复用，不在 Workbench 阶段重写业务逻辑。
- 所有会修改仓库状态的操作必须以后端权限校验为准。
