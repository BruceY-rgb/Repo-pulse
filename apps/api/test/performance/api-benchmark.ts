/**
 * Repo-Pulse API 性能基准测试
 *
 * 运行方式：pnpm --filter api test:perf
 * 前置条件：API 服务在 http://localhost:3001 运行，且已登录获取 Cookie
 *
 * 测试策略：使用 supertest 对 NestJS 应用实例发压，
 * 记录 P50/P95/P99 延迟、QPS、错误率，并输出报告。
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import cookieParser from 'cookie-parser';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@repo-pulse/database';
import { AppModule } from '../../src/app.module';

const prisma = new PrismaClient();

const PERF_USER = {
  email: 'perf-test@repopulse.dev',
  password: 'perf-password-123',
  name: 'Perf Test User',
};

// SLA 阈值（毫秒）
const SLA = {
  p99: 2000,
  p95: 1000,
  p50: 500,
};

interface BenchmarkResult {
  endpoint: string;
  method: string;
  totalRequests: number;
  successCount: number;
  errorCount: number;
  errorRate: number;
  qps: number;
  latencies: {
    p50: number;
    p95: number;
    p99: number;
    min: number;
    max: number;
    mean: number;
  };
  passedSLA: boolean;
}

/**
 * 对指定端点发起 N 个串行请求，收集延迟数据
 */
async function benchmarkEndpoint(
  app: INestApplication,
  method: 'get' | 'post',
  endpoint: string,
  options: {
    cookie?: string;
    body?: object;
    concurrency?: number;
    totalRequests?: number;
  } = {},
): Promise<BenchmarkResult> {
  const { cookie = '', totalRequests = 50, concurrency = 10, body } = options;
  const latencies: number[] = [];
  let successCount = 0;
  let errorCount = 0;

  const startTime = Date.now();

  // 分批并发发送请求
  const batches = Math.ceil(totalRequests / concurrency);
  for (let i = 0; i < batches; i++) {
    const batchSize = Math.min(concurrency, totalRequests - i * concurrency);
    const batchPromises = Array.from({ length: batchSize }, async () => {
      const reqStart = Date.now();
      try {
        let req = request(app.getHttpServer())[method](endpoint);
        if (cookie) req = req.set('Cookie', cookie);
        if (body) req = req.send(body).set('Content-Type', 'application/json');
        const res = await req;
        const elapsed = Date.now() - reqStart;
        latencies.push(elapsed);
        if (res.status >= 200 && res.status < 400) {
          successCount++;
        } else {
          errorCount++;
        }
      } catch {
        errorCount++;
        latencies.push(Date.now() - reqStart);
      }
    });
    await Promise.all(batchPromises);
  }

  const totalTime = (Date.now() - startTime) / 1000;
  latencies.sort((a, b) => a - b);

  const percentile = (p: number) => {
    const idx = Math.ceil((p / 100) * latencies.length) - 1;
    return latencies[Math.max(0, idx)];
  };

  const mean = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  const p50 = percentile(50);
  const p95 = percentile(95);
  const p99 = percentile(99);

  return {
    endpoint,
    method: method.toUpperCase(),
    totalRequests,
    successCount,
    errorCount,
    errorRate: errorCount / totalRequests,
    qps: Math.round(successCount / totalTime),
    latencies: {
      p50,
      p95,
      p99,
      min: latencies[0],
      max: latencies[latencies.length - 1],
      mean: Math.round(mean),
    },
    passedSLA: p99 <= SLA.p99 && p95 <= SLA.p95 && p50 <= SLA.p50,
  };
}

function formatTable(results: BenchmarkResult[]): string {
  const lines: string[] = [
    '| 端点 | QPS | P50(ms) | P95(ms) | P99(ms) | 错误率 | SLA |',
    '|------|-----|---------|---------|---------|--------|-----|',
  ];
  for (const r of results) {
    const sla = r.passedSLA ? '✅ PASS' : '❌ FAIL';
    lines.push(
      `| \`${r.method} ${r.endpoint}\` | ${r.qps} | ${r.latencies.p50} | ${r.latencies.p95} | ${r.latencies.p99} | ${(r.errorRate * 100).toFixed(1)}% | ${sla} |`,
    );
  }
  return lines.join('\n');
}

async function generateReport(results: BenchmarkResult[], date: string): Promise<void> {
  const reportDir = path.join(__dirname, '../../..', '../../docs/test-reports');
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  const passCount = results.filter((r) => r.passedSLA).length;
  const totalCount = results.length;

  const content = `# Repo-Pulse API 性能测试报告

**测试日期**：${date}
**测试环境**：NestJS 测试实例（内存模式，PostgreSQL + Redis）
**测试工具**：supertest 并发压测（${10} 并发 × ${50} 请求）

## SLA 基准

| 指标 | 阈值 |
|------|------|
| P50 延迟 | < ${SLA.p50}ms |
| P95 延迟 | < ${SLA.p95}ms |
| P99 延迟 | < ${SLA.p99}ms |

## 测试结果

${formatTable(results)}

## 详细数据

${results
  .map(
    (r) => `### \`${r.method} ${r.endpoint}\`

| 指标 | 值 |
|------|---|
| 总请求数 | ${r.totalRequests} |
| 成功 | ${r.successCount} |
| 失败 | ${r.errorCount} |
| QPS | ${r.qps} |
| 最小延迟 | ${r.latencies.min}ms |
| 平均延迟 | ${r.latencies.mean}ms |
| P50 延迟 | ${r.latencies.p50}ms |
| P95 延迟 | ${r.latencies.p95}ms |
| P99 延迟 | ${r.latencies.p99}ms |
| 最大延迟 | ${r.latencies.max}ms |
| SLA | ${r.passedSLA ? '✅ PASS' : '❌ FAIL'} |
`,
  )
  .join('\n')}

## 结论

- SLA 达标率：**${passCount}/${totalCount}** 个端点通过
- ${passCount === totalCount ? '✅ 所有核心端点满足性能 SLA，系统响应能力良好。' : `⚠️ ${totalCount - passCount} 个端点未达 SLA，需关注高延迟原因。`}
`;

  const reportPath = path.join(reportDir, 'performance-report.md');
  fs.writeFileSync(reportPath, content, 'utf-8');
  console.log(`\n📄 性能报告已生成：${reportPath}`);
}

describe('API 性能基准测试 (Performance)', () => {
  let app: INestApplication;
  let authCookie: string;
  let testUserId: string;
  const results: BenchmarkResult[] = [];

  beforeAll(async () => {
    // 创建测试用户
    const existing = await prisma.user.findUnique({ where: { email: PERF_USER.email } });
    if (existing) {
      testUserId = existing.id;
    } else {
      const user = await prisma.user.create({
        data: {
          email: PERF_USER.email,
          name: PERF_USER.name,
          passwordHash: await bcrypt.hash(PERF_USER.password, 10),
        },
      });
      testUserId = user.id;
    }

    // 启动应用
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    // 登录获取 Cookie
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: PERF_USER.email, password: PERF_USER.password });

    authCookie = loginRes.headers['set-cookie']?.[0] ?? '';
  }, 60000);

  afterAll(async () => {
    // 生成报告
    const date = new Date().toISOString().slice(0, 10);
    await generateReport(results, date);

    await prisma.user.deleteMany({ where: { email: PERF_USER.email } });
    await prisma.$disconnect();
    await app.close();
  }, 30000);

  it('GET /dashboard/overview — 仪表板聚合查询 (P99 < 2000ms)', async () => {
    const result = await benchmarkEndpoint(app, 'get', '/dashboard/overview', {
      cookie: authCookie,
      totalRequests: 50,
      concurrency: 10,
    });
    results.push(result);

    console.log(`\n[dashboard/overview] QPS=${result.qps} P50=${result.latencies.p50}ms P95=${result.latencies.p95}ms P99=${result.latencies.p99}ms`);
    expect(result.latencies.p99).toBeLessThan(SLA.p99);
    expect(result.errorRate).toBeLessThan(0.05);
  }, 60000);

  it('GET /events — 事件列表分页 (P99 < 2000ms)', async () => {
    const result = await benchmarkEndpoint(app, 'get', '/events?page=1&limit=20', {
      cookie: authCookie,
      totalRequests: 50,
      concurrency: 10,
    });
    results.push(result);

    console.log(`\n[events] QPS=${result.qps} P50=${result.latencies.p50}ms P95=${result.latencies.p95}ms P99=${result.latencies.p99}ms`);
    expect(result.latencies.p99).toBeLessThan(SLA.p99);
    expect(result.errorRate).toBeLessThan(0.05);
  }, 60000);

  it('GET /repositories — 仓库列表 (P99 < 2000ms)', async () => {
    const result = await benchmarkEndpoint(app, 'get', '/repositories', {
      cookie: authCookie,
      totalRequests: 50,
      concurrency: 10,
    });
    results.push(result);

    console.log(`\n[repositories] QPS=${result.qps} P50=${result.latencies.p50}ms P95=${result.latencies.p95}ms P99=${result.latencies.p99}ms`);
    expect(result.latencies.p99).toBeLessThan(SLA.p99);
    expect(result.errorRate).toBeLessThan(0.05);
  }, 60000);

  it('GET /dashboard/activity — 活动趋势图 (P99 < 2000ms)', async () => {
    const result = await benchmarkEndpoint(app, 'get', '/dashboard/activity?days=7', {
      cookie: authCookie,
      totalRequests: 30,
      concurrency: 5,
    });
    results.push(result);

    console.log(`\n[dashboard/activity] QPS=${result.qps} P50=${result.latencies.p50}ms P95=${result.latencies.p95}ms P99=${result.latencies.p99}ms`);
    expect(result.latencies.p99).toBeLessThan(SLA.p99);
    expect(result.errorRate).toBeLessThan(0.05);
  }, 60000);

  it('GET /notifications/preferences — 通知偏好 (P99 < 2000ms)', async () => {
    const result = await benchmarkEndpoint(app, 'get', '/notifications/preferences', {
      cookie: authCookie,
      totalRequests: 50,
      concurrency: 10,
    });
    results.push(result);

    console.log(`\n[notifications/preferences] QPS=${result.qps} P50=${result.latencies.p50}ms P95=${result.latencies.p95}ms P99=${result.latencies.p99}ms`);
    expect(result.latencies.p99).toBeLessThan(SLA.p99);
    expect(result.errorRate).toBeLessThan(0.05);
  }, 60000);
});
