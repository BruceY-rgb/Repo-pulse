# Known Issues — 已知问题追踪

**最后更新**：2026-05-28
**维护人员**：测试团队（@yhyhyhy）

---

## 问题列表

| ID | 严重度 | 模块 | 描述 | 状态 | 发现版本 | 计划修复 |
|----|-------|------|------|------|---------|---------|
| [#001](#001) | Medium | IM/飞书 | 飞书 IM 消息实际投递未实装，框架已建但 send 方法返回空 | Open | 0.4.0 | Phase 5 |
| [#002](#002) | Low | 前端 | DesktopWorkbench.tsx 单文件超 2500 行，可维护性差 | Open | 0.4.0 | 重构期 |
| [#003](#003) | Medium | 测试 | 分支覆盖率 50%，低于目标 70% | In Progress | 0.4.0 | 0.4.1 |
| [#004](#004) | Low | 测试 | feat/authority 合并后行覆盖率从 81% 降至 66%（新增业务代码未补测试） | In Progress | 0.4.1 | 0.4.1 |
| [#005](#005) | Low | 后端 | `resolveRepositoryIds` 逻辑在多个 Service 中重复，应抽取为公共工具 | Open | 0.3.0 | 重构期 |
| [#006](#006) | Low | 后端 | 部分 Service 中直接 `new PrismaClient()` 而非通过依赖注入，可能引发连接池问题 | Open | 0.2.0 | 重构期 |
| [#007](#007) | Medium | 前端 | 部分页面仍使用 `useEffect + useState` 获取数据，违反 React Query 规范 | Open | 0.3.0 | 0.5.0 |
| [#008](#008) | Low | 前端 | 部分组件存在硬编码十六进制颜色，违反样式规范（应使用 CSS 变量） | Open | 0.2.0 | 0.5.0 |
| [#009](#009) | Low | 后端 | 缺少 `/health` 健康检查端点，影响容器化部署的就绪探测 | Open | 0.1.0 | 0.5.0 |
| [#010](#010) | Low | 后端 | IM 通道 Webhook 验证仅做简单字符串比对，未使用 HMAC（与 GitHub Webhook 安全标准不一致） | Open | 0.4.0 | Phase 5 |
| [#011](#011) | Low | CI/CD | E2E 测试覆盖率未上报到 Codecov（仅上报单元测试） | Open | 0.4.1 | 0.4.2 |
| [#012](#012) | Low | 前端 | api-client.ts 刷新令牌拦截器在并发请求时可能触发双重刷新 | Open | 0.1.0 | 0.5.0 |

---

## 详细说明

### #001
**飞书 IM 消息投递未实装**

- **文件**：`apps/api/src/modules/im/im.service.ts`
- **现象**：`sendFeishuMessage()` 框架存在但实际发送逻辑占位，消息不会到达飞书
- **影响**：飞书通知功能对用户不可用
- **临时方案**：使用 Email 或 Webhook 通知渠道
- **修复方向**：接入飞书 Bot SDK，实现 `sendMessage` 接口

### #002
**DesktopWorkbench.tsx 超大文件**

- **文件**：`apps/web/src/pages/DesktopWorkbench.tsx`（约 2500 行）
- **现象**：单文件过大，IDE 响应慢，代码审查困难
- **影响**：开发效率，不影响功能
- **修复方向**：拆分为 `SessionList`、`MessageFeed`、`EventDetail` 等子组件

### #003 / #004
**测试覆盖率低于目标**

- **当前状态**：行覆盖率 ~66%，分支覆盖率 ~50%
- **目标**：行覆盖率 ≥ 70%，分支覆盖率 ≥ 55%
- **正在处理**：本次测试补充（`repository-access.spec.ts`、`filter.service.extra.spec.ts` 等）
- **根因**：`feat/authority` 合并引入大量权限相关新代码，对应单元测试滞后

### #005
**resolveRepositoryIds 逻辑重复**

- **涉及文件**：`EventService`、`ApprovalService`、`DashboardService`、`NotificationService`
- **现象**：各 Service 都有类似的"从 userRepository 查当前用户可访问仓库 ID"逻辑
- **修复方向**：提取到 `apps/api/src/common/utils/repository-access.ts` 作为公共函数

### #006
**PrismaClient 直接实例化**

- **涉及文件**：部分模块中 `new PrismaClient()`
- **推荐做法**：通过 NestJS DI 注入 `PrismaService`
- **潜在影响**：连接池不受统一管理，高并发下可能耗尽连接

### #009
**缺少健康检查端点**

- **影响**：Docker/K8s 就绪探测无法使用标准 `/health` 接口
- **修复**：引入 `@nestjs/terminus`，实现 `HealthModule`

---

## 缺陷管理流程

1. **发现** → 在此文件追加一行，分配 ID，标记 Open
2. **确认** → 复现后更新严重度和计划修复版本
3. **修复中** → 状态改为 In Progress，记录 PR 号
4. **已修复** → 状态改为 Fixed，记录修复版本，移入 CHANGELOG 对应版本的 Fixed 条目
5. **关闭** → 验证通过后从活跃列表移除（保留历史记录）

**严重度定义**：
- **Critical**：核心功能不可用，无临时方案
- **High**：核心功能受损，有临时方案
- **Medium**：次要功能不可用或体验明显下降
- **Low**：轻微问题、优化建议、技术债务
