# 开发测试标记

本文档记录开发过程中添加的临时测试代码，这些代码在生产环境部署前需要移除。

---

## 待移除项

### 1. WebSocket 测试用 Token 返回

**文件**: `apps/api/src/modules/auth/auth.controller.ts`

**代码位置**: `me` 方法

**说明**: 临时返回 access_token 供 WebSocket 连接测试使用。生产环境应移除此字段。

**移除方式**: 将返回值从 `return { ...userData, accessToken }` 改回 `return userData`

**触发条件**: 完成 WebSocket 功能开发并测试通过后

---

### 2. 前端 User 类型临时字段

**文件**: `apps/web/src/types/api.ts`

**代码位置**: `User` 接口

**说明**: 临时添加 `accessToken` 字段供 WebSocket 连接测试使用。

**移除方式**: 从 `User` 接口中移除 `accessToken?: string` 字段

**触发条件**: 完成 WebSocket 功能开发并测试通过后

---

### 3. Webhook 注册端点（生产环境可保留）

**文件**: `apps/api/src/modules/user/user.controller.ts`

**代码位置**: `getMe` 方法

**说明**: 临时返回 access_token 供调试使用。

**移除方式**: 移除 `accessToken` 字段

**触发条件**: 完成 WebSocket 功能开发并测试通过后

---

### 4. Webhook 注册 API

**文件**: `apps/api/src/modules/repository/repository.controller.ts`

**代码位置**: `registerWebhook` 方法

**说明**: 临时添加的重新注册 Webhook 功能，用于测试。

**移除方式**: 删除该端点

**触发条件**: 完成 WebSocket 功能开发并测试通过后，确认自动注册 Webhook 正常工作

---

## 添加测试标记规范

当在代码中添加临时测试代码时，请按以下格式在此文档中追加：

### 2. [功能名称]

**文件**: `[文件路径]`

**代码位置**: `[方法/类名]`

**说明**: [简要说明用途]

**移除方式**: [具体操作]

**触发条件**: [何时移除]