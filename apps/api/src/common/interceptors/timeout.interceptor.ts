import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  RequestTimeoutException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, throwError, TimeoutError } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';

const REQUEST_TIMEOUT_MS_KEY = 'requestTimeoutMs';
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

export const RequestTimeoutMs = (ms: number) => SetMetadata(REQUEST_TIMEOUT_MS_KEY, ms);

@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const timeoutMs = this.reflector.getAllAndOverride<number>(REQUEST_TIMEOUT_MS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]) ?? DEFAULT_REQUEST_TIMEOUT_MS;

    return next.handle().pipe(
      timeout(timeoutMs),
      catchError((err) => {
        if (err instanceof TimeoutError) {
          return throwError(() => new RequestTimeoutException());
        }
        return throwError(() => err);
      }),
    );
  }
}
