import { Controller, Get, Patch, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UserService } from './user.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';

@ApiTags('用户')
@Controller('users')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('me')
  @ApiOperation({ summary: '获取当前用户信息' })
  async getMe(@CurrentUser() user: { sub: string }) {
    return this.userService.findById(user.sub);
  }

  @Patch('preferences')
  @ApiOperation({ summary: '更新用户偏好设置' })
  async updatePreferences(
    @CurrentUser() user: { sub: string },
    @Body() dto: UpdatePreferencesDto,
  ): Promise<any> {
    return this.userService.updatePreferences(user.sub, dto.preferences);
  }
}
