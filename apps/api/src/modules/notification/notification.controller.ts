import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { NotificationService, NotificationPreferences } from './notification.service';
import { SendNotificationDto, UpdateNotificationPreferencesDto } from './dto/notification.dto';
import type { Notification, NotificationStatus } from '@repo-pulse/database';

@Controller('notifications')
@UseGuards(AuthGuard('jwt'))
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  /**
   * 获取用户通知偏好
   */
  @Get('preferences')
  async getPreferences(
    @CurrentUser() user: { sub: string },
  ): Promise<NotificationPreferences> {
    return this.notificationService.getPreferences(user.sub);
  }

  /**
   * 更新用户通知偏好
   */
  @Post('preferences')
  async updatePreferences(
    @CurrentUser() user: { sub: string },
    @Body() prefs: UpdateNotificationPreferencesDto,
  ): Promise<NotificationPreferences> {
    return this.notificationService.updatePreferences(user.sub, prefs);
  }

  /**
   * 获取通知列表
   */
  @Get()
  async getNotifications(
    @CurrentUser() user: { sub: string },
    @Query('status') status?: NotificationStatus,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<{ notifications: Notification[]; total: number }> {
    return this.notificationService.getUserNotifications(user.sub, {
      status,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  /**
   * 获取未读数量
   */
  @Get('unread-count')
  async getUnreadCount(
    @CurrentUser() user: { sub: string },
    @Query('repositoryIds') repositoryIds?: string,
    @Query('branchScopes') branchScopes?: string,
  ): Promise<{ count: number }> {
    const count = await this.notificationService.getUnreadCount(user.sub, repositoryIds, branchScopes);
    return { count };
  }

  /**
   * 标记通知为已读
   */
  @Post(':id/read')
  async markAsRead(
    @CurrentUser() user: { sub: string },
    @Param('id', ParseUUIDPipe) notificationId: string,
  ): Promise<{ success: boolean }> {
    await this.notificationService.markAsRead(notificationId, user.sub);
    return { success: true };
  }

  /**
   * 标记所有通知为已读
   */
  @Post('read-all')
  async markAllAsRead(
    @CurrentUser() user: { sub: string },
  ): Promise<{ success: boolean }> {
    await this.notificationService.markAllAsRead(user.sub);
    return { success: true };
  }

  /**
   * 删除通知
   */
  @Delete(':id')
  async deleteNotification(
    @CurrentUser() user: { sub: string },
    @Param('id', ParseUUIDPipe) notificationId: string,
  ): Promise<{ success: boolean }> {
    await this.notificationService.deleteNotification(notificationId, user.sub);
    return { success: true };
  }

  /**
   * 手动发送通知（管理员用）
   */
  @Post('send')
  async sendNotification(
    @Body() dto: SendNotificationDto,
  ): Promise<Notification> {
    return this.notificationService.send(dto);
  }
}
