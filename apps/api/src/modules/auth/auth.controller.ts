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
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiCookieAuth } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { BootstrapDto } from './dto/bootstrap.dto';
import { SendVerificationCodeDto } from './dto/verification-code.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { GithubAuthGuard } from './guards/github-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { UserService } from '../user/user.service';
import { ConfigService } from '@nestjs/config';

// Cookie 配置常量
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
};

const ACCESS_TOKEN_MAX_AGE = 15 * 60 * 1000;        // 15 分钟
const REFRESH_TOKEN_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 天

@ApiTags('认证')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly authService: AuthService,
    private readonly userService: UserService,
    private readonly configService: ConfigService,
  ) { }

  @Get('bootstrap-status')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '获取首个管理员初始化状态' })
  async bootstrapStatus() {
    return this.authService.getBootstrapStatus();
  }

  @Post('verification-codes')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '发送邮箱验证码' })
  async sendVerificationCode(@Body() dto: SendVerificationCodeDto) {
    return this.authService.sendVerificationCode(dto.email, dto.purpose);
  }

  @Post('bootstrap')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '创建首个管理员账号' })
  async bootstrap(@Body() dto: BootstrapDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.bootstrapFirstAdmin(dto);
    this.setTokenCookies(res, result.accessToken, result.refreshToken);
    return { userId: result.userId, email: result.email, name: result.name };
  }

  /**
   * 邮箱密码登录 — Token 写入 HttpOnly Cookie
   */
  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '邮箱密码登录' })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const user = await this.authService.validateUserWithVerification(
      dto.email,
      dto.password,
      dto.verificationCode,
    );
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
   * GitHub OAuth 入口
   */
  @Get('github')
  @Public()
  @UseGuards(GithubAuthGuard)
  @ApiOperation({ summary: 'GitHub OAuth 跳转' })
  githubAuth() {
    this.logger.log('github_oauth_authorize_redirect_started');
    // Passport 会自动重定向到 GitHub，无需实现
  }


  /**
   * GitHub OAuth 回调 — 将 Token 写入 Cookie 后重定向到前端
   */
  @Get('github/callback')
  @Public()
  @UseGuards(GithubAuthGuard)
  @ApiOperation({ summary: 'GitHub OAuth 回调' })
  async githubCallback(
    @Req() req: Request,
    @Res() res: Response
  ) {
    this.logger.log(
      `github_oauth_callback_entered codePresent=${req.query?.code ? 'true' : 'false'} error=${typeof req.query?.error === 'string' ? req.query.error : 'none'}`,
    );

    // 拿到 GitHub 登录后的用户信息
    const profile = req.user as {
      id: string;
      email: string;
      displayName: string;
      avatar: string;
      githubAccessToken: string;
      githubRefreshToken: string;
    };

    // 生成 token
    const tokens = await this.authService.handleGithubAuth(profile);
    this.logger.log(
      `github_oauth_tokens_generated githubId=${profile.id} accessTokenPresent=${tokens.accessToken ? 'true' : 'false'} refreshTokenPresent=${tokens.refreshToken ? 'true' : 'false'}`,
    );

    // 写入 cookie
    this.setTokenCookies(res, tokens.accessToken, tokens.refreshToken);
    this.logger.log(`github_oauth_cookies_set githubId=${profile.id}`);

    // 跳转到前端回调页（如果有 return cookie 则按 return 路径跳，附 webhook_recheck=1 让前端自动重试）
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:5173';
    const returnPath = req.cookies?.oauth_return_url as string | undefined;
    res.clearCookie('oauth_return_url', { path: '/' });

    const target = returnPath
      ? `${frontendUrl}${returnPath}${returnPath.includes('?') ? '&' : '?'}webhook_recheck=1`
      : `${frontendUrl}/auth/callback`;

    this.logger.log(
      `github_oauth_callback_success email=${profile.email} githubId=${profile.id} redirect=${target}`,
    );
    res.redirect(target);
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
      maxAge: ACCESS_TOKEN_MAX_AGE,
    });
    res.cookie('refresh_token', refreshToken, {
      ...COOKIE_OPTIONS,
      maxAge: REFRESH_TOKEN_MAX_AGE,
    });
  }

  private clearTokenCookies(res: Response) {
    res.clearCookie('access_token', { path: '/' });
    res.clearCookie('refresh_token', { path: '/' });
  }
}
