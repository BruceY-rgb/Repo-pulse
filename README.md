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
- **复用旧功能**：Dashboard、Reports、Repositories、Settings 继续复用原 Web 页面，通过 Workbench 路由嵌入桌面工作流。

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
    <td>单仓库消息流，支持 Markdown 消息、详情抽屉、审批按钮、Agent 入口和右键操作。</td>
  </tr>
  <tr>
    <td><strong>关注动态</strong></td>
    <td>未进入监控范围的仓库事件流，适合浏览 star / follow / 接入系统的仓库动态。</td>
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
    <td>后续用于承载每个仓库独立的 Agent session、run、step、log 和确认流。</td>
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

建议后端统一返回当前用户视角下的仓库权限：

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

建议 Chat 仓库列表接口直接返回分组或分组字段：

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

关注动态应使用独立 Feed API，展示“已接入系统但未加入监控范围”的仓库消息，并支持事件类型过滤：

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

桌面端默认使用：

```text
FRONTEND_URL=http://127.0.0.1:5173
DESKTOP_AUTH_MODE=env
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

- 后端补齐仓库权限识别，返回 `canOperate`、`isEditable`、`isMonitored`。
- 后端统一 Conversation Message API，减少前端临时聚合 events、approvals、notifications。
- 前端二级侧边栏按“可操作仓库 / 只读监控仓库”分组。
- 前端根据 `canOperate` 控制审批、PR 和 Agent 操作入口。
- 后端为所有写操作接口增加仓库权限校验。
- Watch Feed 接入真实 Feed API，并支持 Issue、PR、Push、Release、Security 过滤。
- Agent 会话接入真实 session、run、step、log 和确认后执行流程。

## 设计原则

- 桌面端优先保证高密度、可扫描、低干扰。
- Chat 是处理工作，Watch Feed 是消费信息，两者不要混用真实操作能力。
- 旧 Web 页面尽量通过路由复用，不在 Workbench 阶段重写业务逻辑。
- 所有会修改仓库状态的操作必须以后端权限校验为准。
