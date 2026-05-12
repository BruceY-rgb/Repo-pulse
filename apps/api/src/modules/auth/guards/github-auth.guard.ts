import { BadRequestException, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { GithubStrategy } from '../strategies/github.strategy';

@Injectable()
export class GithubAuthGuard extends AuthGuard('github') {
  private readonly logger = new Logger(GithubAuthGuard.name);

  constructor(private readonly githubStrategy: GithubStrategy) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<{
      method?: string;
      originalUrl?: string;
      ip?: string;
      headers?: Record<string, string | undefined>;
    }>();

    if (!this.githubStrategy.hasCredentials()) {
      this.logger.warn(
        `github_oauth_guard_blocked method=${request?.method ?? 'unknown'} url=${request?.originalUrl ?? 'unknown'} reason=missing_runtime_credentials`,
      );
      throw new BadRequestException(
        'GitHub OAuth is not configured yet. Please provide Client ID and Client Secret on the login page first.',
      );
    }

    this.logger.log(
      `github_oauth_guard_pass method=${request?.method ?? 'unknown'} url=${request?.originalUrl ?? 'unknown'} ip=${request?.ip ?? 'unknown'} userAgent=${request?.headers?.['user-agent'] ?? 'unknown'}`,
    );
    return super.canActivate(context);
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
