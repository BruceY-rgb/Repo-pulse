# Repo-Pulse 系统测试打分报告

| 项目 | 内容 |
|------|------|
| **项目名称** | Repo-Pulse — AI 驱动代码仓库监控平台 |
| **测试分支** | `dev-electron` |
| **测试人员** | @yhyhyhy |
| **文档整理** | @渊 |
| **测试日期** | 2026-05-29 |
| **报告版本** | v2.0 |

---

## 一、测试环境

| 环境项 | 说明 |
|-------|------|
| 操作系统 | Windows 11 Home China 10.0.26200 |
| Node.js | v20.x (LTS) |
| 测试框架 | Jest 29.7 + ts-jest 29.2 |
| 数据库 | PostgreSQL 16（E2E 测试使用本地实例） |
| 缓存 | Redis 7（E2E 测试使用本地实例） |
| 包管理 | pnpm workspaces + Turborepo |
| CI 平台 | GitHub Actions |
| 覆盖率平台 | Codecov（flags: unit） |

---

## 二、测试执行概览

| 测试类型 | 套件数 | 用例数 | 通过 | 失败 | 执行时长 |
|---------|-------|-------|------|------|---------|
| 单元测试（含稳定性） | **41** | **771** | **771** | **0** | ~35s |
| E2E 功能测试 | 10 | — | 需真实 DB+Redis 执行 | — | — |
| 性能测试 | 1 | 5端点 | 需真实运行实例 | — | — |

> **单元测试与稳定性测试全部通过，771/771，零失败。**

---

## 三、单元测试（20分）

### 3.1 覆盖率数据

| 指标 | 数值 | 配置阈值（≥） | 状态 |
|------|------|-------------|------|
| 行覆盖率 | **78.01%** | 65% | ✅ PASS |
| 语句覆盖率 | **77.81%** | 65% | ✅ PASS |
| 函数覆盖率 | **74.91%** | 60% | ✅ PASS |
| 分支覆盖率 | **56.94%** | 50% | ✅ PASS |

**覆盖率变化历程：**

| 时间节点 | 行覆盖率 | 事件 |
|---------|---------|------|
| Phase 3 完成 | ~81% | 基线 |
| feat/authority 合并 | ~66% | 权限模块引入大量新代码，测试滞后 |
| 本次补充后 | **78%** | 新增 4 个测试文件，提升 12 个百分点 |

**覆盖率阈值配置**（`apps/api/package.json`，`coverageThreshold`）：

```json
"coverageThreshold": {
  "global": {
    "lines": 65,
    "functions": 60,
    "branches": 50,
    "statements": 65
  }
}
```

CI 强制执行，低于阈值构建直接失败。

---

### 3.2 测试套件明细（41个套件，771个用例）

#### 认证模块（Auth）— 4个文件

**`auth.service.spec.ts`**

| 测试用例 | 验证内容 |
|---------|---------|
| GitHub OAuth 登录流程 | 新用户首次登录自动创建账号，邮箱/头像正确写入 |
| 已有用户登录 | 复用现有账号，不重复创建 |
| JWT access_token 签发 | payload 含 sub/email/role，过期时间正确 |
| refresh_token 轮换 | 旧 token 刷新后失效，新 token 可继续使用 |
| logout | HttpOnly Cookie 清空 |

**`auth.service.extra.spec.ts`**

| 测试用例 | 验证内容 |
|---------|---------|
| getPreferences 空 preferences | 返回完整默认值（channels/events/monitoringScope 等） |
| 用户不存在 | 仍返回完整默认值，不抛错 |
| 部分自定义偏好与默认值合并 | 缺失字段回落默认值，已设值保留 |
| updatePreferences 部分更新 | 只更新传入字段，其余保留为已有值（非覆盖全量） |
| webhookUrl/email 空串处理 | 空串按用户输入写回，不清空已有值 |
| Email 通道未配置收件人 | notification 状态置 FAILED，metadata.failureReason 有说明 |
| IN_APP 通道 | 始终成功，写入 SENT |

**`auth.controller.spec.ts`**

| 测试用例 | 验证内容 |
|---------|---------|
| GitHub callback 异常重定向 | 有 oauthError 时跳转到 `/login?error=oauth_failed` |
| oauthError 携带 reason | reason 追加到重定向 URL query |
| headersSent 时不重定向 | 避免重复设置响应头 |
| 非 GET callback | 不触发重定向 |
| FRONTEND_URL 未设置 | 降级使用 `localhost:5173` |
| oauthError 多种数据类型 | 对象/字符串/null 均安全处理 |

**`auth-guards-strategies.spec.ts`**

| 测试用例 | 验证内容 |
|---------|---------|
| PublicGuard — 公开路由跳过认证 | `@Public()` 装饰器路由直接放行 |
| PublicGuard — 私有路由走 super | 非公开路由调用父类 canActivate |
| RolesGuard — 无角色要求 | 无 `@Roles()` 时放行 |
| RolesGuard — 角色匹配 | 用户角色满足要求时放行 |
| RolesGuard — 角色不足 | 角色不满足时返回 false |
| GithubStrategy — 无凭证 | strategy 无凭证时抛 BadRequestException |
| GithubStrategy — 有凭证 | 调用 super.canActivate |
| JwtStrategy — validate | 从 payload 提取 sub/email/role 返回 |
| JwtStrategy — 邮箱/头像缺失 | 安全降级不抛错 |

---

#### 事件模块（Event）— 4个文件

**`event.service.spec.ts`**

| 测试用例 | 验证内容 |
|---------|---------|
| create() 写入数据库 | 每次调用都触发 prisma.event.create，无应用层去重 |
| externalId 唯一性 | 重复 externalId 由 DB unique 约束处理（应用层不拦截） |
| 触发 AI 分析入队 | create() 后异步调用 AIService.triggerAnalysis |
| 过滤规则应用 | applyRules 结果为 EXCLUDE 时跳过通知 |
| 广播 WebSocket | broadcastNewEvent 在 create() 后调用 |
| 通知发送 | 用户配置了对应渠道时调用 send() |

**`event.service.extra.spec.ts`**

| 测试用例 | 验证内容 |
|---------|---------|
| resolveChannelsForEvent — PUSH | 直接返回 preferences.channels |
| resolveChannelsForEvent — 其他类型 | 检查 events 字段是否包含该类型 |
| notifyRepositoryUsers — 用户无 monitoringScope | 静默跳过不报错 |
| enqueueAnalysis — anyInScope=false | 无用户在监控范围时跳过 AI |
| broadcastEvent — 同步抛错被捕获 | 独立 try/catch，不影响 create() 返回 |

**`event.processor.spec.ts`**

EventProcessor 是 BullMQ 消费者，处理从队列取出的 Webhook 原始 payload：

| 测试用例 | 验证内容 |
|---------|---------|
| 事件已存在时跳过 | externalId 重复时直接 return，不重复入库 |
| 无重复时正常创建 | 调用 EventService.create() |
| 使用传入的 receivedAt | 时间戳字段正确透传 |
| 处理失败时抛 BadRequestException | 错误向上冒泡 |
| GitHub extractExternalId — PUSH | 使用 payload.after（commit SHA） |
| GitHub extractExternalId — PR 系列 | 使用 pull_request.id |
| GitHub extractExternalId — Issue 系列 | 使用 issue.id / comment.id |
| GitHub extractExternalId — Release | 使用 release.tag_name |
| GitLab extractExternalId — PUSH | 使用 checkout_sha |
| GitLab extractExternalId — MR/Issue/Note | 使用 object_attributes.id |

**`event.gateway.spec.ts`**

| 测试用例 | 验证内容 |
|---------|---------|
| afterInit 不抛错 | Gateway 初始化 |
| handleDisconnect 日志记录 | 客户端断开 |
| JWT 提取 — auth.token | 从 handshake.auth.token 解析 userId |
| JWT 提取 — Authorization header | Bearer token 格式 |
| JWT 提取 — Cookie | access_token Cookie |
| 无 token 断开连接 | 未认证客户端踢出 |
| 无效/过期 JWT 断开 | 签名错误或过期踢出 |
| joinRoom | 客户端加入对应仓库 Room |
| leaveRoom | 客户端离开 Room |
| broadcastNewEvent | 广播到对应 Room |
| broadcastAnalysisCompleted | 全局广播 |

---

#### AI 分析模块 — 3个文件

**`ai.service.spec.ts`**

| 测试用例 | 验证内容 |
|---------|---------|
| triggerAnalysis — 加入队列 | 调用 BullMQ ai-analysis 队列 |
| force=true 透传 | 强制重新分析参数正确透传 |
| 事件不存在 | 抛 NotFoundException（不入队） |
| analyzeEvent — 已有 COMPLETED 分析 | force=false 时返回缓存结果 |
| analyzeEvent — force=true | 跳过缓存重新分析 |
| shouldAnalyze=false | 返回 failedOutput，状态 SKIPPED |
| 无关联用户 | 返回 failedOutput |
| 用户无 API Key | 返回 failedOutput |
| provider.analyze 抛错 | 存 FAILED，返回 failedOutput |
| 成功分析 | 写入 AIAnalysis 记录，返回完整结果 |
| 使用环境变量默认配置 | user.aiSettings 为空时读 env 兜底 |
| 非 Error 对象异常 | 安全包装不崩溃 |

**`ai-analysis.processor.spec.ts`**

| 测试用例 | 验证内容 |
|---------|---------|
| onCompleted | 成功回调不抛错 |
| onFailed | 失败回调不抛错 |
| process — 调用 analyzeEvent | 参数 eventId/force 正确 |
| process — force 默认 false | 未传 force 时默认 false |
| process — AI 分析后通知重试 | 分析完成触发通知重发 |
| process — 广播分析完成 | broadcastAnalysisCompleted 调用 |
| process — 无审批时不通知 | createApproval 返回 null 时跳过通知 |
| process — 创建审批时通知 | 用户有 IN_APP 偏好时发通知 |
| process — 无 highRisk events 偏好 | 跳过通知 |
| process — 无 IN_APP 渠道 | 跳过通知 |
| 事件未找到 | 提前返回 |
| analyzeEvent 抛错 | 向上冒泡 |

**`ai-event-normalizer.spec.ts`**

测试 GitHub 和 GitLab 事件 payload 的标准化（从平台原始格式提取通用字段）：

| 测试用例组 | 验证字段 |
|-----------|---------|
| GitHub PUSH | branch、author、commitsCount |
| GitHub PR_OPENED | title、author、sourceBranch、targetBranch |
| GitHub PR_MERGED | mergedAt 元数据 |
| GitHub ISSUE/COMMENT/RELEASE/BRANCH | 各类型关键字段 |
| GitLab PUSH | branch（从 ref 提取）|
| GitLab MR/Issue/Note/Release | 对应 object_attributes 字段 |
| 未知事件类型 | 降级为 "Unknown Event" 不崩溃 |

---

#### 仓库管理模块（Repository）— 4个文件

**`repository.service.spec.ts`**

| 测试用例 | 验证内容 |
|---------|---------|
| 创建仓库 | 名称/平台/URL 正确写入 |
| 查询用户仓库列表 | 只返回当前用户有权限的仓库 |
| 仓库详情 | 含最近事件、AI 分析摘要 |
| 权限校验 — 无权访问 | assertUserCanAccessRepository 抛 403 |
| 权限校验 — 无权修改 | assertUserCanEditRepository 抛 403 |
| 更新 Webhook Secret | 加密存储，不明文返回 |

**`repository-branch-scope.spec.ts`**

测试仓库分支作用域过滤逻辑：

| 测试用例 | 验证内容 |
|---------|---------|
| 无分支配置 | 所有分支通过 |
| 分支白名单 | 仅配置分支的事件通过 |
| 通配符匹配 | `feature/*` 匹配所有 feature 分支 |
| 不匹配分支 | 事件被过滤掉 |

**`github.service.spec.ts` / `gitlab.service.spec.ts`**

测试 GitHub/GitLab API 客户端封装层（约 60 个用例）：

- 仓库信息获取：成功路径和失败降级
- Webhook 注册/删除：参数正确性
- Commit 历史：分页、时间范围参数
- 分支列表：空名称过滤、格式映射
- PR/Issue 列表：状态参数、空数组降级
- Token 刷新：GitHub 不支持刷新时的抛错行为
- GitLab 专有：编码路径 URL、`iid` 参数

---

#### 过滤规则模块（Filter）— 2个文件

**`filter.service.spec.ts`**（基础路径）

| 测试用例 | 验证内容 |
|---------|---------|
| getRules | 返回用户规则列表 |
| createRule | 规则写入 DB |
| updateRule | 仅更新传入字段 |
| deleteRule — 规则属于用户 | 正常删除 |
| deleteRule — 规则不属于用户 | 抛 403 |
| applyRules — 命中第一条 | 返回对应 action |
| applyRules — 无规则命中 | 返回默认 INCLUDE |
| testRule | 对给定事件测试规则，不入库 |

**`filter.service.extra.spec.ts`**（补充分支覆盖）

| 测试用例 | 验证内容 |
|---------|---------|
| testRule — regex 正则匹配 | `customRegex` 字段，`regex` 算子，大小写不敏感（i flag）|
| testRule — 无效正则 | `[invalid` 不抛错，返回 matched=false |
| testRule — in 算子 | 值在列表内/不在列表内 |
| testRule — 未知算子 | 安全降级返回 matched=false |
| testRule — 字段不存在 | 返回 matched=false |
| testRule — 多条件 AND | 所有条件满足才 matched，任一不满足即失败（短路） |
| testRule — 空条件 | 无限制时 matched=true |
| applyRules — 优先级验证 | 验证 DB 查询传入 `orderBy: { priority: 'desc' }`（非依赖 mock 数组顺序）|
| applyRules — TAG 动作 | 命中 TAG 规则正确返回 |
| hasRuleReferencingField | 有/无规则引用该字段时的 true/false |

---

#### 通知模块（Notification）— 2个文件

**`notification.service.spec.ts`**

| 测试用例 | 验证内容 |
|---------|---------|
| send — WEBHOOK 渠道 | 正确调用并返回 SENT |
| send — DINGTALK 渠道 | 正确调用并返回 SENT |
| send — FEISHU 渠道 | 正确调用并返回 SENT |
| send — 未知渠道 | 返回 FAILED |
| send — channel.send 抛错 | 捕获后保存 FAILED，不向上抛 |
| send — channel 返回 failure | metadata 写入 failureReason |
| markAllRead | 批量更新 readAt |

**`notification.service.extra.spec.ts`**

| 测试用例 | 验证内容 |
|---------|---------|
| getNotifications — 返回列表和 total | 分页正确 |
| getNotifications — status 过滤 | WHERE 条件正确 |
| getNotifications — 自定义 limit/offset | 分页参数透传 |
| getNotificationById — 找到 | 返回记录，更新 readAt |
| getNotificationById — 找不到 | 抛 NotFoundException |
| deleteNotification — 找到 | 正常删除 |
| deleteNotification — 找不到 | 抛 NotFoundException |
| getUnreadCount — 无仓库权限 | 返回 0 |
| getUnreadCount — 有权限 | 返回 prisma count |
| getUnreadCount — repositoryIds 过滤 | WHERE 条件加入 repositoryIds |

---

#### IM / 飞书集成模块 — 2个文件

**`im.service.spec.ts`**

| 测试用例 | 验证内容 |
|---------|---------|
| init — 有飞书配置时恢复 bridge | 应用启动时自动重连 |
| getFeishuStatus — 未配置 | 返回 not_configured |
| getFeishuStatus — 已配置无 state | 返回 configured |
| getFeishuStatus — state=ready | 返回 ready |
| getFeishuStatus — 含 botName/appId | 字段正确包含 |
| getFeishuStatus — 有绑定 chatId | subscriptionReady=true |
| saveFeishuConnection | 保存连接配置，返回状态 |
| getFeishuToken — 请求失败（非 2xx） | 返回错误 |
| getFeishuToken — 请求抛错 | 返回错误 |
| testFeishuConnection — bot 可达 | success=true |
| testFeishuConnection — bot 不可达 | success=false |
| testFeishuConnection — token 获取失败 | 返回 feishu_token_unavailable |
| sendRepositoryEventNotification — token 可用 | 发送到指定 chatId |
| sendRepositoryEventNotification — token 失败 | 返回不可用提示 |
| sendTestNotification | 发送测试消息 |
| verifyBindCode — 有效 | ok=true |
| verifyBindCode — 过期 | ok=false |

**`im.service.extra.spec.ts`**

覆盖飞书事件卡片格式、渠道配置边界条件等补充场景。

---

#### 审批模块（Approval）— 2个文件

**`approval.service.spec.ts`**

| 测试用例 | 验证内容 |
|---------|---------|
| createApproval — HIGH 风险 | AI 分析结果为高风险时创建审批记录 |
| createApproval — 非高风险 | 返回 null，不创建审批 |
| getApprovals | 返回用户相关审批列表 |
| approve | 状态更新为 APPROVED，记录审批人 |
| reject | 状态更新为 REJECTED |
| 权限检查 | 只有仓库成员能操作审批 |

**`approval.service.extra.spec.ts`**

补充边界条件：重复审批、审批不存在、状态非法转换等场景。

---

#### Webhook 接入模块 — 2个文件

**`webhook.service.spec.ts`**

| 测试用例 | 验证内容 |
|---------|---------|
| GitHub — payload 缺 repository 字段 | 抛 BadRequestException |
| GitHub — 仓库未注册 | 静默返回，不入队 |
| GitHub — rawBody 缺失 | 抛错（无法做 HMAC 验签） |
| GitHub — 签名错误 | 抛 401 |
| GitHub — 有 secret 但缺 signature header | 抛错 |
| GitHub — 正确 HMAC 签名 | 入队成功 |
| GitHub — 无 webhookSecret | 跳过签名验证直接入队 |
| GitLab — payload 缺 project 字段 | 抛错 |
| GitLab — 仓库未注册 | 静默返回 |
| GitLab — token 验签 | 错误 token 抛 401 |
| GitLab — 正确 token | 入队成功 |

**`webhook.channel.spec.ts`**

测试 GitHub/GitLab 事件类型映射（Webhook 事件名称 → 内部 EventType 枚举）：

| 覆盖范围 | 用例数 |
|---------|-------|
| GitHub 事件类型映射（push/PR/issue/release/branch） | 12 |
| GitLab 事件类型映射 | 12 |
| 未知事件类型不入队 | 1 |

---

#### 其他工具类/中间件 — 6个文件

**`interceptors.spec.ts`**

- TransformInterceptor：所有响应包装为 `{ code, data, message, timestamp }`，`@SkipTransform()` 时透传原始值
- TimeoutInterceptor：TimeoutError → RequestTimeoutException，其他错误原样传递

**`http-exception-filter.spec.ts`**

- HttpException：使用其 status
- 非 HttpException：统一 500
- 响应 JSON 结构：含 code/data/timestamp

**`event-time.util.spec.ts`**

- 时间工具函数边界条件（时区、格式化、相对时间）

**`dashboard.service.spec.ts`**

- overview：汇总统计（仓库数、事件总量、AI 分析数、待审批数）
- activity：按天分组的事件统计
- 无权访问仓库时返回 0

**`report.service.spec.ts` / `report.controller.spec.ts`**

- 报告生成（Markdown/PDF 格式）
- 下载端点：PDF 用 Buffer，Markdown 用文本
- 找不到报告时抛 NotFoundException

**`sync.service.spec.ts`**

- 首次同步：从 GitHub/GitLab 拉取历史数据入库
- 重复同步：已有数据时的去重逻辑

**`settings.service.spec.ts` / `user.service.spec.ts`**

- AI 配置读写（apiKey、modelName、provider）
- 用户信息查询、角色管理

**`workbench.service.spec.ts`**（27个用例）

| 测试用例组 | 验证内容 |
|-----------|---------|
| getChatRepositories — 分组 | WRITE+ 分为 editable，READ 分为 monitored-readonly |
| getChatRepositories — 最新消息 | latestMessageAt/preview 从 events 中正确取出 |
| getChatRepositories — 未读数 | unreadCount 正确聚合 |
| getChatRepositories — 高风险数 | highRiskCount 从 AI 分析记录聚合 |
| getConversationMessages — 操作权限 | WRITE+ 才有 agent_handle 动作 |
| getConversationMessages — 审批动作 | PENDING 审批仅对有权限用户显示 approve/reject |
| getConversationMessages — 排序 | 按 createdAt 降序 |
| getWatchFeed — 候选仓库筛选 | 只含 starred、非 editable、非 monitored 的仓库 |
| getWatchFeed — 排除条件 | monitored/editable/非 GitHub starred 的仓库排除 |
| getWatchFeed — 分页 | nextCursor 正确返回 |
| getWatchFeed — AI Insight | 包含已完成分析的摘要 |

**`simple-channels.spec.ts`**

- Webhook/DingTalk/Email 通道 send() 方法的基础路径和失败路径

**`feishu-event-card.spec.ts`**

- 飞书富文本卡片格式构造（不同事件类型的卡片字段正确性）

**`repository-access.spec.ts`**（新增，覆盖权限工具函数全路径）

| 测试用例 | 验证内容 |
|---------|---------|
| isEditableRepositoryAccessLevel | OWNER/ADMIN/MAINTAIN/WRITE 可编辑，READ 不可 |
| getUserRepositoryMembership — 成员 | 返回 membership 记录 |
| getUserRepositoryMembership — 非成员 | 返回 null |
| getAccessibleRepositoryIds | 只返回用户有权限的仓库 ID |
| getUserMonitoredRepositoryIds | 从 preferences.monitoringScope 提取 |
| assertUserCanAccessRepository — 有权限 | 不抛错 |
| assertUserCanAccessRepository — 无权限 | 抛 ForbiddenException |
| assertUserCanEditRepository — 可编辑级别 | 不抛错 |
| assertUserCanEditRepository — 只读级别 | 抛 ForbiddenException |

---

### 3.3 评分

| 评分项 | 满分 | 得分 | 说明 |
|-------|------|------|------|
| 测试覆盖范围 | 8 | 8 | 41 个套件，771 个用例，覆盖全部 15 个主要模块 |
| 覆盖率水平 | 7 | 6 | 行 78%（优），分支 57%（中），有阈值保障 |
| 覆盖率阈值强制 | 3 | 3 | Jest coverageThreshold 配置，CI 强制 |
| 测试质量 | 2 | 2 | 边界条件、错误路径、Mock 规范性均良好 |
| **小计** | **20** | **19** | |

---

## 四、功能测试 E2E（20分）

### 4.1 测试方案

- 每个 E2E 文件独立启动完整 NestJS 应用实例（`Test.createTestingModule` + `app.listen`）
- 使用真实 PostgreSQL 16 + Redis 7，数据完全隔离
- `beforeAll` 创建测试用户/仓库种子数据，`afterAll` 按依赖顺序清理
- 使用 `supertest` 发送真实 HTTP 请求，验证完整请求-响应链路
- CI 中独立 Job 运行（Docker services: postgres + redis）

### 4.2 E2E 测试套件明细（10个文件）

**`auth.e2e-spec.ts`**

| 用例 | 请求 | 验证点 |
|------|------|-------|
| 登录成功 | POST /auth/login | 返回用户信息，HttpOnly Cookie 设置 |
| DTO 校验 — 缺少字段 | POST /auth/login | 返回 400 |
| 获取当前用户 | GET /auth/me | 需认证，返回用户完整信息 |
| 未认证访问 | GET /auth/me | 返回 401 |
| 刷新 Token | POST /auth/refresh | 旧 refresh token 换新 access token |
| 登出 | POST /auth/logout | Cookie 清空 |

**`repositories.e2e-spec.ts`**

| 用例 | 请求 | 验证点 |
|------|------|-------|
| 获取仓库列表 | GET /repositories | 只返回当前用户仓库 |
| 权限隔离 | GET /repositories | 不返回其他用户的仓库 |
| 关键字搜索 | GET /repositories?search=xxx | 正确过滤 |
| 创建仓库 | POST /repositories | 201，字段写入正确 |
| 创建 — DTO 校验 | POST /repositories | 400（缺必填字段） |
| 获取单个仓库 | GET /repositories/:id | 200，含事件统计 |
| 访问无权仓库 | GET /repositories/:id | 403 |

**`webhook.e2e-spec.ts`**

| 用例 | 请求 | 验证点 |
|------|------|-------|
| GitHub Webhook 正确签名 | POST /webhook/github/:id | 200，事件入队 |
| GitHub Webhook 错误签名 | POST /webhook/github/:id | 401 |
| Webhook 去重 | 两次相同 externalId | 只入库一条 |
| GitLab Webhook | POST /webhook/gitlab/:id | token 验证正确 |

**`webhook-flow.e2e-spec.ts`**

端对端完整 Webhook 处理流程验证：

```
POST /webhook/github/:id（带正确签名）
  → WebhookService 验签
  → BullMQ 入队
  → EventProcessor 消费
  → EventService.create() 写库
  → AIService 触发分析
  → WebSocket 广播（事件发送到 Room）
```

**`repository-sync.e2e-spec.ts`**

| 用例 | 请求 | 验证点 |
|------|------|-------|
| 首次同步 | POST /repositories/:id/sync | 从 GitHub 拉取历史 commit/PR/Issue 入库 |
| 重复同步 | 第二次 POST | 已有事件不重复创建（externalId 去重） |
| 无权仓库 | POST /repositories/:id/sync | 403 |

**`ai-approval-pipeline.e2e-spec.ts`**

| 用例 | 验证点 |
|------|-------|
| 高风险 AI 分析 → 自动创建审批 | riskLevel=HIGH 时 Approval 记录自动生成 |
| 低风险 AI 分析 → 无审批 | riskLevel=LOW/MEDIUM 时不创建 |
| 审批通过 | PUT /approvals/:id/approve → 状态 APPROVED |
| 审批拒绝 | PUT /approvals/:id/reject → 状态 REJECTED |
| 无权操作他人审批 | 403 |

**`event-notification-pipeline.e2e-spec.ts`**

| 用例 | 验证点 |
|------|-------|
| 事件创建触发通知 | 用户配置 EMAIL 渠道时 send() 被调用 |
| 过滤规则 EXCLUDE | 命中 EXCLUDE 规则时跳过通知 |
| 过滤规则 INCLUDE | 命中 INCLUDE 或无规则时通知正常发送 |
| 通知偏好检查 | 用户未配置对应事件类型时跳过 |

**`notifications.e2e-spec.ts`**

| 用例 | 请求 | 验证点 |
|------|------|-------|
| 获取通知偏好 | GET /notifications/preferences | 返回完整默认值 |
| 更新偏好 | PUT /notifications/preferences | 部分更新，其余保留 |
| 外部渠道故障 | 配置了 EMAIL 但 SMTP 不可用 | 通知 FAILED，不影响事件入库 |

**`dashboard.e2e-spec.ts`**（新增）

| 用例 | 请求 | 验证点 |
|------|------|-------|
| 未认证访问 | GET /dashboard/overview | 401 |
| 概览数据 | GET /dashboard/overview | 含 repositoryCount/eventCount/analysisCount |
| 活动统计 | GET /dashboard/activity?days=7 | 按天分组，7 条记录 |
| days 参数过滤 | GET /dashboard/activity?days=30 | 返回 30 天数据 |
| 最近活动 | GET /dashboard/recent-activity | 返回最近事件列表 |
| 空数据安全 | 无事件时 | 返回 0 而非报错 |

**`filter-rules.e2e-spec.ts`**（新增）

| 用例 | 请求 | 验证点 |
|------|------|-------|
| 获取规则列表 | GET /filters | 只返回当前用户规则 |
| 创建规则 | POST /filters | 201，id 写入 DB |
| 创建 — DTO 校验 | POST /filters | 400（action 枚举非法） |
| 权限隔离 | GET /filters | 不返回其他用户规则 |
| 更新规则 | PUT /filters/:id | 字段正确更新 |
| 更新他人规则 | PUT /filters/:id | 403 |
| 删除规则 | DELETE /filters/:id | 204，DB 记录删除 |
| 删除他人规则 | DELETE /filters/:id | 403 |
| 测试规则 | POST /filters/test | 返回 matched/action，不入库 |

### 4.3 评分

| 评分项 | 满分 | 得分 | 说明 |
|-------|------|------|------|
| E2E 覆盖范围 | 10 | 9 | 10 个文件覆盖核心业务链路；缺少 Workbench E2E |
| 测试用例质量 | 6 | 6 | 正常流+错误流+权限隔离+边界条件均覆盖 |
| CI 自动化 | 4 | 4 | GitHub Actions 独立 Job，真实 DB+Redis |
| **小计** | **20** | **19** | |

---

## 五、性能测试（10分）

### 5.1 测试方案

**文件**：`apps/api/test/performance/api-benchmark.ts`

**方法**：基于 Jest + supertest，在 NestJS 测试模块内原地发压（消除网络传输开销，专注业务逻辑延迟），10 并发 × 50 请求/端点，统计 P50/P95/P99 延迟和错误率。

**执行命令**：

```bash
pnpm --filter api test:perf
```

执行后自动输出 `docs/test-reports/performance-report.md`。

### 5.2 端点与 SLA

| 端点 | 并发 | 请求数 | P99 SLA | 错误率 SLA |
|------|------|-------|---------|----------|
| GET /dashboard/overview | 10 | 50 | < 2000ms | < 5% |
| GET /events?page=1&limit=20 | 10 | 50 | < 2000ms | < 5% |
| GET /repositories | 10 | 50 | < 2000ms | < 5% |
| GET /dashboard/activity?days=7 | 5 | 30 | < 2000ms | < 5% |
| GET /notifications/preferences | 10 | 50 | < 2000ms | < 5% |

### 5.3 报告输出示例结构

```markdown
# Performance Test Report
Generated: 2026-05-29

## Endpoint: GET /dashboard/overview
Requests: 50 | Concurrency: 10
P50: xxxms | P95: xxxms | P99: xxxms
Error Rate: x.x%
SLA P99 < 2000ms: PASS/FAIL
```

### 5.4 评分

| 评分项 | 满分 | 得分 | 说明 |
|-------|------|------|------|
| 性能测试脚本完整 | 4 | 4 | api-benchmark.ts 实现完整，npm script 已配置 |
| 测试端点覆盖 | 3 | 3 | 5 个核心端点，含仪表板/事件/仓库/通知 |
| SLA 定义 | 2 | 2 | P99/P95/P50 + 错误率均有阈值 |
| 报告自动输出 | 1 | 1 | 运行后自动生成 performance-report.md |
| **小计** | **10** | **10** | |

---

## 六、稳定性测试（10分）

### 6.1 测试文件

| 文件 | 位置 | 套件数 | 用例数 |
|------|------|-------|-------|
| fault-tolerance.spec.ts | test/stability/ | 5 | 9 |
| concurrency.spec.ts | test/stability/ | 4 | 8 |

### 6.2 容错降级测试（fault-tolerance.spec.ts）

测试核心原则：**后置服务故障不能影响主链路（事件入库）**。

**WebSocket Gateway 故障**

| 场景 | 注入方式 | 预期行为 | 结果 |
|------|---------|---------|------|
| broadcastNewEvent 同步抛错 | `mockImplementation(() => { throw new Error() })` | create() 正常返回，事件有 id | ✅ |
| WS 故障不影响 AI 入队 | 同上 | triggerAnalysis 被调用 1 次 | ✅ |

> 原理：`broadcastEvent` 内部使用独立的同步 try/catch，与异步任务链路解耦。

**AI 服务故障**

| 场景 | 注入方式 | 预期行为 | 结果 |
|------|---------|---------|------|
| triggerAnalysis 抛错 | `mockRejectedValue(new Error())` | 事件仍正常返回 | ✅ |
| AI 服务"超时"100ms | 返回延迟 Promise | create() 在 500ms 内返回（不等待 AI）| ✅ |

> 原理：AI 分析为异步触发（fire-and-forget），create() 不 await AI 结果。

**通知服务故障**

| 场景 | 注入方式 | 预期行为 | 结果 |
|------|---------|---------|------|
| send() 抛错 | `mockRejectedValue` | 事件创建成功 | ✅ |
| getPreferences() 抛错 | `mockRejectedValue` | 事件入库不受影响 | ✅ |

**IM 服务故障**

| 场景 | 注入方式 | 预期行为 | 结果 |
|------|---------|---------|------|
| sendRepositoryEventNotification 抛错 | `mockRejectedValue` | 事件创建不受影响 | ✅ |

**级联故障（WebSocket + 通知同时故障）**

| 场景 | 预期行为 | 结果 |
|------|---------|------|
| WS 断开 + 邮件服务宕机 | 核心事件入库成功，result.id 有值 | ✅ |

### 6.3 并发安全测试（concurrency.spec.ts）

测试核心原则：**并发操作时数据不串扰，系统不崩溃，响应时间满足基线**。

**事件创建行为**

| 场景 | 验证逻辑 | 结果 |
|------|---------|------|
| create() 直接写库（无应用层去重）| createMock 被调用 1 次 | ✅ |
| 3 个不同 externalId 并发创建 | createMock 被调用 3 次，结果各自独立 | ✅ |

> 说明：EventService.create() 不做应用层 findFirst 去重；externalId 唯一性由 DB unique 约束保障，冲突时由 DB 抛错，调用方（EventProcessor）负责捕获。

**并发压力**

| 场景 | 验证逻辑 | 结果 |
|------|---------|------|
| 10 个并发不同事件 | rejected.length === 0，fulfilled.length === 10 | ✅ |
| 5 个 PR 类型并发 | 5 个结果各有独立 id，互不干扰 | ✅ |

**响应时间基线**

| 场景 | 阈值 | 结果 |
|------|------|------|
| 单次 create()（无真实 I/O） | < 200ms | ✅ |
| 10 次串行 create() | 总计 < 1000ms（平均 < 100ms/次）| ✅ |

**边界条件**

| 场景 | 结果 |
|------|------|
| 空 body 事件正常创建 | ✅ |
| 超长 title（1000字符）不崩溃 | ✅ |

### 6.4 评分

| 评分项 | 满分 | 得分 | 说明 |
|-------|------|------|------|
| 容错降级测试 | 3 | 3 | 5 类故障场景，9 个用例全通过 |
| 并发安全测试 | 3 | 3 | 4 个并发场景，8 个用例全通过 |
| 响应时间基线 | 2 | 2 | 单次 < 200ms，串行 10 次 < 1s |
| 降级行为覆盖深度 | 2 | 1 | 覆盖单次故障和级联故障；无长时间持续运行测试 |
| **小计** | **10** | **9** | |

---

## 七、测试总结报告（10分）

### 7.1 测试文档清单

| 文档 | 路径 | 内容 |
|------|------|------|
| **系统测试打分报告（本文）** | `docs/test-reports/system-test-report.md` | 全维度测试结果、用例说明、评分 |
| E2E 测试指南 | `docs/e2e-test-guide.md` | 用例覆盖表、运行命令、故障排查手册 |
| 性能测试报告 | `docs/test-reports/performance-report.md` | 自动生成，含 QPS/延迟/SLA 结果 |

### 7.2 评分

| 评分项 | 满分 | 得分 | 说明 |
|-------|------|------|------|
| 报告完整性 | 4 | 4 | 单元/E2E/性能/稳定性四维度均有详细说明 |
| 格式与数据支撑 | 3 | 3 | 正式报告格式，表格清晰，数字有出处 |
| 覆盖率历史记录 | 2 | 2 | 三个时间节点（基线→回退→恢复）均有记录 |
| 故障排查指南 | 1 | 1 | e2e-test-guide.md 含详细排查步骤 |
| **小计** | **10** | **10** | |

---

## 八、缺陷管理（20分）

### 8.1 CHANGELOG

文件：`CHANGELOG.md`（项目根目录，Keep a Changelog 规范）

| 版本 | 状态 | 主要变更 |
|------|------|---------|
| Unreleased | dev-electron | 补充测试套件（性能/稳定性/单元），覆盖率阈值，覆盖率 66%→78% |
| 0.4.1 | 已发布 | E2E 数据修复，覆盖率记录更新，feat/authority 适配 |
| 0.4.0 | 已发布 | Electron 桌面端，飞书 IM 框架，审批流，仓库权限管理 |
| 0.3.0 | 已发布 | AI 核心引擎：多模型适配、异步分析、SSE 流式输出 |
| 0.2.0 | 已发布 | 实时数据流：WebSocket、BullMQ、React Query |
| 0.1.0 | 已发布 | 基础设施：JWT、Webhook HMAC 验签、样式基座 |

### 8.2 已知问题（12条）

文件：`docs/KNOWN_ISSUES.md`

| ID | 严重度 | 模块 | 描述 | 状态 |
|----|-------|------|------|------|
| #001 | Medium | IM/飞书 | 飞书消息实际投递未实装，框架存在但 send 为占位 | Open |
| #002 | Low | 前端 | DesktopWorkbench.tsx 超 2500 行，可维护性差 | Open |
| #003 | Medium | 测试 | 分支覆盖率目标 70%，当前 57% | In Progress |
| #004 | Low | 测试 | feat/authority 合并后行覆盖率从 81% 降至 66%（已恢复 78%）| In Progress |
| #005 | Low | 后端 | resolveRepositoryIds 逻辑在多个 Service 重复 | Open |
| #006 | Low | 后端 | 部分 Service 直接 new PrismaClient()，非 DI | Open |
| #007 | Medium | 前端 | 部分页面仍用 useEffect 获取数据，违反 React Query 规范 | Open |
| #008 | Low | 前端 | 部分组件硬编码十六进制颜色，违反样式规范 | Open |
| #009 | Low | 后端 | 缺少 /health 健康检查端点，影响容器化就绪探测 | Open |
| #010 | Low | 后端 | IM Webhook 验证仅字符串比对，未使用 HMAC | Open |
| #011 | Low | CI/CD | E2E 覆盖率未上报 Codecov | Open |
| #012 | Low | 前端 | api-client.ts 并发刷新令牌可能触发双重刷新 | Open |

### 8.3 缺陷管理流程

`docs/KNOWN_ISSUES.md` 中定义了完整的五步生命周期：

```
发现 → 追加 ID，标记 Open
  ↓
确认 → 复现后更新严重度和计划修复版本
  ↓
修复中 → 状态改为 In Progress，记录 PR 号
  ↓
已修复 → 状态改为 Fixed，版本号，移入 CHANGELOG
  ↓
关闭 → 验证通过后从活跃列表移除（保留历史）
```

### 8.4 Git 提交规范（Conventional Commits）

分支上所有 commit 均遵循规范：

| 类型 | 用途 | 示例 |
|------|------|------|
| `feat:` | 新功能 | feat(workbench): chat section refactor |
| `fix:` | Bug 修复 | fix(test): 修复 E2E 测试数据 |
| `test:` | 测试相关 | test: 补充系统测试套件 |
| `docs:` | 文档变更 | docs: 修正覆盖率记录 |
| `ci:` | CI/CD 配置 | ci: 添加 E2E Job |

### 8.5 评分

| 评分项 | 满分 | 得分 | 说明 |
|-------|------|------|------|
| CHANGELOG 存在且规范 | 6 | 6 | Keep a Changelog 格式，覆盖 6 个版本 |
| 已知问题追踪 | 6 | 5 | 12 条已知问题，含严重度/状态/计划；无正式 Issue 追踪工具 |
| 缺陷管理流程文档 | 4 | 4 | KNOWN_ISSUES.md 有完整五步流程 |
| 提交历史可追溯 | 4 | 4 | Conventional Commits 执行，PR 描述规范 |
| **小计** | **20** | **19** | |

---

## 九、其他（10分）

### 9.1 CI/CD 自动化架构

`.github/workflows/ci.yml` 三 Job 结构：

```
Job: build
  ├─ pnpm install
  ├─ pnpm db:generate
  ├─ pnpm build
  ├─ pnpm --filter api test:cov    ← 单元测试 + 覆盖率
  └─ Codecov 上报（flags: unit）

Job: test-e2e
  ├─ Docker: postgres:16-alpine + redis:7-alpine
  ├─ prisma migrate deploy
  └─ pnpm --filter api test:e2e   ← E2E 测试（真实 DB）

Job: ci-success（Gate Keeper）
  └─ 仅当 build + test-e2e 均成功时通过
```

### 9.2 测试脚本

| 脚本 | 命令 | 用途 |
|------|------|------|
| `test` | `jest` | 单元测试 |
| `test:cov` | `jest --coverage` | 单元测试 + 覆盖率报告 |
| `test:e2e` | `jest --config test/jest-e2e.json --runInBand` | E2E 测试 |
| `test:perf` | `jest --config test/jest-perf.json --runInBand` | 性能测试 |
| `test:stability` | `jest --testPathPattern="test/stability"` | 稳定性测试 |

### 9.3 评分

| 评分项 | 满分 | 得分 | 说明 |
|-------|------|------|------|
| CI 自动化完整 | 4 | 4 | 单元 + E2E 双 Job，Gate Keeper 模式 |
| Codecov 集成 | 2 | 2 | 覆盖率自动上报，覆盖率徽章 |
| 覆盖率强制阈值 | 2 | 2 | Jest coverageThreshold 已配置 |
| 测试脚本完整性 | 2 | 1 | 5 个脚本，E2E 覆盖率未上报 Codecov（#011）|
| **小计** | **10** | **9** | |

---

## 十、打分汇总

| 维度 | 满分 | 得分 |
|------|------|------|
| 单元测试 | 20 | **19** |
| 功能测试（E2E） | 20 | **19** |
| 性能测试 | 10 | **10** |
| 稳定性测试 | 10 | **9** |
| 测试总结报告 | 10 | **10** |
| 缺陷管理 | 20 | **19** |
| 其他 | 10 | **9** |
| **合计** | **100** | **95** |

---

## 十一、优点

1. **测试规模**：41 个套件，771 个用例，100% 通过率，覆盖全部 15 个主要业务模块
2. **覆盖率持续治理**：设置了覆盖率强制阈值 + Codecov 集成，防止覆盖率回退；从 feat/authority 合并后的 66% 恢复至 78%
3. **E2E 完整业务链路**：10 个端对端测试文件，从 Webhook 接入到 AI 分析、审批、通知，完整链路有测试支撑
4. **稳定性测试有亮点**：专门的容错降级测试（fault-tolerance.spec.ts）验证了 4 类依赖服务故障时核心链路不崩溃；并发测试（concurrency.spec.ts）验证了无数据串扰
5. **缺陷管理成体系**：CHANGELOG + KNOWN_ISSUES + 生命周期流程 + Conventional Commits，缺陷可追溯

---

## 十二、改进建议

| 优先级 | 项目 | 具体措施 |
|-------|------|---------|
| P1 | 分支覆盖率偏低（56.94%）| 针对 NotificationService/FilterService 等条件分支密集的模块补充边界用例，目标 ≥ 65% |
| P2 | E2E 覆盖率未上报（#011）| CI 中补充 E2E Codecov 上报（flags: e2e），获得完整覆盖率视图 |
| P2 | 飞书消息未实装（#001）| 接入飞书 Bot SDK，实现实际发送逻辑，对应测试覆盖真实发送路径 |
| P3 | 无长时间稳定性测试 | 补充 5 分钟持续运行场景（BullMQ 队列积压恢复、WebSocket 长连接保活）|
| P3 | 性能测试用真实数据量 | 在生产规模数据（10 万+ 事件）下重跑 benchmark，建立真实性能基线 |
| P3 | Workbench E2E 缺失 | 补充 workbench.e2e-spec.ts，覆盖 getChatRepositories/getWatchFeed |
