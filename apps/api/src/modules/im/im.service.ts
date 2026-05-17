import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { randomBytes } from 'crypto';
import { prisma } from '@repo-pulse/database';
import {
  ImSubscriptionDto,
  SaveFeishuConnectionDto,
} from './dto/im.dto';

export type ImConnectionState = 'not_configured' | 'configured' | 'connected' | 'ready' | 'error';
export type ImStageState = 'verified' | 'missing' | 'unknown' | 'error';

export interface ImStageStatus {
  id: 'configured' | 'credential_valid' | 'ws_connected' | 'bot_reachable' | 'subscription_ready';
  state: ImStageState;
  message?: string;
}

interface FeishuConnectionPreferences {
  appId?: string;
  appSecret?: string;
  botName?: string;
  state?: ImConnectionState;
  updatedAt?: string;
}

interface ImPreferences {
  feishu?: FeishuConnectionPreferences;
  subscriptions?: ImSubscriptionDto[];
  pairingCodes?: Array<{
    code: string;
    provider: 'feishu';
    userId: string;
    expiresAt: string;
    createdAt: string;
  }>;
}

@Injectable()
export class ImService {
  private readonly logger = new Logger(ImService.name);

  async getStatus(userId: string) {
    const im = await this.getImPreferences(userId);
    const feishu = im.feishu;

    return {
      feishu: this.buildFeishuStatus(feishu),
    };
  }

  async saveFeishuConnection(userId: string, dto: SaveFeishuConnectionDto) {
    const im = await this.getImPreferences(userId);
    const nextFeishu: FeishuConnectionPreferences = {
      ...im.feishu,
      appId: dto.appId.trim(),
      appSecret: dto.appSecret.trim(),
      state: 'configured',
      updatedAt: new Date().toISOString(),
    };

    await this.updateImPreferences(userId, {
      ...im,
      feishu: nextFeishu,
    });

    this.logger.log(`feishu_connection_saved userId=${userId}`);
    return this.buildFeishuStatus(nextFeishu);
  }

  async testFeishuConnection(userId: string, dto: SaveFeishuConnectionDto) {
    const appId = dto.appId.trim();
    const appSecret = dto.appSecret.trim();

    try {
      const tokenResponse = await axios.post(
        'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
        {
          app_id: appId,
          app_secret: appSecret,
        },
        {
          timeout: 8000,
          validateStatus: () => true,
        },
      );

      const tokenPayload = tokenResponse.data as {
        code?: number;
        msg?: string;
        tenant_access_token?: string;
      };

      if (tokenResponse.status < 200 || tokenResponse.status >= 300 || tokenPayload.code !== 0) {
        return this.buildTestResult({
          success: false,
          state: 'error',
          message: tokenPayload.msg || `Feishu HTTP ${tokenResponse.status}`,
          nextStep: '检查 App ID / App Secret 是否正确。',
          credentialState: 'error',
        });
      }

      const botInfoResponse = await axios.get(
        'https://open.feishu.cn/open-apis/bot/v3/info/',
        {
          timeout: 8000,
          headers: {
            Authorization: `Bearer ${tokenPayload.tenant_access_token}`,
          },
          validateStatus: () => true,
        },
      );

      const botPayload = botInfoResponse.data as {
        code?: number;
        msg?: string;
        bot?: { app_name?: string };
        data?: { bot?: { app_name?: string } };
      };

      const botName = botPayload.bot?.app_name || botPayload.data?.bot?.app_name;
      const botReachable = botInfoResponse.status >= 200 && botInfoResponse.status < 300 && botPayload.code === 0;
      const state: ImConnectionState = botReachable ? 'ready' : 'connected';
      const im = await this.getImPreferences(userId);
      await this.updateImPreferences(userId, {
        ...im,
        feishu: {
          ...im.feishu,
          appId,
          appSecret,
          botName,
          state,
          updatedAt: new Date().toISOString(),
        },
      });

      return this.buildTestResult({
        success: true,
        state,
        message: botReachable ? '飞书机器人连接正常。' : '飞书凭证有效，机器人信息待确认。',
        botReachable,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown_error';
      return this.buildTestResult({
        success: false,
        state: 'error',
        message,
        nextStep: '检查网络、App Secret 和飞书开放平台权限。',
        credentialState: 'unknown',
      });
    }
  }

  async createPairingCode(userId: string) {
    const im = await this.getImPreferences(userId);
    const code = randomBytes(4).toString('hex').toUpperCase();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const now = new Date().toISOString();
    const activeCodes = (im.pairingCodes || []).filter((entry) => {
      return new Date(entry.expiresAt).getTime() > Date.now();
    });

    await this.updateImPreferences(userId, {
      ...im,
      pairingCodes: [
        ...activeCodes,
        {
          code,
          provider: 'feishu',
          userId,
          expiresAt,
          createdAt: now,
        },
      ],
    });

    return { code, expiresAt };
  }

  async listSubscriptions(userId: string) {
    const im = await this.getImPreferences(userId);
    return im.subscriptions || [];
  }

  async saveSubscriptions(userId: string, subscriptions: ImSubscriptionDto[]) {
    const im = await this.getImPreferences(userId);
    const normalized = subscriptions.map((subscription) => ({
      ...subscription,
      repositoryIds: Array.from(new Set(subscription.repositoryIds || [])),
      branches: Array.from(new Set(subscription.branches || [])),
      events: Array.from(new Set(subscription.events || [])),
    }));

    await this.updateImPreferences(userId, {
      ...im,
      subscriptions: normalized,
    });

    return normalized;
  }

  private buildFeishuStatus(feishu?: FeishuConnectionPreferences) {
    const state = feishu?.state || (feishu?.appId ? 'configured' : 'not_configured');
    const connected = state === 'connected' || state === 'ready';

    return {
      provider: 'feishu',
      state,
      connected,
      appId: feishu?.appId,
      botName: feishu?.botName,
      summary: this.getFeishuSummary(state),
      nextStep: this.getFeishuNextStep(state),
      stages: this.buildFeishuStages(state),
    };
  }

  private buildTestResult(params: {
    success: boolean;
    state: ImConnectionState;
    message: string;
    nextStep?: string;
    credentialState?: ImStageState;
    botReachable?: boolean;
  }) {
    return {
      success: params.success,
      state: params.state,
      message: params.message,
      nextStep: params.nextStep,
      stages: [
        { id: 'configured', state: 'verified' },
        { id: 'credential_valid', state: params.credentialState || (params.success ? 'verified' : 'error') },
        { id: 'ws_connected', state: params.success ? 'verified' : 'unknown' },
        { id: 'bot_reachable', state: params.botReachable ? 'verified' : params.success ? 'unknown' : 'unknown' },
        { id: 'subscription_ready', state: 'unknown' },
      ] satisfies ImStageStatus[],
    };
  }

  private buildFeishuStages(state: ImConnectionState): ImStageStatus[] {
    return [
      {
        id: 'configured',
        state: state === 'not_configured' ? 'missing' : 'verified',
      },
      {
        id: 'credential_valid',
        state: state === 'connected' || state === 'ready' ? 'verified' : state === 'error' ? 'error' : 'unknown',
      },
      {
        id: 'ws_connected',
        state: state === 'connected' || state === 'ready' ? 'verified' : 'unknown',
      },
      {
        id: 'bot_reachable',
        state: state === 'ready' ? 'verified' : 'unknown',
      },
      {
        id: 'subscription_ready',
        state: 'unknown',
      },
    ];
  }

  private getFeishuSummary(state: ImConnectionState): string {
    if (state === 'ready') return '飞书机器人已就绪。';
    if (state === 'connected') return '飞书凭证有效，机器人状态待确认。';
    if (state === 'configured') return '飞书凭证已保存。';
    if (state === 'error') return '飞书连接需要检查。';
    return '飞书机器人未配置。';
  }

  private getFeishuNextStep(state: ImConnectionState): string | undefined {
    if (state === 'configured') return '下一步请测试连接。';
    if (state === 'connected') return '下一步请完成用户绑定和群订阅。';
    if (state === 'error') return '检查 App Secret、机器人权限和事件订阅。';
    if (state === 'not_configured') return '填写 App ID 和 App Secret。';
    return undefined;
  }

  private async getImPreferences(userId: string): Promise<ImPreferences> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { preferences: true },
    });
    const prefs = (user?.preferences as Record<string, unknown>) || {};
    return ((prefs.im || {}) as ImPreferences);
  }

  private async updateImPreferences(userId: string, im: ImPreferences): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { preferences: true },
    });
    const prefs = (user?.preferences as Record<string, unknown>) || {};

    await prisma.user.update({
      where: { id: userId },
      data: {
        preferences: {
          ...prefs,
          im,
        } as any,
      },
    });
  }
}
