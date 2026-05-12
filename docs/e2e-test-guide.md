# E2E 测试说明

`apps/api/test/` 下所有 `*.e2e-spec.ts` 文件在每次 CI 时都会执行。每个文件独立启动一个 NestJS 应用实例，用真实数据库跑完后自动清理测试数据。

单元测试位于 `apps/api/src/modules/**/*.spec.ts`。

---

## 测试文件

### `auth.e2e-spec.ts`

测试认证模块的完整流程。

| 用例 | 预期状态码 | 含义 |
| :--- | :---: | :--- |
| 邮箱格式非法 | 400 | DTO 校验拒绝请求 |
| 缺少 password 字段 | 400 | DTO 校验拒绝请求 |
| 密码长度不足 6 位 | 400 | DTO 校验拒绝请求 |
| 用户不存在 | 401 | 认证失败 |
| 密码错误 | 401 | 认证失败 |
| 登录成功 | 200 | 响应头 `Set-Cookie` 中包含 `access_token`，且标记为 `HttpOnly` |
| 登录后访问 `/auth/me` | 200 | 返回当前用户的 `email`、`name`，不含 `passwordHash` |
| 未带 Token 访问 `/auth/me` | 401 | JWT Guard 拒绝 |
| 无 Cookie 调用 `/auth/refresh` | 401 | Refresh Guard 拒绝 |
| 登出 `/auth/logout` | 200 | 响应头中 `access_token` 的 `Max-Age=0`，Cookie 被清除 |

---

### `repositories.e2e-spec.ts`

测试仓库模块的接口契约，包括权限隔离和字段安全。

**未登录访问**

| 用例 | 预期状态码 | 含义 |
| :--- | :---: | :--- |
| GET `/repositories` | 401 | 未认证 |
| POST `/repositories` | 401 | 未认证 |
| GET `/repositories/search` | 401 | 未认证 |

**登录后 — 仓库列表**

| 用例 | 预期状态码 | 含义 |
| :--- | :---: | :--- |
| GET `/repositories` | 200 | 返回数组，只含当前用户的仓库 |
| 返回对象包含必要字段 | 200 | 含 `id`、`name`、`fullName`、`platform`、`url`、`isActive` |
| `webhookSecret` 字段 | — | 值为 `null`，禁止在列表接口中泄露 |

**登录后 — 仓库详情**

| 用例 | 预期状态码 | 含义 |
| :--- | :---: | :--- |
| GET `/repositories/:id`（自己的仓库） | 200 | 返回仓库完整信息 |
| GET `/repositories/:id`（不存在的 ID） | 404 | 资源不存在 |

**登录后 — 创建仓库输入校验**

| 用例 | 预期状态码 | 含义 |
| :--- | :---: | :--- |
| 缺少所有必填字段 | 400 | DTO 校验拒绝 |
| `platform` 传入非法枚举值 | 400 | DTO 校验拒绝 |
| 缺少 `owner` 字段 | 400 | DTO 校验拒绝 |
| 缺少 `repo` 字段 | 400 | DTO 校验拒绝 |

**登录后 — 搜索**

| 用例 | 预期状态码 | 含义 |
| :--- | :---: | :--- |
| GET `/repositories/search?q=` （空字符串） | 200 | 返回空数组 |

---

### `webhook.e2e-spec.ts`

测试 GitHub Webhook 的接收逻辑和 HMAC 签名验证。

**基础校验**

| 用例 | 预期状态码 | 含义 |
| :--- | :---: | :--- |
| Payload 缺少 `repository` 字段 | 400 | 请求体不合法 |
| 未注册仓库发来 Webhook | 200 | 接受但静默忽略，不报错 |

**HMAC 签名验证**（仓库配置了 `webhookSecret` 时）

| 用例 | 预期状态码 | 含义 |
| :--- | :---: | :--- |
| 签名正确 | 200 | 验签通过，正常处理 |
| 签名错误 | 400 | 验签失败，拒绝处理 |
| 缺少 `x-hub-signature-256` 请求头 | 400 | 未提供签名，拒绝处理 |
| 签名正确但 Payload 被篡改 | 400 | 签名与 Body 不匹配，拒绝处理 |

---

### `repository-sync.e2e-spec.ts`

测试仓库历史数据同步功能，包括首次同步和重复同步去重。

**测试用户**：
```typescript
email: 'e2e-repo-sync@repopulse.dev'
password: 'repo-sync-test-123'
name: 'Repo Sync Test User'
```

| 用例 | 预期结果 |
| :--- | :---: |
| POST `/repositories/:id/sync` 首次同步 | 返回 201，createdCount = 3（commits/PRs/issues）|
| 同步返回 sync summary | 含 repositoryId、createdCount、skippedCount、failedSources、lastSyncAt |
| 第二次同步（重复同步） | createdCount = 0，skippedCount >= 3（历史事件被去重跳过）|

---

### `ai-approval-pipeline.e2e-spec.ts`

测试 AI 分析结果到审批流程的自动联动。

| 用例 | 预期结果 |
| :--- | :---: |
| AI 分析为 HIGH 风险 | 自动创建 PENDING 审批，审批内容含原始摘要 |
| AI 分析为 CRITICAL 风险 | 自动创建 PENDING 审批 |
| AI 分析为 LOW 风险 | 不创建审批 |
| AI 分析为 MEDIUM 风险 | 不创建审批 |
| 审批持久化验证 | 数据库中可查到对应的审批记录 |

---

### `event-notification-pipeline.e2e-spec.ts`

测试事件创建后通知生成的完整管道。

**测试用户**：
```typescript
email: 'e2e-event-pipeline@repopulse.dev'
name: 'Event Pipeline E2E User'
```

| 用例 | 预期结果 |
| :--- | :---: |
| 未命中过滤规则时 | 生成站内通知，channel = IN_APP，status = SENT |
| 被 EXCLUDE 规则命中时 | 不生成通知 |
| 事件本身落库 | 即使被过滤，事件仍正常入库 |

---

### `webhook-flow.e2e-spec.ts`

测试 GitHub Webhook 接收 → 队列处理 → 事件入库 → WebSocket 广播 → AI 入队的完整流程。

| 用例 | 预期结果 |
| :--- | :---: |
| Webhook 入站后 | BullMQ 队列添加 job，jobName = 'process-webhook-event' |
| EventProcessor 处理 job 后 | 事件入库，type = PUSH，author = 'Flow Bot' |
| 事件入库后 | WebSocket broadcastNewEvent 被调用一次 |
| 事件入库后 | AI 队列入队入口被调用，参数为 eventId |

---

### `notifications.e2e-spec.ts`

测试通知模块的偏好设置和发送功能。

**测试用户**：
```typescript
email: 'e2e-notification-test@repopulse.dev'
password: 'notification-test-123'
name: 'Notification E2E User'
```

| 用例 | 预期结果 |
| :--- | :---: |
| GET `/notifications/preferences` | 返回完整默认结构（channels、events、webhookUrl、email）|
| POST `/notifications/preferences` 部分更新 | 深合并，非更新字段保留原有值 |
| POST `/notifications/send` 未配置外部渠道 | 状态为 FAILED，metadata.failureReason = 'notification_email_missing' |

---

## 单元测试 (Unit Tests)

单元测试位于 `apps/api/test/units/` 目录下，使用 Jest 进行测试。

---

### `test/units/notification.service.spec.ts`

测试 `NotificationService` 的偏好设置管理和通知发送功能。

#### getPreferences - 默认值合并

| 用例 | 预期结果 |
|------|----------|
| 用户 preferences 为空 `{}` | 返回完整默认值 |
| 用户不存在 | 返回完整默认值 |
| 部分自定义事件偏好 | 与默认值合并，缺失字段回落默认值 |

**默认值**：
```typescript
channels: [NotificationChannel.IN_APP]
events: {
  highRisk: true,
  prUpdates: true,
  analysisComplete: true,
  weeklyReport: false,
}
webhookUrl: null
email: null
```

#### updatePreferences - 部分更新深合并

| 用例 | 预期结果 |
|------|----------|
| 只更新部分 events 字段 | 其它字段保留为已有值（非默认值） |
| 未传入 webhookUrl/email | 不会清空，保持不变 |
| 传入显式新值 | 覆写成功 |

#### send - 未实现通道失败原因写入

| 用例 | 预期结果 |
|------|----------|
| Email 通道未配置收件人 | 状态为 FAILED，metadata.failureReason = 'notification_email_missing' |
| IN_APP 通道 | 始终成功，状态为 SENT |

---

### `test/units/event.service.spec.ts`

测试 `EventService.create` 的后置编排韧性，验证各服务故障时的容错能力。

#### 正常路径

事件创建后，以下服务全部触发：
- `broadcastNewEvent` (WebSocket 广播)
- `notificationService.send` (通知发送)
- `aiService.triggerAnalysis` (AI 分析)

#### 韧性测试

| 故障场景 | 预期结果 |
|----------|----------|
| `broadcastNewEvent` 抛错 | 事件主记录仍正常返回，notify / AI 流程继续 |
| `notificationService.send` 抛错 | 事件主记录仍正常返回，AI 入队仍执行 |
| `FilterService.applyRules` 抛错 | 事件主记录仍正常返回，AI 入队仍执行 |
| `aiService.triggerAnalysis` 抛错 | 事件主记录仍正常返回，无异常抛出 |

---

### `test/units/webhook.channel.spec.ts`

测试 `WebhookChannel` 的 webhook 发送功能。

| 用例 | 预期结果 |
|------|----------|
| 未配置 webhookUrl | 失败，failureReason = 'notification_webhook_missing' |
| HTTP 200 | 成功，metadata 包含 statusCode: 200 |
| HTTP 500 | 失败，failureReason = 'notification_webhook_http_500' |
| HTTP 404 | 失败，failureReason = 'notification_webhook_http_404' |
| 网络超时（ECONNABORTED） | 失败，failureReason = 'notification_webhook_request_failed'，metadata 包含 error |

**axios 配置验证**：
- 超时时间：5000ms
- `validateStatus` 函数允许任意状态码返回（不走异常路径）

---

## 如何读懂 CI 输出

### 结果总览

CI 结束时会打印：

```
Test Suites: 1 failed, 4 passed, 5 total
Tests:       2 failed, 34 passed, 36 total
```

- `Test Suites` — 文件级别，几个 `.e2e-spec.ts` 通过/失败
- `Tests` — 用例级别，几条 `it()` 通过/失败

### 找到失败的用例

在 Actions log 里搜索 `●`，每个 `●` 对应一条失败的用例：

```
● Repository sync (e2e) › POST /repositories/:id/sync should create history events

    expected 201 "Created", got 500 "Internal Server Error"

    > 154 |       .expect(201);
```

- `●` 后面是 `describe 名 › it 名`
- `expected ... got ...` 是断言失败的原因
- `> 行号` 指向测试代码里断言所在的位置

### NestJS 日志

输出中穿插的 `[Nest] ... ERROR` 行是服务端日志，不是 Jest 报错：

```
[Nest] 3317  - ERROR [HttpExceptionFilter] [500] Internal server error
TypeError: this.githubService.getBranches is not a function
```

如果某个用例断言返回了 `got 500`，向上翻这些日志找对应的 `ERROR` 行，里面有服务端抛出的具体异常和堆栈。

### 末尾的两行不需要处理

```
Force exiting Jest: Have you considered using `--detectOpenHandles` ...
```
测试结束后有未完成的异步任务（BullMQ 队列等），Jest 强制退出，属于正常现象。

```
Exit status 1 / Error: Process completed with exit code 1.
```
只要有用例失败 Jest 就以非零退出，这一行只是 CI 挂红的直接原因，真正的原因要找上面的 `●`。

---

## 测试运行命令

```bash
# 运行所有测试（单元 + E2E）
pnpm test

# 运行单元测试
pnpm --filter api test

# 运行 E2E 测试
pnpm --filter api test:e2e

# 运行特定测试文件
pnpm --filter api test -- auth.e2e-spec.ts
pnpm --filter api test -- notification.service.spec.ts
```

---

## 状态码含义速查

| 状态码 | 含义 |
| :---: | :--- |
| 200 | 请求成功，有响应体 |
| 201 | 创建成功（POST 操作） |
| 400 | 请求参数不合法（DTO 校验失败、签名错误等） |
| 401 | 未认证或认证失败 |
| 403 | 已认证但无权限 |
| 404 | 资源不存在 |
| 500 | 服务端内部错误，需要查 NestJS 日志 |
