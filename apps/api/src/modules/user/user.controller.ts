import { Controller, Get, Patch, Post, Body, UseGuards, UseInterceptors, UploadedFile, Req } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UserService } from './user.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';
import * as multer from 'multer';
import type { Request } from 'express';

@ApiTags('用户')
@Controller('users')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('me')
  @ApiOperation({ summary: '获取当前用户信息' })
  async getMe(@CurrentUser() user: { sub: string }, @Req() req?: Request) {
    const userData = await this.userService.findById(user.sub);
    // TODO: 生产环境移除 - 用于 WebSocket 测试
    const accessToken = req?.cookies?.access_token;
    return { ...userData, accessToken };
  }

  @Patch('preferences')
  @ApiOperation({ summary: '更新用户偏好设置' })
  async updatePreferences(
    @CurrentUser() user: { sub: string },
    @Body() dto: UpdatePreferencesDto,
  ): Promise<any> {
    return this.userService.updatePreferences(user.sub, dto.preferences);
  }

  @Patch('me')
  @ApiOperation({ summary: '更新用户资料' })
  async updateProfile(
    @CurrentUser() user: { sub: string },
    @Body() body: { name?: string; email?: string; avatar?: string; username?: string; company?: string; bio?: string },
  ): Promise<any> {
    return this.userService.updateProfile(user.sub, body);
  }

  @Get('me/github-avatar')
  async getGithubAvatar(@CurrentUser() user: { sub: string }) {
    const avatar = await this.userService.fetchGithubAvatar(user.sub);
    return { avatar };
  }

  @Post('me/avatar')
  @UseInterceptors(FileInterceptor('file', {
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: (_req: any, file: any, cb: any) => {
      if (!file.mimetype.startsWith('image/')) {
        cb(new Error('Only image files are allowed'), false);
      } else {
        cb(null, true);
      }
    },
  }))
  async uploadAvatar(
    @CurrentUser() user: { sub: string },
    @UploadedFile() file: any,
  ) {
    const base64 = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
    await this.userService.updateProfile(user.sub, { avatar: base64 });
    return { avatar: base64 };
  }
}
