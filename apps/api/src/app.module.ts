import { Module } from '@nestjs/common';
import { APP_GUARD, APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bullmq';
import * as Joi from 'joi';
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';
import { RepositoryModule } from './modules/repository/repository.module';
import { WebhookModule } from './modules/webhook/webhook.module';
import { EventModule } from './modules/event/event.module';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from './modules/auth/guards/roles.guard';
import { HttpExceptionFilter } from './common/filters';
import { TransformInterceptor, TimeoutInterceptor } from './common/interceptors';

@Module({
  imports: [
    // Global configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '../../.env',
      validationSchema: Joi.object({
        DATABASE_URL: Joi.string().required(),
        REDIS_URL: Joi.string().default('redis://localhost:6379'),
        JWT_SECRET: Joi.string().required(),
        JWT_EXPIRATION: Joi.string().default('7d'),
        APP_PORT: Joi.number().default(3001),
        CORS_ORIGIN: Joi.string().default('http://localhost:5173'),
        GITHUB_TOKEN: Joi.string().allow('').optional(),
        GITLAB_TOKEN: Joi.string().allow('').optional(),
        WEBHOOK_SECRET: Joi.string().allow('').optional(),
        APP_URL: Joi.string().default('http://localhost:3001'),
      }),
    }),

    // Rate limiting
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),

    // BullMQ
    BullModule.forRoot({
      connection: {
        host: 'localhost',
        port: 6379,
      },
    }),

    // Feature modules
    AuthModule,
    UserModule,
    RepositoryModule,
    WebhookModule,
    EventModule,

    // Future modules:
    // AIModule,
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
