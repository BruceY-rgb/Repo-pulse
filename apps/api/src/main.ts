import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { existsSync } from 'fs';
import { join } from 'path';
import { json } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { AppModule } from './app.module';
import { jsonBigIntReplacer } from './common/utils/json-serialization';
import { RedisIoAdapter } from './adapters/redis-io.adapter';

function resolveSwaggerLogoPath(): string | null {
  const candidates = [
    join(process.cwd(), 'apps/web/public/logo.png'),
    join(process.cwd(), 'public/logo.png'),
    join(process.cwd(), '../web/public/logo.png'),
    join(process.cwd(), '../../apps/web/public/logo.png'),
    join(__dirname, '../../web/public/logo.png'),
    join(__dirname, '../../../apps/web/public/logo.png'),
  ];

  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

const repoPulseSwaggerCss = `
  :root {
    color-scheme: dark;
  }

  body {
    margin: 0;
    background:
      radial-gradient(circle at 14% -8%, rgba(255, 92, 31, 0.16), transparent 30rem),
      radial-gradient(circle at 84% 0%, rgba(56, 189, 248, 0.10), transparent 34rem),
      #0d1117;
    color: #e6edf3;
  }

  .swagger-ui {
    color: #e6edf3;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  .swagger-ui .topbar {
    position: sticky;
    top: 0;
    z-index: 20;
    padding: 14px 28px;
    background: rgba(13, 17, 23, 0.92);
    border-bottom: 1px solid rgba(148, 163, 184, 0.18);
    box-shadow: 0 18px 40px rgba(0, 0, 0, 0.28);
    backdrop-filter: blur(18px);
  }

  .swagger-ui .topbar .wrapper {
    max-width: 1440px;
    padding: 0;
  }

  .swagger-ui .topbar-wrapper {
    align-items: center;
  }

  .swagger-ui .topbar-wrapper .link {
    display: inline-flex;
    align-items: center;
    gap: 12px;
    max-width: none;
    text-decoration: none;
  }

  .swagger-ui .topbar-wrapper .link svg,
  .swagger-ui .topbar-wrapper .link span {
    display: none;
  }

  .swagger-ui .topbar-wrapper .link::before {
    width: 38px;
    height: 38px;
    content: "";
    display: inline-block;
    border: 1px solid rgba(255, 116, 48, 0.35);
    border-radius: 10px;
    background: url("/docs-logo.png") center / cover no-repeat, linear-gradient(135deg, #ff5c1f, #1f8ab8);
    box-shadow: 0 0 28px rgba(255, 92, 31, 0.22);
  }

  .swagger-ui .topbar-wrapper .link::after {
    content: "Repo-Pulse API";
    color: #f8fafc;
    font-size: 18px;
    font-weight: 760;
    letter-spacing: 0;
  }

  .swagger-ui .download-url-wrapper {
    gap: 10px;
  }

  .swagger-ui .download-url-wrapper .select-label,
  .swagger-ui .download-url-wrapper .download-url-button {
    color: #e6edf3;
  }

  .swagger-ui .download-url-wrapper input[type=text],
  .swagger-ui .download-url-wrapper .select-label select {
    min-height: 36px;
    color: #e6edf3;
    background: #111827;
    border: 1px solid rgba(148, 163, 184, 0.26);
    border-radius: 8px;
    box-shadow: none;
  }

  .swagger-ui .download-url-wrapper .download-url-button {
    min-height: 36px;
    background: #ff5c1f;
    border-radius: 8px;
    box-shadow: none;
    font-weight: 700;
  }

  .swagger-ui .wrapper {
    max-width: 1440px;
    padding: 0 28px;
  }

  .swagger-ui .information-container.wrapper {
    margin-top: 26px;
  }

  .swagger-ui .info {
    margin: 0 0 22px;
    padding: 24px;
    border: 1px solid rgba(148, 163, 184, 0.18);
    border-radius: 14px;
    background: linear-gradient(180deg, rgba(22, 27, 34, 0.96), rgba(13, 17, 23, 0.92));
    box-shadow: 0 18px 50px rgba(0, 0, 0, 0.24);
  }

  .swagger-ui .info .title {
    color: #f8fafc;
    font-size: 34px;
    line-height: 1.05;
    letter-spacing: 0;
  }

  .swagger-ui .info .title small {
    top: -5px;
    margin-left: 10px;
    padding: 4px 8px;
    color: #ffd6c8;
    background: rgba(255, 92, 31, 0.15);
    border: 1px solid rgba(255, 92, 31, 0.30);
    border-radius: 999px;
  }

  .swagger-ui .info p,
  .swagger-ui .info li,
  .swagger-ui .info table,
  .swagger-ui .markdown p {
    color: #9aa7b8;
    line-height: 1.65;
  }

  .swagger-ui .scheme-container {
    margin: 0 0 20px;
    padding: 16px 20px;
    border: 1px solid rgba(148, 163, 184, 0.16);
    border-radius: 12px;
    background: rgba(22, 27, 34, 0.86);
    box-shadow: none;
  }

  .swagger-ui .scheme-container .schemes > label,
  .swagger-ui .auth-wrapper .authorize {
    color: #e6edf3;
  }

  .swagger-ui .btn,
  .swagger-ui .opblock-control-arrow,
  .swagger-ui button {
    border-radius: 8px;
  }

  .swagger-ui .btn.authorize {
    color: #ffb199;
    border-color: rgba(255, 92, 31, 0.45);
    background: rgba(255, 92, 31, 0.08);
  }

  .swagger-ui .btn.authorize svg {
    fill: #ff8a5c;
  }

  .swagger-ui .filter .operation-filter-input,
  .swagger-ui input,
  .swagger-ui textarea,
  .swagger-ui select {
    color: #e6edf3;
    background: #0d1117;
    border: 1px solid rgba(148, 163, 184, 0.22);
    border-radius: 8px;
    box-shadow: none;
  }

  .swagger-ui .filter .operation-filter-input {
    min-height: 42px;
    margin: 0 0 18px;
    padding: 0 14px;
  }

  .swagger-ui .opblock-tag {
    margin: 0 0 12px;
    padding: 14px 18px;
    color: #f8fafc;
    border: 1px solid rgba(148, 163, 184, 0.14);
    border-radius: 12px;
    background: rgba(22, 27, 34, 0.72);
  }

  .swagger-ui .opblock-tag:hover {
    background: rgba(30, 41, 59, 0.72);
  }

  .swagger-ui .opblock-tag small {
    color: #93a4b8;
  }

  .swagger-ui .opblock {
    overflow: hidden;
    margin: 0 0 12px;
    border: 1px solid rgba(148, 163, 184, 0.16);
    border-radius: 12px;
    background: #111827;
    box-shadow: none;
  }

  .swagger-ui .opblock .opblock-summary {
    min-height: 52px;
    padding: 0 16px;
    border-color: rgba(148, 163, 184, 0.12);
  }

  .swagger-ui .opblock .opblock-summary-method {
    min-width: 76px;
    border-radius: 8px;
    text-shadow: none;
    box-shadow: none;
  }

  .swagger-ui .opblock .opblock-summary-path,
  .swagger-ui .opblock .opblock-summary-path__deprecated,
  .swagger-ui .opblock .opblock-summary-operation-id,
  .swagger-ui .opblock .opblock-summary-description {
    color: #e6edf3;
  }

  .swagger-ui .opblock .opblock-summary-description {
    color: #9aa7b8;
  }

  .swagger-ui .opblock.opblock-get {
    border-color: rgba(56, 189, 248, 0.25);
    background: rgba(14, 54, 76, 0.28);
  }

  .swagger-ui .opblock.opblock-post {
    border-color: rgba(255, 92, 31, 0.28);
    background: rgba(78, 36, 20, 0.32);
  }

  .swagger-ui .opblock.opblock-put,
  .swagger-ui .opblock.opblock-patch {
    border-color: rgba(245, 158, 11, 0.28);
    background: rgba(77, 52, 12, 0.28);
  }

  .swagger-ui .opblock.opblock-delete {
    border-color: rgba(248, 113, 113, 0.28);
    background: rgba(76, 29, 29, 0.30);
  }

  .swagger-ui .opblock-body,
  .swagger-ui .responses-inner,
  .swagger-ui .opblock-section-header {
    color: #e6edf3;
    background: rgba(13, 17, 23, 0.72);
    box-shadow: none;
  }

  .swagger-ui .opblock-description-wrapper p,
  .swagger-ui .opblock-external-docs-wrapper p,
  .swagger-ui .opblock-title_normal p,
  .swagger-ui .response-col_status,
  .swagger-ui .response-col_description,
  .swagger-ui table thead tr td,
  .swagger-ui table thead tr th,
  .swagger-ui .parameters-col_description,
  .swagger-ui .parameters-col_name {
    color: #cbd5e1;
  }

  .swagger-ui .model,
  .swagger-ui .model-title,
  .swagger-ui .model-toggle,
  .swagger-ui .model-box,
  .swagger-ui .model-box-control,
  .swagger-ui .prop-type,
  .swagger-ui .prop-format,
  .swagger-ui .parameter__name,
  .swagger-ui .parameter__type,
  .swagger-ui .tab li,
  .swagger-ui .response-content-type {
    color: #e6edf3;
  }

  .swagger-ui .highlight-code,
  .swagger-ui .microlight,
  .swagger-ui .model-box,
  .swagger-ui section.models {
    background: #0d1117;
    border-color: rgba(148, 163, 184, 0.16);
  }

  .swagger-ui section.models {
    border-radius: 12px;
  }

  .swagger-ui section.models h4,
  .swagger-ui section.models h5 {
    color: #f8fafc;
  }

  .swagger-ui .execute-wrapper,
  .swagger-ui .btn.execute {
    padding: 12px 20px;
  }

  .swagger-ui .btn.execute {
    background: #ff5c1f;
    border-color: #ff5c1f;
    color: #ffffff;
    font-weight: 800;
  }

  .swagger-ui .btn.try-out__btn {
    color: #e6edf3;
    border-color: rgba(148, 163, 184, 0.28);
  }

  .swagger-ui .modal-ux {
    background: #111827;
    border: 1px solid rgba(148, 163, 184, 0.20);
    border-radius: 14px;
  }

  .swagger-ui .modal-ux-header,
  .swagger-ui .modal-ux-content {
    border-color: rgba(148, 163, 184, 0.14);
    background: #111827;
  }

  .swagger-ui .modal-ux h3,
  .swagger-ui .modal-ux h4,
  .swagger-ui .modal-ux label {
    color: #e6edf3;
  }
`;

async function bootstrap() {
  // 保留 Raw Body 供 Webhook 验签使用
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
    bodyParser: false,
  });
  app.getHttpAdapter().getInstance().set('json replacer', jsonBigIntReplacer);

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
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Repo-Pulse-Desktop'],
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

  // Socket.io Redis adapter — 让多个 API 进程共享 WebSocket 广播
  // 单实例开发时可设 REDIS_PUBSUB_DISABLE=true 跳过
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
  const swaggerLogoPath = resolveSwaggerLogoPath();
  app.getHttpAdapter().getInstance().get('/docs-logo.png', (_req: Request, res: Response) => {
    if (!swaggerLogoPath) {
      res.status(404).end();
      return;
    }

    res.sendFile(swaggerLogoPath);
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Repo-Pulse API')
    .setDescription('Repository monitoring, webhook orchestration, AI analysis, and desktop workbench APIs.')
    .setVersion('0.1.0')
    .addBearerAuth()
    .addCookieAuth('access_token')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document, {
    customCss: repoPulseSwaggerCss,
    customfavIcon: '/docs-logo.png',
    customSiteTitle: 'Repo-Pulse API Docs',
    swaggerOptions: {
      docExpansion: 'none',
      filter: true,
      persistAuthorization: true,
      displayRequestDuration: true,
      defaultModelsExpandDepth: 1,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
  });

  const host = configService.get<string>('APP_HOST', '127.0.0.1');
  const port = configService.get<number>('APP_PORT', 3001);
  await app.listen(port, host);
  logger.log(`Application running on http://${host}:${port}`);
  logger.log(`Swagger docs at http://${host}:${port}/docs`);
  logger.log(`Frontend URL (CORS): ${frontendUrl}`);
}

bootstrap();
