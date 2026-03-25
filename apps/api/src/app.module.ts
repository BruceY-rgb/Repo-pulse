import { Module } from '@nestjs/common';
import { APP_GUARD, APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bullmq';
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';
import { RepositoryModule } from './modules/repository/repository.module';
import { WebhookModule } from './modules/webhook/webhook.module';
import { EventModule } from './modules/event/event.module';
import { SettingsModule } from './modules/settings/settings.module';
import { AIModule } from './modules/ai/ai.module';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from './modules/auth/guards/roles.guard';
import { HttpExceptionFilter } from './common/filters';
import { TransformInterceptor, TimeoutInterceptor } from './common/interceptors';
import { envValidationSchema } from './config/env.validation';

@Module({
  imports: [
    // Global configuration — 使用统一的 envValidationSchema，避免多处 schema 分裂
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '../../.env',
      validationSchema: envValidationSchema,
    }),

    // Rate limiting
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),

    // BullMQ — 从 ConfigService 读取 Redis 连接，避免硬编码
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const redisUrl = configService.get<string>('REDIS_URL') || 'redis://localhost:6379';
        const url = new URL(redisUrl);
        return {
          connection: {
            host: url.hostname,
            port: parseInt(url.port || '6379', 10),
            password: url.password || undefined,
          },
        };
      },
    }),

    // Feature modules
    AuthModule,
    UserModule,
    RepositoryModule,
    WebhookModule,
    EventModule,
    SettingsModule,
    AIModule,

    // Future modules (uncomment as implemented):
    // FilterModule,
    // ApprovalModule,
    // NotificationModule,
    // DashboardModule,
    // ReportModule,
    // WorkspaceModule,
  ],
  providers: [
    // Global exception filter
    { provide: APP_FILTER, useClass: HttpExceptionFilter },

    // Global interceptors
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
    { provide: APP_INTERCEPTOR, useClass: TimeoutInterceptor },

    // Global guards (order matters: throttle → auth → roles)
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
