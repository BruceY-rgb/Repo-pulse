# 系统设计 · 文档索引

## 主文档

[系统设计书 · system-design-book.md](./system-design-book.md) — 涵盖系统体系结构、数据库、关键过程、用户界面、组件设计、可靠性与安全性、项目文档体系七个章节，配套 15 张示意图。

## 章节入口

| 章节 | 入口 | 关键图 |
| :--- | :--- | :--- |
| 系统体系结构 | [§1](./system-design-book.md#1-系统体系结构) | 图 1-1 分层架构 |
| 数据库设计 | [§2](./system-design-book.md#2-数据库设计) | 图 2-1 E-R 结构 |
| 关键过程描述 | [§3](./system-design-book.md#3-关键过程描述) | 图 3-1 主链路时序 |
| 用户界面设计 | [§4](./system-design-book.md#4-用户界面设计) | 图 4-1 至 4-4（Landing / Dashboard / 页面流程 / 角色路径） |
| 组件设计 / 详细设计 | [§5](./system-design-book.md#5-组件设计--详细设计) | 图 5-1 至 5-3（总组件 / 后端模块 / 前端组件） |
| 可靠性与安全性设计 | [§6](./system-design-book.md#6-可靠性与安全性设计) | 图 6-1 至 6-3（SLO / 安全 / 容错） |
| 项目文档体系 | [§7](./system-design-book.md#7-项目文档体系) | 图 7-1 至 7-2（文档站点 / 工程规范） |

## 目录结构

```
docs/system-design/
├── README.md                      (本文件 · 索引)
├── system-design-book.md          (主文档 · 系统设计书)
└── img/                           (15 张示意图)
    ├── 01-architecture.png
    ├── 02-database-er.png
    ├── 03-sequence-main-flow.png
    ├── 04-page-flow.png
    ├── 04-role-paths.png
    ├── 04-ui-landing.png
    ├── 04-ui-dashboard.png
    ├── 05-component.png
    ├── 05-backend-modules.png
    ├── 05-frontend-tree.png
    ├── 06-slo-indicators.png
    ├── 06-security-architecture.png
    ├── 06-fallback-chain.png
    ├── 07-docs-site.png
    └── 07-docs-system.png
```

## 相关文档

- 需求规格：[`../requirements/srs.md`](../requirements/srs.md)
- 项目计划：[`../project-plan-book.md`](../project-plan-book.md)
- 前端样式规范：[`../frontend-style-guide.md`](../frontend-style-guide.md)
- 顶层执行契约：[`../../CLAUDE.md`](../../CLAUDE.md)
