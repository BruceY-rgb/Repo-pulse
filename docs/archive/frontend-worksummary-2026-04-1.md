# Repo-Pulse 前端工作总结（2026-04-1）

## 1. 本次工作目标

本轮在 03-31 基础上继续推进，核心目标为：

1. 稳定 Dashboard 视图并保留原始图表布局。
2. 完整补齐中英切换能力（不仅是工作台，还包括 Landing）。
3. 完成顶栏/侧边栏关键交互增强。
4. 对比并迁移 feature/websocket-gateway 分支的核心实时能力到当前主线。
5. 完成联调与冒烟验证，确保可运行。

---

## 2. 主要改动汇总

### 2.1 Dashboard 视图回归 + 能力融合

1. 以原始 Dashboard 视图结构为基准（保留 chart 与页面视觉布局）。
2. 在保留视图的前提下接入后续已实现的数据能力（Query 驱动）。
3. 未完全实现的块先保留接口与占位逻辑，不强行改动。

关键文件：

1. apps/web/src/pages/Dashboard.tsx

### 2.2 中英切换完善（Dashboard + Landing）

1. Dashboard 文案全面改为 i18n（标题、分区、错误、空态、风险标签、相对时间等）。
2. Landing 页面完成完整 i18n 化（导航、Hero、Features、Testimonials、CTA、Footer）。
3. 补齐 LanguageContext 对应中英文翻译键。

关键文件：

1. apps/web/src/pages/Dashboard.tsx
2. apps/web/src/pages/Landing.tsx
3. apps/web/src/contexts/LanguageContext.tsx

### 2.3 顶栏与侧边栏交互增强

1. 顶栏右侧图标补全 Tooltip 提示（GitHub / Docs / Support）。
2. 顶栏搜索栏可输入可提交，文案为 `search repositories, issues, PRs...`。
3. 搜索提交后跳转到 `/repositories?keyword=...`，仓库页自动读取参数并过滤。
4. 顶栏左侧 Logo 支持收起/展开侧边栏。
5. 侧边栏顶部 Logo 点击跳转发布页 `/landing`。

关键文件：

1. apps/web/src/components/ui-custom/Layout.tsx
2. apps/web/src/pages/Repositories.tsx
3. apps/web/src/contexts/LanguageContext.tsx

### 2.4 迁移 feature/websocket-gateway 分支核心能力

对比分支后采用“最小冲突迁移”，迁入实时主链路而不覆盖现有页面架构。

后端迁入：

1. 新增 Event WebSocket Gateway（鉴权、join/leave room、广播）。
2. Event 模块注册 gateway。
3. 事件创建时触发广播。

前端迁入：

1. 新增 websocket hook。
2. Dashboard 接入实时订阅。
3. Repositories / Notifications 接入实时订阅，并触发 Query 缓存失效自动刷新。

关键文件：

1. apps/api/src/modules/event/event.gateway.ts
2. apps/api/src/modules/event/event.module.ts
3. apps/api/src/modules/event/event.service.ts
4. apps/web/src/hooks/use-web-socket.ts
5. apps/web/src/pages/Dashboard.tsx
6. apps/web/src/pages/Repositories.tsx
7. apps/web/src/pages/Notifications.tsx

依赖变更：

1. apps/web/package.json
2. apps/api/package.json
3. pnpm-lock.yaml

---

## 3. 联调与验证结果

### 3.1 服务可用性

1. 前端可访问：`http://localhost:5173`
2. 后端可访问：`http://localhost:3001`
3. OAuth 跳转可用：`/auth/github` 返回 302
4. Swagger 可访问：`/docs` 返回 200
5. Socket 握手端点可用：`/socket.io/?EIO=4&transport=polling` 返回 200

### 3.2 编译与类型检查

1. `@repo-pulse/web` typecheck 通过。
2. `@repo-pulse/api` typecheck 通过。

### 3.3 冒烟结论

1. 登录、路由、受保护接口状态码符合预期。
2. Dashboard/Repositories/Notifications 的实时订阅链路已接通（通过缓存失效触发自动刷新）。

---

## 4. 与 03-31 总结相比的增量

本文件是 04-1 的增量总结，主要新增点：

1. Landing 完整 i18n（此前是待收敛项）。
2. 顶栏搜索由展示改为可用功能。
3. 顶栏/侧边栏 Logo 交互行为按产品预期落地。
4. feature/websocket-gateway 的核心实时能力迁入当前主线并联调通过。

---

## 5. 现阶段状态与后续建议

1. 当前主线已经具备“静态数据视图 + 实时更新能力”的基本闭环。
2. 建议下一步增加 websocket 端到端测试用例（join room、event push、缓存刷新）。
3. 若要继续收敛 style-guide，可针对 Landing 的视觉规范做第二轮统一（保持当前 i18n 成果不回退）。
