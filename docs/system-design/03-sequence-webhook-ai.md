# 3. 核心流程时序图：Webhook → AI 分析 → SSE 推送

> 对应《系统设计书》「关键过程描述」章节（15 分项核心图）。

这是 Repo Pulse 的主链路。设计原则是 **"同步快通，异步深算"** —— 网关必须在 2 秒内完成入队并返回 200，AI 分析则走异步队列，最多 30 秒完成。

```mermaid
sequenceDiagram
    autonumber
    participant GH as GitHub / GitLab
    participant GW as API 网关
    participant WH as Webhook 模块
    participant Q as BullMQ 队列
    participant EP as Event 处理器
    participant DB as PostgreSQL
    participant AI as AI Worker
    participant SDK as ai-sdk 抽象层
    participant LLM as LLM Provider
    participant FE as 前端 React
    participant Notif as 通知中心

    rect rgba(254, 215, 170, 0.35)
    Note over GH,WH: 同步阶段 · ≤ 2 秒入队
    GH->>GW: POST /webhook 携签名头
    GW->>WH: 转发原始 Body
    WH->>WH: HMAC-SHA256 验签 按仓库 Secret
    alt 验签失败
        WH-->>GH: 401 Unauthorized
        WH->>DB: 写入审计日志
    else 验签通过
        WH->>Q: enqueue event-raw
        WH-->>GH: 200 OK
    end
    end

    rect rgba(219, 234, 254, 0.35)
    Note over Q,FE: 异步阶段 · 事件归一与持久化
    Q->>EP: consume event-raw
    EP->>EP: GitHub / GitLab 格式归一
    EP->>DB: INSERT Event
    EP->>Q: enqueue ai-analyze
    EP-->>FE: WebSocket emit event-created
    end

    rect rgba(187, 247, 208, 0.35)
    Note over Q,FE: 异步阶段 · AI 分析与流式推送
    Q->>AI: consume ai-analyze
    AI->>DB: AIAnalysis PROCESSING
    AI->>SDK: analyze event userConfig
    SDK->>LLM: chat.completions stream true
    loop SSE 流式分块
        LLM-->>SDK: chunk 摘要 风险 建议
        SDK-->>AI: 解析后 chunk
        AI-->>FE: SSE push 到 /ai/stream/:eventId
    end
    AI->>DB: AIAnalysis COMPLETED
    end

    rect rgba(254, 202, 202, 0.35)
    Note over AI,SDK: 失败兜底链路
    opt AI 调用失败
        AI->>AI: 指数退避重试 最多 3 次
        AI->>SDK: 切备选 Provider Fallback
        AI->>DB: 仍失败 标记 FAILED
    end
    end

    rect rgba(233, 213, 255, 0.35)
    Note over AI,Notif: 通知分发
    AI->>Notif: trigger eventId
    Notif->>Notif: 规则引擎按 FilterRule 优先级匹配
    opt 命中 INCLUDE 或 TAG
        Notif->>DB: INSERT Notification
        Notif-->>FE: WebSocket emit notification-new
        Notif->>Notif: 邮件 钉钉 飞书 推送
    end
    end
```

## 关键性能约束

| 阶段 | SLA |
| :--- | :--- |
| 网关入队（步骤 1–6） | **≤ 2 秒** (P95) |
| CRITICAL 级通知首次触发 | **≤ 1 秒** |
| AI 摘要 SSE 首帧 | **≤ 10 秒**（常规 PR） |
| 大 diff（>1K 行）AI 完成 | **≤ 15 秒**，分阶段推送 |
| AI 任务最大重试 | **3 次**，指数退避（1s / 4s / 16s） |

## 关联状态机

- **AI 分析任务**：`PENDING → PROCESSING → COMPLETED / FAILED`（见 `srs.md` 状态图 1）
- **审批工作流**：`PENDING → EDITED / APPROVED / REJECTED`（见 `srs.md` 状态图 2）
- **通知投递**：`PENDING → SENT / FAILED → READ`
