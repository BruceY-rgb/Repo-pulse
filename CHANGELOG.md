# Changelog

本文档按 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/) 规范记录所有重要变更。
版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

---

## [0.0.0] — 2026-06-08 — Desktop Workbench Release

### Added
- Electron 桌面端第一版 release：Workbench 会话、Watch Feed、Agent 会话、实时 IPC、本地 Git watcher、自动隧道和 webhook 自动重建
- 系统测试补充：性能测试（api-benchmark）、稳定性测试（fault-tolerance、concurrency）
- 新增 E2E 测试：`dashboard.e2e-spec.ts`、`filter-rules.e2e-spec.ts`
- 新增单元测试：`repository-access.spec.ts`、`filter.service.extra.spec.ts`
- Jest 覆盖率强制阈值配置（lines/functions/branches/statements）
- 性能测试专用 Jest 配置（`jest-perf.json`）
- `test:perf` 和 `test:stability` npm scripts
- 系统测试打分报告文档

### Fixed
- 覆盖率阈值设为当前可达水平，CI 不因新增阈值失败

---

## [0.4.1] — 2026-05-23

### Fixed
- 修正覆盖率记录，feat/authority 合并后约 66%
- 补充单元测试覆盖率记录与 feat/authority E2E 变更说明
- 修复 E2E 测试数据以适配 feat/authority 变更
- 修复单元测试以匹配 feat/authority 变更

---

## [0.4.0] — 2026-05 — Phase 4 团队协同与通知

### Added
- **Electron 桌面端**：将项目转化为完整的 Electron 桌面应用（`apps/electron/`）
  - contextIsolation + preload bridge 安全架构
  - HashRouter 适配 `file://` 协议
  - 桌面工作台（`DesktopWorkbench`）：仓库会话、消息流、Markdown 渲染
- **飞书 IM 集成**：飞书机器人配置、连接管理、WebSocket 桥接框架、消息卡片格式化
- **审批流程**（Approval 模块）：PENDING → APPROVED / REJECTED / EDITED 状态机
- **仓库权限管理**（feat/authority）：
  - `RepositoryAccessLevel`（OWNER/ADMIN/MAINTAIN/WRITE/TRIAGE/READ/NONE）
  - `assertUserCanAccessRepository` / `assertUserCanEditRepository` 工具函数
  - 仓库操作权限分离（可编辑 / 只读监控）
- **Codecov 集成**：单元测试覆盖率自动上报
- **报告生成**：周期/安全/团队报告、PDF 导出
- **仪表板多分支过滤**：按分支范围过滤事件统计
- 通知 Markdown 渲染、报告与设置对接 API

### Fixed
- Webhook 端点统一返回 200（原 201）
- E2E 测试 webhook-flow spy 累积问题
- 静音评论噪音、机器人消息过滤
- 仪表板空活动状态展示

---

## [0.3.0] — Phase 3 AI 核心引擎

### Added
- **AI 抽象层**（`packages/ai-sdk/`）：
  - 统一 `AIProvider` 接口
  - 内置：OpenAI、Anthropic、Ollama、OpenAICompatible、Gemini
  - 国产 LLM 预设：DeepSeek、Moonshot、Zhipu
  - 工厂函数 `createProvider(config)` 动态实例化
- **AI 分析工作流**：
  - `AIAnalysisProcessor`：BullMQ 消费者，调用 ai-sdk，写 AIAnalysis 记录
  - `AIEventNormalizer`：事件规范化、敏感信息脱敏
  - 异步重试（指数退避，最多 3 次）
- **SSE 流式输出**：AI 分析结果实时推送
- AI 分析只针对已监控仓库触发

---

## [0.2.0] — Phase 2 实时数据流

### Added
- **WebSocket Gateway**（Socket.io）：`EventGateway` 实时广播新事件
- **BullMQ 队列**：`event-processing` + `ai-analysis` 双队列异步解耦
- **React Query 迁移**：前端数据获取统一使用 TanStack Query
- 仓库同步（`SyncService`）：拉取 GitHub/GitLab 仓库列表，同步权限级别
- 事件去重机制：基于 `externalId` 防止重复入库
- 过滤规则引擎（`FilterService`）：INCLUDE / EXCLUDE / TAG 动作

---

## [0.1.0] — Phase 1 基础设施加固

### Added
- **环境变量分离**：开发/生产/测试环境独立配置
- **HttpOnly Cookie 认证**：JWT access_token + refresh_token，防 XSS
- **GitHub OAuth 2.0**：`/auth/github` → 回调 → Cookie
- **Webhook HMAC 验签**：SHA256 签名，按仓库粒度取 secret，`timingSafeEqual` 防时序攻击
- **全局 NestJS 管道**：
  - `TransformInterceptor`：统一响应包装 `{ code, data, message }`
  - `HttpExceptionFilter`：统一错误格式
  - `TimeoutInterceptor`：请求超时保护
  - `ThrottlerGuard`：限流（100次/分钟）
  - Helmet 安全 HTTP 头
- **样式基座**：CSS 变量体系、shadcn/ui New York 风格
- **Monorepo 架构**：pnpm workspaces + Turborepo

---

## 版本说明

| 版本 | 对应分支 / 标签 | 状态 |
|------|----------------|------|
| Unreleased | dev-electron | 开发中 |
| 0.4.x | dev-electron | 已合并 |
| 0.3.0 | Phase 3 | 已完成 |
| 0.2.0 | Phase 2 | 已完成 |
| 0.1.0 | Phase 1 | 已完成 |
