# Repo-Pulse 文档索引

> Repo-Pulse 是一个 AI 驱动的代码仓库监控与管理平台（Monorepo：React 前端 + NestJS 后端 + Electron 桌面端）。
> 本目录收录项目的全部文档。下方「正式交付物」为课程提交的四类核心文档，其余为支撑性开发文档与归档资料。

## 一、正式交付物

| # | 交付物 | 文档 | 主要内容 |
| :-: | :--- | :--- | :--- |
| ① | 需求分析 | [requirements/srs.md](requirements/srs.md) | 项目背景与痛点、市场调研、价值主张、用例图、数据流图（0/1 层）、类图、状态图、CRC 卡、安全性、性能、UI 设计 |
| ② | 项目计划 | [project-plan-book.md](project-plan-book.md) | 项目范围与边界、过程模型、规模估算、资源配置、交付物定义、任务与进度计划、风险分析 |
| ③ | 系统设计 | [system-design/system-design-book.md](system-design/system-design-book.md) | 系统体系结构、数据库设计、关键过程描述、用户界面设计、组件/详细设计、可靠性与安全性设计（七章 + 配套示意图） |
| ④ | 系统测试 | [test-reports/](test-reports/) | 见下方明细（保持多份） |

### ④ 系统测试文档明细

| 文档 | 内容 |
| :--- | :--- |
| [test-reports/system-test-report.md](test-reports/system-test-report.md) | 系统测试打分报告：测试环境、分层测试体系、执行概览、结果与评分 |
| [test-reports/performance-report.md](test-reports/performance-report.md) | API 性能测试报告：SLA 基准、测试结果与详细数据 |
| [test-reports/system-test-ppt.md](test-reports/system-test-ppt.md) | 系统测试汇报（演示用，Marp/PPT 格式） |
| [e2e-test-guide.md](e2e-test-guide.md) | E2E 测试说明：测试用例、模拟数据、覆盖率（测试执行指南） |

需求分析与系统设计文档的配图分别位于 [requirements/img/](requirements/img/) 与 [system-design/img/](system-design/img/)，测试结果截图位于 [test-reports/](test-reports/)（`0.png`/`1.png`/`2.png`）。

## 二、支撑性开发文档

| 文档 | 用途 |
| :--- | :--- |
| [frontend-style-guide.md](frontend-style-guide.md) | 前端样式红线与交互规范（CSS 变量、禁用硬编码颜色，被 `CLAUDE.md` 引用为强制约束） |
| [electron.md](electron.md) | Electron 桌面端开发 / 构建 / 打包指南 |
| [KNOWN_ISSUES.md](KNOWN_ISSUES.md) | 已知问题追踪 |
| [prototypes/](prototypes/) | 工作台界面静态原型（设计预览，不参与构建） |

> 项目顶层还有 [`/README.md`](../README.md)（项目总览与上手）、[`/CHANGELOG.md`](../CHANGELOG.md)（变更日志）、[`/CLAUDE.md`](../CLAUDE.md)（开发执行契约）。

## 三、归档资料

[archive/](archive/) 收录开发过程中的阶段性产物，仅作历史追溯，不属于交付物：阶段工作总结、实时推送实施计划与交接文档、接口改动说明、数据库诊断脚本等。
