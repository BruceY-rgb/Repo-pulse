# Repo-Pulse

Repo-Pulse 是一个用于 AI 辅助仓库监控的平台 Monorepo，包含：

- `apps/web`：基于 Vite + React 的前端
- `apps/api`：基于 NestJS 的后端
- `packages/database`：Prisma Client 与数据库 schema
- `packages/shared`：共享常量与类型
- `packages/ai-sdk`：AI Provider 抽象层

## 技术栈

- Node.js 20+
- pnpm workspace
- Turbo
- React 19 + Vite 7
- NestJS 11
- Prisma + PostgreSQL
- BullMQ + Redis

## 项目结构

```text
apps/
  api/        NestJS API
  web/        React 前端
packages/
  ai-sdk/     AI Provider 适配层
  database/   Prisma schema 与客户端导出
  shared/     共享类型与常量
docs/         规划与设计文档
```

## 本地环境

项目依赖根目录下的 `.env` 文件。当前仓库中已经提供了本地开发所需的默认配置：

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/repo_pulse
REDIS_URL=redis://localhost:6379
APP_PORT=3001
FRONTEND_URL=http://localhost:5173
API_URL=http://localhost:3001
```

如果需要重新创建，可使用 `.env.example` 作为模板。

## 安装依赖

如果系统没有全局安装 `pnpm`，可以通过 Corepack 使用：

```powershell
$env:COREPACK_HOME="$PWD\.corepack"
corepack pnpm install
```

然后生成 Prisma Client：

```powershell
$env:COREPACK_HOME="$PWD\.corepack"
corepack pnpm --filter @repo-pulse/database db:generate
```

## 构建

本地验证通过的分包构建顺序如下：

```powershell
$env:COREPACK_HOME="$PWD\.corepack"
corepack pnpm --filter @repo-pulse/shared build
corepack pnpm --filter @repo-pulse/ai-sdk build
corepack pnpm --filter @repo-pulse/database build
corepack pnpm --filter @repo-pulse/api build
corepack pnpm --filter @repo-pulse/web build
```

说明：

- 在当前环境下，`turbo run build` 可能无法直接工作，因为 `pnpm` 未全局安装时，Turbo 可能无法解析 package manager 可执行文件。
- 后端在 TypeScript 编译前需要先执行 `prisma generate`，否则无法正确解析 Prisma 的 model 和 enum 类型。

## 运行

### 后端

```powershell
$env:COREPACK_HOME="$PWD\.corepack"
corepack pnpm --filter @repo-pulse/api dev
```

默认本地地址：

- API：`http://localhost:3001`
- Swagger：`http://localhost:3001/docs`

### 前端

开发模式：

```powershell
$env:COREPACK_HOME="$PWD\.corepack"
corepack pnpm --filter @repo-pulse/web dev
```

预览生产构建：

```powershell
$env:COREPACK_HOME="$PWD\.corepack"
corepack pnpm --filter @repo-pulse/web preview -- --host 127.0.0.1 --port 4173
```

默认前端地址：

- `http://localhost:5173`

## 基础依赖服务

后端依赖 PostgreSQL 和 Redis。仓库中包含 `docker-compose.yml`，可用于本地启动这些基础服务：

```powershell
docker compose up -d
```

服务默认地址：

- PostgreSQL：`localhost:5432`
- Redis：`localhost:6379`

如果没有 Redis，API 仍然可以启动并监听 `3001`，但 BullMQ 会持续输出 `ECONNREFUSED` 错误日志。

## OAuth 行为

本地开发时，GitHub OAuth 现在是可选项：

- 如果未配置 `GITHUB_CLIENT_ID` 和 `GITHUB_CLIENT_SECRET`，API 仍然可以启动。
- `/auth/github` 和 `/auth/github/callback` 在未配置相关变量时会返回 `503`。

## 当前仓库已验证内容

在当前工作区中，以下内容已经验证通过：

- `packages/shared`、`packages/ai-sdk`、`packages/database` 可以成功构建
- `apps/api` 可以成功构建
- `apps/web` 可以成功构建
- `apps/api` 可以启动并监听 `3001`
- `apps/web` 的 preview 可以成功启动

当前机器上的限制：

- 没有安装 `docker`，因此无法通过 `docker-compose.yml` 启动 PostgreSQL 和 Redis
- 本地 `6379` 端口不可用时，Redis 相关队列会持续报连接错误

## 故障排查

- `pnpm` 未找到：

  请使用 `corepack pnpm ...`，不要直接使用 `pnpm ...`

- `@repo-pulse/database` 中缺少 Prisma model 类型：

  请执行 `corepack pnpm --filter @repo-pulse/database db:generate`

- API 因 OAuth 配置启动失败：

  请确认你使用的是当前仓库中的最新代码；当前版本后端已兼容本地缺少 GitHub OAuth 环境变量的情况

- 前端 preview 自动切换到其他端口：

  说明指定端口已被占用，Vite 会自动选择下一个可用端口
