import {
  Controller,
  Post,
  Body,
  Headers,
  RawBodyRequest,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { WebhookService } from './webhook.service';
import { Public } from '../auth/decorators/public.decorator';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('Webhook')
@Controller('webhooks')
export class WebhookController {
  constructor(private readonly webhookService: WebhookService) {}

  @Post('github')
  @Public()
  @ApiOperation({ summary: 'GitHub Webhook 接收端点' })
  async handleGithubWebhook(
    @Headers('x-hub-signature-256') signature: string,
    @Headers('x-github-event') githubEvent: string,
    @Body() payload: Record<string, unknown>,
  ) {
    await this.webhookService.handleGithubWebhook(signature, githubEvent, payload);
    return { success: true };
  }

  @Post('gitlab')
  @Public()
  @ApiOperation({ summary: 'GitLab Webhook 接收端点' })
  async handleGitlabWebhook(
    @Headers('x-gitlab-token') token: string,
    @Body() payload: Record<string, unknown>,
  ) {
    await this.webhookService.handleGitlabWebhook(token, payload);
    return { success: true };
  }
}
