import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { json } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { AppModule } from './app.module';
import { RedisIoAdapter } from './adapters/redis-io.adapter';
import { join } from 'path';

// Prisma Event.seq is BigInt. Native JSON.stringify throws on BigInt, so make
// HTTP responses and socket replay payloads safe before app bootstrap.
(BigInt.prototype as unknown as { toJSON(): number }).toJSON = function () {
  return Number(this);
};

async function bootstrap() {
  // 保留 Raw Body 供 Webhook 验签使用
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
    bodyParser: false,
  });

  app.use(json({ limit: '20mb' }));

  const configService = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  // Security
  app.use(helmet());

  // Cookie parser — 支持 HttpOnly Cookie 认证
  app.use(cookieParser());

  // CORS — 使用 FRONTEND_URL，允许携带 Cookie
  const frontendUrl = configService.get<string>('FRONTEND_URL', 'http://localhost:5173');
  const allowedCorsOrigins = new Set([
    frontendUrl,
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:5174',
    'http://127.0.0.1:5174',
    'null',
  ]);
  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      if (!origin || allowedCorsOrigins.has(origin)) {
        callback(null, true);
        return;
      }

      logger.warn(`CORS request rejected from origin: ${origin}`);
      callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // Raw body 捕获中间件 — 仅对 /webhooks 路径保留原始 Buffer，供 HMAC 验签使用
  app.use('/webhooks', (req: Request & { rawBody?: Buffer }, _res: Response, next: NextFunction) => {
    // NestJS rawBody 模式已经在 NestFactory.create 中启用，此处作为备用
    if (!req.rawBody && req.body) {
      req.rawBody = Buffer.from(JSON.stringify(req.body));
    }
    next();
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Socket.io Redis adapter — 多 API 实例时共享 WebSocket room 广播。
  // 本地单实例可设置 REDIS_PUBSUB_DISABLE=true 跳过；Redis 不可用时自动降级。
  if (configService.get<string>('REDIS_PUBSUB_DISABLE') !== 'true') {
    const redisUrl = configService.get<string>('REDIS_URL', 'redis://localhost:6379');
    const pubsubDb = Number(configService.get<string>('REDIS_PUBSUB_DB', '1'));
    const redisAdapter = new RedisIoAdapter(app);
    try {
      await redisAdapter.connectToRedis(redisUrl, pubsubDb);
      app.useWebSocketAdapter(redisAdapter);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown_error';
      logger.warn(
        `Redis adapter unavailable, falling back to single-instance broadcast: ${message}`,
      );
    }
  }

  // Swagger API docs
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Repo-Pulse API')
    .setDescription('AI-powered code repository monitoring platform')
    .setVersion('0.1.0')
    .addBearerAuth()
    .addCookieAuth('access_token')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  const host = configService.get<string>('APP_HOST', '127.0.0.1');
  const port = configService.get<number>('APP_PORT', 3001);
  await app.listen(port, host);
  logger.log(`Application running on http://${host}:${port}`);
  logger.log(`Swagger docs at http://${host}:${port}/docs`);
  logger.log(`Frontend URL (CORS): ${frontendUrl}`);
}

bootstrap();
