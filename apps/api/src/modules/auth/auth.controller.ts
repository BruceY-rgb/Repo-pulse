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
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';

@ApiTags('认证')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '邮箱密码登录' })
  async login(@Body() dto: LoginDto) {
    const user = await this.authService.validateUser(dto.email, dto.password);
    return this.authService.generateTokens({
      sub: user.id,
      email: user.email,
      role: user.role,
    });
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '刷新 Token' })
  async refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshTokens(dto.refreshToken);
  }

  @Get('github')
  @Public()
  @UseGuards(AuthGuard('github'))
  @ApiOperation({ summary: 'GitHub OAuth 跳转' })
  githubAuth() {
    // Passport 会自动重定向到 GitHub
  }

  @Get('github/callback')
  @Public()
  @UseGuards(AuthGuard('github'))
  @ApiOperation({ summary: 'GitHub OAuth 回调' })
  async githubCallback(@Req() req: Request, @Res() res: Response) {
    const user = req.user as {
      id: string;
      email: string;
      displayName: string;
      avatar: string;
    };
    const tokens = await this.authService.handleGithubAuth(user);

    // 将 token 通过 URL 参数传递给前端
    const frontendUrl = process.env.APP_URL || 'http://localhost:5173';
    res.redirect(
      `${frontendUrl}/auth/callback?accessToken=${tokens.accessToken}&refreshToken=${tokens.refreshToken}`,
    );
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取当前用户信息' })
  async me(@CurrentUser() user: { sub: string }) {
    return this.authService['userService'].findById(user.sub);
  }
}
