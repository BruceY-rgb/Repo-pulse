/**
 * JSON 解析与校验工具
 *
 * 职责：
 * 1. 从模型返回的原始文本中提取 JSON（处理 markdown code block、多余文本）
 * 2. 用 Zod schema 校验解析结果
 * 3. 全部失败不抛异常，返回明确错误信息
 */
import {
  type ValidatedAnalysisOutput,
  analysisOutputSchema,
} from '../schemas/analysis-output.schema';
import { ZodError } from 'zod';

/**
 * 从原始文本中提取首个合法 JSON 对象。
 * 1. 去掉 ```json ... ``` / ``` ... ``` markdown fence
 * 2. 用正则提取首个 { ... } 块
 * 3. JSON.parse；失败返回 null
 */
export function parseJsonOutput(raw: string): object | null {
  if (!raw || raw.trim().length === 0) {
    return null;
  }

  let text = raw;

  // 去除 markdown code block 包裹
  const blockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (blockMatch) {
    text = blockMatch[1];
  }

  // 提取首个 { ... } 块
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return null;
  }

  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    return null;
  }
}

export interface AnalysisParseResult {
  success: boolean;
  data?: ValidatedAnalysisOutput;
  error?: string;
  raw?: string;
}

/**
 * 解析并校验 AI 返回的 JSON。
 *
 * @param raw - 模型原始返回文本
 * @returns 校验结果，始终不抛异常
 */
export function parseAndValidateAnalysisOutput(raw: string): AnalysisParseResult {
  const parsed = parseJsonOutput(raw);

  if (parsed === null) {
    return {
      success: false,
      error: 'Failed to extract valid JSON from model response',
      raw,
    };
  }

  try {
    const data = analysisOutputSchema.parse(parsed) as ValidatedAnalysisOutput;
    return { success: true, data };
  } catch (err) {
    let errorMsg = 'Unknown schema validation error';
    if (err instanceof ZodError) {
      // zod v4: use .issues instead of .errors
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const issues: Array<{ path: PropertyKey[]; message: string }> = (err as any).issues ?? [];
      if (issues.length > 0) {
        errorMsg = issues
          .map((e) => `${e.path.join('.')}: ${e.message}`)
          .join('; ');
      } else {
        errorMsg = err.message;
      }
    } else if (err instanceof Error) {
      errorMsg = err.message;
    }
    return {
      success: false,
      error: errorMsg,
      raw: JSON.stringify(parsed),
    };
  }
}

/**
 * 清理 AnalysisOutput 边角情况
 * - truncate 超长字段
 * - 将 lower-case 枚举值映射为 upper-case
 * - 数组截断到最大长度
 */
export function sanitizeAnalysisOutput(
  raw: ValidatedAnalysisOutput,
): ValidatedAnalysisOutput {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: Record<string, any> = { ...raw };

  result.summaryLong = (raw.summaryLong as string).slice(0, 2000);
  result.summaryShort = (raw.summaryShort as string).slice(0, 200);
  result.impactSummary = (raw.impactSummary as string).slice(0, 1000);

  result.category = normalizeEnum(raw.category as string, [
    'FEATURE',
    'BUGFIX',
    'REFACTOR',
    'DOCS',
    'TEST',
    'DEPENDENCY',
    'SECURITY',
    'RELEASE',
    'UNKNOWN',
  ]);

  result.riskLevel = normalizeEnum(raw.riskLevel as string, [
    'LOW',
    'MEDIUM',
    'HIGH',
    'CRITICAL',
  ]);

  result.suggestedAction = normalizeEnum(raw.suggestedAction as string, [
    'REVIEW_REQUIRED',
    'TEST_REQUIRED',
    'SAFE_TO_IGNORE',
    'NOTIFY_OWNER',
    'CREATE_APPROVAL',
  ]);

  result.riskReasons = (raw.riskReasons as string[]).slice(0, 10);
  result.tags = (raw.tags as string[]).slice(0, 15);
  result.affectedAreas = (raw.affectedAreas as string[]).slice(0, 15);

  return result as ValidatedAnalysisOutput;
}

function normalizeEnum(value: string, allowed: string[]): string {
  const upper = value.toUpperCase();
  if (allowed.includes(upper)) return upper;
  // 尝试模糊匹配
  const match = allowed.find(
    (a) => a.toUpperCase() === upper.slice(0, a.length),
  );
  return match ?? value;
}
