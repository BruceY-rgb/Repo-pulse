import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  constructor(private readonly configService: ConfigService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? exception.message
        : 'Internal server error';

    if (status >= 500) {
      const oauthDetails = extractOAuthErrorDetails(exception);
      this.logger.error(
        oauthDetails ? `[${status}] ${message} ${oauthDetails}` : `[${status}] ${message}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:5173';
    const isGithubCallbackRequest =
      request.method === 'GET' && request.path === '/auth/github/callback';

    if (isGithubCallbackRequest && !response.headersSent) {
      const oauthReason = extractOAuthErrorReason(exception);
      const query = oauthReason
        ? `error=oauth_failed&reason=${encodeURIComponent(oauthReason)}`
        : 'error=oauth_failed';
      response.redirect(`${frontendUrl}/login?${query}`);
      return;
    }

    response.status(status).json({
      code: status,
      data: null,
      message,
      timestamp: new Date().toISOString(),
    });
  }
}

function extractOAuthErrorDetails(exception: unknown): string | null {
  if (!exception || typeof exception !== 'object' || !('oauthError' in exception)) {
    return null;
  }

  const oauthError = (exception as {
    oauthError?: { statusCode?: number; data?: unknown; message?: string };
  }).oauthError;

  if (!oauthError) {
    return null;
  }

  const parts: string[] = [];

  if (typeof oauthError.statusCode === 'number') {
    parts.push(`oauthStatus=${oauthError.statusCode}`);
  }

  if (typeof oauthError.data === 'string' && oauthError.data) {
    parts.push(`oauthData=${oauthError.data}`);
  } else if (oauthError.data) {
    try {
      parts.push(`oauthData=${JSON.stringify(oauthError.data)}`);
    } catch {
      // ignore serialization failure
    }
  }

  if (!parts.length && typeof oauthError.message === 'string' && oauthError.message) {
    parts.push(`oauthMessage=${oauthError.message}`);
  }

  return parts.length ? parts.join(' ') : null;
}

function extractOAuthErrorReason(exception: unknown): string | null {
  if (!exception || typeof exception !== 'object' || !('oauthError' in exception)) {
    return null;
  }

  const oauthError = (exception as {
    oauthError?: { data?: unknown };
  }).oauthError;

  if (!oauthError || typeof oauthError.data !== 'string') {
    return null;
  }

  const params = new URLSearchParams(oauthError.data);
  return params.get('error') || null;
}
