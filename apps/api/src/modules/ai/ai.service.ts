import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  prisma,
  AIAnalysis,
  RiskLevel,
  AnalysisStatus,
} from '@repo-pulse/database';
import {
  createProvider,
  type AnalysisInput,
  type AnalysisOutput,
} from '@repo-pulse/ai-sdk';
import type { AIProvider as ProviderType } from '@repo-pulse/shared';
import { AIEventNormalizer } from './ai-event-normalizer';

const PROMPT_VERSION = 'v2.0.0';

@Injectable()
export class AIService {
  private readonly logger = new Logger(AIService.name);

  constructor(
    @InjectQueue('ai-analysis') private aiQueue: Queue,
    private readonly normalizer: AIEventNormalizer,
  ) {}

  /**
   * 触发 AI 分析任务（放入队列）
   */
  async triggerAnalysis(
    eventId: string,
    force = false,
  ): Promise<void> {
    this.logger.log(`Triggering AI analysis for event: ${eventId}, force=${force}`);

    await this.aiQueue.add(
      'analyze-event',
      { eventId, force },
      {
        attempts: parseInt(process.env.AI_MAX_RETRY || '2', 10) + 1,
        backoff: { type: 'exponential', delay: 5000 },
      },
    );

    this.logger.log(`AI analysis job added to queue for event: ${eventId}`);
  }

  /**
   * 执行 AI 分析（核心方法）
   *
   * 流程：
   *   1. 查询事件 + 关联用户
   *   2. 去重检查（已有 COMPLETED 且 !force → 直接返回）
   *   3. shouldAnalyze 检查（不支持类型 → SKIPPED）
   *   4. 解析 Provider 配置 → 创建 Provider
   *   5. normalizer.buildAnalysisInput → 脱敏+截断+装配
   *   6. provider.analyze → 结果 parse + Zod 校验 + retry
   *   7. 双写新旧字段到 AIAnalysis
   */
  async analyzeEvent(
    eventId: string,
    force = false,
  ): Promise<AnalysisOutput> {
    this.logger.log(`Analyzing event: ${eventId}, force=${force}`);

    // 1. 查询事件 + 关联仓库 + 关联用户
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        repository: {
          include: {
            users: { include: { user: true } },
          },
        },
      },
    });

    if (!event) {
      throw new Error(`Event not found: ${eventId}`);
    }

    // 2. 去重检查
    if (!force) {
      const existing = await prisma.aIAnalysis.findFirst({
        where: { eventId, status: AnalysisStatus.COMPLETED },
        orderBy: { createdAt: 'desc' },
      });
      if (existing) {
        this.logger.log(`Event ${eventId} already has COMPLETED analysis, returning cached result`);
        return this.toAnalysisOutput(existing);
      }
    }

    // 3. shouldAnalyze 检查
    const check = this.normalizer.shouldAnalyze(event, force);
    if (!check.should) {
      this.logger.log(`Event ${eventId} skipped: ${check.reason}`);
      await this.saveSkipped(eventId, 'system', check.reason ?? 'unknown');
      return this.failedOutput(check.reason ?? 'skipped');
    }

    // 4. 解析用户 AI 配置
    const userRepo = event.repository.users[0];
    if (!userRepo) {
      await this.saveSkipped(eventId, 'system', 'no_user_associated');
      return this.failedOutput('No user associated with repository');
    }

    const user = await prisma.user.findUnique({
      where: { id: userRepo.userId },
    });
    if (!user) {
      await this.saveSkipped(eventId, 'system', 'user_not_found');
      return this.failedOutput('User not found');
    }

    const aiProvider = (user.aiProvider || process.env.AI_DEFAULT_PROVIDER || 'anthropic') as ProviderType;
    const aiApiKey = user.aiApiKey || process.env.ANTHROPIC_API_KEY || '';
    const aiModel = user.aiModel || process.env.AI_DEFAULT_MODEL || 'claude-sonnet-4-20250514';
    const aiBaseUrl = user.aiBaseUrl || undefined;

    // 5. 检查 API Key
    if (!aiApiKey) {
      this.logger.warn(`No API key for provider ${aiProvider}, event ${eventId}`);
      await this.saveFailed(eventId, aiModel, 'provider_not_configured');
      return this.failedOutput('Missing AI provider API key');
    }

    this.logger.log(`Using provider=${aiProvider} model=${aiModel} baseUrl=${aiBaseUrl || 'preset'}`);

    // 6. 创建 Provider（factory，非硬编码）
    const provider = createProvider(aiProvider, aiApiKey, {
      model: aiModel,
      baseUrl: aiBaseUrl,
      timeout: 60000,
      maxRetries: 2,
    });

    // 7. 构建输入（sanitize → truncate → 装配）
    const input = this.normalizer.buildAnalysisInput(event);

    // 8. 调用 AI 分析（捕获异常并写库）
    let result: AnalysisOutput;
    try {
      result = await provider.analyze(input);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown_error';
      this.logger.error(`AI call failed for event ${eventId}: ${message}`);
      await this.saveFailed(eventId, aiModel, message);
      return this.failedOutput(message);
    }

    // 9. 保存结果（双写新旧字段）
    await this.saveAnalysis(eventId, result, aiModel);

    this.logger.log(
      `AI analysis completed for event ${eventId}: riskLevel=${result.riskLevel} category=${result.category ?? 'N/A'}`,
    );

    return result;
  }

  // ============================================================
  // Private helpers
  // ============================================================

  /**
   * 保存成功分析结果（新旧字段双写）
   */
  private async saveAnalysis(
    eventId: string,
    result: AnalysisOutput,
    model: string,
  ): Promise<AIAnalysis> {
    const riskReasons = result.riskReasons ?? [];
    const tags = result.tags ?? [];
    const affectedAreas = result.affectedAreas ?? [];
    const category = result.category ?? 'UNKNOWN';

    return prisma.aIAnalysis.create({
      data: {
        eventId,
        model,
        status: AnalysisStatus.COMPLETED,

        // 新字段
        summaryShort: result.summaryShort ?? result.summary,
        summaryLong: result.summaryLong ?? result.summary,
        category,
        riskLevel: result.riskLevel as RiskLevel,
        riskScore: result.riskScore ?? 0,
        riskReasons,
        tags,
        affectedAreas,
        impactSummary: result.impactSummary ?? '',
        suggestedAction: result.suggestedAction ?? 'REVIEW_REQUIRED',
        confidence: result.confidence ?? 0.5,
        promptVersion: PROMPT_VERSION,

        // 旧字段（兼容映射）
        summary: result.summaryShort ?? result.summary,
        riskReason: riskReasons.length > 0 ? riskReasons.join('; ') : undefined,
        categories: [category, ...tags],
        keyChanges: affectedAreas as unknown as any[],
        suggestions: (result.suggestions ?? [
          {
            type: 'info' as const,
            title: (result.suggestedAction ?? 'REVIEW_REQUIRED').replace(/_/g, ' '),
            description: result.impactSummary ?? '',
          },
        ]) as unknown as any[],
        tokensUsed: result.tokensUsed,
        latencyMs: result.latencyMs,
      },
    });
  }

  /**
   * 保存 SKIPPED 状态
   */
  private async saveSkipped(
    eventId: string,
    model: string,
    reason: string,
  ): Promise<void> {
    await prisma.aIAnalysis.create({
      data: {
        eventId,
        model,
        summary: `Skipped: ${reason}`,
        riskLevel: RiskLevel.LOW,
        categories: [],
        keyChanges: [],
        suggestions: [],
        tokensUsed: 0,
        latencyMs: 0,
        status: AnalysisStatus.SKIPPED,
        errorMessage: reason,
      },
    });
  }

  /**
   * 保存 FAILED 状态
   */
  private async saveFailed(
    eventId: string,
    model: string,
    reason: string,
  ): Promise<void> {
    await prisma.aIAnalysis.create({
      data: {
        eventId,
        model,
        summary: 'Analysis failed',
        riskLevel: RiskLevel.MEDIUM,
        categories: [],
        keyChanges: [],
        suggestions: [],
        tokensUsed: 0,
        latencyMs: 0,
        status: AnalysisStatus.FAILED,
        errorMessage: reason,
      },
    });
  }

  /**
   * 生成 FAILED/SKIPPED 的 AnalysisOutput 占位对象
   */
  private failedOutput(reason: string): AnalysisOutput {
    return {
      summary: reason,
      riskLevel: 'MEDIUM',
      riskReason: reason,
      categories: [],
      keyChanges: [],
      suggestions: [],
      tokensUsed: 0,
      latencyMs: 0,
    };
  }

  /**
   * 从数据库记录重建 AnalysisOutput（用于去重返回已有结果）
   */
  private toAnalysisOutput(record: AIAnalysis): AnalysisOutput {
    return {
      summary: record.summary,
      summaryShort: record.summaryShort ?? record.summary,
      summaryLong: record.summaryLong ?? record.summary,
      category: record.category ?? 'UNKNOWN',
      riskLevel: record.riskLevel,
      riskScore: record.riskScore ?? 0,
      riskReasons: record.riskReasons,
      riskReason: record.riskReason ?? undefined,
      tags: record.tags,
      categories: record.categories,
      affectedAreas: record.affectedAreas,
      impactSummary: record.impactSummary ?? '',
      suggestedAction: record.suggestedAction ?? 'REVIEW_REQUIRED',
      confidence: record.confidence ?? 0.5,
      keyChanges: (record.keyChanges as string[]) ?? [],
      suggestions: (record.suggestions as any[]) ?? [],
      tokensUsed: record.tokensUsed,
      latencyMs: record.latencyMs,
    };
  }
}
