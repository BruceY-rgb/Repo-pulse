import { ConflictException, Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { UserService } from '../user/user.service';
import { prisma, Role, User } from '@repo-pulse/database';

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
    const user = await this.userService.findByEmail(this.normalizeEmail(email));
    // 统一错误信息，避免暴露邮箱是否已注册
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return user;
  }

  async getBootstrapStatus() {
    const userCount = await prisma.user.count();
    return { required: userCount === 0 };
  }

  /**
   * 账号密码注册。首个注册的用户成为本地实例的 ADMIN，后续用户为 MEMBER。
   */
  async register(dto: {
    email: string;
    name: string;
    password: string;
    username?: string;
  }): Promise<TokenPair & { userId: string; email: string; name: string; role: string }> {
    const email = this.normalizeEmail(dto.email);

    const existing = await this.userService.findByEmail(email);
    if (existing) {
      throw new ConflictException('Email is already registered');
    }

    const userCount = await prisma.user.count();
    const role = userCount === 0 ? Role.ADMIN : Role.MEMBER;

    const user = await this.userService.create({
      email,
      name: dto.name.trim() || email,
      username: dto.username?.trim() || undefined,
      password: dto.password,
      role,
    });
    this.logger.log(`user_registered userId=${user.id} role=${role}`);

    const tokens = await this.generateTokens({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    return {
      ...tokens,
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };
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

  private normalizeEmail(email: string) {
    return email.trim().toLowerCase();
  }
}
