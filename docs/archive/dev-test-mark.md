# 开发测试标记

本文档记录开发过程中保留的临时测试入口。生产环境部署前需要再次确认这些入口是否仍然需要。

## 当前待评估项

### 1. Webhook 重新注册 API

**文件**: `apps/api/src/modules/repository/repository.controller.ts`

**代码位置**: `registerWebhook` 方法

**说明**: 用于在开发和排障时为已有 GitHub 仓库重新注册 Webhook。该接口已要求 JWT 登录态，并在服务层校验当前用户对仓库有可编辑权限。

**移除条件**: 确认仓库创建时的自动 Webhook 注册和恢复流程已经覆盖生产运维需求后，可以删除该端点。

## 已处理项

- 本次合并没有保留 “从用户信息接口返回 access token 供 WebSocket 测试” 的旧实现。WebSocket 认证继续使用 HttpOnly Cookie 或显式 `Authorization`/`auth.token`。
