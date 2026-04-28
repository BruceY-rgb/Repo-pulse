import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  Res,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AIService } from './ai.service';
import { prisma, AnalysisStatus } from '@repo-pulse/database';
import type { EventAnalysisDto } from '@repo-pulse/shared';

@Controller('ai')
@UseGuards(JwtAuthGuard)
export class AIController {
  constructor(private readonly aiService: AIService) {}

  // ================================================================
  // MVP 必做接口
  // ================================================================

  /**
   * 触发 AI 分析（放入队列）
   */
  @Post('trigger/:eventId')
  async triggerAnalysis(
    @CurrentUser() user: { sub: string },
    @Param('eventId') eventId: string,
    @Body('force') force?: boolean,
  ) {
    await this.aiService.triggerAnalysis(eventId, force ?? false);
    return { success: true, message: 'Analysis job triggered' };
  }

  /**
   * 获取事件分析结果（返回 EventAnalysisDto）
   */
  @Get('analysis/:eventId')
  async getAnalysis(
    @CurrentUser() user: { sub: string },
    @Param('eventId') eventId: string,
  ): Promise<{ status: string; analysis: EventAnalysisDto | null }> {
    const analysis = await prisma.aIAnalysis.findFirst({
      where: { eventId },
      orderBy: { createdAt: 'desc' },
    });

    if (!analysis) {
      return { status: 'pending', analysis: null };
    }

    return {
      status: analysis.status.toLowerCase(),
      analysis: this.toDto(analysis),
    };
  }

  /**
   * 分析列表（分页 + 筛选）
   */
  @Get('analysis/events')
  async getAnalysisList(
    @CurrentUser() user: { sub: string },
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('riskLevel') riskLevel?: string,
    @Query('category') category?: string,
    @Query('status') status?: string,
  ) {
    const pageNum = Math.max(1, parseInt(page || '1', 10));
    const size = Math.min(100, Math.max(1, parseInt(pageSize || '20', 10)));
    const skip = (pageNum - 1) * size;

    const where: Record<string, unknown> = {};

    // 仅返回用户有权限访问仓库的分析
    where.event = {
      repository: {
        users: { some: { userId: user.sub } },
      },
    };

    if (riskLevel) {
      where.riskLevel = riskLevel.toUpperCase();
    }
    if (category) {
      where.category = category.toUpperCase();
    }
    if (status) {
      where.status = status.toUpperCase() as AnalysisStatus;
    }

    const [items, total] = await Promise.all([
      prisma.aIAnalysis.findMany({
        where: where as any,
        orderBy: { createdAt: 'desc' },
        skip,
        take: size,
      }),
      prisma.aIAnalysis.count({ where: where as any }),
    ]);

    return {
      items: items.map((a) => this.toDto(a)),
      total,
      page: pageNum,
      pageSize: size,
      totalPages: Math.ceil(total / size),
    };
  }

  // ================================================================
  // 非 MVP 接口（保留不删除，不在本阶段主动维护）
  // ================================================================

  /**
   * 流式 AI 分析结果 (SSE)
   * @deprecated MVP 阶段不修复 Provider 硬编码，后续 Phase 再处理
   */
  @Get('stream/:eventId')
  @HttpCode(200)
  async streamAnalysis(
    @CurrentUser() user: { sub: string },
    @Param('eventId') eventId: string,
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    try {
      const event = await prisma.event.findFirst({
        where: {
          id: eventId,
          repository: {
            users: { some: { userId: user.sub } },
          },
        },
        include: { repository: true },
      });

      if (!event) {
        res.write(`data: ${JSON.stringify({ error: 'Event not found or access denied' })}\n\n`);
        res.end();
        return;
      }

      const userData = await prisma.user.findUnique({
        where: { id: user.sub },
      });

      const aiProvider = userData?.aiProvider || 'anthropic';
      const aiApiKey = userData?.aiApiKey || process.env.ANTHROPIC_API_KEY || '';
      const aiBaseUrl = userData?.aiBaseUrl || undefined;
      const aiModel = userData?.aiModel || 'claude-sonnet-4-20250514';

      const input = {
        eventType: event.type,
        title: event.title,
        body: event.body || '',
        language: 'zh' as const,
        context: {
          repository: event.repository.name,
          author: event.author,
        },
      };

      // @ts-ignore
      const { OpenAIProvider } = await import('@repo-pulse/ai-sdk');
      const provider = new OpenAIProvider({
        apiKey: aiApiKey,
        baseUrl: aiBaseUrl,
        model: aiModel,
      });

      for await (const chunk of provider.analyzeStream(input)) {
        if (chunk.type === 'text') {
          res.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk.content })}\n\n`);
        } else if (chunk.type === 'done') {
          res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
        }
      }

      res.end();
    } catch (error) {
      console.error('SSE streaming error:', error);
      res.write(`data: ${JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' })}\n\n`);
      res.end();
    }
  }

  // ================================================================
  // Private helpers
  // ================================================================

  /**
   * 将 AIAnalysis DB 记录映射为 EventAnalysisDto
   */
  private toDto(analysis: any): EventAnalysisDto {
    return {
      id: analysis.id,
      eventId: analysis.eventId,
      model: analysis.model,
      summary: analysis.summaryShort ?? analysis.summary ?? '',
      summaryShort: analysis.summaryShort ?? analysis.summary ?? '',
      summaryLong: analysis.summaryLong ?? analysis.summary ?? '',
      category: analysis.category ?? 'UNKNOWN',
      riskLevel: analysis.riskLevel,
      riskScore: analysis.riskScore ?? 0,
      riskReasons: analysis.riskReasons ?? [],
      tags: analysis.tags ?? [],
      affectedAreas: analysis.affectedAreas ?? [],
      impactSummary: analysis.impactSummary ?? '',
      suggestedAction: analysis.suggestedAction ?? 'REVIEW_REQUIRED',
      confidence: analysis.confidence ?? 0,
      keyChanges: (analysis.keyChanges as any[])?.map(String) ?? [],
      suggestions: (analysis.suggestions as any[]) ?? [],
      tokensUsed: analysis.tokensUsed,
      latencyMs: analysis.latencyMs,
      status: analysis.status,
      errorMessage: analysis.errorMessage ?? undefined,
      promptVersion: analysis.promptVersion ?? undefined,
      createdAt: analysis.createdAt?.toISOString() ?? '',
    };
  }
}
