import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiCookieAuth } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { UserService } from '../user/user.service';
import { ConfigService } from '@nestjs/config';
import { DesktopSessionDto } from './dto/desktop-session.dto';
import {
  ChangeAppLockPasswordDto,
  DisableAppLockDto,
  EnableAppLockDto,
} from './dto/app-lock.dto';

// Cookie 配置常量
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
};

const DEFAULT_ACCESS_TOKEN_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 天
const DEFAULT_REFRESH_TOKEN_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 天

/**
 * 解析 '15m' / '12h' / '7d' / '30s' 形式的时长为毫秒。
 * Cookie 的 maxAge 必须与 JWT 的有效期一致，否则会出现
 * 「Cookie 还在但 Token 已过期」或反过来的不一致状态。
 * 合法格式由 env.validation.ts 在启动时强制（^[1-9]\d*[smhd]$），这里的回退只兜底缺省值。
 */
function parseDurationMs(value: string | undefined, fallbackMs: number): number {
  if (!value) {
    return fallbackMs;
  }
  const match = /^([1-9]\d*)([smhd])$/.exec(value.trim());
  if (!match) {
    return fallbackMs;
  }
  const amount = Number(match[1]);
  const unitMs = { s: 1000, m: 60 * 1000, h: 60 * 60 * 1000, d: 24 * 60 * 60 * 1000 }[
    match[2] as 's' | 'm' | 'h' | 'd'
  ];
  return amount * unitMs;
}

@ApiTags('认证')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);
  private readonly accessTokenMaxAge: number;
  private readonly refreshTokenMaxAge: number;

  constructor(
    private readonly authService: AuthService,
    private readonly userService: UserService,
    private readonly configService: ConfigService,
  ) {
    this.accessTokenMaxAge = parseDurationMs(
      this.configService.get<string>('JWT_EXPIRATION'),
      DEFAULT_ACCESS_TOKEN_MAX_AGE,
    );
    this.refreshTokenMaxAge = parseDurationMs(
      this.configService.get<string>('JWT_REFRESH_EXPIRATION'),
      DEFAULT_REFRESH_TOKEN_MAX_AGE,
    );
  }

  @Get('bootstrap-status')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '是否还没有任何账号（首次使用）' })
  async bootstrapStatus() {
    return this.authService.getBootstrapStatus();
  }

  /**
   * Electron 个人模式的本地会话入口。仍签发标准 JWT/HttpOnly Cookie，后续所有
   * API 与 WebSocket 继续走既有鉴权。只有显式启用且来自回环地址的桌面请求可用。
   */
  @Post('desktop-session')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '建立本地桌面会话，应用锁开启时验证密码' })
  async desktopSession(
    @Body() dto: DesktopSessionDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.assertLocalDesktopRequest(req);
    const result = await this.authService.createDesktopSession(dto.password);
    if (result.status === 'locked' || !result.tokens || !result.user) {
      this.clearTokenCookies(res);
      return { status: 'locked', lockEnabled: true };
    }

    this.setTokenCookies(res, result.tokens.accessToken, result.tokens.refreshToken);
    return {
      status: 'authenticated',
      lockEnabled: result.lockEnabled,
      userId: result.user.id,
    };
  }

  @Get('app-lock')
  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: '读取本地应用锁状态' })
  async appLockStatus(@CurrentUser() user: { sub: string }) {
    return this.authService.getAppLockStatus(user.sub);
  }

  @Post('app-lock/enable')
  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: '设置密码并启用启动验证' })
  async enableAppLock(@CurrentUser() user: { sub: string }, @Body() dto: EnableAppLockDto) {
    return this.authService.enableAppLock(user.sub, dto.password);
  }

  @Post('app-lock/change-password')
  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: '修改应用锁密码' })
  async changeAppLockPassword(
    @CurrentUser() user: { sub: string },
    @Body() dto: ChangeAppLockPasswordDto,
  ) {
    return this.authService.changeAppLockPassword(user.sub, dto.currentPassword, dto.newPassword);
  }

  @Post('app-lock/disable')
  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: '关闭启动验证' })
  async disableAppLock(@CurrentUser() user: { sub: string }, @Body() dto: DisableAppLockDto) {
    return this.authService.disableAppLock(user.sub, dto.password);
  }

  /**
   * 账号密码注册 — 首个用户成为 ADMIN，注册成功后直接登录
   */
  @Post('register')
  @Public()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '账号密码注册' })
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.register(dto);
    this.setTokenCookies(res, result.accessToken, result.refreshToken);
    return { userId: result.userId, email: result.email, name: result.name, role: result.role };
  }

  /**
   * 邮箱密码登录 — Token 写入 HttpOnly Cookie
   */
  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '邮箱密码登录' })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const user = await this.authService.validateUser(dto.email, dto.password);
    const tokens = await this.authService.generateTokens({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    this.setTokenCookies(res, tokens.accessToken, tokens.refreshToken);

    // 返回用户基本信息（不含 Token，Token 已在 Cookie 中）
    return { userId: user.id, email: user.email, name: user.name };
  }

  /**
   * 刷新 Token — 从 Cookie 读取 Refresh Token，写入新 Token
   */
  @Post('refresh')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '刷新 Token（从 Cookie 读取）' })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = req.cookies?.refresh_token as string | undefined;
    if (!refreshToken) {
      throw new UnauthorizedException('未找到 Refresh Token，请重新登录');
    }

    const tokens = await this.authService.refreshTokens(refreshToken);
    this.setTokenCookies(res, tokens.accessToken, tokens.refreshToken);

    return { message: 'Token 已刷新' };
  }

  /**
   * 登出 — 清除 Cookie
   */
  @Post('logout')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '登出，清除 Cookie' })
  async logout(@Res({ passthrough: true }) res: Response) {
    this.clearTokenCookies(res);
    return { message: '已成功登出' };
  }

  /**
   * 获取当前登录用户信息
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: '获取当前用户信息' })
  async me(@CurrentUser() user: { sub: string }) {
    this.logger.log(`auth_me_requested userId=${user.sub}`);
    return this.userService.findById(user.sub);
  }

  /**
   * 静默读取当前会话。
   *
   * 用于前端路由守卫：未登录、Cookie 缺失或 Token 无效时返回 null，
   * 避免把正常未登录态表现为浏览器控制台里的 401 网络错误。
   */
  @Get('session')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '静默获取当前会话' })
  async session(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const accessToken = req.cookies?.access_token as string | undefined;
    const refreshToken = req.cookies?.refresh_token as string | undefined;

    const accessPayload = accessToken
      ? await this.authService.verifyToken(accessToken)
      : null;

    if (accessPayload) {
      return this.userService.findById(accessPayload.sub);
    }

    if (!refreshToken) {
      return null;
    }

    const refreshPayload = await this.authService.verifyToken(refreshToken);
    if (!refreshPayload) {
      this.clearTokenCookies(res);
      return null;
    }

    const tokens = await this.authService.generateTokens({
      sub: refreshPayload.sub,
      email: refreshPayload.email,
      role: refreshPayload.role,
    });
    this.setTokenCookies(res, tokens.accessToken, tokens.refreshToken);

    return this.userService.findById(refreshPayload.sub);
  }

  // ─── 私有方法 ────────────────────────────────────────────────────────────────

  private setTokenCookies(res: Response, accessToken: string, refreshToken: string) {
    res.cookie('access_token', accessToken, {
      ...COOKIE_OPTIONS,
      maxAge: this.accessTokenMaxAge,
    });
    res.cookie('refresh_token', refreshToken, {
      ...COOKIE_OPTIONS,
      maxAge: this.refreshTokenMaxAge,
    });
  }

  private clearTokenCookies(res: Response) {
    res.clearCookie('access_token', { path: '/' });
    res.clearCookie('refresh_token', { path: '/' });
  }

  private assertLocalDesktopRequest(req: Request) {
    const enabled = this.configService.get<boolean>('LOCAL_DESKTOP_AUTH_ENABLED', true);
    const appHost = this.configService.get<string>('APP_HOST', '127.0.0.1');
    const isLoopbackHost = appHost === '127.0.0.1' || appHost === 'localhost' || appHost === '::1';
    const desktopHeader = req.header('x-repo-pulse-desktop');
    const remoteAddress = req.socket.remoteAddress ?? req.ip ?? '';
    const isLoopback =
      remoteAddress === '127.0.0.1' ||
      remoteAddress === '::1' ||
      remoteAddress === '::ffff:127.0.0.1';

    if (!enabled || !isLoopbackHost || desktopHeader !== 'electron' || !isLoopback) {
      throw new ForbiddenException('本地桌面自动会话不可用');
    }
  }
}
