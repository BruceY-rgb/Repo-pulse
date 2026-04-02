import {
  Controller,
  Get,
  Post,
  Param,
  Res,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AIService } from './ai.service';
import { prisma } from '@repo-pulse/database';

@Controller('ai')
@UseGuards(JwtAuthGuard)
export class AIController {
  constructor(private readonly aiService: AIService) {}

  /**
   * 流式 AI 分析结果 (SSE)
   */
  @Get('stream/:eventId')
  @HttpCode(200)
  async streamAnalysis(
    @CurrentUser() user: { sub: string },
    @Param('eventId') eventId: string,
    @Res() res: Response,
  ) {
    // 设置 SSE 响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    try {
      // 检查事件是否存在且属于用户
      const event = await prisma.event.findFirst({
        where: {
          id: eventId,
          repository: {
            users: {
              some: {
                userId: user.sub,
              },
            },
          },
        },
        include: {
          repository: true,
        },
      });

      if (!event) {
        res.write(`data: ${JSON.stringify({ error: 'Event not found or access denied' })}\n\n`);
        res.end();
        return;
      }

      // 获取用户的 AI 配置
      const userData = await prisma.user.findUnique({
        where: { id: user.sub },
      });

      const aiProvider = userData?.aiProvider || 'anthropic';
      const aiApiKey = userData?.aiApiKey || process.env.ANTHROPIC_API_KEY || '';
      const aiBaseUrl = userData?.aiBaseUrl || undefined;
      const aiModel = userData?.aiModel || 'claude-sonnet-4-20250514';

      // 构建分析输入
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

      // 动态导入 Provider
      const { OpenAIProvider } = await import('@repo-pulse/ai-sdk');
      const provider = new OpenAIProvider({
        apiKey: aiApiKey,
        baseUrl: aiBaseUrl,
        model: aiModel,
      });

      // 流式发送分析结果
      let fullContent = '';
      for await (const chunk of provider.analyzeStream(input)) {
        if (chunk.type === 'text') {
          fullContent += chunk.content;
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

  /**
   * 获取事件分析结果
   */
  @Get('analysis/:eventId')
  async getAnalysis(
    @CurrentUser() user: { sub: string },
    @Param('eventId') eventId: string,
  ): Promise<{ status: string; analysis: object | null }> {
    const analysis = await prisma.aIAnalysis.findFirst({
      where: { eventId },
    });

    if (!analysis) {
      return { status: 'pending', analysis: null };
    }

    return {
      status: analysis.status.toLowerCase(),
      analysis: {
        summary: analysis.summary,
        riskLevel: analysis.riskLevel,
        riskReason: analysis.riskReason,
        categories: analysis.categories,
        keyChanges: analysis.keyChanges,
        suggestions: analysis.suggestions,
        tokensUsed: analysis.tokensUsed,
        latencyMs: analysis.latencyMs,
      },
    };
  }

  /**
   * 触发 AI 分析
   */
  @Post('trigger/:eventId')
  async triggerAnalysis(
    @CurrentUser() user: { sub: string },
    @Param('eventId') eventId: string,
  ) {
    await this.aiService.triggerAnalysis(eventId);
    return { success: true, message: 'Analysis job triggered' };
  }
}