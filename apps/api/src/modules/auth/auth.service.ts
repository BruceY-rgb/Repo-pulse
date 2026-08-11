import { ConflictException, ForbiddenException, Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import type { RegisterPayload, RegisterResult } from '@repo-pulse/shared';
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

export interface DesktopSessionResult {
  status: 'authenticated' | 'locked';
  lockEnabled: boolean;
  user?: User;
  tokens?: TokenPair;
}

const LOCAL_DESKTOP_USER_ID_KEY = 'LOCAL_DESKTOP_USER_ID';
const LOCAL_APP_LOCK_ENABLED_KEY = 'LOCAL_APP_LOCK_ENABLED';
const DEFAULT_LOCAL_EMAIL = 'local@repo-pulse.app';

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
   * 为个人桌面模式解析唯一的本地身份。
   *
   * 升级兼容策略是确定性的：优先使用已经记录的本地用户；否则选择最早创建的
   * ADMIN，再退回最早创建的任意用户；空库才创建默认 Owner。选定后写入
   * AppConfig，后续启动不会因新增用户而漂移。
   */
  async resolveLocalDesktopUser(): Promise<User> {
    const configured = await prisma.appConfig.findUnique({
      where: { key: LOCAL_DESKTOP_USER_ID_KEY },
    });
    if (configured?.value) {
      const selected = await prisma.user.findUnique({ where: { id: configured.value } });
      if (selected) {
        return selected;
      }
    }

    let user = await prisma.user.findFirst({
      where: { role: Role.ADMIN },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    user ??= await prisma.user.findFirst({
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    if (!user) {
      try {
        user = await prisma.user.create({
          data: {
            email: DEFAULT_LOCAL_EMAIL,
            name: 'Repo-Pulse User',
            role: Role.ADMIN,
          },
        });
        this.logger.log(`local_desktop_user_created userId=${user.id}`);
      } catch (error) {
        if ((error as { code?: string })?.code !== 'P2002') {
          throw error;
        }
        user = await prisma.user.findUnique({ where: { email: DEFAULT_LOCAL_EMAIL } });
        if (!user) {
          throw error;
        }
      }
    }

    await prisma.appConfig.upsert({
      where: { key: LOCAL_DESKTOP_USER_ID_KEY },
      update: { value: user.id, updatedBy: user.id },
      create: { key: LOCAL_DESKTOP_USER_ID_KEY, value: user.id, updatedBy: user.id },
    });
    return user;
  }

  async getAppLockStatus(userId: string) {
    const [config, user] = await Promise.all([
      prisma.appConfig.findUnique({ where: { key: LOCAL_APP_LOCK_ENABLED_KEY } }),
      prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } }),
    ]);
    return {
      enabled: config?.value === 'true',
      hasPassword: Boolean(user?.passwordHash),
    };
  }

  async createDesktopSession(password?: string): Promise<DesktopSessionResult> {
    const user = await this.resolveLocalDesktopUser();
    const lock = await this.getAppLockStatus(user.id);

    if (lock.enabled) {
      if (!password || !user.passwordHash) {
        return { status: 'locked', lockEnabled: true };
      }
      if (!(await bcrypt.compare(password, user.passwordHash))) {
        throw new UnauthorizedException('应用锁密码错误');
      }
    }

    const tokens = await this.generateTokens({
      sub: user.id,
      email: user.email,
      role: user.role,
    });
    return { status: 'authenticated', lockEnabled: lock.enabled, user, tokens };
  }

  async enableAppLock(userId: string, password: string) {
    await this.assertLocalDesktopUser(userId);
    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.$transaction([
      prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
      prisma.appConfig.upsert({
        where: { key: LOCAL_APP_LOCK_ENABLED_KEY },
        update: { value: 'true', updatedBy: userId },
        create: { key: LOCAL_APP_LOCK_ENABLED_KEY, value: 'true', updatedBy: userId },
      }),
    ]);
    return { enabled: true, hasPassword: true };
  }

  async changeAppLockPassword(userId: string, currentPassword: string, newPassword: string) {
    await this.assertLocalDesktopUser(userId);
    await this.verifyAppLockPassword(userId, currentPassword);
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await bcrypt.hash(newPassword, 10) },
    });
    return { enabled: true, hasPassword: true };
  }

  async disableAppLock(userId: string, password: string) {
    await this.assertLocalDesktopUser(userId);
    await this.verifyAppLockPassword(userId, password);
    // 保留 passwordHash，便于重新启用和兼容归档版本；只关闭启动验证开关。
    await prisma.appConfig.upsert({
      where: { key: LOCAL_APP_LOCK_ENABLED_KEY },
      update: { value: 'false', updatedBy: userId },
      create: { key: LOCAL_APP_LOCK_ENABLED_KEY, value: 'false', updatedBy: userId },
    });
    return { enabled: false, hasPassword: true };
  }

  private async verifyAppLockPassword(userId: string, password: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });
    if (!user?.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('应用锁密码错误');
    }
  }

  private async assertLocalDesktopUser(userId: string) {
    const selected = await this.resolveLocalDesktopUser();
    if (selected.id !== userId) {
      throw new ForbiddenException('只有当前本地桌面身份可以修改应用锁');
    }
  }

  /**
   * 账号密码注册。首个注册的用户成为本地实例的 ADMIN，后续用户为 MEMBER。
   */
  async register(dto: RegisterPayload): Promise<TokenPair & RegisterResult> {
    const email = this.normalizeEmail(dto.email);

    const existing = await this.userService.findByEmail(email);
    if (existing) {
      throw new ConflictException('Email is already registered');
    }

    const userCount = await prisma.user.count();
    const role = userCount === 0 ? Role.ADMIN : Role.MEMBER;

    let user: User;
    try {
      user = await this.userService.create({
        email,
        name: dto.name.trim() || email,
        username: dto.username?.trim() || undefined,
        password: dto.password,
        role,
      });
    } catch (error) {
      // 并发注册/重复提交可能绕过上面的 findByEmail 预检，
      // 唯一约束冲突（email/username）统一映射为 409 而不是 500
      if ((error as { code?: string })?.code === 'P2002') {
        throw new ConflictException('Email or username is already registered');
      }
      throw error;
    }
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
