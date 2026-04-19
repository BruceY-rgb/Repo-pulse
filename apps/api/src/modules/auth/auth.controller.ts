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
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiCookieAuth } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { GithubAuthGuard } from './guards/github-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { UserService } from '../user/user.service';
import { GithubStrategy } from './strategies/github.strategy';

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
  constructor(
    private readonly authService: AuthService,
    private readonly userService: UserService,
    private readonly githubStrategy: GithubStrategy,
  ) { }

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
    res.clearCookie('access_token', { path: '/' });
    res.clearCookie('refresh_token', { path: '/' });
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
    // Passport 会自动重定向到 GitHub，无需实现
  }

  /**
   * 运行时配置 GitHub OAuth 客户端参数（仅内存生效，重启后失效）
   */
  @Post('github/config')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '配置 GitHub OAuth 客户端参数（运行时）' })
  configureGithubOAuth(
    @Body() body: { clientId?: string; clientSecret?: string },
  ) {
    const clientId = body.clientId?.trim();
    const clientSecret = body.clientSecret?.trim();

    if (!clientId || !clientSecret) {
      throw new UnauthorizedException('GitHub Client ID / Client Secret 不能为空');
    }

    this.githubStrategy.updateCredentials(clientId, clientSecret);

    return { message: 'GitHub OAuth 配置已更新（重启后需重新配置）' };
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

    // 写入 cookie
    this.setTokenCookies(res, tokens.accessToken, tokens.refreshToken);

    // 跳转到前端回调页
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(`${frontendUrl}/auth/callback`);
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
    return this.userService.findById(user.sub);
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
}
