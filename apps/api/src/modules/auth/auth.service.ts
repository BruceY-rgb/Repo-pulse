import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { UserService } from '../user/user.service';
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

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly userService: UserService,
  ) {}

  async validateUser(email: string, password: string): Promise<User> {
    const user = await this.userService.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException('用户不存在');
    }

    // 如果用户通过 OAuth 注册，没有密码
    if (!user.passwordHash) {
      throw new UnauthorizedException('请使用 OAuth 方式登录');
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedException('密码错误');
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
      throw new UnauthorizedException('Refresh token 无效或已过期');
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
    // 如果 email 为空，抛出错误
    if (!profile.email) {
      this.logger.error('GitHub OAuth failed: email not available');
      throw new UnauthorizedException('无法获取 GitHub 邮箱，请确保您的邮箱已公开');
    }

    let user = await this.userService.findByGithubId(profile.id);

    if (!user) {
      user = await this.userService.create({
        email: profile.email,
        name: profile.displayName || 'GitHub User',
        avatar: profile.avatar,
        githubId: profile.id,
        githubAccessToken: profile.githubAccessToken,
        githubRefreshToken: profile.githubRefreshToken,
      });
      this.logger.log(`New user created via GitHub OAuth: ${profile.email}`);
    } else {
      // 更新已存在用户的 token
      user = await this.userService.update(user.id, {
        githubAccessToken: profile.githubAccessToken,
        githubRefreshToken: profile.githubRefreshToken,
      });
    }

    return this.generateTokens({
      sub: user.id,
      email: user.email,
      role: user.role,
    });
  }
}
