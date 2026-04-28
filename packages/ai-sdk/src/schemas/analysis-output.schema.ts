/**
 * AI AnalysisOutput Zod Schema
 *
 * 用于校验 AI Provider 返回的 JSON 是否满足 AnalyzedOutput 结构。
 * MVP 阶段使用内联枚举值，后续 Step 可迁移为 z.nativeEnum() 连接 shared 枚举。
 */
import { z } from 'zod';

export const analysisOutputSchema = z.object({
  summaryShort: z.string().min(1).max(200),
  summaryLong: z.string().min(1).max(2000),
  category: z.enum([
    'FEATURE',
    'BUGFIX',
    'REFACTOR',
    'DOCS',
    'TEST',
    'DEPENDENCY',
    'SECURITY',
    'RELEASE',
    'UNKNOWN',
  ]),
  riskLevel: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  riskScore: z.number().int().min(0).max(100),
  riskReasons: z.array(z.string()),
  tags: z.array(z.string()),
  affectedAreas: z.array(z.string()),
  impactSummary: z.string(),
  suggestedAction: z.enum([
    'REVIEW_REQUIRED',
    'TEST_REQUIRED',
    'SAFE_TO_IGNORE',
    'NOTIFY_OWNER',
    'CREATE_APPROVAL',
  ]),
  confidence: z.number().min(0).max(1),
});

export type ValidatedAnalysisOutput = z.infer<typeof analysisOutputSchema>;
