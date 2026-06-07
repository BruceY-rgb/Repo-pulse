import { Injectable, Logger } from '@nestjs/common';
import { prisma, Notification, NotificationChannel, NotificationStatus } from '@repo-pulse/database';
import { EmailChannel } from './channels/email.channel';
import { DingTalkChannel } from './channels/dingtalk.channel';
import { FeishuChannel } from './channels/feishu.channel';
import { WebhookChannel } from './channels/webhook.channel';
import { WecomChannel } from './channels/wecom.channel';
import { WechatChannel } from './channels/wechat.channel';
import { ChannelSendResult } from './channels/shared';
import { SendNotificationDto, UpdateNotificationPreferencesDto } from './dto/notification.dto';
import {
  buildEventScopeWhere,
  normalizeRepositoryBranchScopes,
  parseRepositoryBranchScopesParam,
} from '../../common/utils/repository-branch-scope';
import { EventGateway } from '../event/event.gateway';

export interface NotificationPreferences {
  channels: NotificationChannel[];
  events: {
    highRisk: boolean;
    prUpdates: boolean;
    analysisComplete: boolean;
    weeklyReport: boolean;
  };
  focusLevel: 'all' | 'important' | 'focused';
  webhookUrl: string | null;
  wecomWebhookUrl: string | null;
  wechatWebhookUrl: string | null;
  email: string | null;
}

const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  channels: [NotificationChannel.IN_APP],
  events: {
    highRisk: true,
    prUpdates: true,
    analysisComplete: true,
    weeklyReport: false,
  },
  focusLevel: 'important',
  webhookUrl: null,
  wecomWebhookUrl: null,
  wechatWebhookUrl: null,
  email: null,
};

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly emailChannel: EmailChannel,
    private readonly dingtalkChannel: DingTalkChannel,
    private readonly feishuChannel: FeishuChannel,
    private readonly webhookChannel: WebhookChannel,
    private readonly wecomChannel: WecomChannel,
    private readonly wechatChannel: WechatChannel,
    private readonly eventGateway: EventGateway,
  ) {}

  /**
   * IN_APP 通知落库成功后，向该用户的 Room 定向推送 notification.new（含最新未读数），
   * 触发前端红点即时刷新。非 IN_APP 渠道跳过；广播失败不影响通知主流程。
   */
  private async maybeEmitNotificationNew(
    dto: SendNotificationDto,
    notificationId: string,
  ): Promise<void> {
    if (dto.channel !== NotificationChannel.IN_APP) {
      return;
    }
    try {
      const unreadCount = await this.getUnreadCount(dto.userId);
      this.eventGateway.broadcastNotificationNew(dto.userId, {
        userId: dto.userId,
        unreadCount,
        notification: {
          id: notificationId,
          title: dto.title,
          content: dto.content,
          eventId: dto.eventId ?? null,
          createdAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      this.logger.warn(
        `notification_new_broadcast_failed id=${notificationId} reason=${
          error instanceof Error ? error.message : 'unknown_error'
        }`,
      );
    }
  }

  /**
   * 通知已读 / 全部已读 / 删除后，向该用户 Room 推送 notification.updated（含最新未读数），
   * 驱动同一用户跨标签页 / 跨设备的红点与通知列表实时同步。广播失败不影响主流程。
   */
  private async emitNotificationUpdated(userId: string): Promise<void> {
    try {
      const unreadCount = await this.getUnreadCount(userId);
      this.eventGateway.broadcastNotificationUpdated(userId, { userId, unreadCount });
    } catch (error) {
      this.logger.warn(
        `notification_updated_broadcast_failed userId=${userId} reason=${
          error instanceof Error ? error.message : 'unknown_error'
        }`,
      );
    }
  }

  private async resolveRepositoryIds(
    userId: string,
    repositoryIdsParam?: string,
  ): Promise<string[]> {
    const userRepos = await prisma.userRepository.findMany({
      where: { userId },
      select: { repositoryId: true },
    });

    const accessibleRepositoryIds = userRepos.map(
      (repository: { repositoryId: string }) => repository.repositoryId,
    );

    if (!repositoryIdsParam) {
      return accessibleRepositoryIds;
    }

    const requestedRepositoryIds = repositoryIdsParam
      .split(',')
      .map((repositoryId) => repositoryId.trim())
      .filter(Boolean);

    if (requestedRepositoryIds.length === 0) {
      return [];
    }

    const accessibleRepositoryIdSet = new Set(accessibleRepositoryIds);
    return requestedRepositoryIds.filter((repositoryId) => accessibleRepositoryIdSet.has(repositoryId));
  }

  async getPreferences(userId: string): Promise<NotificationPreferences> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { preferences: true },
    });

    const prefs = (user?.preferences as Record<string, unknown>) || {};
    const eventPrefs = (prefs.notificationEvents as Record<string, unknown>) || {};

    return {
      channels:
        (prefs.notificationChannels as NotificationChannel[] | undefined) ??
        DEFAULT_NOTIFICATION_PREFERENCES.channels,
      events: {
        ...DEFAULT_NOTIFICATION_PREFERENCES.events,
        ...eventPrefs,
      },
      webhookUrl:
        typeof prefs.notificationWebhookUrl === 'string'
          ? (prefs.notificationWebhookUrl as string)
          : null,
      wecomWebhookUrl:
        typeof prefs.notificationWecomWebhookUrl === 'string'
          ? (prefs.notificationWecomWebhookUrl as string)
          : null,
      wechatWebhookUrl:
        typeof prefs.notificationWechatWebhookUrl === 'string'
          ? (prefs.notificationWechatWebhookUrl as string)
          : null,
      focusLevel:
        typeof prefs.notificationFocusLevel === 'string'
          ? (prefs.notificationFocusLevel as NotificationPreferences['focusLevel'])
          : DEFAULT_NOTIFICATION_PREFERENCES.focusLevel,
      email:
        typeof prefs.notificationEmail === 'string'
          ? (prefs.notificationEmail as string)
          : null,
    };
  }

  async updatePreferences(
    userId: string,
    prefs: UpdateNotificationPreferencesDto,
  ): Promise<NotificationPreferences> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { preferences: true },
    });

    const currentPrefs = (user?.preferences as Record<string, unknown>) || {};
    const existing = await this.getPreferences(userId);

    const updatedPrefs: Record<string, unknown> = {
      ...currentPrefs,
      notificationChannels: prefs.channels ?? existing.channels,
      notificationEvents: {
        ...existing.events,
        ...(prefs.events || {}),
      },
    };

    if (prefs.webhookUrl !== undefined) {
      updatedPrefs.notificationWebhookUrl = prefs.webhookUrl;
    }

    if (prefs.wecomWebhookUrl !== undefined) {
      updatedPrefs.notificationWecomWebhookUrl = prefs.wecomWebhookUrl;
    }

    if (prefs.wechatWebhookUrl !== undefined) {
      updatedPrefs.notificationWechatWebhookUrl = prefs.wechatWebhookUrl;
    }

    if (prefs.email !== undefined) {
      updatedPrefs.notificationEmail = prefs.email;
    }

    if (prefs.focusLevel !== undefined) {
      updatedPrefs.notificationFocusLevel = prefs.focusLevel;
    }

    await prisma.user.update({
      where: { id: userId },
      data: { preferences: updatedPrefs as any },
    });

    return this.getPreferences(userId);
  }

  async send(dto: SendNotificationDto): Promise<Notification> {
    this.logger.log(
      `Sending notification to user ${dto.userId} via ${dto.channel}: ${dto.title}`,
    );

    const notification = await prisma.notification.create({
      data: {
        userId: dto.userId,
        eventId: dto.eventId,
        channel: dto.channel,
        title: dto.title,
        content: dto.content,
        status: NotificationStatus.PENDING,
        metadata: (dto.metadata || {}) as any,
      },
    });

    try {
      const result = await this.sendViaChannel(dto);
      const nextStatus = result.success
        ? NotificationStatus.SENT
        : NotificationStatus.FAILED;
      const sentAt = result.success ? new Date() : null;
      const nextMetadata = {
        ...(dto.metadata || {}),
        ...(result.metadata || {}),
        ...(result.failureReason ? { failureReason: result.failureReason } : {}),
      };

      await prisma.notification.update({
        where: { id: notification.id },
        data: {
          status: nextStatus,
          sentAt,
          metadata: nextMetadata as any,
        },
      });

      this.logger.log(
        `${result.success ? 'notification_sent' : 'notification_failed'} notificationId=${notification.id} channel=${dto.channel} userId=${dto.userId}`,
      );

      if (result.success) {
        await this.maybeEmitNotificationNew(dto, notification.id);
      }

      return {
        ...notification,
        status: nextStatus,
        sentAt,
        metadata: nextMetadata as any,
      };
    } catch (error) {
      this.logger.error(`Failed to send notification ${notification.id}`, error);

      await prisma.notification.update({
        where: { id: notification.id },
        data: {
          status: NotificationStatus.FAILED,
          metadata: {
            ...(dto.metadata || {}),
            failureReason: 'notification_send_exception',
            error: error instanceof Error ? error.message : 'unknown_error',
          } as any,
        },
      });

      throw error;
    }
  }

  private async sendViaChannel(dto: SendNotificationDto): Promise<ChannelSendResult> {
    const user = await prisma.user.findUnique({
      where: { id: dto.userId },
      select: { preferences: true },
    });

    const prefs = (user?.preferences as Record<string, unknown>) || {};

    switch (dto.channel) {
      case NotificationChannel.EMAIL:
        return this.emailChannel.send({
          to: prefs.notificationEmail as string,
          subject: dto.title,
          body: dto.content,
        });

      case NotificationChannel.DINGTALK:
        return this.dingtalkChannel.send({
          webhookUrl: prefs.notificationWebhookUrl as string,
          title: dto.title,
          content: dto.content,
        });

      case NotificationChannel.FEISHU:
        return this.feishuChannel.send({
          webhookUrl: prefs.notificationWebhookUrl as string,
          title: dto.title,
          content: dto.content,
        });

      case NotificationChannel.WECOM:
        return this.wecomChannel.send({
          webhookUrl: prefs.notificationWecomWebhookUrl as string,
          title: dto.title,
          content: dto.content,
        });

      case NotificationChannel.WECHAT:
        return this.wechatChannel.send({
          userId: dto.userId,
          title: dto.title,
          content: dto.content,
        });

      case NotificationChannel.WEBHOOK:
        return this.webhookChannel.send({
          webhookUrl: prefs.notificationWebhookUrl as string,
          title: dto.title,
          content: dto.content,
        });

      case NotificationChannel.IN_APP:
        return { success: true };

      default:
        this.logger.warn(`Unknown notification channel: ${dto.channel}`);
        return { success: false, failureReason: 'notification_channel_unknown' };
    }
  }

  async getUserNotifications(
    userId: string,
    options?: {
      status?: NotificationStatus;
      limit?: number;
      offset?: number;
    },
  ): Promise<{ notifications: Notification[]; total: number }> {
    const where: Record<string, unknown> = { userId, channel: NotificationChannel.IN_APP };

    if (options?.status) {
      where.status = options.status;
    }

    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        include: {
          event: {
            include: {
              repository: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: options?.limit ?? 20,
        skip: options?.offset ?? 0,
      }),
      prisma.notification.count({ where }),
    ]);

    return { notifications, total };
  }

  async markAsRead(notificationId: string, userId: string): Promise<void> {
    const notification = await prisma.notification.findFirst({
      where: { id: notificationId, userId },
    });

    if (!notification) {
      throw new Error(`Notification not found: ${notificationId}`);
    }

    await prisma.notification.update({
      where: { id: notificationId },
      data: { readAt: new Date() },
    });

    await this.emitNotificationUpdated(userId);
  }

  async markAllAsRead(userId: string): Promise<void> {
    await prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });

    await this.emitNotificationUpdated(userId);
  }

  async deleteNotification(notificationId: string, userId: string): Promise<void> {
    const notification = await prisma.notification.findFirst({
      where: { id: notificationId, userId },
    });

    if (!notification) {
      throw new Error(`Notification not found: ${notificationId}`);
    }

    await prisma.notification.delete({
      where: { id: notificationId },
    });

    await this.emitNotificationUpdated(userId);
  }

  async getUnreadCount(
    userId: string,
    repositoryIdsParam?: string,
    repositoryBranchScopesParam?: string,
  ): Promise<number> {
    const repositoryIds = await this.resolveRepositoryIds(userId, repositoryIdsParam);
    const repositoryBranchScopes = normalizeRepositoryBranchScopes(
      repositoryIds,
      parseRepositoryBranchScopesParam(repositoryBranchScopesParam),
    );

    if (repositoryIds.length === 0) {
      return 0;
    }

    return prisma.notification.count({
      where: {
        userId,
        channel: NotificationChannel.IN_APP,
        readAt: null,
        event: {
          ...buildEventScopeWhere(repositoryIds, repositoryBranchScopes),
        },
      },
    });
  }
}
