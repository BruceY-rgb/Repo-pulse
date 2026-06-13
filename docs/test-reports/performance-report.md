# Repo-Pulse API 性能测试报告

**测试日期**：2026-06-13
**测试环境**：NestJS 测试实例（内存模式，PostgreSQL + Redis）
**测试工具**：supertest 并发压测（10 并发 × 50 请求）

## SLA 基准

| 指标 | 阈值 |
|------|------|
| P50 延迟 | < 500ms |
| P95 延迟 | < 1000ms |
| P99 延迟 | < 2000ms |

## 测试结果

| 端点 | QPS | P50(ms) | P95(ms) | P99(ms) | 错误率 | SLA |
|------|-----|---------|---------|---------|--------|-----|
| `GET /dashboard/overview` | 413 | 5 | 44 | 46 | 0.0% | ✅ PASS |
| `GET /events?page=1&limit=20` | 403 | 5 | 49 | 50 | 0.0% | ✅ PASS |
| `GET /repositories` | 435 | 6 | 42 | 42 | 0.0% | ✅ PASS |
| `GET /dashboard/activity?days=7` | 857 | 4 | 11 | 11 | 0.0% | ✅ PASS |
| `GET /notifications/preferences` | 602 | 3 | 6 | 6 | 0.0% | ✅ PASS |

## 详细数据

### `GET /dashboard/overview`

| 指标 | 值 |
|------|---|
| 总请求数 | 50 |
| 成功 | 50 |
| 失败 | 0 |
| QPS | 413 |
| 最小延迟 | 1ms |
| 平均延迟 | 12ms |
| P50 延迟 | 5ms |
| P95 延迟 | 44ms |
| P99 延迟 | 46ms |
| 最大延迟 | 46ms |
| SLA | ✅ PASS |

### `GET /events?page=1&limit=20`

| 指标 | 值 |
|------|---|
| 总请求数 | 50 |
| 成功 | 50 |
| 失败 | 0 |
| QPS | 403 |
| 最小延迟 | 3ms |
| 平均延迟 | 13ms |
| P50 延迟 | 5ms |
| P95 延迟 | 49ms |
| P99 延迟 | 50ms |
| 最大延迟 | 50ms |
| SLA | ✅ PASS |

### `GET /repositories`

| 指标 | 值 |
|------|---|
| 总请求数 | 50 |
| 成功 | 50 |
| 失败 | 0 |
| QPS | 435 |
| 最小延迟 | 2ms |
| 平均延迟 | 12ms |
| P50 延迟 | 6ms |
| P95 延迟 | 42ms |
| P99 延迟 | 42ms |
| 最大延迟 | 42ms |
| SLA | ✅ PASS |

### `GET /dashboard/activity?days=7`

| 指标 | 值 |
|------|---|
| 总请求数 | 30 |
| 成功 | 30 |
| 失败 | 0 |
| QPS | 857 |
| 最小延迟 | 3ms |
| 平均延迟 | 5ms |
| P50 延迟 | 4ms |
| P95 延迟 | 11ms |
| P99 延迟 | 11ms |
| 最大延迟 | 11ms |
| SLA | ✅ PASS |

### `GET /notifications/preferences`

| 指标 | 值 |
|------|---|
| 总请求数 | 50 |
| 成功 | 50 |
| 失败 | 0 |
| QPS | 602 |
| 最小延迟 | 2ms |
| 平均延迟 | 4ms |
| P50 延迟 | 3ms |
| P95 延迟 | 6ms |
| P99 延迟 | 6ms |
| 最大延迟 | 6ms |
| SLA | ✅ PASS |


## 结论

- SLA 达标率：**5/5** 个端点通过
- ✅ 所有核心端点满足性能 SLA，系统响应能力良好。
