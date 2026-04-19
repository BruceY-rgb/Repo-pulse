import { ExecutionContext, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { GithubStrategy } from '../strategies/github.strategy';

@Injectable()
export class GithubAuthGuard extends AuthGuard('github') {
  constructor(private readonly githubStrategy: GithubStrategy) {
    super();
  }

  canActivate(context: ExecutionContext) {
    if (!this.githubStrategy.isConfigured()) {
      throw new ServiceUnavailableException('GitHub OAuth is not configured');
    }

    return super.canActivate(context);
  }
}
