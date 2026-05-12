# AI Service Layer

> **作用范围**：`packages/ai-sdk`、`packages/shared`、`packages/database`、`apps/api/src/modules/ai`、`apps/api/src/modules/event`、`apps/web/src/{services,hooks,pages/analysis}`
> **执行约束**：本计划与 `CLAUDE.md` 第 2 章渐进式开发步长共同生效。每个 Step 必须经过用户验收后才能进入下一个 Step。

---

## 1. 修改摘要

本次修订的核心是把"模型层是否可被信任"作为整个 AI Service Layer 的入口条件，而不是默认假设。在原计划"shared 类型 → ai-sdk → DB → service → controller → queue → 前端"的基础上，前置一个 **Step 0：AI Provider 后端离线验证**，并对若干语义和优先级做了调整。

主要改动点：

- 新增 **Step 0**：在不接 DB / 队列 / 前端的前提下，验证 `NormalizedRepoEvent → Provider → Prompt JSON → parse → Zod → AnalysisOutput` 链路。
- **AnalysisStatus** 不再引入 `RUNNING`，复用现有的 `PROCESSING`，最终态收敛为 `PENDING / PROCESSING / COMPLETED / FAILED / SKIPPED`。
- **SKIPPED 语义收紧**：已存在 `COMPLETED` 且 `force=false` 时，不再写 `SKIPPED` 记录，直接返回已有结果。
- **AIEventNormalizer** 增加 `sanitizeBody`（脱敏）阶段，处理顺序固定为 `sanitize → truncate → buildInput → send`。
- **成本控制策略** 由"截断 + 去重"扩展为多级开关、配额、重试上限、事件类型白名单。
- **Provider 配置优先级**写明四级回退：用户 → 仓库/组织 → 系统 ENV → Mock/Disabled。
- **summary 字段双写**明确映射规则：`summaryShort → summary`、`riskReasons[0] → riskReason`、`category + tags → categories`。
- **`/ai/stream/:eventId` 降级为非 MVP**，MVP 必做接口为 `trigger / analysis / analysis-list (+ dev-only debug)`。
- **测试计划**按 Provider / Normalizer / Service / Queue / 前端五层分别设定。

代码侧已经发现的两个真实问题，本计划必须顺手解决：

- [ai.service.ts:94](../apps/api/src/modules/ai/ai.service.ts#L94) 不论用户配置如何都直接 `new OpenAIProvider`，导致用户选 anthropic 也会走 OpenAI 协议。
- [providers/index.ts](../packages/ai-sdk/src/providers/index.ts) 里的 `createProvider()` 把 `anthropic` 走进了 `OpenAICompatibleProvider` 分支，没有路由到 [anthropic.ts](../packages/ai-sdk/src/providers/anthropic.ts)。
- [anthropic.ts:46-47](../packages/ai-sdk/src/providers/anthropic.ts#L46-L47) 用 `JSON.parse(jsonMatch?.[0] ?? '{}')`，模型一旦失败直接抛错或者返回空对象，没有 schema 校验，符合"风险点"。

---

## 2. 为什么要新增 Step 0

AI Analysis 链路最大的不确定性集中在 **模型输出是否结构化、是否可解析、风险判断是否合理**，而不是接口怎么接、页面怎么画。如果这层不稳：

- 即使 Service / Queue / 前端 100% 写好，AI 字段写进 DB 仍是 `summary: 'Analysis failed'`，最终页面是空壳。
- 一旦上线在线 debug，定位非常困难——错误可能出现在 prompt、模型、parser、schema 任何一层。
- 多 Provider 切换之后（Anthropic / OpenAI / Gemini / Ollama）会反复回炉同一个问题。

Step 0 的本质是 **把"模型层契约"从假设变成被验证过的事实**：

- 给定 5–10 个真实风格的事件输入；
- 让真实 Claude 调用一次；
- 记录原始返回；
- 跑 `parseAndValidateAnalysisOutput`；
- 对照人工预期检查 `category / riskLevel / suggestedAction`。

通过之后，后续所有 Step 都可以基于 **"模型层一定能给出合法 AnalysisOutput"** 来设计；任何一层出问题都能被快速定位（要么是 normalizer 没塞对输入，要么是 service 没存对，要么是前端没读对）。

CI 中不应消耗真实模型 quota，所以 Step 0 一定要附带 **MockProvider**，让后续 Step 1–10 的自动化测试都基于 Mock。

---

## 3. 调整后的施工顺序

| Step  | 名称                                                      | 是否阻塞下一步 | 是否 MVP |
| :---- | :-------------------------------------------------------- | :------------- | :------- |
| **0** | AI Provider 后端离线验证                                  | ✅ 是           | ✅ 是     |
| 1     | Shared 类型扩展                                           | ✅ 是           | ✅ 是     |
| 2     | AI SDK 升级（Provider / Prompt / Parser / Schema / Mock） | ✅ 是           | ✅ 是     |
| 3     | 数据库扩展（AIAnalysis 字段 + Prisma enum）               | ✅ 是           | ✅ 是     |
| 4     | AIEventNormalizer（过滤 / 脱敏 / 截断）                   | ✅ 是           | ✅ 是     |
| 5     | AIService.analyzeEvent 改造                               | ✅ 是           | ✅ 是     |
| 6     | Controller API（trigger / analysis / list / dev-debug）   | ✅ 是           | ✅ 是     |
| 7     | Queue Processor（force / retry / Mock 测试）              | ✅ 是           | ✅ 是     |
| 8     | EventService 接入分析入队                                 | ✅ 是           | ✅ 是     |
| 9     | 前端 service + TanStack Query hooks                       | ✅ 是           | ✅ 是     |
| 10    | 前端 /analysis 页面真实化                                 | ✅ 是           | ✅ 是     |
| 11    | 可选增强：WebSocket / Backfill / RAG / Embedding          | ❌ 否           | ❌ 否     |

执行原则：**Step N 不通过用户验收，禁止开始 Step N+1**（CLAUDE.md §2.3）。

---

## 4. 各 Step 详细设计

### Step 0：AI Provider 后端离线验证

**目标**

不接 DB、不接队列、不接前端，验证 `NormalizedRepoEvent → Provider → Prompt JSON → parse → Zod → AnalysisOutput`。

**改动文件 / 新增文件**

- 新增 `packages/ai-sdk/src/schemas/analysis-output.schema.ts` — Zod schema
- 新增 `packages/ai-sdk/src/utils/parse-analysis-output.ts` — `parseJsonOutput` / `parseAndValidateAnalysisOutput` / `sanitizeAnalysisOutput`
- 新增 `packages/ai-sdk/src/providers/mock.ts` — MockProvider（CI 用）
- 新增 `packages/ai-sdk/test/fixtures/` — 5–10 个标准化事件样例 JSON
- 新增 `apps/api/scripts/ai-test.ts` — CLI 入口
- 修改 `apps/api/package.json` — `"ai:test": "tsx scripts/ai-test.ts"`
- （可选）新增 `apps/api/src/modules/ai/ai.debug.controller.ts` — `POST /ai/debug/analyze-sample`，仅 `NODE_ENV=development` 时挂载

**核心逻辑**

1. Zod Schema（详见 §6）。
2. Parser：先剥 markdown code block，再用正则提取 `{...}`，失败返回 `null`，调用方决定是否 retry。
3. Prompt：明确要求"只返回 JSON，不要任何 markdown 包裹、不要解释文字"，并要求字段全部使用枚举值（避免模型自创 `categories: "code-improvement"`）。
4. 5–10 个 fixtures 覆盖文档/重构/认证/迁移/泄露五种场景，每个 fixture 附带 `expected` 字段，CLI 跑完打印 pass/fail 表格。

**验收标准**

- `pnpm --filter api ai:test` 全部样例返回合法 JSON、Zod 校验通过；
- `riskLevel / suggestedAction` 至少 80% 与 expected 一致（语义题，不强求 100%）；
- 故意构造一个"模型只会胡乱回话"的伪 Provider，retry 1 次后写入 FAILED，不抛异常到调用方；
- MockProvider 在 CI 中可固定输出，无网络请求。

---

### Step 1：Shared 类型扩展

**改动文件**

- `packages/shared/src/types/index.ts`（已有 `EventType / RiskLevel / AnalysisStatus`，需新增 `EventCategory / SuggestedAction`，扩展 `AnalysisStatus`）
- `packages/shared/src/index.ts`（导出）

**核心逻辑**

```ts
export enum EventCategory {
  FEATURE = 'FEATURE',
  BUGFIX = 'BUGFIX',
  REFACTOR = 'REFACTOR',
  DOCS = 'DOCS',
  TEST = 'TEST',
  DEPENDENCY = 'DEPENDENCY',
  SECURITY = 'SECURITY',
  RELEASE = 'RELEASE',
  UNKNOWN = 'UNKNOWN',
}

export enum SuggestedAction {
  REVIEW_REQUIRED = 'REVIEW_REQUIRED',
  TEST_REQUIRED = 'TEST_REQUIRED',
  SAFE_TO_IGNORE = 'SAFE_TO_IGNORE',
  NOTIFY_OWNER = 'NOTIFY_OWNER',
  CREATE_APPROVAL = 'CREATE_APPROVAL',
}

export enum AnalysisStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  SKIPPED = 'SKIPPED',  // 新增
}

export interface NormalizedRepoEvent {
  eventId: string;
  repositoryId: string;
  type: EventType;
  title: string;
  body: string;        // 已经 sanitize + truncate
  author?: string;
  language: 'zh' | 'en';
  context: { repository: string; branch?: string; url?: string };
}

export interface EventAnalysisDto {
  eventId: string;
  status: AnalysisStatus;
  summaryShort: string;
  summaryLong: string;
  category: EventCategory;
  riskLevel: RiskLevel;
  riskScore: number;
  riskReasons: string[];
  tags: string[];
  affectedAreas: string[];
  impactSummary: string;
  suggestedAction: SuggestedAction;
  confidence: number;
  model: string;
  tokensUsed: number;
  latencyMs: number;
  createdAt: string;
}
```

**验收标准**

- `pnpm --filter @repo-pulse/shared build` 通过；
- `pnpm build` 全 monorepo 通过（确保依赖该包的 api/web 不会断）。

---

### Step 2：AI SDK 升级

**改动文件**

- `packages/ai-sdk/src/interfaces/ai-provider.ts` — 扩展 `AnalysisOutput`
- `packages/ai-sdk/src/prompts/index.ts` — 重写 prompt
- `packages/ai-sdk/src/providers/anthropic.ts` — 接 parser / schema
- `packages/ai-sdk/src/providers/index.ts` — **修复 `createProvider('anthropic', ...)` 当前错误地走到 OpenAICompatibleProvider 的 bug**
- 新增 MockProvider（Step 0 已落地）

**核心逻辑**

`AnalysisOutput` 同时包含新旧字段，用于双写过渡（详见 §5、§6）：

```ts
export interface AnalysisOutput {
  // 新字段
  summaryShort: string;
  summaryLong: string;
  category: EventCategory;
  riskLevel: RiskLevel;
  riskScore: number;
  riskReasons: string[];
  tags: string[];
  affectedAreas: string[];
  impactSummary: string;
  suggestedAction: SuggestedAction;
  confidence: number;
  // 旧字段（仅服务端兼容写入用，前端不再消费）
  summary?: string;
  riskReason?: string;
  categories?: string[];
  keyChanges?: string[];
  suggestions?: Suggestion[];
  // 元信息
  tokensUsed: number;
  latencyMs: number;
}
```

`AnthropicProvider.analyze` 改为：

```
raw text → parseJsonOutput → Zod validate
  → 失败 → retry 1 次（temperature=0）
  → 仍失败 → throw AIParseError
```

**验收标准**

- `createProvider('anthropic', key)` 返回 `AnthropicProvider` 实例；
- 给定 fixture，`provider.analyze()` 返回的对象通过 `AnalysisOutputSchema.parse`；
- MockProvider 单测全绿；
- `pnpm --filter @repo-pulse/ai-sdk typecheck` 通过。

---

### Step 3：数据库扩展

**改动文件**

- `packages/database/prisma/schema.prisma`

**核心逻辑**

```prisma
enum AnalysisStatus {
  PENDING
  PROCESSING
  COMPLETED
  FAILED
  SKIPPED   // 新增
}

enum EventCategory { FEATURE BUGFIX REFACTOR DOCS TEST DEPENDENCY SECURITY RELEASE UNKNOWN }
enum SuggestedAction { REVIEW_REQUIRED TEST_REQUIRED SAFE_TO_IGNORE NOTIFY_OWNER CREATE_APPROVAL }

model AIAnalysis {
  id            String         @id @default(cuid())
  eventId       String         @unique  // ← 一个事件只允许一条 COMPLETED；force 不新增行而是 update
  model         String

  // 新字段（全部可选以兼容旧记录）
  summaryShort     String?         @db.Text
  summaryLong      String?         @db.Text
  category         EventCategory?
  riskScore        Int?
  riskReasons      String[]        @default([])
  tags             String[]        @default([])
  affectedAreas    String[]        @default([])
  impactSummary    String?         @db.Text
  suggestedAction  SuggestedAction?
  confidence       Float?

  // 旧字段保留（双写）
  summary       String         @db.Text
  riskLevel     RiskLevel
  riskReason    String?        @db.Text
  categories    String[]
  sentiment     Float?
  keyChanges    Json           @default("[]")
  suggestions   Json           @default("[]")

  tokensUsed    Int            @default(0)
  latencyMs     Int            @default(0)
  status        AnalysisStatus
  errorMessage  String?
  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt

  event         Event          @relation(fields: [eventId], references: [id], onDelete: Cascade)

  @@index([status])
  @@index([category, riskLevel])
}
```

注意：`eventId` 加 `@unique` 是配合 §5 SKIPPED 语义调整的关键 —— `upsert` 而不是 `create`。

**迁移步骤**

1. `pnpm db:generate` 同步 Prisma Client
2. `pnpm db:migrate dev --name ai_analysis_extend`
3. 已有 `AIAnalysis` 旧记录新字段为 `null`，前端必须容错

**验收标准**

- 迁移在本地 PG 顺利执行且回滚脚本可用；
- 旧记录读取不报错；
- `prisma.aIAnalysis.upsert({ where: { eventId } })` 类型可用。

---

### Step 4：AIEventNormalizer

**改动文件**

- 新增 `apps/api/src/modules/ai/ai-event.normalizer.ts`

**核心逻辑**

```ts
class AIEventNormalizer {
  shouldAnalyze(event: Event, force = false): { ok: boolean; skipReason?: string };
  buildAnalysisInput(event: Event): NormalizedRepoEvent;
  sanitizeBody(text: string): string;
  truncateBody(text: string, max?: number): string;
}
```

处理顺序固定：

```
event.body
  → sanitizeBody          (脱敏)
  → truncateBody          (截断)
  → buildAnalysisInput    (装配)
  → 交给 Provider
```

**`shouldAnalyze` 跳过规则**：

| 条件                                                | 跳过原因                  | 是否能被 force 绕过 |
| :-------------------------------------------------- | :------------------------ | :------------------ |
| `event.type` 不在 `[PUSH, PR_OPENED, ISSUE_OPENED]` | `unsupported_event_type`  | ❌ 不可              |
| `body` 为空且 `title` 长度 < 10                     | `empty_content`           | ❌ 不可              |
| 系统 `AI_ANALYSIS_ENABLED=false`                    | `system_disabled`         | ❌ 不可              |
| 仓库 `aiAnalysisEnabled=false`                      | `repository_disabled`     | ✅ 可                |
| 当日仓库分析数 ≥ `AI_MAX_DAILY_EVENTS_PER_REPO`     | `quota_exceeded`          | ✅ 可                |
| 缺少有效 provider/apiKey                            | `provider_not_configured` | ❌ 不可              |

**脱敏正则集合**（至少覆盖）：

- GitHub PAT: `gh[pousr]_[A-Za-z0-9]{36,}`
- Bearer / Authorization: `Bearer\s+[A-Za-z0-9._\-]+`
- 通用 API key: `(?i)(api[_-]?key|secret|password|token)\s*[:=]\s*['"]?[A-Za-z0-9_\-]{16,}`
- PEM block: `-----BEGIN [A-Z ]+PRIVATE KEY-----[\s\S]+?-----END [A-Z ]+PRIVATE KEY-----`
- `.env` 行: `^[A-Z][A-Z0-9_]+=.+$`（多行模式）
- email: `[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}`

替换文本统一为 `[REDACTED:<kind>]`，便于排查。

**验收标准**

- 单测覆盖：每条规则一条 case；
- `force=true` 不能绕过 sanitize（关键安全约束）；
- 截断阈值由 `AI_MAX_BODY_CHARS`（默认 4000）控制。

---

### Step 5：AIService.analyzeEvent 改造

**改动文件**

- `apps/api/src/modules/ai/ai.service.ts`

**新签名**

```ts
analyzeEvent(eventId: string, options?: { force?: boolean }): Promise<EventAnalysisDto>
```

**流程**

```
1. 加载 event + repository + user
2. 查询已有 AIAnalysis (where eventId)
   - 有 COMPLETED 且 force=false → 直接返回（不写 SKIPPED 行）
3. normalizer.shouldAnalyze(event, force)
   - 不通过 → upsert SKIPPED { skipReason }，返回
4. 解析 Provider 配置（§7 优先级）
   - 缺 key → upsert FAILED { errorMessage: 'provider_not_configured' }
5. normalizer.buildAnalysisInput(event)
6. provider.analyze(input)
   - 抛 AIParseError → upsert FAILED
   - 抛网络错误 → 抛出，由 Queue 决定 retry
7. upsert 成功记录（双写新旧字段，§8）
8. 返回 EventAnalysisDto
```

**字段双写映射**（详见 §8）。

**验收标准**

- 新事件分析成功；
- 已有 COMPLETED + `force=false` → 不新增行，直接返回；
- `force=true` → 同 eventId upsert 覆盖；
- provider 无 key → 写 FAILED，且不抛 500；
- 模型返回非法 JSON → 写 FAILED，errorMessage 含 schema validation error。

---

### Step 6：Controller API

**改动文件**

- `apps/api/src/modules/ai/ai.controller.ts`
- 新增 `apps/api/src/modules/ai/ai.debug.controller.ts`（dev-only）

**MVP 必做接口**

| Method | Path                       | 说明                                                                           |
| :----- | :------------------------- | :----------------------------------------------------------------------------- |
| POST   | `/ai/trigger/:eventId`     | Body `{ force?: boolean }`，入队                                               |
| GET    | `/ai/analysis/:eventId`    | 返回 `EventAnalysisDto` 或 `{ status: 'pending' }`                             |
| GET    | `/ai/analysis/events`      | 列表，query: `riskLevel / category / status / repositoryId / page / pageSize`  |
| POST   | `/ai/debug/analyze-sample` | dev-only，输入 `NormalizedRepoEvent`，直返 `AnalysisOutput + validationResult` |

**降级**

- `GET /ai/stream/:eventId` 不在 MVP 范围。代码保留但显式标记 `@deprecated`，且修复其 `ai.controller.ts:85-90` 硬编码 `OpenAIProvider` 的 bug，避免误用时直接崩。

**验收标准**

- 接口契约可用 supertest 跑通；
- 列表查询带筛选时 SQL 走索引（`@@index([category, riskLevel])`）；
- dev controller 仅在 `NODE_ENV=development` 注册（在 `ai.module.ts` 用条件 providers）。

---

### Step 7：Queue Processor

**改动文件**

- `apps/api/src/modules/ai/ai-analysis.processor.ts`

**核心逻辑**

```ts
@Processor('ai-analysis')
class AIAnalysisProcessor {
  @Process('analyze-event')
  async handle(job: Job<{ eventId: string; force?: boolean }>) {
    return this.aiService.analyzeEvent(job.data.eventId, { force: job.data.force });
  }
}
```

BullMQ 配置：

- `attempts: AI_MAX_RETRY + 1`（默认 3）
- `backoff: { type: 'exponential', delay: 5000 }`
- `removeOnComplete: { count: 1000 }`
- `removeOnFail: { count: 1000 }`

**验收标准**

- 用 MockProvider 跑 100 个 job，全部 COMPLETED；
- 注入"间歇 503"的 Mock，retry 后最终 FAILED 且 errorMessage 准确；
- `force=true` 在队列中可正确传递。

---

### Step 8：EventService 接入分析入队

**改动文件**

- `apps/api/src/modules/event/event.service.ts`（事件创建处）

**核心逻辑**

```
event 入库 (事务 A)
  → 异步 dispatch:
    if (MVP_EVENT_TYPES.includes(type)) aiQueue.add('analyze-event', { eventId })
```

注意：

- 事件入库与 AI 入队解耦，**入队失败不能 rollback 事件入库**；
- 入队失败仅 `logger.warn`，不抛出。

**验收标准**

- 创建 PUSH/PR/ISSUE 事件 → 队列里出现 job；
- 创建 BRANCH_CREATED 等非 MVP 事件 → 不入队；
- AI 服务整个停摆时，事件仍能正常入库。

---

### Step 9：前端 Service + Hooks

**改动文件**

- 新增 `apps/web/src/services/analysis.service.ts`
- 新增 `apps/web/src/hooks/use-analysis.ts`（聚合 `useAnalysisList / useEventAnalysis / useTriggerAnalysis`）

**核心 hooks**

```ts
useAnalysisList(filters)        // GET /ai/analysis/events
useEventAnalysis(eventId)       // GET /ai/analysis/:eventId, refetchInterval when PENDING/PROCESSING
useTriggerAnalysis()            // POST /ai/trigger/:eventId, invalidate above on success
```

**验收标准**

- 类型从 `@repo-pulse/shared` 导入，无 `any`；
- `useEventAnalysis` 在 status 为 `PENDING/PROCESSING` 时按 3s 轮询，达到终态停止。

---

### Step 10：前端 /analysis 页面真实化

**改动文件**

- `apps/web/src/pages/analysis/*`
- 新增组件：`AnalysisCard`、`AnalysisDetail`、`RiskBadge`、`CategoryBadge`

**核心逻辑**

- 完全替换 mock 数据；
- 列表展示 `summaryShort + RiskBadge + CategoryBadge + suggestedAction`；
- 详情页展示 `summaryLong / riskReasons / affectedAreas / impactSummary / confidence`；
- 触发重新分析按钮 → `useTriggerAnalysis({ force: true })`；
- Loading / Error / Empty 三态必须独立组件，不允许 `if (!data) return null`。

**样式约束**：必须使用 `frontend-style-guide.md` 定义的 CSS 变量，`RiskBadge` 颜色映射（CRITICAL → `bg-destructive`、HIGH → `bg-orange-500/15 text-orange-500`、MEDIUM → `bg-yellow-500/15 text-yellow-500`、LOW → `bg-emerald-500/15 text-emerald-500`），不可硬编码十六进制。

**验收标准**：CLAUDE.md §3.1 全部红线通过 + UI 在浏览器实测。

---

### Step 11：可选增强（非 MVP）

- WebSocket 广播 `ai.analysis.complete` → 前端去掉轮询；
- Backfill 脚本批量分析历史事件；
- Reports / Approval 与 `suggestedAction` 联动；
- Embedding / RAG 检索相似事件。

---

## 5. 状态枚举与数据语义调整

### AnalysisStatus

最终采用：`PENDING / PROCESSING / COMPLETED / FAILED / SKIPPED`，**不引入 RUNNING**。理由：`PROCESSING` 已经表达"worker 在跑"，再加 `RUNNING` 仅会让前端 switch 多一个 case，且无法清晰说明两者分界。

| 状态         | 来源                                                      | 转换                               |
| :----------- | :-------------------------------------------------------- | :--------------------------------- |
| `PENDING`    | `AIService.triggerAnalysis` 入队前可选写入；或 job 排队中 | → PROCESSING                       |
| `PROCESSING` | processor 拿到 job、开始调 provider 时 upsert             | → COMPLETED / FAILED               |
| `COMPLETED`  | provider 返回合法 JSON 且 schema 通过                     | 终态（可被 force 覆盖）            |
| `FAILED`     | 模型异常 / parse 失败 / provider 缺配                     | 终态（可被 force 覆盖）            |
| `SKIPPED`    | normalizer.shouldAnalyze 拒绝（且非"已 COMPLETED"原因）   | 终态（可被 force 覆盖，规则见 §4） |

### SKIPPED 调整

**不再** "已存在 COMPLETED + force=false → 写一条 SKIPPED 记录"。改为直接复用已有记录返回，避免每次刷新页面都 +1 条无意义行。

`SKIPPED` 仅用于 §4 表格中列出的真正"被规则跳过"的场景。

---

## 6. Provider / Prompt / Schema / Parser 设计

### Zod Schema

```ts
export const AnalysisOutputSchema = z.object({
  summaryShort: z.string().min(1).max(200),
  summaryLong: z.string().min(1).max(2000),
  category: z.nativeEnum(EventCategory),
  riskLevel: z.nativeEnum(RiskLevel),
  riskScore: z.number().int().min(0).max(100),
  riskReasons: z.array(z.string()).max(10),
  tags: z.array(z.string()).max(15),
  affectedAreas: z.array(z.string()).max(15),
  impactSummary: z.string().min(1).max(1000),
  suggestedAction: z.nativeEnum(SuggestedAction),
  confidence: z.number().min(0).max(1),
});
```

### Prompt 设计要点

- 系统提示中硬性规定 **"只输出 JSON、不输出 ```json fence"**，但 parser 仍要兼容 fence；
- 在 system prompt 中**完整列出枚举值**（包括 `category` 的 9 种和 `suggestedAction` 的 5 种），并给一条 few-shot 示例；
- temperature 默认 0.2，retry 时改为 0；
- 中文/英文 prompt 共享同一份字段定义，仅描述文字本地化。

### Parser

```ts
parseJsonOutput(raw: string): unknown | null
  // 1) 去掉 ```json ... ``` / ``` ... ```
  // 2) 再用 /\{[\s\S]*\}/ 提取首个 {...}
  // 3) JSON.parse；失败返回 null

parseAndValidateAnalysisOutput(raw: string): {
  ok: true; data: AnalysisOutput
} | {
  ok: false; error: string; raw: string
}

sanitizeAnalysisOutput(data: AnalysisOutput): AnalysisOutput
  // 兜底：truncate summaryLong/riskReasons 长度，
  // 把模型可能输出的 lower-case 枚举映射为 upper-case
```

### Provider 配置优先级（§7 提到的四级）

```
1. user.aiProvider / aiApiKey / aiBaseUrl / aiModel        (User 表)
2. repository.aiProvider / ...   (未来仓库级覆盖；预留接口，MVP 可不实现)
3. process.env.<DEFAULT>_API_KEY (ANTHROPIC_API_KEY 等)
4. MockProvider / DisabledProvider
   - DEV_USE_MOCK_AI=true → MockProvider
   - 否则 → throw ProviderNotConfiguredError
```

`createProvider()` 必须修复 `anthropic` 路由 bug，新增分支显式 `return new AnthropicProvider(...)`。

---

## 7. Normalizer 脱敏与成本控制

### 脱敏（详见 Step 4）

**关键约束**：`force=true` 不能绕过 `sanitizeBody`。原因：触发"重新分析"通常是用户行为，最容易把敏感日志当 body 重发。

### 成本控制配置项

| ENV                            | 默认                          | 说明                                          |
| :----------------------------- | :---------------------------- | :-------------------------------------------- |
| `AI_ANALYSIS_ENABLED`          | `true`                        | 系统级总开关                                  |
| `AI_MAX_BODY_CHARS`            | `4000`                        | body 截断阈值                                 |
| `AI_MAX_DAILY_EVENTS_PER_REPO` | `200`                         | 每仓库每日上限                                |
| `AI_MAX_RETRY`                 | `2`                           | provider 调用重试上限（含 schema retry 1 次） |
| `AI_MVP_EVENT_TYPES`           | `PUSH,PR_OPENED,ISSUE_OPENED` | 入队白名单                                    |
| `DEV_USE_MOCK_AI`              | `false`                       | 强制使用 MockProvider                         |

**配额实现**：基于 Redis `INCR ai:quota:{repoId}:{YYYYMMDD}` + `EXPIRE 86400`，命中即 SKIPPED。

---

## 8. API 与队列接入方案 + summary 兼容映射

### 双写映射表

| 新字段                            | 旧字段        | 写入规则                                                                       |
| :-------------------------------- | :------------ | :----------------------------------------------------------------------------- |
| `summaryShort`                    | `summary`     | `summary = summaryShort`                                                       |
| `riskReasons[]`                   | `riskReason`  | `riskReason = riskReasons.join('; ')`（或 `riskReasons[0]`）                   |
| `category + tags`                 | `categories`  | `categories = [category, ...tags].slice(0, 10)`                                |
| `affectedAreas`                   | `keyChanges`  | `keyChanges = affectedAreas`（双向兼容）                                       |
| `suggestedAction + impactSummary` | `suggestions` | `suggestions = [{ type, title: suggestedAction, description: impactSummary }]` |

**理由**：旧 `summary` 在通知卡片、列表中已有展示位，长度受限；不能塞 `summaryLong` 的长文本。

### API 队列契约

- Job payload: `{ eventId: string; force?: boolean }`
- 返回值不通过 BullMQ result 传递（前端通过轮询 `GET /ai/analysis/:eventId` 获取）

---

## 9. 前端接入方案

详见 Step 9 / Step 10。补充几条强约束：

- **禁止** 在 `/analysis` 页面用 `useEffect + fetch`，必须 TanStack Query（CLAUDE.md §3.1）；
- **禁止** 在前端重定义 `EventAnalysisDto`；
- **禁止** 硬编码颜色，`RiskBadge` 通过 CSS 变量；
- 触发重新分析必须有二次确认（toast confirm 即可），避免误点击消耗 quota。

---

## 10. 测试计划

### 10.1 Provider 层

- `MockProvider`：固定输入 → 固定输出（unit）
- `AnthropicProvider`：仅本地，从 fixture 读 5–10 个事件人工跑一轮；CI 跳过
- `parseAndValidateAnalysisOutput`：
  - 纯 JSON ✅
  - ```json fence 包裹 ✅
  - 文本 + JSON + 文本 ✅
  - 非法 JSON → ok:false
  - schema 缺字段 → ok:false 且 error 指出字段名
  - 枚举值小写 → sanitize 后 ok:true

### 10.2 AIEventNormalizer

- `[PUSH, PR_OPENED, ISSUE_OPENED]` 通过；其他类型 SKIPPED
- body > 4000 字 → 截断到 4000
- token / bearer / api_key / PEM / .env / email 各一条 case 验证脱敏
- `force=true` 不绕过脱敏（**关键测试**）
- `force=true` 绕过 quota / repository_disabled

### 10.3 AIService

- 新事件分析成功（MockProvider）
- 已有 COMPLETED + force=false → 不新增、直接返回
- force=true → upsert 覆盖
- provider 缺失 → upsert FAILED, status 200
- 模型返回非法 JSON → upsert FAILED
- 双写：检查 DB 行同时含 `summaryShort` 与 `summary`

### 10.4 Queue / Event 集成

- 创建 PUSH event → 队列出现 job
- 创建 BRANCH_CREATED → 不入队
- 队列失败 3 次 → DB FAILED 且 event 入库不受影响
- AI 服务整体停摆 → event 仍正常入库

### 10.5 前端

- `/analysis` 不再有 mock import
- loading / error / empty 三态独立可见
- 筛选 `riskLevel=HIGH` → URL query 同步
- 触发重新分析 → mutation 成功后列表 invalidate

---

## 11. MVP 范围与非 MVP 延后项

### MVP（Step 0 → Step 10）

- AnthropicProvider + MockProvider
- 5 字段以上 AnalysisOutput + Zod
- 双写新旧字段
- `trigger / analysis / list` + dev-only debug
- `/analysis` 页面真实数据
- PUSH / PR_OPENED / ISSUE_OPENED 入队

### 非 MVP（Step 11 及后续）

- WebSocket 推送（替换前端轮询）
- Backfill 历史事件
- 仓库/组织级 AI 配置 UI
- Embedding / RAG / 相似事件
- OpenAI / Gemini / Ollama 多 Provider 抽样测试（Step 0 框架已支持，但 MVP 默认只验证 Anthropic）
- `/ai/stream/:eventId` 重写

---

## 12. 风险点与建议

| 风险                        | 触发条件                       | 缓解                                                                                          |
| :-------------------------- | :----------------------------- | :-------------------------------------------------------------------------------------------- |
| 模型 JSON 不稳定            | 输入异常或 prompt 边界         | Step 0 完成前不向后推进；retry 1 次；FAILED 兜底                                              |
| Anthropic key 计费失控      | 配额规则失效                   | Redis 配额 + 仓库开关 + 系统总开关三级                                                        |
| 脱敏漏网                    | 自定义 secret 模式             | 把脱敏规则做成独立模块 + 单测覆盖；后续可热更新                                               |
| Prisma enum 迁移失败        | PostgreSQL enum 加值需特殊语法 | 迁移脚本拆为 `ALTER TYPE ... ADD VALUE` 单独事务                                              |
| 旧 `summary` 字段长度限制   | 模型 summaryShort > 200 字     | sanitize 阶段 truncate                                                                        |
| 前端轮询风暴                | 大量 PENDING 同时打开          | refetchInterval 退避 + 终态停止                                                               |
| `force=true` 被滥用         | 用户重复点击                   | 二次确认 + mutation 节流                                                                      |
| createProvider 路由 bug     | 已存在，未发现                 | Step 2 第一件事就是修复 + 加单测                                                              |
| dev debug controller 误上线 | 配置错误                       | 在 `ai.module.ts` 用 `process.env.NODE_ENV === 'development'` 条件注册，并加 e2e 验证生产 404 |

---

**修改稿到此结束。** 请确认本计划，确认通过后再启动 Step 0 实施。
