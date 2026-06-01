import { Controller, ForbiddenException, Get, Headers, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { MetricsService } from './metrics.service';

@Public()
@Controller('metrics')
export class MetricsController {
  constructor(
    private readonly metricsService: MetricsService,
    private readonly configService: ConfigService,
  ) {}

  @Get()
  async getMetrics(
    @Headers('authorization') authorization: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const expectedToken = this.configService.get<string>('METRICS_TOKEN');
    if (expectedToken) {
      const provided = authorization?.startsWith('Bearer ')
        ? authorization.slice('Bearer '.length).trim()
        : undefined;
      if (provided !== expectedToken) {
        throw new ForbiddenException('Invalid metrics token');
      }
    }
    // 未配置 METRICS_TOKEN 时默认允许（开发场景）；生产应在 .env 设置

    const body = await this.metricsService.getMetrics();
    res
      .setHeader('Content-Type', this.metricsService.getContentType())
      .status(200)
      .send(body);
  }
}
