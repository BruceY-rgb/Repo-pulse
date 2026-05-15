# 4. 组件图 / 模块依赖图

> 对应《系统设计书》「组件设计 / 详细设计」章节（20 分项核心图）。

后端共 **13 个 NestJS 模块**，按职责分为三组：

- **边缘模块**：处理外部输入（OAuth 回调、Webhook 推送、定时同步）。
- **核心模块**：主链路 Event → AI → Filter → Approval → Notification。
- **支撑模块**：跨切面能力（仓库管理、用户管理、配置、看板、报告）。

## 后端模块依赖图

```mermaid
flowchart LR
    subgraph EDGE["边缘模块 · Edge"]
        direction TB
        Auth["Auth<br/>OAuth · JWT"]
        Webhook["Webhook<br/>验签 · 入队"]
        Sync["Sync<br/>仓库定时同步"]
    end

    subgraph CORE["核心模块 · Core Pipeline"]
        direction LR
        Event["Event<br/>归一 · Gateway"]
        AI["AI<br/>分析 · SSE 流式"]
        Filter["Filter<br/>规则引擎"]
        Approval["Approval<br/>审批工作流"]
        Notification["Notification<br/>多渠道分发"]
    end

    subgraph SUPPORT["支撑模块 · Support"]
        direction TB
        Repository["Repository<br/>仓库 CRUD"]
        User["User<br/>用户管理"]
        Settings["Settings<br/>AI · 通知偏好"]
        Dashboard["Dashboard<br/>DORA 聚合"]
        Report["Report<br/>周月报生成"]
    end

    Webhook ==> Event
    Sync ==> Event
    Event ==> AI
    AI ==> Filter
    Filter ==> Approval
    Approval ==> Notification

    Auth -.-> User
    Auth -.-> Repository
    Repository -.-> Webhook
    Settings -.-> AI
    Settings -.-> Notification
    User -.-> Notification
    Filter -.-> User
    Dashboard -.-> Event
    Dashboard -.-> AI
    Report -.-> Event
    Report -.-> AI

    classDef edge fill:#fef3c7,stroke:#92400e,stroke-width:1.5px,color:#1c1917;
    classDef core fill:#fed7aa,stroke:#c2410c,stroke-width:2.5px,color:#1c1917;
    classDef support fill:#e9d5ff,stroke:#7e22ce,stroke-width:1.5px,color:#1c1917;

    class Auth,Webhook,Sync edge;
    class Event,AI,Filter,Approval,Notification core;
    class Repository,User,Settings,Dashboard,Report support;
```

**图例**：粗实箭头 `==>` 表示主链路数据流；虚箭头 `-.->` 表示依赖关系。

## 模块职责说明

### 边缘模块

| 模块 | 主要职责 | 关键文件 |
| :--- | :--- | :--- |
| **Auth** | GitHub OAuth 登录、JWT 签发、HttpOnly Cookie 写入、Guards | `auth.controller.ts`, `strategies/`, `guards/` |
| **Webhook** | Raw Body HMAC-SHA256 验签、按仓库 Secret 查找、入 BullMQ 队列 | `webhook.controller.ts`, `webhook.service.ts` |
| **Sync** | 定时拉取仓库元数据、Webhook 健康检查 | `sync.service.ts` |

### 核心模块

| 模块 | 主要职责 | 关键文件 |
| :--- | :--- | :--- |
| **Event** | GitHub / GitLab 格式归一、Event 持久化、WebSocket Gateway 广播 | `event.processor.ts`, `event.gateway.ts` |
| **AI** | AI 任务队列消费、调用 `@repo-pulse/ai-sdk`、SSE 流式输出、结果落库 | `ai-analysis.processor.ts`, `ai.controller.ts` |
| **Filter** | INCLUDE / EXCLUDE / TAG 规则匹配、按优先级裁决通知去向 | `filter.service.ts` |
| **Approval** | 审批队列、编辑双版本保留（originalContent / editedContent）、状态机驱动 | `approval.service.ts` |
| **Notification** | 邮件 / 钉钉 / 飞书 / 站内信适配器、失败重试、已读追踪 | `channels/`, `notification.service.ts` |

### 支撑模块

| 模块 | 主要职责 |
| :--- | :--- |
| **Repository** | 仓库绑定、Webhook 注册、`UserRepository` 关联管理 |
| **User** | 用户 CRUD、角色管理 |
| **Settings** | 个人 AI Provider 配置（加密存储）、通知偏好、主题 |
| **Dashboard** | DORA 4 指标聚合查询、风险趋势统计 |
| **Report** | 周 / 月报模板渲染、跨仓库聚合（P2 阶段） |

## 前端组件层次

```mermaid
flowchart TB
    App["App.tsx<br/>根组件"]
    App --> Router["React Router<br/>路由表"]

    Router --> Pages["pages/ · 10 个主页面"]
    Router --> Layout["components/layout/<br/>导航 · 侧边栏 · 主题切换"]

    subgraph PageGroup["页面组"]
        direction LR
        P1["Landing"]
        P2["Login / AuthCallback"]
        P3["Dashboard"]
        P4["Repositories"]
        P5["AIAnalysis"]
        P6["Approvals"]
        P7["Notifications"]
        P8["Reports"]
        P9["Settings"]
    end
    Pages --> PageGroup

    PageGroup --> Hooks["hooks/<br/>TanStack Query"]
    PageGroup --> UI["components/ui/<br/>shadcn 30+ 组件"]
    PageGroup --> Stores["stores/<br/>Zustand 全局 UI"]

    subgraph HookList["核心 hooks"]
        direction LR
        H1["use-repositories"]
        H2["use-events"]
        H3["use-sse"]
        H4["use-web-socket"]
        H5["use-approvals"]
        H6["use-notifications"]
        H7["use-settings"]
    end
    Hooks --> HookList

    HookList --> Services["services/<br/>axios · 接口契约"]
    Services --> Backend[("apps/api<br/>REST · SSE · WebSocket")]

    classDef root fill:#dbeafe,stroke:#1e40af,stroke-width:1.5px,color:#0f172a;
    classDef pageBox fill:#fef3c7,stroke:#92400e,stroke-width:1.5px,color:#1c1917;
    classDef pageItem fill:#fed7aa,stroke:#c2410c,stroke-width:1.5px,color:#1c1917;
    classDef hook fill:#e9d5ff,stroke:#7e22ce,stroke-width:1.5px,color:#1c1917;
    classDef be fill:#bbf7d0,stroke:#15803d,stroke-width:1.5px,color:#0f172a;

    class App,Router,Layout,Pages root;
    class P1,P2,P3,P4,P5,P6,P7,P8,P9 pageItem;
    class Hooks,Stores,UI,H1,H2,H3,H4,H5,H6,H7,Services hook;
    class Backend be;
```

## 共享包

| 包 | 职责 |
| :--- | :--- |
| `@repo-pulse/shared` | 前后端共享的 TypeScript 类型、常量、Payload 接口 |
| `@repo-pulse/database` | Prisma Schema + 客户端 |
| `@repo-pulse/ai-sdk` | 多 Provider 抽象层（统一 `chat()` / `stream()` 接口） |
