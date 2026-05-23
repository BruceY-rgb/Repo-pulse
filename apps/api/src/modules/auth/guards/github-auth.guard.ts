import { BadRequestException, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request, Response } from 'express';
import { GithubStrategy } from '../strategies/github.strategy';

const OAUTH_RETURN_COOKIE = 'oauth_return_url';
const OAUTH_RETURN_COOKIE_MAX_AGE = 5 * 60 * 1000; // 5 分钟

@Injectable()
export class GithubAuthGuard extends AuthGuard('github') {
  private readonly logger = new Logger(GithubAuthGuard.name);

  constructor(private readonly githubStrategy: GithubStrategy) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    if (!this.githubStrategy.hasCredentials()) {
      this.logger.warn(
        `github_oauth_guard_blocked method=${request?.method ?? 'unknown'} url=${request?.originalUrl ?? 'unknown'} reason=missing_runtime_credentials`,
      );
      throw new BadRequestException(
        'GitHub OAuth is not configured yet. Please provide Client ID and Client Secret on the login page first.',
      );
    }

    // 入口路径（/auth/github）从 query 取 return，写 cookie；callback 路径不动 cookie
    const path = request?.path ?? '';
    if (path.endsWith('/auth/github') && !path.endsWith('/callback')) {
      const returnUrl = typeof request.query?.return === 'string' ? request.query.return : null;
      if (returnUrl && this.isSafeReturnPath(returnUrl)) {
        response.cookie(OAUTH_RETURN_COOKIE, returnUrl, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: OAUTH_RETURN_COOKIE_MAX_AGE,
          path: '/',
        });
        this.logger.log(`github_oauth_return_cookie_set returnUrl=${returnUrl}`);
      }
    }

    this.logger.log(
      `github_oauth_guard_pass method=${request?.method ?? 'unknown'} url=${request?.originalUrl ?? 'unknown'} ip=${request?.ip ?? 'unknown'} userAgent=${request?.headers?.['user-agent'] ?? 'unknown'}`,
    );
    return super.canActivate(context);
  }

  private isSafeReturnPath(value: string): boolean {
    // 只允许同源相对路径（防止 open redirect）
    return value.startsWith('/') && !value.startsWith('//');
  }

  handleRequest<TUser = unknown>(
    err: unknown,
    user: TUser,
    info: unknown,
    context: ExecutionContext,
  ) {
    const request = context.switchToHttp().getRequest<{ originalUrl?: string }>();

    if (err || !user) {
      const errMessage = err instanceof Error ? err.message : 'none';
      const infoMessage =
        info instanceof Error
          ? info.message
          : typeof info === 'string'
            ? info
            : info
              ? JSON.stringify(info)
              : 'none';

      this.logger.warn(
        `github_oauth_guard_handle_request_failed url=${request?.originalUrl ?? 'unknown'} err=${errMessage} info=${infoMessage}`,
      );
    } else {
      this.logger.log(
        `github_oauth_guard_handle_request_success url=${request?.originalUrl ?? 'unknown'}`,
      );
    }

    return super.handleRequest(err, user, info, context);
  }
}
