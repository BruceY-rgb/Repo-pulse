import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as bcrypt from 'bcrypt';
import { UserService } from '../user/user.service';
import { SyncService } from '../sync/sync.service';
import { prisma, User } from '@repo-pulse/database';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

interface GithubEnvProfile {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
  avatar_url: string;
}

interface GithubEmail {
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

  async verifyToken(token: string): Promise<JwtPayload | null> {
    try {
      return await this.jwtService.verifyAsync<JwtPayload>(token);
    } catch {
      return null;
    }
  }

  async handleGithubAuth(profile: {
    id: string;
    email: string | undefined;
    displayName: string;
    githubLogin?: string;
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
          githubLogin: profile.githubLogin,
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
          githubLogin: profile.githubLogin,
          githubAccessToken: profile.githubAccessToken,
          githubRefreshToken: profile.githubRefreshToken,
        });
        this.logger.log(`New user created via GitHub OAuth: ${profile.email}`);
      }
    } else {
      this.logger.log(`github_oauth_lookup_by_github_id_hit githubId=${profile.id} userId=${user.id}`);
        user = await this.userService.update(user.id, {
          githubId: profile.id,
          githubLogin: profile.githubLogin,
          githubAccessToken: profile.githubAccessToken,
          githubRefreshToken: profile.githubRefreshToken,
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

  async handleGithubEnvTokenAuth() {
    if (this.configService.get<string>('DESKTOP_AUTH_MODE') !== 'env') {
      throw new UnauthorizedException('Desktop env login is not enabled');
    }

    const githubToken = this.configService.get<string>('GITHUB_TOKEN')?.trim();
    if (!githubToken) {
      throw new UnauthorizedException('GITHUB_TOKEN is not configured');
    }

    const profile = await this.fetchGithubEnvProfile(githubToken);
    const email =
      profile.email ||
      (await this.fetchPrimaryGithubEmail(githubToken)) ||
      `${profile.login}@users.noreply.github.com`;
    const githubId = String(profile.id);
    const displayName = profile.name || profile.login || 'GitHub User';

    let user = await this.userService.findByGithubId(githubId);

    if (!user) {
      const existingUserByEmail = await this.userService.findByEmail(email);

      if (existingUserByEmail) {
        user = await this.userService.update(existingUserByEmail.id, {
          githubId,
          githubLogin: profile.login,
          githubAccessToken: githubToken,
          name: displayName,
          avatar: profile.avatar_url,
        });
      } else {
        user = await this.userService.create({
          email,
          name: displayName,
          avatar: profile.avatar_url,
          githubId,
          githubLogin: profile.login,
          githubAccessToken: githubToken,
        });
      }
    } else {
      user = await this.userService.update(user.id, {
        githubLogin: profile.login,
        githubAccessToken: githubToken,
        name: displayName,
        avatar: profile.avatar_url,
      });
    }

    // Desktop env login = 本机开发者 = 这个本地实例的 owner，强制升 ADMIN
    if (user.role !== 'ADMIN') {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { role: 'ADMIN' },
      });
      this.logger.log(`desktop_github_env_login_role_promoted userId=${user.id} role=ADMIN`);
    }

    this.logger.log(`desktop_github_env_login_success userId=${user.id} login=${profile.login}`);

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

  private async fetchGithubEnvProfile(githubToken: string): Promise<GithubEnvProfile> {
    try {
      const response = await axios.get<GithubEnvProfile>('https://api.github.com/user', {
        headers: this.getGithubTokenHeaders(githubToken),
      });
      return response.data;
    } catch (error) {
      this.logger.error('desktop_github_env_profile_fetch_failed', this.formatErrorForLog(error));
      throw new UnauthorizedException('Unable to read GitHub profile from GITHUB_TOKEN');
    }
  }

  private async fetchPrimaryGithubEmail(githubToken: string): Promise<string | null> {
    try {
      const response = await axios.get<GithubEmail[]>('https://api.github.com/user/emails', {
        headers: this.getGithubTokenHeaders(githubToken),
      });
      const primaryEmail = response.data.find((item) => item.primary && item.verified);
      const verifiedEmail = response.data.find((item) => item.verified);
      return primaryEmail?.email || verifiedEmail?.email || null;
    } catch (error) {
      this.logger.warn('desktop_github_env_email_fetch_failed', this.formatErrorForLog(error));
      return null;
    }
  }

  private formatErrorForLog(error: unknown): string {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const method = error.config?.method?.toUpperCase();
      const url = error.config?.url;
      const data = error.response?.data as { message?: unknown } | undefined;
      const providerMessage = typeof data?.message === 'string' ? data.message : undefined;
      return [
        `AxiosError: ${error.message}`,
        status ? `status=${status}` : undefined,
        method ? `method=${method}` : undefined,
        url ? `url=${url}` : undefined,
        providerMessage ? `providerMessage=${providerMessage}` : undefined,
      ].filter(Boolean).join(' ');
    }

    if (error instanceof Error) {
      return `${error.name}: ${error.message}`;
    }

    return String(error);
  }

  private getGithubTokenHeaders(githubToken: string) {
    return {
      Accept: 'application/vnd.github.v3+json',
      Authorization: `Bearer ${githubToken}`,
      'User-Agent': 'Repo-Pulse-Desktop',
    };
  }
}
