/**
 * AI Provider 后端离线验证 CLI
 *
 * 用法: pnpm --filter api ai:test
 *
 * 分三个阶段：
 * 1. Parser + Zod Schema 单元测试（用固定 JSON 字符串）
 * 2. MockProvider 集成测试
 * 3. Anthropic 真实 Claude 测试（需设置 ANTHROPIC_API_KEY）
 */
import {
  AnthropicProvider,
  MockProvider,
  parseAndValidateAnalysisOutput,
  sanitizeAnalysisOutput,
  type AnalysisParseResult,
} from '@repo-pulse/ai-sdk';

const path = require('path');

// ============================================================
// Part 1: Parser + Zod Schema 单元测试
// ============================================================
function testParser() {
  console.log('='.repeat(60));
  console.log('Part 1: JSON Parser + Zod Schema 单元测试');
  console.log('='.repeat(60));
  console.log();

  let passed = 0;
  let failed = 0;

  const testCases: { name: string; raw: string; expectSuccess: boolean }[] = [
    {
      name: '合法 JSON',
      raw: JSON.stringify({
        summaryShort: 'Short summary.',
        summaryLong: 'Long summary text here.',
        category: 'FEATURE',
        riskLevel: 'LOW',
        riskScore: 25,
        riskReasons: ['Low risk change.'],
        tags: ['frontend'],
        affectedAreas: ['UI'],
        impactSummary: 'Minimal impact.',
        suggestedAction: 'SAFE_TO_IGNORE',
        confidence: 0.95,
      }),
      expectSuccess: true,
    },
    {
      name: 'Markdown code block 包裹',
      raw: '```json\n' + JSON.stringify({
        summaryShort: 'Short summary.',
        summaryLong: 'Long summary text here.',
        category: 'BUGFIX',
        riskLevel: 'MEDIUM',
        riskScore: 50,
        riskReasons: ['Changed logic.'],
        tags: ['backend'],
        affectedAreas: ['API'],
        impactSummary: 'Moderate impact.',
        suggestedAction: 'TEST_REQUIRED',
        confidence: 0.8,
      }) + '\n```',
      expectSuccess: true,
    },
    {
      name: '多余文本包裹 JSON',
      raw: 'Here is my analysis:\n' + JSON.stringify({
        summaryShort: 'Short.',
        summaryLong: 'Long.',
        category: 'DOCS',
        riskLevel: 'LOW',
        riskScore: 10,
        riskReasons: ['Documentation only.'],
        tags: ['docs'],
        affectedAreas: ['README'],
        impactSummary: 'No code impact.',
        suggestedAction: 'SAFE_TO_IGNORE',
        confidence: 0.99,
      }) + '\nEnd of analysis.',
      expectSuccess: true,
    },
    {
      name: '非法 JSON',
      raw: 'This is not JSON at all.',
      expectSuccess: false,
    },
    {
      name: 'Schema 缺字段',
      raw: JSON.stringify({
        summaryShort: 'Missing fields.',
        // 缺少 category, riskLevel 等
      }),
      expectSuccess: false,
    },
    {
      name: '枚举值小写',
      raw: JSON.stringify({
        summaryShort: 'Test.',
        summaryLong: 'Test long.',
        category: 'feature',
        riskLevel: 'low',
        riskScore: 10,
        riskReasons: ['Test.'],
        tags: [],
        affectedAreas: [],
        impactSummary: 'Test.',
        suggestedAction: 'safe_to_ignore',
        confidence: 0.9,
      }),
      expectSuccess: false, // 小写不通过 Zod 枚举
    },
  ];

  for (const tc of testCases) {
    const result = parseAndValidateAnalysisOutput(tc.raw);
    const ok = result.success === tc.expectSuccess;
    const status = ok ? 'PASS' : 'FAIL';
    console.log(`  [${status}] ${tc.name}`);
    console.log(`    Expected: ${tc.expectSuccess ? 'success' : 'failure'}, Got: ${result.success ? 'success' : 'failure'}`);
    if (!result.success) {
      console.log(`    Error: ${result.error}`);
    }
    if (ok) passed++;
    else failed++;
  }

  console.log();
  console.log(`Parser tests: ${passed}/${testCases.length} passed`);
  console.log();

  return { passed, failed };
}

// ============================================================
// Part 2: sanitizeAnalysisOutput 测试
// ============================================================
function testSanitizer() {
  console.log('='.repeat(60));
  console.log('Part 2: sanitizeAnalysisOutput 测试');
  console.log('='.repeat(60));
  console.log();

  let passed = 0;
  let failed = 0;

  // Test: lower-case enum normalization
  const rawJson = JSON.stringify({
    summaryShort: 'Test',
    summaryLong: 'Test long',
    category: 'feature',        // lower-case
    riskLevel: 'high',          // lower-case
    riskScore: 75,
    riskReasons: ['Test'],
    tags: ['test'],
    affectedAreas: ['test'],
    impactSummary: 'Test impact.',
    suggestedAction: 'review_required', // lower-case
    confidence: 0.9,
  });
  const parseResult = parseAndValidateAnalysisOutput(rawJson);
  console.log(`  Lower-case enum input parse: ${parseResult.success ? 'FAIL' : 'PASS (expected fail on Zod strict enum)'}`);

  // 用 sanitize 处理一个已解析但存在边角情况的数据
  const testData = {
    summaryShort: 's'.repeat(300),
    summaryLong: 'l'.repeat(3000),
    category: 'FEATURE' as const,
    riskLevel: 'LOW' as const,
    riskScore: 50,
    riskReasons: Array.from({ length: 20 }, (_, i) => `Reason ${i}`),
    tags: Array.from({ length: 30 }, (_, i) => `tag-${i}`),
    affectedAreas: Array.from({ length: 30 }, (_, i) => `area-${i}`),
    impactSummary: 'i'.repeat(2000),
    suggestedAction: 'SAFE_TO_IGNORE' as const,
    confidence: 0.5,
  };
  const sanitized = sanitizeAnalysisOutput(testData);
  const checksPassed =
    sanitized.summaryShort.length === 200 &&
    sanitized.summaryLong.length === 2000 &&
    sanitized.impactSummary.length === 1000 &&
    sanitized.riskReasons.length === 10 &&
    sanitized.tags.length === 15 &&
    sanitized.affectedAreas.length === 15;

  console.log(`  Truncation: ${checksPassed ? 'PASS' : 'FAIL'}`);
  if (checksPassed) passed++;
  else failed++;

  console.log();
  console.log(`Sanitizer tests: ${passed}/${passed + failed} passed`);
  console.log();
  return { passed, failed };
}

// ============================================================
// Part 3: MockProvider 集成测试
// ============================================================
async function testMockProvider() {
  console.log('='.repeat(60));
  console.log('Part 3: MockProvider 集成测试');
  console.log('='.repeat(60));
  console.log();

  const provider = new MockProvider();
  const fixturePath = path.resolve(
    __dirname,
    '../../../packages/ai-sdk/test/fixtures/event-samples',
  );
  const { eventSamples } = require(fixturePath);

  let passed = 0;
  let failed = 0;

  for (const sample of eventSamples.slice(0, 3)) {
    console.log(`  Testing: ${sample.name}`);
    try {
      const output = await provider.analyze(sample.input);
      console.log(`    summary: ${output.summary}`);
      console.log(`    riskLevel: ${output.riskLevel}`);
      console.log(`    categories: [${output.categories.join(', ')}]`);
      console.log(`    tokens: ${output.tokensUsed}, latency: ${output.latencyMs}ms`);
      console.log('    PASS');
      passed++;
    } catch (err) {
      console.log(`    ERROR: ${err instanceof Error ? err.message : String(err)}`);
      failed++;
    }
  }

  console.log();
  console.log(`MockProvider: ${passed}/${passed + failed} passed`);
  console.log();
  return { passed, failed };
}

// ============================================================
// Part 4: Anthropic 真实 Claude 测试
// ============================================================
async function testAnthropicProvider() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log('='.repeat(60));
    console.log('Part 4: Anthropic/Claude 真实测试 - SKIPPED');
    console.log('='.repeat(60));
    console.log('  Set ANTHROPIC_API_KEY in .env to run this test.');
    console.log();
    return { passed: 0, failed: 0, skipped: true };
  }

  console.log('='.repeat(60));
  console.log('Part 4: Anthropic/Claude 真实测试');
  console.log('='.repeat(60));
  console.log();

  const fixturePath = path.resolve(
    __dirname,
    '../../../packages/ai-sdk/test/fixtures/event-samples',
  );
  const { eventSamples } = require(fixturePath);

  const provider = new AnthropicProvider({
    apiKey,
    model: process.env.AI_DEFAULT_MODEL || 'claude-sonnet-4-20250514',
  });

  let passed = 0;
  let failed = 0;
  const allResults: AnalysisParseResult[] = [];

  // 只取前 5 个 case 避免消耗太多 quota
  for (const sample of eventSamples.slice(0, 5)) {
    console.log(`${'─'.repeat(50)}`);
    console.log(`Testing: ${sample.name}`);
    console.log(`Expected: category=${sample.expected.category.join('/')} | riskLevel=${sample.expected.riskLevel.join('/')} | action=${sample.expected.suggestedAction.join('/')}`);

    try {
      const output = await provider.analyze(sample.input);
      console.log(`  Tokens: ${output.tokensUsed}, Latency: ${output.latencyMs}ms`);

      // AnthropicProvider 已将模型输出解析为 AnalysisOutput（仅含旧字段）
      // 用 Zod schema 验证模型原始返回的解析结果
      // 注意：当前 AnalysisOutput 不包含新字段，所以 Zod 校验可能不完整
      // Step 2 会扩展 AnalysisOutput 后完整校验
      console.log(`  summary: ${output.summary}`);
      console.log(`  riskLevel: ${output.riskLevel}`);
      console.log(`  riskReason: ${output.riskReason || '(none)'}`);
      console.log(`  categories: [${output.categories.join(', ')}]`);

      // 验证旧格式输出完整性
      const hasRequired =
        typeof output.summary === 'string' && output.summary.length > 0 &&
        ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(output.riskLevel) &&
        output.tokensUsed > 0;
      const status = hasRequired ? 'PASS' : 'FAIL';
      console.log(`  Required fields valid: ${status}`);
      if (hasRequired) passed++;
      else failed++;

      allResults.push({
        success: hasRequired,
        data: undefined,
      });
    } catch (err) {
      console.log(`  ERROR: ${err instanceof Error ? err.message : String(err)}`);
      failed++;
      allResults.push({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  console.log();
  console.log('='.repeat(60));
  console.log(`Claude test: ${passed}/${passed + failed} passed`);
  console.log('='.repeat(60));
  console.log();

  return { passed, failed, skipped: false };
}

// ============================================================
// Main
// ============================================================
async function main() {
  const parserResult = testParser();
  testSanitizer();
  await testMockProvider();
  const anthropicResult = await testAnthropicProvider();

  console.log('='.repeat(60));
  console.log('STEP 0 FINAL SUMMARY');
  console.log('='.repeat(60));
  console.log(`  Parser tests:     ${parserResult.passed}/${parserResult.passed + parserResult.failed} passed`);
  if (anthropicResult.skipped) {
    console.log('  Claude test:      SKIPPED (no ANTHROPIC_API_KEY)');
  } else {
    console.log(`  Claude test:      ${anthropicResult.passed}/${anthropicResult.passed + anthropicResult.failed} passed`);
  }
  console.log();

  if (parserResult.failed > 0) {
    console.log('Some parser tests failed. Please fix before proceeding.');
    process.exit(1);
  }

  console.log('Step 0 验收通过. 可以进入 Step 1.');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
