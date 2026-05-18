import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import axios from 'axios';
import { randomBytes } from 'crypto';
import { prisma } from '@repo-pulse/database';
import {
  ImSubscriptionDto,
  SaveFeishuConnectionDto,
} from './dto/im.dto';
import {
  DEFAULT_FEISHU_GITHUB_EVENTS,
  RepositoryEventNotificationInput,
  buildFeishuRepositoryEventCard,
  formatFeishuRepositoryEventText,
  matchesFeishuSubscription,
} from './feishu-event-card';

export type ImConnectionState = 'not_configured' | 'configured' | 'connected' | 'ready' | 'error';
export type ImStageState = 'verified' | 'missing' | 'unknown' | 'error';
type FeishuBridgeRuntimeState = 'stopped' | 'connecting' | 'connected' | 'error';
interface FeishuBridgeRuntime {
  userId: string;
  appId: string;
  status: FeishuBridgeRuntimeState;
  lastError?: string;
  startedAt?: string;
  wsClient?: { close: (options?: { force?: boolean }) => void | Promise<void> };
}

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
  bindings?: Array<{
    provider: 'feishu';
    openId: string;
    chatId?: string;
    chatName?: string;
    boundAt: string;
  }>;
  pairingCodes?: Array<{
    code: string;
    provider: 'feishu';
    userId: string;
    expiresAt: string;
    createdAt: string;
  }>;
}

@Injectable()
export class ImService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ImService.name);
  private readonly feishuBridges = new Map<string, FeishuBridgeRuntime>();
  private readonly recentFeishuEventIds = new Set<string>();

  async onModuleInit() {
    await this.restoreFeishuBridges();
  }

  async onModuleDestroy() {
    await Promise.all(
      Array.from(this.feishuBridges.keys()).map((userId) => this.stopFeishuBridge(userId)),
    );
  }

  async getStatus(userId: string) {
    const im = await this.getImPreferences(userId);
    const feishu = im.feishu;

    return {
      feishu: this.buildFeishuStatus(feishu, im, this.feishuBridges.get(userId)),
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
    void this.startFeishuBridge(userId, { ...im, feishu: nextFeishu }).catch((error) => {
      const message = error instanceof Error ? error.message : 'unknown_error';
      this.logger.warn(`feishu_bridge_start_after_save_failed userId=${userId} reason=${message}`);
    });
    return this.buildFeishuStatus(nextFeishu, { ...im, feishu: nextFeishu }, this.feishuBridges.get(userId));
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
      const im = await this.getImPreferences(userId);
      const subscriptionReady = this.hasReadySubscription(im);
      const nextIm = {
        ...im,
        feishu: {
          ...im.feishu,
          appId,
          appSecret,
          botName,
          state: 'connected' as ImConnectionState,
          updatedAt: new Date().toISOString(),
        },
      };

      await this.updateImPreferences(userId, {
        ...nextIm,
      });

      const bridge = await this.startFeishuBridge(userId, nextIm);
      const bridgeConnected = bridge.status === 'connected';
      const state: ImConnectionState = botReachable && bridgeConnected ? 'ready' : 'connected';

      await this.updateImPreferences(userId, {
        ...nextIm,
        feishu: {
          ...nextIm.feishu,
          state,
          updatedAt: new Date().toISOString(),
        },
      });

      return this.buildTestResult({
        success: bridgeConnected,
        state,
        message: bridgeConnected
          ? '飞书长连接已建立。'
          : bridge.lastError || '飞书长连接未建立。',
        nextStep: bridgeConnected
          ? undefined
          : '在飞书「事件与回调」中选择使用长连接接收事件，并确认应用版本已发布。',
        botReachable,
        subscriptionReady,
        wsState: bridgeConnected ? 'verified' : 'error',
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
      repositoryBranchScopes: this.normalizeRepositoryBranchScopes(subscription.repositoryBranchScopes),
      events: Array.from(new Set(subscription.events || [])),
    }));

    await this.updateImPreferences(userId, {
      ...im,
      subscriptions: normalized,
    });

    return normalized;
  }

  async sendRepositoryEventNotification(
    userId: string,
    event: RepositoryEventNotificationInput,
  ): Promise<{ sent: number; skippedReason?: string }> {
    const im = await this.getImPreferences(userId);
    const appId = im.feishu?.appId?.trim();
    const appSecret = im.feishu?.appSecret?.trim();
    if (!appId || !appSecret) {
      return { sent: 0, skippedReason: 'feishu_not_configured' };
    }

    const chatIds = this.resolveFeishuNotificationChatIds(im, event);
    if (chatIds.length === 0) {
      return { sent: 0, skippedReason: 'feishu_chat_not_bound' };
    }

    const token = await this.getTenantAccessToken(appId, appSecret);
    if (!token) {
      return { sent: 0, skippedReason: 'feishu_token_unavailable' };
    }

    const sent = await this.sendFeishuEventCardToChats({
      token,
      chatIds,
      event,
      logContext: `userId=${userId} eventId=${event.eventId} source=event_notification`,
    });

    return { sent };
  }

  async sendFeishuTestNotification(userId: string): Promise<{ sent: number; message: string }> {
    const im = await this.getImPreferences(userId);
    const appId = im.feishu?.appId?.trim();
    const appSecret = im.feishu?.appSecret?.trim();
    if (!appId || !appSecret) {
      return { sent: 0, message: '飞书机器人未配置。' };
    }

    const chatIds = this.resolveAllFeishuChatIds(im);
    if (chatIds.length === 0) {
      return { sent: 0, message: '还没有绑定飞书群聊。' };
    }

    const token = await this.getTenantAccessToken(appId, appSecret);
    if (!token) {
      return { sent: 0, message: '无法获取飞书访问令牌。' };
    }

    const sent = await this.sendFeishuEventCardToChats({
      token,
      chatIds,
      event: {
        eventId: `test-${Date.now()}`,
        repositoryId: 'test',
        repositoryName: 'repo-pulse/example',
        eventType: 'PR_OPENED',
        title: '测试飞书 GitHub 事件卡片',
        content: '这是一条 Repo-Pulse 测试推送。真实 GitHub webhook 到达后，会按订阅规则推送类似卡片。',
        author: 'Repo-Pulse',
        sourceBranch: 'feature/feishu-card',
        targetBranch: 'main',
        externalUrl: 'https://github.com/',
      },
      logContext: `userId=${userId} source=test_notification`,
    });

    return {
      sent,
      message: sent > 0 ? '测试推送已发送。' : '测试推送发送失败。',
    };
  }

  async handleFeishuEvent(payload: Record<string, any>) {
    const eventType = payload.header?.event_type || payload.event?.type;
    const hasEncryptedPayload = typeof payload.encrypt === 'string';

    this.logger.log(
      `feishu_event_callback_received eventType=${eventType || '-'} encrypted=${hasEncryptedPayload}`,
    );

    if (typeof payload.challenge === 'string') {
      return { challenge: payload.challenge };
    }

    if (hasEncryptedPayload) {
      this.logger.warn('feishu_event_encrypted_payload_ignored');
      return { ok: true, ignored: true, reason: 'encrypted_payload_not_supported' };
    }

    if (eventType !== 'im.message.receive_v1') {
      return { ok: true, ignored: true };
    }

    const appId = String(payload.header?.app_id || '').trim();
    const message = payload.event?.message;
    const sender = payload.event?.sender;
    const messageId = String(message?.message_id || '').trim();
    const chatId = String(message?.chat_id || '').trim();
    const openId = String(sender?.sender_id?.open_id || '').trim();
    const text = this.extractFeishuMessageText(message);
    const code = this.extractBindCode(text);

    this.logger.log(
      `feishu_message_received type=${eventType} chatId=${chatId || '-'} openId=${openId || '-'} hasBindCode=${Boolean(code)}`,
    );

    if (!code) {
      return { ok: true, ignored: true };
    }

    const bindResult = await this.bindFeishuUser({
      appId,
      code,
      openId,
      chatId,
    });

    if (messageId) {
      await this.replyFeishuMessage({
        appId,
        messageId,
        text: bindResult.message,
      }).catch((error) => {
        const message = error instanceof Error ? error.message : 'unknown_error';
        this.logger.warn(`feishu_reply_failed reason=${message}`);
      });
    }

    return bindResult;
  }

  private buildFeishuStatus(
    feishu?: FeishuConnectionPreferences,
    im?: ImPreferences,
    bridge?: FeishuBridgeRuntime,
  ) {
    const state = feishu?.state || (feishu?.appId ? 'configured' : 'not_configured');
    const connected = bridge?.status === 'connected' || state === 'connected' || state === 'ready';
    const subscriptionReady = this.hasReadySubscription(im);

    return {
      provider: 'feishu',
      state,
      connected,
      appId: feishu?.appId,
      botName: feishu?.botName,
      summary: this.getFeishuSummary(state),
      nextStep: bridge?.lastError || this.getFeishuNextStep(state, bridge),
      stages: this.buildFeishuStages(state, subscriptionReady, bridge),
    };
  }

  private buildTestResult(params: {
    success: boolean;
    state: ImConnectionState;
    message: string;
    nextStep?: string;
    credentialState?: ImStageState;
    botReachable?: boolean;
    subscriptionReady?: boolean;
    wsState?: ImStageState;
  }) {
    return {
      success: params.success,
      state: params.state,
      message: params.message,
      nextStep: params.nextStep,
      stages: [
        { id: 'configured', state: 'verified' },
        { id: 'credential_valid', state: params.credentialState || (params.success ? 'verified' : 'error') },
        { id: 'ws_connected', state: params.wsState || (params.success ? 'verified' : 'unknown') },
        { id: 'bot_reachable', state: params.botReachable ? 'verified' : params.success ? 'unknown' : 'unknown' },
        { id: 'subscription_ready', state: params.subscriptionReady ? 'verified' : 'unknown' },
      ] satisfies ImStageStatus[],
    };
  }

  private hasReadySubscription(im?: ImPreferences) {
    return Boolean(
      im?.bindings?.some((binding) => binding.chatId) ||
      im?.subscriptions?.some((subscription) => subscription.chatId && subscription.enabled),
    );
  }

  private buildFeishuStages(
    state: ImConnectionState,
    subscriptionReady = false,
    bridge?: {
      status: FeishuBridgeRuntimeState;
      lastError?: string;
    },
  ): ImStageStatus[] {
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
        state: bridge?.status === 'connected'
          ? 'verified'
          : bridge?.status === 'error'
            ? 'error'
            : state === 'not_configured'
              ? 'missing'
              : 'unknown',
        message: bridge?.lastError,
      },
      {
        id: 'bot_reachable',
        state: state === 'ready' ? 'verified' : 'unknown',
      },
      {
        id: 'subscription_ready',
        state: subscriptionReady ? 'verified' : 'unknown',
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

  private getFeishuNextStep(
    state: ImConnectionState,
    bridge?: { status: FeishuBridgeRuntimeState },
  ): string | undefined {
    if (state === 'configured') return '下一步请测试连接。';
    if (bridge?.status !== 'connected' && (state === 'connected' || state === 'ready')) {
      return '在飞书「事件与回调」中选择使用长连接接收事件，并发布应用版本。';
    }
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

  private async restoreFeishuBridges(): Promise<void> {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        preferences: true,
      },
    });

    await Promise.all(users.map(async (user) => {
      const prefs = (user.preferences as Record<string, unknown>) || {};
      const im = ((prefs.im || {}) as ImPreferences);
      if (!im.feishu?.appId || !im.feishu?.appSecret) return;

      await this.startFeishuBridge(user.id, im).catch((error) => {
        const message = error instanceof Error ? error.message : 'unknown_error';
        this.logger.warn(`feishu_bridge_restore_failed userId=${user.id} reason=${message}`);
      });
    }));
  }

  private async startFeishuBridge(userId: string, im: ImPreferences) {
    const appId = im.feishu?.appId?.trim();
    const appSecret = im.feishu?.appSecret?.trim();
    if (!appId || !appSecret) {
      await this.stopFeishuBridge(userId);
      return {
        userId,
        appId: appId || '',
        status: 'stopped' as FeishuBridgeRuntimeState,
      };
    }

    const current = this.feishuBridges.get(userId);
    if (current?.status === 'connected' && current.appId === appId) {
      return current;
    }

    await this.stopFeishuBridge(userId);

    const runtime: FeishuBridgeRuntime = {
      userId,
      appId,
      status: 'connecting',
      startedAt: new Date().toISOString(),
    };
    this.feishuBridges.set(userId, runtime);

    try {
      const lark = await import('@larksuiteoapi/node-sdk');
      const eventDispatcher = new lark.EventDispatcher({}).register({
        'im.message.receive_v1': (data: Record<string, any>) => {
          void this.handleFeishuLongConnectionMessage(userId, appId, data).catch((error) => {
            const message = error instanceof Error ? error.message : 'unknown_error';
            this.logger.error(`feishu_ws_message_handle_failed userId=${userId} reason=${message}`);
          });
        },
      });

      const wsClient = new lark.WSClient({
        appId,
        appSecret,
        loggerLevel: lark.LoggerLevel.warn,
      });

      runtime.wsClient = wsClient;
      await wsClient.start({ eventDispatcher });
      runtime.status = 'connected';
      delete runtime.lastError;
      this.logger.log(`feishu_ws_connected userId=${userId} appId=${appId}`);
      return runtime;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown_error';
      runtime.status = 'error';
      runtime.lastError = message;
      this.logger.warn(`feishu_ws_connect_failed userId=${userId} reason=${message}`);
      return runtime;
    }
  }

  private async stopFeishuBridge(userId: string): Promise<void> {
    const bridge = this.feishuBridges.get(userId);
    if (!bridge) return;

    try {
      await bridge.wsClient?.close({ force: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown_error';
      this.logger.warn(`feishu_ws_close_failed userId=${userId} reason=${message}`);
    } finally {
      this.feishuBridges.delete(userId);
    }
  }

  private async handleFeishuLongConnectionMessage(
    userId: string,
    appId: string,
    event: Record<string, any>,
  ): Promise<void> {
    const eventId = String(event.event_id || '').trim();
    if (eventId && this.recentFeishuEventIds.has(eventId)) {
      return;
    }
    if (eventId) {
      this.addRecentFeishuEventId(eventId);
    }

    const message = event.message;
    const sender = event.sender;
    const messageId = String(message?.message_id || '').trim();
    const chatId = String(message?.chat_id || '').trim();
    const openId = String(sender?.sender_id?.open_id || '').trim();
    const senderType = String(sender?.sender_type || '').trim();
    const text = this.extractFeishuMessageText(message);
    const code = this.extractBindCode(text);

    this.logger.log(
      `feishu_ws_message_received userId=${userId} chatId=${chatId || '-'} openId=${openId || '-'} senderType=${senderType || '-'} hasBindCode=${Boolean(code)}`,
    );

    if (senderType && senderType !== 'user') return;
    if (!code) return;

    const bindResult = await this.bindFeishuUser({
      appId,
      code,
      openId,
      chatId,
    });

    if (messageId) {
      await this.replyFeishuMessage({
        appId,
        messageId,
        text: bindResult.message,
      }).catch((error) => {
        const message = error instanceof Error ? error.message : 'unknown_error';
        this.logger.warn(`feishu_ws_reply_failed userId=${userId} reason=${message}`);
      });
    }
  }

  private addRecentFeishuEventId(eventId: string): void {
    this.recentFeishuEventIds.add(eventId);
    if (this.recentFeishuEventIds.size <= 500) return;
    const oldest = this.recentFeishuEventIds.values().next().value;
    if (oldest) {
      this.recentFeishuEventIds.delete(oldest);
    }
  }

  private extractFeishuMessageText(message: Record<string, any> | undefined): string {
    if (!message) return '';
    if (message.message_type !== 'text') return '';

    try {
      const content = typeof message.content === 'string'
        ? JSON.parse(message.content)
        : message.content;
      return String(content?.text || '').trim();
    } catch {
      return '';
    }
  }

  private resolveFeishuNotificationChatIds(
    im: ImPreferences,
    event: RepositoryEventNotificationInput,
  ): string[] {
    const chatIds = new Set<string>();
    const allSubscriptions = im.subscriptions || [];
    const subscriptions = allSubscriptions.filter((subscription) => {
      return matchesFeishuSubscription(subscription, event);
    });

    for (const subscription of subscriptions) {
      if (subscription.chatId) chatIds.add(subscription.chatId);
    }

    if (allSubscriptions.length === 0) {
      for (const binding of im.bindings || []) {
        if (binding.chatId) chatIds.add(binding.chatId);
      }
    }

    return Array.from(chatIds);
  }

  private resolveAllFeishuChatIds(im: ImPreferences): string[] {
    const chatIds = new Set<string>();
    for (const subscription of im.subscriptions || []) {
      if (subscription.enabled && subscription.chatId) {
        chatIds.add(subscription.chatId);
      }
    }
    for (const binding of im.bindings || []) {
      if (binding.chatId) {
        chatIds.add(binding.chatId);
      }
    }
    return Array.from(chatIds);
  }

  private async sendFeishuEventCardToChats(params: {
    token: string;
    chatIds: string[];
    event: RepositoryEventNotificationInput;
    logContext: string;
  }): Promise<number> {
    let sent = 0;
    const card = buildFeishuRepositoryEventCard(params.event);
    const fallbackText = formatFeishuRepositoryEventText(params.event);

    for (const chatId of params.chatIds) {
      const cardResponse = await this.sendFeishuMessage({
        token: params.token,
        chatId,
        msgType: 'interactive',
        content: JSON.stringify(card),
      });

      const cardPayload = cardResponse.data as { code?: number; msg?: string };
      if (cardResponse.status >= 200 && cardResponse.status < 300 && cardPayload.code === 0) {
        sent += 1;
        this.logger.log(`feishu_card_sent chatId=${chatId} ${params.logContext}`);
        continue;
      }

      this.logger.warn(
        `feishu_card_failed chatId=${chatId} ${params.logContext} status=${cardResponse.status} code=${cardPayload.code ?? '-'} msg=${cardPayload.msg ?? '-'}`,
      );

      const textResponse = await this.sendFeishuMessage({
        token: params.token,
        chatId,
        msgType: 'text',
        content: JSON.stringify({ text: fallbackText }),
      });

      const textPayload = textResponse.data as { code?: number; msg?: string };
      if (textResponse.status >= 200 && textResponse.status < 300 && textPayload.code === 0) {
        sent += 1;
        this.logger.log(`feishu_text_fallback_sent chatId=${chatId} ${params.logContext}`);
      } else {
        this.logger.warn(
          `feishu_text_fallback_failed chatId=${chatId} ${params.logContext} status=${textResponse.status} code=${textPayload.code ?? '-'} msg=${textPayload.msg ?? '-'}`,
        );
      }
    }
    return sent;
  }

  private async sendFeishuMessage(params: {
    token: string;
    chatId: string;
    msgType: 'interactive' | 'text';
    content: string;
  }) {
    return axios.post(
      'https://open.feishu.cn/open-apis/im/v1/messages',
      {
        receive_id: params.chatId,
        msg_type: params.msgType,
        content: params.content,
      },
      {
        timeout: 8000,
        params: { receive_id_type: 'chat_id' },
        headers: {
          Authorization: `Bearer ${params.token}`,
        },
        validateStatus: () => true,
      },
    );
  }

  private extractBindCode(text: string): string | null {
    const match = text.match(/(?:^|\s)\/bind\s+([A-Za-z0-9_-]+)/i);
    return match?.[1]?.trim().toUpperCase() || null;
  }

  private async bindFeishuUser(params: {
    appId: string;
    code: string;
    openId: string;
    chatId: string;
  }): Promise<{ ok: boolean; message: string; userId?: string }> {
    if (!params.openId || !params.chatId) {
      return { ok: false, message: '绑定失败：缺少飞书用户或群聊信息。' };
    }

    const users = await prisma.user.findMany({
      select: {
        id: true,
        preferences: true,
      },
    });

    const now = Date.now();
    for (const user of users) {
      const prefs = (user.preferences as Record<string, unknown>) || {};
      const im = ((prefs.im || {}) as ImPreferences);

      if (params.appId && im.feishu?.appId && im.feishu.appId !== params.appId) {
        continue;
      }

      const pairingCodes = im.pairingCodes || [];
      const matchedCode = pairingCodes.find((entry) => {
        return entry.provider === 'feishu' &&
          entry.code.toUpperCase() === params.code &&
          new Date(entry.expiresAt).getTime() > now;
      });

      if (!matchedCode) {
        continue;
      }

      const bindings = [
        ...(im.bindings || []).filter((binding) => binding.openId !== params.openId),
        {
          provider: 'feishu' as const,
          openId: params.openId,
          chatId: params.chatId,
          boundAt: new Date().toISOString(),
        },
      ];

      const subscriptions = this.ensureDefaultSubscription(im.subscriptions || [], params.chatId);

      await this.updateImPreferences(user.id, {
        ...im,
        feishu: {
          ...im.feishu,
          state: 'ready',
          updatedAt: new Date().toISOString(),
        },
        bindings,
        subscriptions,
        pairingCodes: pairingCodes.filter((entry) => entry.code.toUpperCase() !== params.code),
      });

      this.logger.log(`feishu_user_bound userId=${user.id} chatId=${params.chatId}`);
      return {
        ok: true,
        userId: user.id,
        message: '绑定成功。这个飞书账号和当前群聊已接入 Repo-Pulse。',
      };
    }

    return {
      ok: false,
      message: '绑定失败：配对码无效或已过期。',
    };
  }

  private ensureDefaultSubscription(
    subscriptions: ImSubscriptionDto[],
    chatId: string,
  ): ImSubscriptionDto[] {
    const existing = subscriptions.find((subscription) => subscription.chatId === chatId);
    if (existing) {
      return subscriptions.map((subscription) =>
        subscription.chatId === chatId
          ? { ...subscription, enabled: true }
          : subscription,
      );
    }

    return [
      ...subscriptions,
      {
        id: `feishu-${chatId}`,
        chatName: 'Feishu chat',
        chatId,
        repositoryIds: [],
        branches: ['main'],
        repositoryBranchScopes: {},
        events: [...DEFAULT_FEISHU_GITHUB_EVENTS],
        enabled: true,
      },
    ];
  }

  private normalizeRepositoryBranchScopes(scopes?: Record<string, string[]>): Record<string, string[]> {
    if (!scopes || typeof scopes !== 'object') return {};

    return Object.fromEntries(
      Object.entries(scopes)
        .filter(([repositoryId, branches]) => repositoryId.trim().length > 0 && Array.isArray(branches))
        .map(([repositoryId, branches]) => [
          repositoryId,
          Array.from(new Set(branches.map((branch) => branch.trim()).filter(Boolean)))
            .sort((left, right) => left.localeCompare(right)),
        ]),
    );
  }

  private async replyFeishuMessage(params: {
    appId: string;
    messageId: string;
    text: string;
  }): Promise<void> {
    const owner = await this.findFeishuConnectionOwner(params.appId);
    const appId = owner?.im.feishu?.appId;
    const appSecret = owner?.im.feishu?.appSecret;
    if (!appId || !appSecret) return;

    const token = await this.getTenantAccessToken(appId, appSecret);
    if (!token) return;

    await axios.post(
      `https://open.feishu.cn/open-apis/im/v1/messages/${params.messageId}/reply`,
      {
        msg_type: 'text',
        content: JSON.stringify({ text: params.text }),
      },
      {
        timeout: 8000,
        headers: {
          Authorization: `Bearer ${token}`,
        },
        validateStatus: () => true,
      },
    );
  }

  private async findFeishuConnectionOwner(appId: string): Promise<{ userId: string; im: ImPreferences } | null> {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        preferences: true,
      },
    });

    for (const user of users) {
      const prefs = (user.preferences as Record<string, unknown>) || {};
      const im = ((prefs.im || {}) as ImPreferences);
      if (!appId || im.feishu?.appId === appId) {
        return { userId: user.id, im };
      }
    }

    return null;
  }

  private async getTenantAccessToken(appId: string, appSecret: string): Promise<string | null> {
    const response = await axios.post(
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

    const payload = response.data as { code?: number; tenant_access_token?: string };
    return response.status >= 200 && response.status < 300 && payload.code === 0
      ? payload.tenant_access_token || null
      : null;
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
