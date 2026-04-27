import { Injectable, Logger } from '@nestjs/common';
import { prisma, Notification, NotificationChannel, NotificationStatus } from '@repo-pulse/database';
import { EmailChannel } from './channels/email.channel';
import { DingTalkChannel } from './channels/dingtalk.channel';
import { FeishuChannel } from './channels/feishu.channel';
import { WebhookChannel } from './channels/webhook.channel';
import { ChannelSendResult } from './channels/shared';
import { SendNotificationDto, UpdateNotificationPreferencesDto } from './dto/notification.dto';

export interface NotificationPreferences {
  channels: NotificationChannel[];
  events: {
    highRisk: boolean;
    prUpdates: boolean;
    analysisComplete: boolean;
    weeklyReport: boolean;
  };
  webhookUrl: string | null;
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
  webhookUrl: null,
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
  ) {}

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

    if (prefs.email !== undefined) {
      updatedPrefs.notificationEmail = prefs.email;
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
    const where: Record<string, unknown> = { userId };

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
  }

  async markAllAsRead(userId: string): Promise<void> {
    await prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
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
  }

  async getUnreadCount(userId: string): Promise<number> {
    return prisma.notification.count({
      where: {
        userId,
        readAt: null,
      },
    });
  }
}
