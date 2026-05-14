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

  const host = configService.get<string>('APP_HOST', '127.0.0.1');
  const port = configService.get<number>('APP_PORT', 3001);
  const publicApiUrl = configService.get<string>('API_URL', `http://${host}:${port}`);
  const githubCallbackUrl = configService.get<string>('GITHUB_CALLBACK_URL', '');
  const githubOAuthTimeoutMs = configService.get<number>('GITHUB_OAUTH_TIMEOUT_MS', 30000);
  const githubOAuthProxyEnabled = isGithubOAuthProxyEnabled(configService);

  await app.listen(port, host);
  logger.log(`Application running on http://${host}:${port}`);
  logger.log(`Swagger docs at http://${host}:${port}/docs`);
  logger.log(`API URL: ${publicApiUrl}`);
  logger.log(`Frontend URL (CORS): ${frontendUrl}`);
  logger.log(`GitHub OAuth callback URL: ${githubCallbackUrl || 'not configured'}`);
  logger.log(`GitHub OAuth timeout: ${githubOAuthTimeoutMs}ms`);
  logger.log(`GitHub OAuth proxy: ${githubOAuthProxyEnabled ? 'enabled' : 'disabled'}`);
}

bootstrap();

function isGithubOAuthProxyEnabled(configService: ConfigService) {
  if (configService.get<string>('GITHUB_OAUTH_PROXY_URL')?.trim()) {
    return true;
  }

  if (matchesNoProxy('github.com') || matchesNoProxy('api.github.com')) {
    return false;
  }

  return Boolean(
    process.env.HTTPS_PROXY?.trim() ||
      process.env.https_proxy?.trim() ||
      process.env.ALL_PROXY?.trim() ||
      process.env.all_proxy?.trim() ||
      process.env.HTTP_PROXY?.trim() ||
      process.env.http_proxy?.trim(),
  );
}

function matchesNoProxy(host: string) {
  const noProxy = process.env.NO_PROXY ?? process.env.no_proxy;
  if (!noProxy) {
    return false;
  }

  return noProxy.split(',').some((entry) => {
    const pattern = entry.trim().toLowerCase();
    if (!pattern) {
      return false;
    }

    if (pattern === '*') {
      return true;
    }

    if (pattern.startsWith('.')) {
      return host.endsWith(pattern);
    }

    return host === pattern || host.endsWith(`.${pattern}`);
  });
}
