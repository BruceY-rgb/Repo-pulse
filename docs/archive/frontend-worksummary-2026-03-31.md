# Repo-Pulse 前端工作总结（2026-03-31）

## 1. 本次目标

本次工作包含环境可运行化和前端主线交付两部分，重点是把前端从 Demo 形态升级为可联调、可验收、可继续迭代的结构化实现：

1. 本地开发环境可稳定运行（含无 Docker 兜底）。
2. 前端路由、鉴权、数据请求体系重构为 Query 驱动。
3. 完成登录、仓库、通知、仪表盘等核心页面的联调闭环。
4. 修复验收中发现的一系列交互和稳定性问题。

---

## 2. 主要改动总览

### 2.1 环境与工程化

1. 新增本地基础服务脚本：scripts/conda-services.sh
2. 根脚本增加一键命令：package.json
3. 忽略本地服务数据目录：.gitignore（新增 .dev-services/）

交付效果：在 Docker 拉取失败场景下，依旧可通过 conda + 本地 PostgreSQL/Redis 跑通开发链路。

### 2.2 应用入口与路由

1. 全局 Provider 接入：apps/web/src/main.tsx
2. 路由体系重构：apps/web/src/App.tsx
3. 登录守卫改造：apps/web/src/components/ProtectedRoute.tsx
4. 应用骨架重构：apps/web/src/components/ui-custom/Layout.tsx

当前路由策略：

1. 默认入口 / -> /landing（发布页）。
2. 公开路由：/landing、/login、/auth/callback。
3. 受保护路由：/dashboard、/repositories、/analysis、/notifications、/reports、/settings、/approvals。

### 2.3 API 客户端与 Query 基础设施

1. Axios 客户端支持 Cookie 鉴权与 401 自动刷新：apps/web/src/services/api-client.ts
2. 认证服务封装：apps/web/src/services/auth.service.ts
3. QueryClient 统一入口：apps/web/src/lib/query-client.tsx
4. 新增统一 Query Hook 封装：apps/web/src/lib/query-hooks.ts

统一收益：

1. 页面层不再重复写 try/catch。
2. API 错误结构统一，便于显示细粒度提示。

### 2.4 认证链路

1. 登录页重写：apps/web/src/pages/Login.tsx
2. OAuth 回调页重写：apps/web/src/pages/AuthCallback.tsx
3. 认证查询与 mutation：apps/web/src/hooks/queries/use-auth-queries.ts

新增能力：

1. GitHub OAuth 登录。
2. 邮箱密码登录（恢复 Demo 阶段能力并纳入统一服务层）。
3. 登录失败细粒度提示：
   - 401：账号或密码错误
   - 5xx：服务异常
   - 无状态码：网络异常
   - 其他：后端 message 或通用错误

### 2.5 页面数据化改造

1. 仪表盘 Query 化：apps/web/src/hooks/queries/use-dashboard-queries.ts + apps/web/src/pages/Dashboard.tsx
2. 仓库页 Query 化：apps/web/src/hooks/queries/use-repository-queries.ts + apps/web/src/pages/Repositories.tsx
3. 通知页 Query 化：apps/web/src/hooks/queries/use-notification-queries.ts + apps/web/src/pages/Notifications.tsx

补充修复：apps/web/src/services/notification.service.ts 增加 readAt 类型，消除 TS2339。

### 2.6 仓库接入与状态管理修复

这是验收阶段最关键的一组修复。

1. 修复“添加仓库按钮点击不弹窗”：apps/web/src/pages/Repositories.tsx
2. 新增仓库启用/停用能力：
   - apps/web/src/hooks/queries/use-repository-queries.ts
   - apps/web/src/pages/Repositories.tsx
3. 添加弹窗支持“已停用仓库一键启用”：apps/web/src/pages/Repositories.tsx
4. 仓库状态变更后同步失效仪表盘仓库缓存：apps/web/src/pages/Repositories.tsx
5. 修复类型定义：
   - 新增 UpdateRepositoryDto：apps/web/src/types/api.ts
   - repositoryService.update 改用 UpdateRepositoryDto：apps/web/src/services/repository.service.ts
   - 删除未使用变量 monitoredSet：apps/web/src/pages/Repositories.tsx

### 2.7 仪表盘稳定性修复

1. 仪表盘仓库数据改为先取全量再本地筛选 active，避免布尔查询参数兼容问题：apps/web/src/hooks/queries/use-dashboard-queries.ts
2. 统计从 events 列表聚合，避免 stats 接口不稳定导致整页报错：apps/web/src/hooks/queries/use-dashboard-queries.ts
3. 三个关键查询加入失败兜底（空数组/空分页/0 统计），避免底部错误条持续触发：apps/web/src/hooks/queries/use-dashboard-queries.ts
4. 底部错误条显示条件收窄，仅在有仓库且关键请求确实失败时触发：apps/web/src/pages/Dashboard.tsx

### 2.8 国际化补齐

文件：apps/web/src/contexts/LanguageContext.tsx

补齐模块：

1. auth（登录表单、错误文案、OAuth 提示）
2. dashboard（卡片、图表、错误、空态）
3. repositories（新增启用/停用、弹窗按钮）
4. notifications（列表、设置、按钮、错误）

### 2.9 顶栏与侧边栏交互增强（新增）

核心文件：apps/web/src/components/ui-custom/Layout.tsx

本轮按验收反馈补充了以下交互：

1. 运行时语言切换入口加入当前工作台顶栏（此前仅旧 Header 有入口）。
2. 顶栏右侧三个图标按钮新增悬浮文字提示（GitHub、Docs、Support）。
3. 顶栏搜索栏改为可输入可提交：
   - 占位文案：search repositories, issues, PRs...
   - 回车后跳转到 /repositories?keyword=xxx
   - 仓库页接收 query 参数并自动过滤列表。
4. 顶栏左侧 Logo 点击行为改为收起/展开侧边栏（桌面端）。
5. 侧边栏顶部 Logo 点击跳转发布页 /landing。

关联文件：

1. apps/web/src/pages/Repositories.tsx（接收 keyword 查询参数）
2. apps/web/src/contexts/LanguageContext.tsx（新增顶栏交互相关文案）

---

## 3. 关键问题与处理结果

1. Docker Hub 网络失败导致服务拉起困难。
   - 处理：落地 conda + 本地 PostgreSQL/Redis 脚本化方案。

2. OAuth 404/跳转异常。
   - 处理：修正 .env OAuth 配置并重启 API；验证 /auth/github 返回 302。

3. 仓库已添加但仪表盘显示无仓库。
   - 处理：补齐仓库启停逻辑、缓存失效、仪表盘 active 过滤稳定化。

4. 仪表盘底部持续错误条。
   - 处理：改查询来源 + 收窄错误判定 + 失败兜底数据。

5. 登录页缺失账号密码方式。
   - 处理：恢复邮箱密码登录并统一到 Query mutation + 细粒度错误提示。

6. 当前工作台顶栏缺少语言入口与图标提示，且搜索栏不可用。
   - 处理：在实际使用的 Layout 顶栏补齐语言菜单、Tooltip 说明与可提交搜索功能。

7. 侧边栏与 Logo 行为不符合预期。
   - 处理：顶栏 Logo 支持收起侧边栏；侧边栏 Logo 跳转到发布页。

---

## 4. 前端启动与验收流程

### 4.1 环境准备

1. conda activate repo-pulse
2. pnpm install
3. 确认 .env 已配置（尤其 GITHUB_CLIENT_ID、GITHUB_CLIENT_SECRET、FRONTEND_URL）

### 4.2 启动基础服务

1. pnpm services:start
2. pnpm services:status

### 4.3 启动 API 与 Web

1. conda run --no-capture-output -n repo-pulse pnpm dev:api
2. conda run --no-capture-output -n repo-pulse pnpm dev:web

访问地址：

1. Web：http://localhost:5173
2. API：http://localhost:3001

### 4.4 验收建议路径

1. 打开 /，确认默认进入 /landing（发布页）。
2. 进入 /login，验证邮箱密码与 GitHub OAuth 两条登录链路。
3. 在 /repositories 添加仓库，验证弹窗正常打开。
4. 对仓库执行停用/启用，观察 /dashboard 是否同步变化。
5. 检查 /dashboard 底部是否还出现持续错误条。
6. 在顶栏切换语言（English/中文）并验证页面文案切换。
7. 将鼠标悬浮在顶栏右侧 GitHub/Docs/Support 图标，确认出现提示文字。
8. 在顶栏搜索栏输入关键词并回车，确认跳转到仓库页并自动过滤。
9. 点击顶栏左侧 Logo，确认侧边栏可收起/展开。
10. 点击侧边栏顶部 Logo，确认跳转到 /landing。

---

## 5. 当前交付状态

1. 前端主流程已可用：发布页 -> 登录 -> 仓库接入 -> 仪表盘展示。
2. 关键体验问题已处理：登录方式、仓库启停、弹窗触发、仪表盘误报错、顶栏交互缺失。
3. 代码可编译：相关变更均通过 web typecheck。

---

## 6. 后续建议

1. 为仪表盘和仓库页补 E2E 用例，覆盖“添加-停用-启用-仪表盘同步”链路。
2. 后端补充 repository query 参数的严格布尔解析与单测，减少前端兜底成本。
3. 将 API/Web/Services 一键并行启动固化为单命令，提升团队联调效率。

---

## 7. 三项要求复检结果（a/b/c）

### 7.1 a. 基础骨架与路由

结论：已完成。

检查依据：

1. 路由结构完整且分为公开/受保护两层：apps/web/src/App.tsx
2. 工作台采用侧边栏 + 主内容区布局：apps/web/src/components/ui-custom/Layout.tsx
3. 受保护路由由鉴权守卫控制：apps/web/src/components/ProtectedRoute.tsx

### 7.2 b. 登录与 API 层

结论：已完成。

检查依据：

1. GitHub OAuth 登录入口和回调页已落地：
   - apps/web/src/pages/Login.tsx
   - apps/web/src/pages/AuthCallback.tsx
2. TanStack Query 基础封装已建立：apps/web/src/lib/query-hooks.ts
3. 认证查询/变更逻辑已统一：apps/web/src/hooks/queries/use-auth-queries.ts
4. API 客户端已支持 Cookie 鉴权、401 刷新、错误标准化：apps/web/src/services/api-client.ts

### 7.3 c. 样式约束应用（frontend-style-guide.md）

结论：主体完成，但尚未达到“全量严格 100% 合规”，存在明确收敛项。

已满足的关键点：

1. 核心功能页面（Dashboard/Repositories/Notifications/Login）大部分使用 shadcn/ui 组件。
2. 主干布局和交互大量采用语义色类（bg-background、text-foreground、border-border 等）。
3. 加载状态使用 Skeleton，未使用 alert() 等不规范通知方式。
4. 主要新增交互文案已接入 i18n（尤其工作台、登录、仓库、通知）。

待收敛风险（本次复检发现）：

1. Landing 页面存在大量硬编码英文文案，未完全走 i18n：apps/web/src/pages/Landing.tsx
2. Landing 页面存在较多非规范视觉表达（如 purple 系渐变、硬编码色值/色系），与当前 style guide 的橙色主色方向不一致：apps/web/src/pages/Landing.tsx
3. 项目内仍有历史组件/样式写法与“严格禁止项”存在偏差，需要专项统一清理（建议以 Landing 为优先）。

建议执行策略：

1. 先完成 Landing 页面 i18n 化（文案抽离）。
2. 再做颜色与视觉规范对齐（统一语义色、橙色强调、去除不合规渐变）。
3. 最后进行一次基于 frontend-style-guide 的逐条审计清单打勾。
