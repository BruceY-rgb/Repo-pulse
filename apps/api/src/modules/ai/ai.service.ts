import { Injectable, Logger } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { prisma, AIAnalysis, RiskLevel, AnalysisStatus } from '@repo-pulse/database';
// @ts-ignore
import { OpenAIProvider, AnalysisInput, AnalysisOutput } from '@repo-pulse/ai-sdk';

@Injectable()
export class AIService {
  private readonly logger = new Logger(AIService.name);

  constructor(
    @InjectQueue('ai-analysis') private aiQueue: Queue,
  ) {}

  /**
   * 触发 AI 分析任务
   */
  async triggerAnalysis(eventId: string): Promise<void> {
    this.logger.log(`Triggering AI analysis for event: ${eventId}`);

    // 添加到队列
    await this.aiQueue.add('analyze-event', {
      eventId,
    });

    this.logger.log(`AI analysis job added to queue for event: ${eventId}`);
  }

  /**
   * 执行 AI 分析
   */
  async analyzeEvent(eventId: string): Promise<AnalysisOutput> {
    this.logger.log(`Analyzing event: ${eventId}`);

    // 获取事件详情 - 需要通过 UserRepository 找到用户
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        repository: {
          include: {
            users: {
              include: {
                user: true,
              },
            },
          },
        },
      },
    });

    if (!event) {
      throw new Error(`Event not found: ${eventId}`);
    }

    // 获取第一个关联用户
    const userRepo = event.repository.users[0];
    if (!userRepo) {
      throw new Error(`No user associated with repository: ${event.repositoryId}`);
    }

    const userId = userRepo.userId;
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    // 使用用户的 AI 配置或默认值
    const aiProvider = user.aiProvider || 'anthropic';
    const aiApiKey = user.aiApiKey || process.env.ANTHROPIC_API_KEY || '';
    const aiBaseUrl = user.aiBaseUrl || undefined;
    const aiModel = user.aiModel || 'claude-sonnet-4-20250514';

    this.logger.log(`Using AI provider: ${aiProvider}, model: ${aiModel}`);

    // 构建分析输入
    const input: AnalysisInput = {
      eventType: event.type,
      title: event.title,
      body: event.body || '',
      language: this.detectLanguage(event.repository.name) as 'zh' | 'en',
      context: {
        repository: event.repository.name,
        author: event.author,
      },
    };

    try {
      // 创建 AI Provider
      const provider = new OpenAIProvider({
        apiKey: aiApiKey,
        baseUrl: aiBaseUrl,
        model: aiModel,
      });

      // 执行分析
      const result = await provider.analyze(input);

      // 保存分析结果到数据库
      await this.saveAnalysis(eventId, result, aiModel);

      this.logger.log(`AI analysis completed for event: ${eventId}`);

      return result;
    } catch (error) {
      this.logger.error(`AI analysis failed for event: ${eventId}`, error);

      // 保存失败状态
      await prisma.aIAnalysis.create({
        data: {
          eventId,
          model: aiModel,
          summary: 'Analysis failed',
          riskLevel: RiskLevel.MEDIUM,
          riskReason: error instanceof Error ? error.message : 'Unknown error',
          categories: [],
          keyChanges: [],
          suggestions: [],
          tokensUsed: 0,
          latencyMs: 0,
          status: AnalysisStatus.FAILED,
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
        },
      });

      throw error;
    }
  }

  /**
   * 保存分析结果
   */
  private async saveAnalysis(
    eventId: string,
    result: AnalysisOutput,
    model: string,
  ): Promise<AIAnalysis> {
    return prisma.aIAnalysis.create({
      data: {
        eventId,
        model,
        summary: result.summary,
        riskLevel: result.riskLevel as RiskLevel,
        riskReason: result.riskReason,
        categories: result.categories,
        keyChanges: result.keyChanges as any,
        suggestions: result.suggestions as any,
        tokensUsed: result.tokensUsed,
        latencyMs: result.latencyMs,
        status: AnalysisStatus.COMPLETED,
      },
    });
  }

  /**
   * 检测编程语言
   */
  private detectLanguage(repoName: string): 'zh' | 'en' {
    const extMap: Record<string, 'zh' | 'en'> = {
      js: 'en',
      ts: 'en',
      py: 'en',
      go: 'en',
      rs: 'en',
      java: 'en',
      rb: 'en',
      php: 'en',
    };

    for (const [ext, lang] of Object.entries(extMap)) {
      if (repoName.includes(ext)) {
        return lang;
      }
    }

    return 'en';
  }
}
