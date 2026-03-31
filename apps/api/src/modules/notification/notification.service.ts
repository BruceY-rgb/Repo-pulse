import { Injectable, Logger } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { prisma, Notification, NotificationChannel, NotificationStatus } from '@repo-pulse/database';
import { EmailChannel } from './channels/email.channel';
import { DingTalkChannel } from './channels/dingtalk.channel';
import { FeishuChannel } from './channels/feishu.channel';
import { WebhookChannel } from './channels/webhook.channel';

export interface NotificationPreferences {
  channels: NotificationChannel[];
  events: {
    highRisk: boolean;
    prUpdates: boolean;
    analysisComplete: boolean;
    weeklyReport: boolean;
  };
  webhookUrl?: string;
  email?: string;
}

export interface SendNotificationDto {
  userId: string;
  eventId?: string;
  channel: NotificationChannel;
  title: string;
  content: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly emailChannel: EmailChannel,
    private readonly dingtalkChannel: DingTalkChannel,
    private readonly feishuChannel: FeishuChannel,
    private readonly webhookChannel: WebhookChannel,
  ) {}

  /**
   * 获取用户通知偏好
   */
  async getPreferences(userId: string): Promise<NotificationPreferences> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { preferences: true },
    });

    const prefs = (user?.preferences as Record<string, unknown>) || {};
    return {
      channels: (prefs.notificationChannels as NotificationChannel[]) || [
        NotificationChannel.IN_APP,
      ],
      events: (prefs.notificationEvents as NotificationPreferences['events']) || {
        highRisk: true,
        prUpdates: true,
        analysisComplete: true,
        weeklyReport: false,
      },
      webhookUrl: prefs.notificationWebhookUrl as string | undefined,
      email: prefs.notificationEmail as string | undefined,
    };
  }

  /**
   * 更新用户通知偏好
   */
  async updatePreferences(
    userId: string,
    prefs: Partial<NotificationPreferences>,
  ): Promise<NotificationPreferences> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { preferences: true },
    });

    const currentPrefs = (user?.preferences as Record<string, unknown>) || {};

    const updatedPrefs = {
      ...currentPrefs,
      notificationChannels: prefs.channels,
      notificationEvents: prefs.events,
      notificationWebhookUrl: prefs.webhookUrl,
      notificationEmail: prefs.email,
    };

    await prisma.user.update({
      where: { id: userId },
      data: { preferences: updatedPrefs as any },
    });

    return this.getPreferences(userId);
  }

  /**
   * 发送通知
   */
  async send(dto: SendNotificationDto): Promise<Notification> {
    this.logger.log(
      `Sending notification to user ${dto.userId} via ${dto.channel}: ${dto.title}`,
    );

    // 创建通知记录
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

    // 根据渠道发送
    try {
      const success = await this.sendViaChannel(dto);

      // 更新发送状态
      await prisma.notification.update({
        where: { id: notification.id },
        data: {
          status: success ? NotificationStatus.SENT : NotificationStatus.FAILED,
          sentAt: success ? new Date() : null,
        },
      });

      this.logger.log(
        `Notification ${notification.id} sent via ${dto.channel}: ${success ? 'success' : 'failed'}`,
      );

      return { ...notification, status: success ? NotificationStatus.SENT : NotificationStatus.FAILED };
    } catch (error) {
      this.logger.error(
        `Failed to send notification ${notification.id}`,
        error,
      );

      await prisma.notification.update({
        where: { id: notification.id },
        data: {
          status: NotificationStatus.FAILED,
          metadata: { error: (error as Error).message },
        },
      });

      throw error;
    }
  }

  /**
   * 根据渠道发送
   */
  private async sendViaChannel(dto: SendNotificationDto): Promise<boolean> {
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
        // 应用内通知已在创建记录时完成
        return true;

      default:
        this.logger.warn(`Unknown notification channel: ${dto.channel}`);
        return false;
    }
  }

  /**
   * 获取用户通知列表
   */
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

  /**
   * 标记通知为已读
   */
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

  /**
   * 标记所有通知为已读
   */
  async markAllAsRead(userId: string): Promise<void> {
    await prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  /**
   * 删除通知
   */
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

  /**
   * 获取未读通知数量
   */
  async getUnreadCount(userId: string): Promise<number> {
    return prisma.notification.count({
      where: {
        userId,
        readAt: null,
      },
    });
  }
}