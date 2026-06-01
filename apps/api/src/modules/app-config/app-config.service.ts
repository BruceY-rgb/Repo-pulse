import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { prisma } from '@repo-pulse/database';

export interface AppConfigValue {
  key: string;
  value: string;
  source: 'database' | 'env' | 'default';
  updatedAt?: string;
}

@Injectable()
export class AppConfigService {
  constructor(private readonly configService: ConfigService) {}

  async get(key: string, fallback = ''): Promise<string> {
    const value = await this.getWithSource(key, fallback);
    return value.value;
  }

  async getWithSource(key: string, fallback = ''): Promise<AppConfigValue> {
    const persisted = await prisma.appConfig.findUnique({ where: { key } });
    if (persisted) {
      return {
        key,
        value: persisted.value,
        source: 'database',
        updatedAt: persisted.updatedAt.toISOString(),
      };
    }

    const envValue = this.configService.get<string>(key);
    if (envValue) {
      return { key, value: envValue, source: 'env' };
    }

    return { key, value: fallback, source: 'default' };
  }

  async set(key: string, value: string, updatedBy?: string): Promise<AppConfigValue> {
    const saved = await prisma.appConfig.upsert({
      where: { key },
      update: { value, updatedBy },
      create: { key, value, updatedBy },
    });

    return {
      key,
      value: saved.value,
      source: 'database',
      updatedAt: saved.updatedAt.toISOString(),
    };
  }
}
