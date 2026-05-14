import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as bcrypt from 'bcrypt';
import { UserService } from '../user/user.service';
import { SyncService } from '../sync/sync.service';
import { User } from '@repo-pulse/database';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

interface GithubViewerResponse {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
  avatar_url: string | null;
}

interface GithubEmailResponse {
  email: string;
  primary: boolean;
  verified: boolean;
  visibility: string | null;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly userService: UserService,
    private readonly syncService: SyncService,
  ) {}

  async validateUser(email: string, password: string): Promise<User> {
    const user = await this.userService.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (!user.passwordHash) {
      throw new UnauthorizedException('Please sign in with OAuth');
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedException('Invalid password');
    }

    return user;
  }

  async generateTokens(payload: JwtPayload): Promise<TokenPair> {
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload),
      this.jwtService.signAsync(payload, {
        expiresIn: this.configService.get('JWT_REFRESH_EXPIRATION') || '30d',
      }),
    ]);

    return { accessToken, refreshToken };
  }

  async refreshTokens(refreshToken: string): Promise<TokenPair> {
    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(
        refreshToken,
      );
      return this.generateTokens({
        sub: payload.sub,
        email: payload.email,
        role: payload.role,
      });
    } catch {
      throw new UnauthorizedException('Refresh token is invalid or expired');
    }
  }

  async handleGithubAuth(profile: {
    id: string;
    email: string | undefined;
    displayName: string;
    avatar: string;
    githubAccessToken: string;
    githubRefreshToken: string;
  }) {
    this.logger.log(
      `github_oauth_handle_start githubId=${profile.id} email=${profile.email ?? 'missing'} displayName=${profile.displayName || 'unknown'}`,
    );

    if (!profile.email) {
      this.logger.error('GitHub OAuth failed: email not available');
      throw new UnauthorizedException(
        'Unable to read GitHub email, please make sure your email is available',
      );
    }

    let user = await this.userService.findByGithubId(profile.id);

    if (!user) {
      this.logger.log(`github_oauth_lookup_by_github_id_miss githubId=${profile.id}`);
      const existingUserByEmail = await this.userService.findByEmail(profile.email);

      if (existingUserByEmail) {
        user = await this.userService.update(existingUserByEmail.id, {
          githubId: profile.id,
          githubAccessToken: profile.githubAccessToken,
          githubRefreshToken: profile.githubRefreshToken,
          name: profile.displayName || existingUserByEmail.name,
          avatar: profile.avatar || existingUserByEmail.avatar || undefined,
        });
        this.logger.log(`Existing user linked via GitHub OAuth: ${profile.email}`);
      } else {
        user = await this.userService.create({
          email: profile.email,
          name: profile.displayName || 'GitHub User',
          avatar: profile.avatar,
          githubId: profile.id,
          githubAccessToken: profile.githubAccessToken,
          githubRefreshToken: profile.githubRefreshToken,
        });
        this.logger.log(`New user created via GitHub OAuth: ${profile.email}`);
      }
    } else {
      this.logger.log(`github_oauth_lookup_by_github_id_hit githubId=${profile.id} userId=${user.id}`);
      user = await this.userService.update(user.id, {
        githubId: profile.id,
        githubAccessToken: profile.githubAccessToken,
        githubRefreshToken: profile.githubRefreshToken,
        name: profile.displayName || user.name,
        avatar: profile.avatar || user.avatar || undefined,
      });
    }

    this.logger.log(`github_oauth_handle_success userId=${user.id} email=${user.email}`);

    setTimeout(() => {
      this.syncService.syncUserRepositories(user.id).catch((err) => {
        this.logger.error(`Failed to sync user repositories for ${user.id}`, err);
      });
    }, 100);

    return this.generateTokens({
      sub: user.id,
      email: user.email,
      role: user.role,
    });
  }

  async handleDevGithubTokenAuth(githubToken: string) {
    const profile = await this.resolveGithubProfileFromToken(githubToken);

    this.logger.log(
      `dev_github_auth_profile_resolved githubId=${profile.id} login=${profile.login} emailSource=${profile.emailSource}`,
    );

    return this.handleGithubAuth({
      id: profile.id,
      email: profile.email,
      displayName: profile.displayName,
      avatar: profile.avatar,
      githubAccessToken: githubToken,
      githubRefreshToken: '',
    });
  }

  private async resolveGithubProfileFromToken(githubToken: string) {
    const client = axios.create({
      baseURL: 'https://api.github.com',
      timeout: 30_000,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${githubToken}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    try {
      const [viewerResponse, emailResponse] = await Promise.allSettled([
        client.get<GithubViewerResponse>('/user'),
        client.get<GithubEmailResponse[]>('/user/emails'),
      ]);

      if (viewerResponse.status === 'rejected') {
        throw viewerResponse.reason;
      }

      const viewer = viewerResponse.value.data;
      const verifiedPrimaryEmail =
        emailResponse.status === 'fulfilled'
          ? emailResponse.value.data.find((email) => email.primary && email.verified)?.email
          : null;
      const verifiedVisibleEmail =
        emailResponse.status === 'fulfilled'
          ? emailResponse.value.data.find((email) => email.verified)?.email
          : null;
      const email =
        viewer.email ||
        verifiedPrimaryEmail ||
        verifiedVisibleEmail ||
        `${viewer.login}@users.noreply.github.com`;

      return {
        id: String(viewer.id),
        login: viewer.login,
        email,
        emailSource: viewer.email
          ? 'viewer'
          : verifiedPrimaryEmail
            ? 'primary'
            : verifiedVisibleEmail
              ? 'verified'
              : 'noreply_fallback',
        displayName: viewer.name || viewer.login,
        avatar: viewer.avatar_url || '',
      };
    } catch (error) {
      const status =
        axios.isAxiosError(error) && error.response?.status
          ? ` status=${error.response.status}`
          : '';
      this.logger.warn(`dev_github_auth_profile_failed${status}`);
      throw new UnauthorizedException(
        'Unable to validate GITHUB_TOKEN with GitHub. Please check token validity and permissions.',
      );
    }
  }
}
