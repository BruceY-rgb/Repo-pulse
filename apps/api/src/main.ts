import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import type { Request, Response, NextFunction } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  // 保留 Raw Body 供 Webhook 验签使用
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
  });

  const configService = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  // Security
  app.use(helmet());

  // Cookie parser — 支持 HttpOnly Cookie 认证
  app.use(cookieParser());

  // CORS — 使用 FRONTEND_URL，允许携带 Cookie
  const frontendUrl = configService.get<string>('FRONTEND_URL', 'http://localhost:5173');
  app.enableCors({
    origin: frontendUrl,
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

  const port = configService.get<number>('APP_PORT', 3001);
  await app.listen(port);
  logger.log(`Application running on http://localhost:${port}`);
  logger.log(`Swagger docs at http://localhost:${port}/docs`);
  logger.log(`Frontend URL (CORS): ${frontendUrl}`);
}

bootstrap();
