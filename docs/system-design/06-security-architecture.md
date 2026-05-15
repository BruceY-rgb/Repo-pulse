# 6. 安全架构图

> 对应《系统设计书》「可靠性 & 安全性设计」章节（10 分项关键图）。

Repo Pulse 采用 **三层兜底安全模型**：数据层加密、接口层校验、行为层审计。

## 三层安全架构

```mermaid
flowchart TB
    Attacker[("外部请求 · 伪造 Webhook · 凭据窃取尝试")]

    subgraph IFACE["接口层 · Interface Layer"]
        direction LR
        HTTPS["传输安全<br/>全站 HTTPS"]
        HMAC["Webhook 验签<br/>HMAC-SHA256<br/>按仓库 Secret · Raw Body"]
        JWT["鉴权<br/>JWT + HttpOnly Cookie"]
        RBAC["授权<br/>RBAC 四级角色"]
        RateLimit["速率限制<br/>失败入审计"]
    end

    subgraph BEHAVIOR["行为层 · Behavior Layer"]
        direction LR
        Sandbox["AI Sandbox<br/>受限容器执行"]
        Audit["操作审计<br/>关键动作全留痕"]
        Emergency["应急响应<br/>playbook · 自动隔离"]
    end

    subgraph DATA["数据层 · Data Layer"]
        direction LR
        Encrypt["凭据加密<br/>AES-256<br/>Token · API Key"]
        AuditLog[("审计日志表<br/>失败验签 · 操作记录")]
        Backup["备份策略<br/>RTO ≤ 1h · RPO ≤ 15min"]
    end

    Attacker -->|"请求"| HTTPS
    HTTPS --> HMAC
    HMAC -->|"通过"| JWT
    HMAC -->|"失败"| AuditLog
    JWT -->|"通过"| RBAC
    JWT -->|"失败"| AuditLog
    RBAC --> Sandbox
    RBAC --> Audit
    Sandbox -->|"动态解密 Token"| Encrypt
    Sandbox -->|"调用 LLM"| Audit
    RateLimit --> AuditLog
    Audit --> AuditLog
    AuditLog --> Backup
    AuditLog -->|"CRITICAL 异常"| Emergency

    classDef threat fill:#fecaca,stroke:#dc2626,stroke-width:2px,color:#1c1917;
    classDef iface fill:#fed7aa,stroke:#c2410c,stroke-width:1.5px,color:#1c1917;
    classDef behavior fill:#dbeafe,stroke:#1e40af,stroke-width:1.5px,color:#0f172a;
    classDef data fill:#bbf7d0,stroke:#15803d,stroke-width:1.5px,color:#0f172a;

    class Attacker threat;
    class HTTPS,HMAC,JWT,RBAC,RateLimit iface;
    class Sandbox,Audit,Emergency behavior;
    class Encrypt,AuditLog,Backup data;
```

## 三层安全措施对照

| 层 | 维度 | 核心措施 |
| :--- | :--- | :--- |
| **数据层** | 凭据存储 | 所有第三方凭证（GitHub / GitLab Token、AI API Key）采用 **AES-256** 加密落库，动态解密使用，日志不出明文 |
| | 备份恢复 | 全量数据每日备份；用户 / 权限 / 审计 / 安全评分等关键表启用实时备份；**RTO ≤ 1h · RPO ≤ 15min** |
| **接口层** | Webhook 完整性 | 基于 **原始 Body** 做 **HMAC-SHA256** 校验；按仓库粒度获取 Secret；失败入审计后丢弃 |
| | 鉴权 | JWT 存于 **HttpOnly Cookie**（前端不可读，防 XSS）；过期自动刷新 |
| | 授权 | **RBAC 四级**：ADMIN / MANAGER / MEMBER / VIEWER；敏感操作 2FA |
| | 传输安全 | 全站 **HTTPS**；内部服务通信启用 JWT 鉴权 |
| **行为层** | AI 执行隔离 | AI 分析跑在受限容器（Sandbox），防止恶意 Prompt / 代码扩散主流程 |
| | 审计 & 应急 | 所有关键操作（登录、Webhook 失败、AI 调用、审批动作）写入 `AuditLog`；CRITICAL 级异常 5 分钟内通知负责人，自动触发隔离策略 |

## 容错与降级链路

```mermaid
flowchart LR
    Req(["AI 分析请求"]) --> Primary["主 Provider<br/>用户配置"]
    Primary -->|"成功"| Done(["返回结果"])
    Primary -->|"失败 · 超时"| Retry["指数退避重试<br/>1s → 4s → 16s · ≤ 3 次"]
    Retry -->|"成功"| Done
    Retry -->|"耗尽重试"| Fallback["切备选 Provider<br/>平台默认 Fallback"]
    Fallback -->|"成功"| Done
    Fallback -->|"仍失败"| Manual["标记 FAILED<br/>转 Reviewer 人工兜底"]
    Manual --> Done

    classDef ok fill:#bbf7d0,stroke:#15803d,stroke-width:1.5px,color:#0f172a;
    classDef warn fill:#fef3c7,stroke:#92400e,stroke-width:1.5px,color:#1c1917;
    classDef err fill:#fecaca,stroke:#dc2626,stroke-width:1.5px,color:#1c1917;
    classDef base fill:#dbeafe,stroke:#1e40af,stroke-width:1.5px,color:#0f172a;

    class Req,Primary base;
    class Done ok;
    class Retry,Fallback warn;
    class Manual err;
```

## 可靠性指标（SLO）

| 维度 | 目标 |
| :--- | :--- |
| Webhook 入队 | 95% 事件 ≤ 2 秒 |
| CRITICAL 级通知 | ≤ 1 秒触发 |
| AI 摘要首帧 | 常规 PR ≤ 10 秒；大 diff ≤ 15 秒 |
| 单 PR 查询 | ≤ 200 ms |
| 灾难恢复 | RTO ≤ 1 小时；RPO ≤ 15 分钟 |
| AI 任务重试 | 最多 3 次，超过转人工 |
