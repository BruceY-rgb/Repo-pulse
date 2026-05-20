# Workbench 接口改动说明

## 一、数据库重置命令

### 方案 A：只重建库表，保留 Docker 数据卷

适用于 PostgreSQL 和 Redis 已经通过 Docker 启动，只想重新生成表结构和本地数据的场景。

```powershell
docker compose up -d
$env:COREPACK_HOME="F:\codes\Repo-pulse\.corepack"
$env:DATABASE_URL="postgresql://postgres:postgres@localhost:5432/repo_pulse"
corepack pnpm install
corepack pnpm --filter @repo-pulse/database db:generate
corepack pnpm --filter @repo-pulse/database db:migrate
corepack pnpm --filter @repo-pulse/database build
```

### 方案 B：彻底重置，包括 Docker 数据卷

适用于你想清空本地数据库、Redis 数据并从零开始的场景。

```powershell
docker compose down -v
docker compose up -d
$env:COREPACK_HOME="F:\codes\Repo-pulse\.corepack"
$env:DATABASE_URL="postgresql://postgres:postgres@localhost:5432/repo_pulse"
corepack pnpm install
corepack pnpm --filter @repo-pulse/database db:generate
corepack pnpm --filter @repo-pulse/database db:migrate
corepack pnpm --filter @repo-pulse/database build
```

## 二、项目启动命令

### 一键启动本地环境

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run-local.ps1
```

启动后地址如下：

- API：`http://127.0.0.1:3001`
- Web 预览：`http://127.0.0.1:4173`

停止命令：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\stop-local.ps1
```

### 分开启动开发环境

先启动基础依赖和后端：

```powershell
docker compose up -d
$env:COREPACK_HOME="F:\codes\Repo-pulse\.corepack"
corepack pnpm install
corepack pnpm --filter @repo-pulse/database db:generate
corepack pnpm --filter @repo-pulse/database build
corepack pnpm --filter @repo-pulse/api dev
```

再开一个终端启动前端：

```powershell
$env:COREPACK_HOME="F:\codes\Repo-pulse\.corepack"
corepack pnpm --filter @repo-pulse/web exec vite --host 127.0.0.1
```

## 三、后端接口改动总览

## 1. 仓库权限模型

后端现在会从“当前用户视角”返回仓库权限信息：

```ts
type RepositoryAccessLevel =
  | 'owner'
  | 'admin'
  | 'maintain'
  | 'write'
  | 'triage'
  | 'read'
  | 'none';

interface Repository {
  id: string;
  fullName: string;
  url: string;
  defaultBranch: string;
  accessLevel: RepositoryAccessLevel;
  canOperate: boolean;
  isMonitored: boolean;
  isEditable: boolean;
}
```

判定规则：

- `isEditable = accessLevel in ['owner', 'admin', 'maintain', 'write']`
- `canOperate = isEditable`
- `isMonitored = repository.id 在 user.preferences.monitoringScope.repositoryIds 中`

受影响接口：

- `GET /repositories`
- `GET /repositories/:id`
- `GET /repositories/my-repos`
- `GET /repositories/starred`

## 2. Workbench Chat 仓库接口

### `GET /workbench/chat/repositories`

返回按类型分组后的仓库列表：

```ts
type ChatRepositoryKind = 'editable' | 'monitored-readonly';

interface ChatRepository {
  repository: Repository;
  kind: ChatRepositoryKind;
  latestMessageAt: string | null;
  latestMessagePreview: string | null;
  unreadCount: number;
  highRiskCount: number;
}

interface ChatRepositoriesResponse {
  editableRepositories: ChatRepository[];
  monitoredRepositories: ChatRepository[];
}
```

排序规则：

- 有消息的仓库排前面
- 按 `latestMessageAt desc` 排序
- 没有消息的仓库排后面
- 可编辑仓库和只读监控仓库分组展示，不混排

## 3. Workbench Chat 消息接口

### `GET /workbench/chat/repositories/:id/messages`

返回会话消息列表：

```ts
interface MessageAction {
  key: string;
  label: string;
  method: 'POST';
  endpoint: string;
  requiresConfirmation: boolean;
}

interface ConversationMessage {
  id: string;
  repositoryId: string;
  repositoryAccessLevel: RepositoryAccessLevel;
  repositoryCanOperate: boolean;
  type: 'issue' | 'pull_request' | 'push' | 'release' | 'security' | 'approval' | 'agent' | 'notification';
  title: string;
  body: string;
  author: string;
  authorAvatar?: string;
  createdAt: string;
  externalUrl?: string;
  actions?: MessageAction[];
}
```

当前后端行为：

- 只有 `repositoryCanOperate = true` 的仓库，才会返回真实 `actions`
- 当前已支持的消息动作主要是待审批消息：
  - `POST /approvals/:id/approve`
  - `POST /approvals/:id/reject`

## 4. Watch Feed 接口

### `GET /workbench/watch-feed?type=issue,pr,push&cursor=xxx&limit=20`

返回“已接入系统、但当前未进入 Chat 分组展示”的仓库动态。

```ts
interface WatchFeedItem {
  id: string;
  repositoryId: string;
  repositoryFullName: string;
  repositoryAvatar?: string;
  type: 'issue' | 'pull_request' | 'push' | 'release' | 'security';
  title: string;
  summary: string;
  author: string;
  authorAvatar?: string;
  occurredAt: string;
  externalUrl?: string;
  aiInsight?: string;
  canAddToMonitoring: boolean;
}

interface WatchFeedResponse {
  items: WatchFeedItem[];
  nextCursor: string | null;
}
```

补充说明：

- `cursor` 是后端生成的游标，前端直接透传即可
- 当前支持的类型过滤有：`issue`、`pr`、`pull_request`、`push`、`release`
- `security` 先保留在接口契约里，当前后端还没有独立安全事件源

## 5. 后端权限校验

前端隐藏按钮只是体验控制，不是安全边界。后端已对真实写操作增加权限拦截。

当前已纳入权限校验的接口包括：

- `PATCH /repositories/:id`
- `DELETE /repositories/:id`
- `POST /repositories/:id/sync`
- `POST /reports/generate`
- `POST /approvals/:id/approve`
- `POST /approvals/:id/reject`
- `POST /approvals/:id/edit`

无权限时统一返回：

```json
{
  "code": "REPOSITORY_OPERATION_FORBIDDEN",
  "message": "当前账号没有该仓库的操作权限"
}
```

## 四、前端联调建议

- 前端统一使用 `repository.canOperate` 判断是否展示真实操作入口。
- Workbench 左侧仓库列表直接使用：
  - `editableRepositories`
  - `monitoredRepositories`
- 消息卡片里的操作按钮只根据后端返回的 `actions` 渲染，不要自行推断。
- Watch Feed 应视为“发现和浏览”流，不应承载真实仓库修改操作。
