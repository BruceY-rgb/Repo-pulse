import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const errorResponse =
      exception instanceof HttpException ? exception.getResponse() : null;
    const details =
      typeof errorResponse === 'string'
        ? { message: errorResponse }
        : (errorResponse as Record<string, unknown> | null);
    const rawMessage = details?.message;
    const message = Array.isArray(rawMessage)
      ? String(rawMessage[0] ?? 'Request failed')
      : typeof rawMessage === 'string'
        ? rawMessage
        : exception instanceof HttpException
          ? exception.message
          : 'Internal server error';
    const error =
      status === HttpStatus.BAD_REQUEST
        ? message
        : typeof details?.error === 'string'
          ? details.error
          : HttpStatus[status] ?? 'Error';

    if (status >= 500) {
      this.logger.error(
        `[${status}] ${message}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    response.status(status).json({
      code: status,
      data: null,
      error,
      message,
      timestamp: new Date().toISOString(),
    });
  }
}
