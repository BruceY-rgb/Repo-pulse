import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  constructor(private readonly configService: ConfigService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : null;
    const responsePayload =
      exceptionResponse && typeof exceptionResponse === 'object'
        ? (exceptionResponse as Record<string, unknown>)
        : null;

    const message =
      typeof responsePayload?.message === 'string'
        ? responsePayload.message
        : exception instanceof HttpException
          ? exception.message
          : 'Internal server error';

    const code =
      typeof responsePayload?.code === 'string' || typeof responsePayload?.code === 'number'
        ? responsePayload.code
        : status;

    if (status >= 500) {
      this.logger.error(
        `[${status}] ${message}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    response.status(status).json({
      code,
      data: null,
      message,
      timestamp: new Date().toISOString(),
    });
  }
}
