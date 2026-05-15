# 5. 页面流程图（User Flow）

> 对应《系统设计书》「用户界面设计」章节（10 分项关键图）。

前端共 **10 个主页面**，使用路径概括为：**Dashboard 看全局 → 列表看任务 → 详情看证据 → 审批做决策**。

```mermaid
flowchart TD
    Start([进入站点]) --> Landing["Landing<br/>/"]
    Landing -->|"点击登录"| Login["Login<br/>/login"]
    Login -->|"GitHub OAuth"| AuthCallback["AuthCallback<br/>/auth/callback<br/>写入 HttpOnly Cookie"]
    AuthCallback --> Dashboard

    Dashboard["Dashboard · /dashboard<br/>活跃仓库 · 未审 PR · 风险趋势 · DORA"]

    Dashboard --> Repositories["Repositories<br/>/repositories"]
    Dashboard --> NotificationsP["Notifications<br/>/notifications"]
    Dashboard --> Approvals["Approvals<br/>/approvals"]
    Dashboard --> Reports["Reports<br/>/reports"]
    Dashboard --> Settings["Settings<br/>/settings"]

    NotificationsP -->|"点击事件"| AIAnalysis["AIAnalysis · /analysis/:id<br/>左 diff · 右 AI 摘要 · SSE 流式"]
    Approvals -->|"点击审批"| AIAnalysis
    Dashboard -->|"高优 PR 入口"| AIAnalysis

    AIAnalysis -->|"批准 · 编辑 · 驳回"| Approvals
    Approvals -->|"APPROVED 触发"| NotificationsP

    classDef entry fill:#dbeafe,stroke:#1e40af,stroke-width:1.5px,color:#0f172a;
    classDef core fill:#fed7aa,stroke:#c2410c,stroke-width:2.5px,color:#1c1917;
    classDef list fill:#fef3c7,stroke:#92400e,stroke-width:1.5px,color:#1c1917;
    classDef config fill:#e9d5ff,stroke:#7e22ce,stroke-width:1.5px,color:#1c1917;
    classDef start fill:#bbf7d0,stroke:#15803d,stroke-width:1.5px,color:#0f172a;

    class Start start;
    class Landing,Login,AuthCallback entry;
    class Dashboard,AIAnalysis core;
    class Repositories,NotificationsP,Approvals,Reports list;
    class Settings config;
```

## 页面与路径对照表

| 页面 | 路径 | 角色入口 | 核心要素 |
| :--- | :--- | :--- | :--- |
| Landing | `/` | 全部 | 产品介绍、登录入口、价值主张展示 |
| Login | `/login` | 未登录 | GitHub OAuth 登录按钮 |
| AuthCallback | `/auth/callback` | 未登录 | OAuth 回调处理、HttpOnly Cookie 写入 |
| **Dashboard** | `/dashboard` | 全部 | 活跃仓库概览、未审 PR、风险趋势、DORA 指标、Recharts 可视化 |
| Repositories | `/repositories` | Developer / Admin | 仓库绑定、同步状态、Webhook 健康度 |
| **AIAnalysis** | `/analysis/:id` | Developer / Reviewer | 左 diff + 右 AI 摘要 + 风险提示 + Reviewer 推荐 + SSE 流式渲染 |
| **Approvals** | `/approvals` | Reviewer | 待审批队列、原版 / 编辑版对比、批准 / 驳回 / 编辑操作 |
| Notifications | `/notifications` | 全部 | 按时间分组、已读 / 忽略、跳转详情 |
| Reports | `/reports` | Project Manager | 周 / 月报生成与查看（P2 阶段） |
| Settings | `/settings` | 全部 | 个人 AI Provider 配置、过滤规则、通知偏好、主题切换 |

## 角色使用路径

```mermaid
flowchart LR
    Dev(["Developer"]) -->|"日常浏览"| F1["Dashboard → Notifications<br/>→ AIAnalysis → 回 Notifications"]
    Rev(["Reviewer"]) -->|"审批兜底"| F2["Dashboard → Approvals<br/>→ AIAnalysis → 批准 / 编辑 / 驳回"]
    Sec(["Security Analyst"]) -->|"盯高风险"| F3["Dashboard 风险面板<br/>→ AIAnalysis (CRITICAL 事件)"]
    PM(["Project Manager"]) -->|"看效率"| F4["Dashboard → Reports → 导出周报"]
    Adm(["SaaS Admin"]) -->|"策略配置"| F5["Settings → 规则配置 · 角色管理"]

    classDef role fill:#dbeafe,stroke:#1e40af,stroke-width:1.5px,color:#0f172a;
    classDef path fill:#fef3c7,stroke:#92400e,stroke-width:1.5px,color:#1c1917;

    class Dev,Rev,Sec,PM,Adm role;
    class F1,F2,F3,F4,F5 path;
```

## 设计原则

| 原则 | 落地方式 |
| :--- | :--- |
| 简洁直观 | 每个页面单一职责，主操作不超过 3 个 |
| 响应式适配 | 桌面 / 平板 / 移动三档断点 |
| 语义化色彩 | CRITICAL 红 · HIGH 橙 · MEDIUM 黄 · LOW 蓝 · 正常态绿 |
| 深浅主题 | 通过 `next-themes` 切换两套调色板 |
