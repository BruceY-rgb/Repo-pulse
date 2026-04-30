import {
  Controller,
  Post,
  Body,
  Headers,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { WebhookService } from './webhook.service';
import { Public } from '../auth/decorators/public.decorator';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('Webhook')
@Controller('webhooks')
export class WebhookController {
  constructor(private readonly webhookService: WebhookService) {}

  /**
   * GitHub Webhook 接收端点
   * 使用 RawBodyRequest 获取原始 Buffer，用于 HMAC 签名验证
   */
  @Post('github')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'GitHub Webhook 接收端点' })
  async handleGithubWebhook(
    @Headers('x-hub-signature-256') signature: string | undefined,
    @Headers('x-github-event') githubEvent: string | undefined,
    @Req() req: RawBodyRequest<Request>,
    @Body() payload: Record<string, unknown>,
  ) {
    // 优先使用 NestJS 内置的 rawBody（需在 NestFactory.create 中开启 rawBody: true）
    const rawBody = req.rawBody;
    await this.webhookService.handleGithubWebhook(signature, githubEvent, rawBody, payload);
    return { success: true };
  }

  /**
   * GitLab Webhook 接收端点
   * GitLab 使用 X-Gitlab-Token 头进行简单 Token 比对
   */
  @Post('gitlab')
  @Public()
  @ApiOperation({ summary: 'GitLab Webhook 接收端点' })
  async handleGitlabWebhook(
    @Headers('x-gitlab-token') token: string | undefined,
    @Body() payload: Record<string, unknown>,
  ) {
    await this.webhookService.handleGitlabWebhook(token, payload);
    return { success: true };
  }
}
