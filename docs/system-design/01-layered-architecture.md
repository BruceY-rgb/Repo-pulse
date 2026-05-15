# 1. 分层架构图

> 对应《系统设计书》「系统体系结构图」章节（10 分项核心图）。

Repo Pulse 采用 **5 层架构**，整体设计原则：**同步快通、异步深算、分层解耦**。

- **客户端层**：React 19 + Vite，通过 HTTPS / WebSocket / SSE 与后端通信。
- **API 网关层**：横切关注点（鉴权、签名校验、速率限制）。
- **业务层**：13 个 NestJS 模块按职责拆分为边缘 / 核心 / 支撑三组。
- **数据层**：PostgreSQL 持久化 + Redis 异步队列。
- **外部集成层**：通过 Webhook / OAuth 接 Git 平台，通过 AI SDK 抽象层接多家 LLM。

```mermaid
flowchart TB
    subgraph CLIENT["客户端层 · Client"]
        Browser["浏览器<br/>React 19 · Vite<br/>shadcn/ui · Tailwind"]
    end

    subgraph GATEWAY["API 网关层 · Gateway"]
        direction LR
        AuthGuard["鉴权<br/>JWT · HttpOnly Cookie"]
        Validate["验签<br/>HMAC-SHA256"]
        RateLimit["限流 · 日志"]
    end

    subgraph BUSINESS["业务层 · NestJS 13 Modules"]
        direction TB
        subgraph EDGE_BIZ["边缘"]
            direction LR
            Auth["Auth"]
            Webhook["Webhook"]
            Sync["Sync"]
        end
        subgraph CORE_BIZ["核心管道"]
            direction LR
            Event["Event"]
            AI["AI"]
            Filter["Filter"]
            Approval["Approval"]
            Notification["Notification"]
        end
        subgraph SUPPORT_BIZ["支撑"]
            direction LR
            Repo["Repository"]
            User["User"]
            Settings["Settings"]
            Dashboard["Dashboard"]
            Report["Report"]
        end
    end

    subgraph DATA["数据层 · Data"]
        direction LR
        Postgres[("PostgreSQL 16<br/>Prisma 6 · 10 Models")]
        Redis[("Redis 7<br/>BullMQ 异步队列")]
    end

    subgraph EXTERNAL["外部集成层 · External"]
        direction LR
        Git["GitHub / GitLab<br/>Webhook · OAuth"]
        LLM["LLM Providers<br/>Claude · GPT · Gemini ..."]
        Channels["邮件 · 钉钉 · 飞书"]
    end

    Browser -->|"HTTPS · WebSocket · SSE"| GATEWAY
    GATEWAY --> BUSINESS
    Git -->|"Webhook Push"| GATEWAY
    BUSINESS --> Postgres
    BUSINESS --> Redis
    BUSINESS -->|"OAuth · REST"| Git
    BUSINESS -->|"ai-sdk 抽象层"| LLM
    BUSINESS -->|"多渠道推送"| Channels

    classDef client fill:#dbeafe,stroke:#1e40af,stroke-width:1.5px,color:#0f172a;
    classDef gw fill:#fed7aa,stroke:#c2410c,stroke-width:1.5px,color:#1c1917;
    classDef edge fill:#fef3c7,stroke:#92400e,stroke-width:1.5px,color:#1c1917;
    classDef core fill:#fed7aa,stroke:#c2410c,stroke-width:2px,color:#1c1917;
    classDef support fill:#e9d5ff,stroke:#7e22ce,stroke-width:1.5px,color:#1c1917;
    classDef data fill:#bbf7d0,stroke:#15803d,stroke-width:1.5px,color:#0f172a;
    classDef ext fill:#f1f5f9,stroke:#64748b,stroke-width:1.5px,color:#0f172a;

    class Browser client;
    class AuthGuard,Validate,RateLimit gw;
    class Auth,Webhook,Sync edge;
    class Event,AI,Filter,Approval,Notification core;
    class Repo,User,Settings,Dashboard,Report support;
    class Postgres,Redis data;
    class Git,LLM,Channels ext;
```

## 关键说明

| 层 | 关键技术 | 设计要点 |
| :--- | :--- | :--- |
| 客户端 | React 19 + TanStack Query + Zustand + Socket.io-client | 服务端数据走 TanStack Query；实时通信走 WebSocket / SSE |
| API 网关 | NestJS Guards + Passport + `crypto.timingSafeEqual` | 验签必须基于原始 Body；Cookie 只用 HttpOnly |
| 业务层 | NestJS 11 + 依赖注入 + BullMQ Producer / Consumer | Webhook 必须 ≤ 2 秒入队；AI 分析走异步队列 |
| 数据层 | PostgreSQL 16 + Prisma 6；Redis 7 + BullMQ | 关键查询带复合索引；队列幂等去重 |
| 外部集成 | `@repo-pulse/ai-sdk` 抽象层 | 一键切换 7+ 家 LLM Provider |
