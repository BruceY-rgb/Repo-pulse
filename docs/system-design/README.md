# 系统设计图集（System Design Diagrams）

本目录收录《系统设计书》评分项所需的核心图。所有图均使用 **Mermaid** 绘制，可在 GitHub / VSCode / Typora 直接渲染。

## 图集索引

| # | 文件 | 对应评分项 | 类型 |
| :--- | :--- | :--- | :--- |
| 1 | [01-layered-architecture.md](./01-layered-architecture.md) | 系统体系结构图（10 分） | 分层架构图 |
| 2 | [02-er-diagram.md](./02-er-diagram.md) | 数据库设计（20 分） | E-R 实体关系图 |
| 3 | [03-sequence-webhook-ai.md](./03-sequence-webhook-ai.md) | 关键过程描述（15 分） | 主链路时序图 |
| 4 | [04-component-diagram.md](./04-component-diagram.md) | 组件设计 / 详细设计（20 分） | 模块依赖图 + 前端组件层次 |
| 5 | [05-user-flow.md](./05-user-flow.md) | 用户界面设计（10 分） | 页面流程图 |
| 6 | [06-security-architecture.md](./06-security-architecture.md) | 可靠性 & 安全性设计（10 分） | 三层安全架构 + 容错降级 |

## 与其他文档的关系

- **需求层面的图**（用例图、数据流图、状态图、CRC 卡片、类图）在 [`../requirements/srs.md`](../requirements/srs.md)。
- **本目录是设计层面的图**，更贴近代码实现细节。
- 项目计划与里程碑见 [`../project-plan-book.md`](../project-plan-book.md)。

## 内容来源约束

所有图的内容严格对齐：

- 后端模块结构：`apps/api/src/modules/`（13 个 NestJS 模块）
- 前端页面结构：`apps/web/src/pages/`（10 个主页面）
- 数据模型：`packages/database/prisma/schema.prisma`（10 个 Model + 12 个枚举）
- 业务流程描述：`docs/requirements/srs.md`
- 性能与安全指标：`docs/requirements/srs.md` 安全性 & 性能章节
