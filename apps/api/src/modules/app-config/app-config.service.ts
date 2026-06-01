import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@repo-pulse/database';

export type AppConfigSource = 'db' | 'env' | 'default';

export interface AppConfigValue {
  value: string;
  source: AppConfigSource;
}

@Injectable()
export class AppConfigService {
  private readonly logger = new Logger(AppConfigService.name);
  private readonly prisma = new PrismaClient();

  constructor(private readonly configService: ConfigService) {}

  /**
   * 读取配置：DB → env → fallback 三层兜底
   */
  async get(key: string, fallback?: string): Promise<string | undefined> {
    const resolved = await this.resolve(key, fallback);
    return resolved?.value;
  }

  /**
   * 读取配置 + 来源标识（给 UI 显示用）
   */
  async resolve(key: string, fallback?: string): Promise<AppConfigValue | undefined> {
    const row = await this.prisma.appConfig.findUnique({ where: { key } });
    if (row?.value) {
      return { value: row.value, source: 'db' };
    }
    const envValue = this.configService.get<string>(key);
    if (envValue) {
      return { value: envValue, source: 'env' };
    }
    if (fallback !== undefined) {
      return { value: fallback, source: 'default' };
    }
    return undefined;
  }

  /**
   * 写入配置（upsert）
   */
  async set(key: string, value: string, userId: string): Promise<void> {
    await this.prisma.appConfig.upsert({
      where: { key },
      update: { value, updatedBy: userId },
      create: { key, value, updatedBy: userId },
    });
    this.logger.log(`app_config_updated key=${key} updatedBy=${userId}`);
  }
}
