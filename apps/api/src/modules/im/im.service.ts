import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import axios from 'axios';
import { randomBytes } from 'crypto';
import AiBot, { generateReqId, type WsFrame } from '@wecom/aibot-node-sdk';
import { prisma } from '@repo-pulse/database';
import {
  ImProvider,
  ImSubscriptionDto,
  SaveDingTalkConnectionDto,
  SaveFeishuConnectionDto,
  SaveWecomConnectionDto,
  SaveWechatConnectionDto,
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
type DingTalkBridgeRuntimeState = 'stopped' | 'connecting' | 'connected' | 'error';
type WecomBridgeRuntimeState = 'stopped' | 'connecting' | 'connected' | 'error';
type WechatBridgeRuntimeState = 'stopped' | 'waiting_scan' | 'scanned' | 'connecting' | 'connected' | 'error';

interface FeishuBridgeRuntime {
  userId: string;
  appId: string;
  status: FeishuBridgeRuntimeState;
  lastError?: string;
  startedAt?: string;
  wsClient?: { close: (options?: { force?: boolean }) => void | Promise<void> };
}

interface DingTalkBridgeRuntime {
  userId: string;
  clientId: string;
  status: DingTalkBridgeRuntimeState;
  lastError?: string;
  startedAt?: string;
  client?: {
    disconnect: () => void;
    send?: (messageId: string, value: { status: string; message?: string }) => void;
  };
  webhookCache: Map<string, string>;
}

interface WecomBridgeRuntime {
  userId: string;
  botId: string;
  status: WecomBridgeRuntimeState;
  lastError?: string;
  startedAt?: string;
  client?: InstanceType<typeof AiBot.WSClient>;
}

interface WechatBridgeRuntime {
  userId: string;
  status: WechatBridgeRuntimeState;
  lastError?: string;
  startedAt?: string;
  qrCodeUrl?: string;
  qrCodeKey?: string;
  pollAbortController?: AbortController;
  loginAbortController?: AbortController;
  syncCursor?: string;
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

interface DingTalkConnectionPreferences {
  clientId?: string;
  clientSecret?: string;
  botName?: string;
  state?: ImConnectionState;
  updatedAt?: string;
}

interface WecomConnectionPreferences {
  botId?: string;
  secret?: string;
  botName?: string;
  state?: ImConnectionState;
  updatedAt?: string;
}

interface WechatConnectionPreferences {
  botToken?: string;
  ilinkBotId?: string;
  ilinkUserId?: string;
  baseUrl?: string;
  state?: ImConnectionState;
  updatedAt?: string;
}

interface ImPreferences {
  feishu?: FeishuConnectionPreferences;
  dingtalk?: DingTalkConnectionPreferences;
  wecom?: WecomConnectionPreferences;
  wechat?: WechatConnectionPreferences;
  subscriptions?: ImSubscriptionDto[];
  bindings?: Array<{
    provider?: ImProvider;
    openId: string;
    chatId?: string;
    chatName?: string;
    robotCode?: string;
    contextToken?: string;
    boundAt: string;
  }>;
  pairingCodes?: Array<{
    code: string;
    provider: ImProvider;
    userId: string;
    expiresAt: string;
    createdAt: string;
  }>;
}

const WECHAT_DEFAULT_BASE_URL = 'https://ilinkai.weixin.qq.com';
const WECHAT_QR_CODE_URL = `${WECHAT_DEFAULT_BASE_URL}/ilink/bot/get_bot_qrcode?bot_type=3`;
const WECHAT_QR_STATUS_URL = `${WECHAT_DEFAULT_BASE_URL}/ilink/bot/get_qrcode_status?qrcode=`;
const WECHAT_LONG_POLL_TIMEOUT_MS = 40_000;
const WECHAT_SEND_TIMEOUT_MS = 15_000;
const WECHAT_MESSAGE_TYPE = { USER: 1, BOT: 2 } as const;
const WECHAT_MESSAGE_STATE = { FINISH: 2 } as const;
const WECHAT_ITEM_TYPE = { TEXT: 1 } as const;

@Injectable()
export class ImService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ImService.name);
  private readonly feishuBridges = new Map<string, FeishuBridgeRuntime>();
  private readonly dingtalkBridges = new Map<string, DingTalkBridgeRuntime>();
  private readonly wecomBridges = new Map<string, WecomBridgeRuntime>();
  private readonly wechatBridges = new Map<string, WechatBridgeRuntime>();
  private readonly recentFeishuEventIds = new Set<string>();
  private readonly recentDingTalkEventIds = new Set<string>();
  private readonly recentWecomEventIds = new Set<string>();

  async onModuleInit() {
    await Promise.all([
      this.restoreFeishuBridges(),
      this.restoreDingTalkBridges(),
      this.restoreWecomBridges(),
      this.restoreWechatBridges(),
    ]);
  }

  async onModuleDestroy() {
    await Promise.all(
      [
        ...Array.from(this.feishuBridges.keys()).map((userId) => this.stopFeishuBridge(userId)),
        ...Array.from(this.dingtalkBridges.keys()).map((userId) => this.stopDingTalkBridge(userId)),
        ...Array.from(this.wecomBridges.keys()).map((userId) => this.stopWecomBridge(userId)),
        ...Array.from(this.wechatBridges.keys()).map((userId) => this.stopWechatBridge(userId)),
      ],
    );
  }

  async getStatus(userId: string) {
    const im = await this.getImPreferences(userId);
    const feishu = im.feishu;

    return {
      feishu: this.buildFeishuStatus(feishu, im, this.feishuBridges.get(userId)),
      dingtalk: this.buildDingTalkStatus(im.dingtalk, im, this.dingtalkBridges.get(userId)),
      wecom: this.buildWecomStatus(im.wecom, im, this.wecomBridges.get(userId)),
      wechat: this.buildWechatStatus(im.wechat, im, this.wechatBridges.get(userId)),
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

  async saveDingTalkConnection(userId: string, dto: SaveDingTalkConnectionDto) {
    const im = await this.getImPreferences(userId);
    const nextDingTalk: DingTalkConnectionPreferences = {
      ...im.dingtalk,
      clientId: dto.clientId.trim(),
      clientSecret: dto.clientSecret.trim(),
      botName: dto.botName?.trim() || im.dingtalk?.botName || '钉钉机器人',
      state: 'configured',
      updatedAt: new Date().toISOString(),
    };

    await this.updateImPreferences(userId, {
      ...im,
      dingtalk: nextDingTalk,
    });

    this.logger.log(`dingtalk_connection_saved userId=${userId}`);
    void this.startDingTalkBridge(userId, { ...im, dingtalk: nextDingTalk }).catch((error) => {
      const message = error instanceof Error ? error.message : 'unknown_error';
      this.logger.warn(`dingtalk_bridge_start_after_save_failed userId=${userId} reason=${message}`);
    });

    return this.buildDingTalkStatus(nextDingTalk, { ...im, dingtalk: nextDingTalk }, this.dingtalkBridges.get(userId));
  }

  async testDingTalkConnection(userId: string, dto: SaveDingTalkConnectionDto) {
    const clientId = dto.clientId.trim();
    const clientSecret = dto.clientSecret.trim();

    if (!clientId || !clientSecret) {
      return this.buildTestResult({
        success: false,
        state: 'error',
        message: '请填写 Client ID 和 Client Secret。',
        nextStep: '在钉钉开放平台应用详情中复制 AppKey 和 AppSecret。',
        credentialState: 'missing',
      });
    }

    const im = await this.getImPreferences(userId);
    const nextIm = {
      ...im,
      dingtalk: {
        ...im.dingtalk,
        clientId,
        clientSecret,
        botName: dto.botName?.trim() || im.dingtalk?.botName || '钉钉机器人',
        state: 'connected' as ImConnectionState,
        updatedAt: new Date().toISOString(),
      },
    };

    await this.updateImPreferences(userId, nextIm);
    const bridge = await this.startDingTalkBridge(userId, nextIm);
    const connected = bridge.status === 'connected';
    const state: ImConnectionState = connected ? 'ready' : 'error';

    await this.updateImPreferences(userId, {
      ...nextIm,
      dingtalk: {
        ...nextIm.dingtalk,
        state,
        updatedAt: new Date().toISOString(),
      },
    });

    return this.buildTestResult({
      success: connected,
      state,
      message: connected ? '钉钉 Stream 长连接已建立。' : bridge.lastError || '钉钉 Stream 长连接未建立。',
      nextStep: connected
        ? '把机器人加入群聊后，发送 /bind 配对码完成绑定。'
        : '确认应用已开启机器人能力，并在事件订阅中选择 Stream 模式。',
      credentialState: connected ? 'verified' : 'error',
      wsState: connected ? 'verified' : 'error',
      botReachable: connected,
      subscriptionReady: this.hasReadySubscription(nextIm, 'dingtalk'),
    });
  }

  async saveWecomConnection(userId: string, dto: SaveWecomConnectionDto) {
    const im = await this.getImPreferences(userId);
    const nextWecom: WecomConnectionPreferences = {
      ...im.wecom,
      botId: dto.botId.trim(),
      secret: dto.secret.trim(),
      botName: dto.botName?.trim() || im.wecom?.botName || '企业微信机器人',
      state: 'configured',
      updatedAt: new Date().toISOString(),
    };

    await this.updateImPreferences(userId, {
      ...im,
      wecom: nextWecom,
    });

    this.logger.log(`wecom_connection_saved userId=${userId}`);
    void this.startWecomBridge(userId, { ...im, wecom: nextWecom }).catch((error) => {
      const message = error instanceof Error ? error.message : 'unknown_error';
      this.logger.warn(`wecom_bridge_start_after_save_failed userId=${userId} reason=${message}`);
    });
    return this.buildWecomStatus(nextWecom, { ...im, wecom: nextWecom }, this.wecomBridges.get(userId));
  }

  async startWecom(userId: string) {
    const im = await this.getImPreferences(userId);
    const runtime = await this.startWecomBridge(userId, im);
    await this.waitForWecomBridge(runtime, 6000);
    const latest = await this.getImPreferences(userId);
    return this.buildWecomStatus(latest.wecom, latest, this.wecomBridges.get(userId));
  }

  async generateWecomQrCode() {
    const plat = process.platform === 'darwin' ? 1 : process.platform === 'win32' ? 2 : 3;
    const response = await axios.get(
      `https://work.weixin.qq.com/ai/qc/generate?source=wecom-cli&plat=${plat}`,
      {
        timeout: 10000,
        validateStatus: () => true,
      },
    );

    const payload = response.data as {
      errcode?: number;
      errmsg?: string;
      data?: { scode?: string; auth_url?: string };
    };
    if (response.status < 200 || response.status >= 300 || !payload.data?.scode || !payload.data?.auth_url) {
      return {
        ok: false,
        status: 'error',
        error: payload.errmsg || `企业微信二维码生成失败：HTTP ${response.status}`,
      };
    }

    return {
      ok: true,
      status: 'pending',
      scode: payload.data.scode,
      authUrl: payload.data.auth_url,
    };
  }

  async checkWecomQrCode(userId: string, scode: string) {
    const response = await axios.get(
      `https://work.weixin.qq.com/ai/qc/query_result?scode=${encodeURIComponent(scode)}`,
      {
        timeout: 10000,
        validateStatus: () => true,
      },
    );

    const payload = response.data as {
      errcode?: number;
      errmsg?: string;
      data?: {
        status?: string;
        state?: string;
        bot_info?: {
          botid?: string;
          bot_id?: string;
          botId?: string;
          secret?: string;
          bot_secret?: string;
          botSecret?: string;
          name?: string;
        };
        botInfo?: {
          botid?: string;
          bot_id?: string;
          botId?: string;
          secret?: string;
          bot_secret?: string;
          botSecret?: string;
          name?: string;
        };
        botid?: string;
        bot_id?: string;
        botId?: string;
        secret?: string;
        bot_secret?: string;
        botSecret?: string;
        name?: string;
      };
      status?: string;
      state?: string;
      bot_info?: {
        botid?: string;
        bot_id?: string;
        botId?: string;
        secret?: string;
        bot_secret?: string;
        botSecret?: string;
        name?: string;
      };
      botInfo?: {
        botid?: string;
        bot_id?: string;
        botId?: string;
        secret?: string;
        bot_secret?: string;
        botSecret?: string;
        name?: string;
      };
    };

    if (response.status < 200 || response.status >= 300) {
      return {
        ok: false,
        status: 'error',
        error: payload.errmsg || `企业微信扫码状态查询失败：HTTP ${response.status}`,
      };
    }

    const parsed = this.parseWecomQrCheckPayload(payload);
    this.logger.log(
      `wecom_qr_check userId=${userId} status=${parsed.rawStatus || 'unknown'} hasBotId=${parsed.botId ? 'true' : 'false'} hasSecret=${parsed.secret ? 'true' : 'false'}`,
    );

    if (!parsed.isSuccess || !parsed.botId || !parsed.secret) {
      return { ok: true, status: 'pending', pollStatus: parsed.rawStatus };
    }

    const status = await this.saveWecomConnection(userId, {
      botId: parsed.botId,
      secret: parsed.secret,
      botName: parsed.botName || '企业微信机器人',
    });

    return {
      ok: true,
      status: 'success',
      botId: parsed.botId,
      secret: parsed.secret,
      botName: parsed.botName,
      connection: status,
    };
  }

  async startWechatLogin(userId: string) {
    await this.stopWechatBridge(userId);

    const runtime: WechatBridgeRuntime = {
      userId,
      status: 'waiting_scan',
      startedAt: new Date().toISOString(),
    };
    this.wechatBridges.set(userId, runtime);

    const response = await axios.get(WECHAT_QR_CODE_URL, {
      timeout: 10000,
      validateStatus: () => true,
    });
    const payload = response.data as {
      qrcode?: string;
      qrcode_img_content?: string;
      errmsg?: string;
    };

    if (response.status < 200 || response.status >= 300 || !payload.qrcode || !payload.qrcode_img_content) {
      runtime.status = 'error';
      runtime.lastError = payload.errmsg || `微信二维码生成失败：HTTP ${response.status}`;
      return this.buildWechatStatus(undefined, undefined, runtime);
    }

    runtime.qrCodeKey = payload.qrcode;
    runtime.qrCodeUrl = payload.qrcode_img_content;
    runtime.loginAbortController = new AbortController();
    void this.pollWechatLogin(userId, payload.qrcode, runtime.loginAbortController.signal).catch((error) => {
      const message = error instanceof Error ? error.message : 'unknown_error';
      runtime.status = 'error';
      runtime.lastError = message;
      this.logger.warn(`wechat_login_poll_failed userId=${userId} reason=${message}`);
    });

    return this.buildWechatStatus(undefined, undefined, runtime);
  }

  async saveWechatConnection(userId: string, dto: SaveWechatConnectionDto) {
    const im = await this.getImPreferences(userId);
    const nextWechat: WechatConnectionPreferences = {
      ...im.wechat,
      botToken: dto.botToken.trim(),
      ilinkBotId: dto.ilinkBotId.trim(),
      ilinkUserId: dto.ilinkUserId.trim(),
      baseUrl: dto.baseUrl?.trim() || WECHAT_DEFAULT_BASE_URL,
      state: 'configured',
      updatedAt: new Date().toISOString(),
    };

    await this.updateImPreferences(userId, {
      ...im,
      wechat: nextWechat,
    });

    void this.startWechatBridge(userId, { ...im, wechat: nextWechat }).catch((error) => {
      const message = error instanceof Error ? error.message : 'unknown_error';
      this.logger.warn(`wechat_bridge_start_after_save_failed userId=${userId} reason=${message}`);
    });

    this.logger.log(`wechat_connection_saved userId=${userId}`);
    return this.buildWechatStatus(nextWechat, { ...im, wechat: nextWechat }, this.wechatBridges.get(userId));
  }

  async startWechat(userId: string) {
    const im = await this.getImPreferences(userId);
    const runtime = await this.startWechatBridge(userId, im);
    return this.buildWechatStatus(im.wechat, im, runtime);
  }

  async stopWechat(userId: string) {
    await this.stopWechatBridge(userId);
    const im = await this.getImPreferences(userId);
    return this.buildWechatStatus(im.wechat, im, this.wechatBridges.get(userId));
  }

  async logoutWechat(userId: string) {
    await this.stopWechatBridge(userId);
    const im = await this.getImPreferences(userId);
    await this.updateImPreferences(userId, {
      ...im,
      wechat: {
        state: 'not_configured',
        updatedAt: new Date().toISOString(),
      },
    });
    return this.buildWechatStatus({ state: 'not_configured' }, im, undefined);
  }

  async createPairingCode(userId: string, provider: ImProvider = 'feishu') {
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
          provider,
          userId,
          expiresAt,
          createdAt: now,
        },
      ],
    });

    return { code, expiresAt };
  }

  async listSubscriptions(userId: string, provider: ImProvider = 'feishu') {
    const im = await this.getImPreferences(userId);
    return this.getProviderSubscriptions(im, provider);
  }

  async saveSubscriptions(
    userId: string,
    providerOrSubscriptions: ImProvider | ImSubscriptionDto[],
    maybeSubscriptions?: ImSubscriptionDto[],
  ) {
    const provider: ImProvider = Array.isArray(providerOrSubscriptions) ? 'feishu' : providerOrSubscriptions;
    const subscriptions = Array.isArray(providerOrSubscriptions) ? providerOrSubscriptions : (maybeSubscriptions || []);
    const im = await this.getImPreferences(userId);
    const normalized = subscriptions.map((subscription) => ({
      ...subscription,
      provider,
      repositoryIds: Array.from(new Set(subscription.repositoryIds || [])),
      branches: Array.from(new Set(subscription.branches || [])),
      repositoryBranchScopes: this.normalizeRepositoryBranchScopes(subscription.repositoryBranchScopes),
      events: Array.from(new Set(subscription.events || [])),
    }));

    await this.updateImPreferences(userId, {
      ...im,
      subscriptions: [
        ...(im.subscriptions || []).filter((subscription) => this.getSubscriptionProvider(subscription) !== provider),
        ...normalized,
      ],
    });

    return normalized;
  }

  async sendRepositoryEventNotification(
    userId: string,
    event: RepositoryEventNotificationInput,
  ): Promise<{ sent: number; skippedReason?: string }> {
    const im = await this.getImPreferences(userId);
    let totalSent = 0;
    const skippedReasons: string[] = [];

    try {
      const feishuResult = await this.sendFeishuRepositoryEventNotification(userId, im, event);
      totalSent += feishuResult.sent;
      if (feishuResult.skippedReason) skippedReasons.push(feishuResult.skippedReason);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown_error';
      this.logger.warn(`feishu_event_notification_failed userId=${userId} eventId=${event.eventId} reason=${message}`);
      skippedReasons.push('feishu_failed');
    }

    try {
      const dingTalkResult = await this.sendDingTalkRepositoryEventNotification(userId, im, event);
      totalSent += dingTalkResult.sent;
      if (dingTalkResult.skippedReason) skippedReasons.push(dingTalkResult.skippedReason);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown_error';
      this.logger.warn(`dingtalk_event_notification_failed userId=${userId} eventId=${event.eventId} reason=${message}`);
      skippedReasons.push('dingtalk_failed');
    }

    try {
      const wechatResult = await this.sendWechatRepositoryEventNotification(userId, im, event);
      totalSent += wechatResult.sent;
      if (wechatResult.skippedReason) skippedReasons.push(wechatResult.skippedReason);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown_error';
      this.logger.warn(`wechat_event_notification_failed userId=${userId} eventId=${event.eventId} reason=${message}`);
      skippedReasons.push('wechat_failed');
    }

    try {
      const wecomResult = await this.sendWecomRepositoryEventNotification(userId, im, event);
      totalSent += wecomResult.sent;
      if (wecomResult.skippedReason) skippedReasons.push(wecomResult.skippedReason);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown_error';
      this.logger.warn(`wecom_event_notification_failed userId=${userId} eventId=${event.eventId} reason=${message}`);
      skippedReasons.push('wecom_failed');
    }

    return {
      sent: totalSent,
      skippedReason: totalSent > 0 ? undefined : this.summarizeSkippedReasons(skippedReasons),
    };
  }

  private async sendFeishuRepositoryEventNotification(
    userId: string,
    im: ImPreferences,
    event: RepositoryEventNotificationInput,
  ): Promise<{ sent: number; skippedReason?: string }> {
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

  async sendDingTalkTestNotification(userId: string): Promise<{ sent: number; message: string }> {
    const im = await this.getImPreferences(userId);
    const result = await this.sendDingTalkRepositoryEventNotification(userId, im, this.buildTestRepositoryEvent('dingtalk'));
    return {
      sent: result.sent,
      message: result.sent > 0 ? '钉钉测试推送已发送。' : this.toSkippedMessage(result.skippedReason, '钉钉测试推送发送失败。'),
    };
  }

  async sendWecomTestNotification(userId: string): Promise<{ sent: number; message: string }> {
    const im = await this.getImPreferences(userId);
    const result = await this.sendWecomRepositoryEventNotification(userId, im, this.buildTestRepositoryEvent('wecom'));
    return {
      sent: result.sent,
      message: result.sent > 0 ? '企业微信测试推送已发送。' : this.toSkippedMessage(result.skippedReason, '企业微信测试推送暂未发送。'),
    };
  }

  async sendWechatTestNotification(userId: string): Promise<{ sent: number; message: string }> {
    const im = await this.getImPreferences(userId);
    const result = await this.sendWechatRepositoryEventNotification(userId, im, this.buildTestRepositoryEvent('wechat'));
    return {
      sent: result.sent,
      message: result.sent > 0 ? '微信测试推送已发送。' : this.toSkippedMessage(result.skippedReason, '微信测试推送发送失败。'),
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

  private buildDingTalkStatus(
    dingtalk?: DingTalkConnectionPreferences,
    im?: ImPreferences,
    bridge?: DingTalkBridgeRuntime,
  ) {
    const state = dingtalk?.state || (dingtalk?.clientId ? 'configured' : 'not_configured');
    const connected = bridge?.status === 'connected' || state === 'connected' || state === 'ready';
    const subscriptionReady = this.hasReadySubscription(im, 'dingtalk');

    return {
      provider: 'dingtalk',
      state,
      connected,
      clientId: dingtalk?.clientId,
      botName: dingtalk?.botName,
      summary: this.getDingTalkSummary(state, bridge),
      nextStep: bridge?.lastError || this.getDingTalkNextStep(state, bridge),
      stages: this.buildProviderStages(state, subscriptionReady, bridge?.status, bridge?.lastError),
    };
  }

  private buildWecomStatus(
    wecom?: WecomConnectionPreferences,
    im?: ImPreferences,
    bridge?: WecomBridgeRuntime,
  ) {
    const state = wecom?.state || (wecom?.botId ? 'configured' : 'not_configured');
    const connected = bridge?.status === 'connected' || state === 'connected' || state === 'ready';
    const effectiveState: ImConnectionState = connected
      ? (this.hasReadySubscription(im, 'wecom') ? 'ready' : 'connected')
      : bridge?.status === 'error'
        ? 'error'
        : state;
    return {
      provider: 'wecom',
      state: effectiveState,
      connected,
      botId: wecom?.botId,
      botName: wecom?.botName,
      summary: bridge?.status === 'connecting'
        ? '企业微信长连接正在连接。'
        : connected
          ? '企业微信机器人长连接已建立。'
          : effectiveState === 'error'
            ? '企业微信连接需要检查。'
            : state === 'not_configured'
              ? '企业微信机器人未配置。'
              : '企业微信机器人凭证已保存。',
      nextStep: bridge?.lastError || (state === 'not_configured'
        ? '扫码授权或手动填写 Bot ID / Secret。'
        : connected
          ? '把机器人加入会话后，发送 /bind 配对码完成绑定。'
          : '启动并测试企业微信 Bot WebSocket 长连接。'),
      stages: this.buildProviderStages(
        effectiveState,
        this.hasReadySubscription(im, 'wecom'),
        bridge?.status,
        bridge?.lastError,
      ),
    };
  }

  private parseWecomQrCheckPayload(payload: Record<string, any>) {
    const data = payload?.data && typeof payload.data === 'object' ? payload.data : {};
    const botInfoCandidates = [
      data?.bot_info,
      data?.botInfo,
      data?.bot,
      payload?.bot_info,
      payload?.botInfo,
      payload?.bot,
      data,
    ].filter((candidate) => candidate && typeof candidate === 'object');
    const botInfo = Object.assign({}, ...botInfoCandidates);
    const rawStatus = String(
      data?.status ??
      data?.state ??
      payload?.status ??
      payload?.state ??
      '',
    ).trim().toLowerCase();
    const botId = this.firstNonEmptyString(
      botInfo.botid,
      botInfo.bot_id,
      botInfo.botId,
      data?.botid,
      data?.bot_id,
      data?.botId,
    );
    const secret = this.firstNonEmptyString(
      botInfo.secret,
      botInfo.bot_secret,
      botInfo.botSecret,
      data?.secret,
      data?.bot_secret,
      data?.botSecret,
    );
    const botName = this.firstNonEmptyString(botInfo.name, data?.name);
    const successStatuses = new Set(['success', 'succeeded', 'done', 'confirmed', 'authorized', 'authed', 'ok']);

    return {
      rawStatus,
      isSuccess: successStatuses.has(rawStatus) || Boolean(botId && secret),
      botId,
      secret,
      botName,
    };
  }

  private firstNonEmptyString(...values: unknown[]): string | undefined {
    for (const value of values) {
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }
    return undefined;
  }

  private buildWechatStatus(
    wechat?: WechatConnectionPreferences,
    im?: ImPreferences,
    bridge?: WechatBridgeRuntime,
  ) {
    const state = wechat?.state || (wechat?.botToken ? 'configured' : 'not_configured');
    const connected = bridge?.status === 'connected' || state === 'ready' || state === 'connected';

    return {
      provider: 'wechat',
      state,
      connected,
      ilinkBotId: wechat?.ilinkBotId,
      summary: bridge?.status === 'waiting_scan'
        ? '等待微信扫码。'
        : bridge?.status === 'scanned'
          ? '已扫码，请在手机上确认。'
          : connected
            ? '微信长轮询已连接。'
            : state === 'not_configured'
              ? '微信机器人未登录。'
              : '微信凭证已保存。',
      nextStep: bridge?.lastError || (connected ? '发送 /bind 配对码完成绑定。' : '扫码登录并保持 API 进程运行。'),
      qrCodeUrl: bridge?.qrCodeUrl,
      stages: this.buildProviderStages(
        state,
        this.hasReadySubscription(im, 'wechat'),
        bridge?.status === 'connected' ? 'connected' : bridge?.status === 'error' ? 'error' : undefined,
        bridge?.lastError,
      ),
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

  private hasReadySubscription(im?: ImPreferences, provider?: ImProvider) {
    return Boolean(
      im?.bindings?.some((binding) => binding.chatId && (!provider || this.getBindingProvider(binding) === provider)) ||
      im?.subscriptions?.some((subscription) =>
        subscription.chatId && subscription.enabled && (!provider || this.getSubscriptionProvider(subscription) === provider),
      ),
    );
  }

  private buildProviderStages(
    state: ImConnectionState,
    subscriptionReady = false,
    runtimeStatus?: string,
    runtimeError?: string,
  ): ImStageStatus[] {
    return [
      {
        id: 'configured',
        state: state === 'not_configured' ? 'missing' : 'verified',
      },
      {
        id: 'credential_valid',
        state: state === 'connected' || state === 'ready' || state === 'configured'
          ? 'verified'
          : state === 'error'
            ? 'error'
            : 'unknown',
      },
      {
        id: 'ws_connected',
        state: runtimeStatus === 'connected'
          ? 'verified'
          : runtimeStatus === 'error'
            ? 'error'
            : state === 'not_configured'
              ? 'missing'
              : 'unknown',
        message: runtimeError,
      },
      {
        id: 'bot_reachable',
        state: state === 'ready' || runtimeStatus === 'connected' ? 'verified' : 'unknown',
      },
      {
        id: 'subscription_ready',
        state: subscriptionReady ? 'verified' : 'unknown',
      },
    ];
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

  private getDingTalkSummary(
    state: ImConnectionState,
    bridge?: { status: DingTalkBridgeRuntimeState },
  ): string {
    if (bridge?.status === 'connected' || state === 'ready') return '钉钉机器人已就绪。';
    if (bridge?.status === 'connecting') return '钉钉 Stream 正在连接。';
    if (state === 'configured') return '钉钉凭证已保存。';
    if (state === 'error' || bridge?.status === 'error') return '钉钉连接需要检查。';
    return '钉钉机器人未配置。';
  }

  private getDingTalkNextStep(
    state: ImConnectionState,
    bridge?: { status: DingTalkBridgeRuntimeState },
  ): string | undefined {
    if (state === 'not_configured') return '填写 Client ID 和 Client Secret。';
    if (state === 'configured') return '测试 Stream 连接。';
    if (bridge?.status !== 'connected') return '在钉钉开放平台启用机器人能力，并选择 Stream 模式。';
    return '把机器人加入群聊，发送 /bind 配对码完成绑定。';
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

  private async restoreDingTalkBridges(): Promise<void> {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        preferences: true,
      },
    });

    await Promise.all(users.map(async (user) => {
      const prefs = (user.preferences as Record<string, unknown>) || {};
      const im = ((prefs.im || {}) as ImPreferences);
      if (!im.dingtalk?.clientId || !im.dingtalk?.clientSecret) return;

      await this.startDingTalkBridge(user.id, im).catch((error) => {
        const message = error instanceof Error ? error.message : 'unknown_error';
        this.logger.warn(`dingtalk_bridge_restore_failed userId=${user.id} reason=${message}`);
      });
    }));
  }

  private async restoreWecomBridges(): Promise<void> {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        preferences: true,
      },
    });

    await Promise.all(users.map(async (user) => {
      const prefs = (user.preferences as Record<string, unknown>) || {};
      const im = ((prefs.im || {}) as ImPreferences);
      if (!im.wecom?.botId || !im.wecom?.secret) return;

      await this.startWecomBridge(user.id, im).catch((error) => {
        const message = error instanceof Error ? error.message : 'unknown_error';
        this.logger.warn(`wecom_bridge_restore_failed userId=${user.id} reason=${message}`);
      });
    }));
  }

  private async restoreWechatBridges(): Promise<void> {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        preferences: true,
      },
    });

    await Promise.all(users.map(async (user) => {
      const prefs = (user.preferences as Record<string, unknown>) || {};
      const im = ((prefs.im || {}) as ImPreferences);
      if (!im.wechat?.botToken || !im.wechat?.ilinkBotId) return;

      await this.startWechatBridge(user.id, im).catch((error) => {
        const message = error instanceof Error ? error.message : 'unknown_error';
        this.logger.warn(`wechat_bridge_restore_failed userId=${user.id} reason=${message}`);
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

  private async startDingTalkBridge(userId: string, im: ImPreferences): Promise<DingTalkBridgeRuntime> {
    const clientId = im.dingtalk?.clientId?.trim();
    const clientSecret = im.dingtalk?.clientSecret?.trim();
    if (!clientId || !clientSecret) {
      await this.stopDingTalkBridge(userId);
      return {
        userId,
        clientId: clientId || '',
        status: 'stopped',
        webhookCache: new Map(),
      };
    }

    const current = this.dingtalkBridges.get(userId);
    if (current?.status === 'connected' && current.clientId === clientId) {
      return current;
    }

    await this.stopDingTalkBridge(userId);

    const runtime: DingTalkBridgeRuntime = {
      userId,
      clientId,
      status: 'connecting',
      startedAt: new Date().toISOString(),
      webhookCache: new Map(),
    };
    this.dingtalkBridges.set(userId, runtime);

    try {
      const dynamicImport = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<unknown>;
      const sdk = await dynamicImport('dingtalk-stream-sdk-nodejs') as {
        DWClient: new (opts: { clientId: string; clientSecret: string; keepAlive?: boolean }) => {
          registerCallbackListener: (topic: string, callback: (message: Record<string, any>) => void) => any;
          registerAllEventListener: (callback: (message: Record<string, any>) => { status: string; message?: string }) => any;
          connect: () => Promise<void>;
          disconnect: () => void;
          send: (messageId: string, value: { status: string; message?: string }) => void;
        };
        TOPIC_ROBOT: string;
        EventAck: { SUCCESS: string; LATER?: string };
      };

      const client = new sdk.DWClient({
        clientId,
        clientSecret,
        keepAlive: true,
      });

      client.registerCallbackListener(sdk.TOPIC_ROBOT, (message: Record<string, any>) => {
        const messageId = String((message.headers as Record<string, any> | undefined)?.messageId || '').trim();
        if (messageId) {
          client.send(messageId, { status: sdk.EventAck.SUCCESS });
        }
        void this.handleDingTalkRobotMessage(userId, message).catch((error) => {
          const reason = error instanceof Error ? error.message : 'unknown_error';
          this.logger.warn(`dingtalk_message_handle_failed userId=${userId} reason=${reason}`);
        });
      });

      client.registerAllEventListener((message: Record<string, any>) => {
        const eventType = String((message.headers as Record<string, any> | undefined)?.eventType || '').trim();
        this.logger.log(`dingtalk_event_received userId=${userId} eventType=${eventType || '-'}`);
        return { status: sdk.EventAck.SUCCESS };
      });

      await client.connect();
      runtime.client = client;
      runtime.status = 'connected';
      delete runtime.lastError;
      this.logger.log(`dingtalk_stream_connected userId=${userId} clientId=${clientId}`);
      return runtime;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown_error';
      runtime.status = 'error';
      runtime.lastError = message.includes('Cannot find module')
        ? '缺少 dingtalk-stream-sdk-nodejs，请安装依赖后重试。'
        : message;
      this.logger.warn(`dingtalk_stream_connect_failed userId=${userId} reason=${runtime.lastError}`);
      return runtime;
    }
  }

  private async stopDingTalkBridge(userId: string): Promise<void> {
    const bridge = this.dingtalkBridges.get(userId);
    if (!bridge) return;

    try {
      bridge.client?.disconnect();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown_error';
      this.logger.warn(`dingtalk_stream_disconnect_failed userId=${userId} reason=${message}`);
    } finally {
      this.dingtalkBridges.delete(userId);
    }
  }

  private async startWecomBridge(userId: string, im: ImPreferences): Promise<WecomBridgeRuntime> {
    const botId = im.wecom?.botId?.trim();
    const secret = im.wecom?.secret?.trim();
    if (!botId || !secret) {
      await this.stopWecomBridge(userId);
      return {
        userId,
        botId: botId || '',
        status: 'stopped',
      };
    }

    const current = this.wecomBridges.get(userId);
    if (current?.status === 'connected' && current.botId === botId) {
      return current;
    }

    await this.stopWecomBridge(userId);

    const runtime: WecomBridgeRuntime = {
      userId,
      botId,
      status: 'connecting',
      startedAt: new Date().toISOString(),
    };
    this.wecomBridges.set(userId, runtime);

    try {
      const client = new AiBot.WSClient({
        botId,
        secret,
        maxReconnectAttempts: -1,
        logger: {
          debug: (message: string, ...args: any[]) => this.logger.debug(`[wecom] ${message} ${args.join(' ')}`.trim()),
          info: (message: string, ...args: any[]) => this.logger.log(`[wecom] ${message} ${args.join(' ')}`.trim()),
          warn: (message: string, ...args: any[]) => this.logger.warn(`[wecom] ${message} ${args.join(' ')}`.trim()),
          error: (message: string, ...args: any[]) => this.logger.error(`[wecom] ${message} ${args.join(' ')}`.trim()),
        },
      });

      runtime.client = client;

      client.on('authenticated', () => {
        runtime.status = 'connected';
        delete runtime.lastError;
        this.logger.log(`wecom_ws_authenticated userId=${userId} botId=${botId}`);
        void this.markProviderStateFromRuntime(userId, 'wecom').catch((error) => {
          const message = error instanceof Error ? error.message : 'unknown_error';
          this.logger.warn(`wecom_state_update_failed userId=${userId} reason=${message}`);
        });
      });

      client.on('reconnecting', (attempt: number) => {
        runtime.status = 'connecting';
        runtime.lastError = `企业微信长连接正在重连（第 ${attempt} 次）。`;
      });

      client.on('disconnected', (reason: string) => {
        runtime.status = 'error';
        runtime.lastError = reason || '企业微信长连接已断开。';
      });

      client.on('error', (error: Error) => {
        runtime.status = 'error';
        runtime.lastError = error.message || '企业微信长连接错误。';
        this.logger.warn(`wecom_ws_error userId=${userId} reason=${runtime.lastError}`);
      });

      client.on('message', (frame: WsFrame<Record<string, any>>) => {
        void this.handleWecomMessage(userId, frame).catch((error) => {
          const reason = error instanceof Error ? error.message : 'unknown_error';
          this.logger.warn(`wecom_message_handle_failed userId=${userId} reason=${reason}`);
        });
      });

      client.on('event.enter_chat', (frame: WsFrame<Record<string, any>>) => {
        void client.replyWelcome(frame, {
          msgtype: 'text',
          text: { content: '欢迎接入 Repo-Pulse。请在设置页生成配对码后发送 /bind 配对码完成绑定。' },
        }).catch((error) => {
          const reason = error instanceof Error ? error.message : 'unknown_error';
          this.logger.warn(`wecom_welcome_reply_failed userId=${userId} reason=${reason}`);
        });
      });

      client.connect();
      this.logger.log(`wecom_ws_connecting userId=${userId} botId=${botId}`);
      return runtime;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown_error';
      runtime.status = 'error';
      runtime.lastError = message;
      this.logger.warn(`wecom_ws_connect_failed userId=${userId} reason=${message}`);
      return runtime;
    }
  }

  private async stopWecomBridge(userId: string): Promise<void> {
    const bridge = this.wecomBridges.get(userId);
    if (!bridge) return;

    try {
      bridge.client?.disconnect();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown_error';
      this.logger.warn(`wecom_ws_disconnect_failed userId=${userId} reason=${message}`);
    } finally {
      this.wecomBridges.delete(userId);
    }
  }

  private async ensureWecomBridgeReady(userId: string, im: ImPreferences): Promise<WecomBridgeRuntime> {
    let runtime = this.wecomBridges.get(userId);
    if (runtime?.status === 'connected' && runtime.client) {
      return runtime;
    }

    runtime = await this.startWecomBridge(userId, im);
    await this.waitForWecomBridge(runtime, 6000);
    return runtime;
  }

  private async waitForWecomBridge(runtime: WecomBridgeRuntime, timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (runtime.status === 'connected') return true;
      if (runtime.status === 'error' || runtime.status === 'stopped') return false;
      await this.sleep(250);
    }
    return runtime.status === 'connected';
  }

  private async markProviderStateFromRuntime(userId: string, provider: ImProvider): Promise<void> {
    const im = await this.getImPreferences(userId);
    const nextState: ImConnectionState = this.hasReadySubscription(im, provider) ? 'ready' : 'connected';
    await this.updateImPreferences(userId, this.withProviderState(im, provider, nextState));
  }

  private async startWechatBridge(userId: string, im: ImPreferences): Promise<WechatBridgeRuntime> {
    const wechat = im.wechat;
    if (!wechat?.botToken || !wechat.ilinkBotId) {
      await this.stopWechatBridge(userId);
      return {
        userId,
        status: 'stopped',
      };
    }

    await this.stopWechatBridge(userId);
    const pollAbortController = new AbortController();
    const runtime: WechatBridgeRuntime = {
      userId,
      status: 'connecting',
      startedAt: new Date().toISOString(),
      pollAbortController,
      syncCursor: '',
    };
    this.wechatBridges.set(userId, runtime);
    runtime.status = 'connected';

    void this.pollWechatMessages(userId, pollAbortController.signal).catch((error) => {
      const message = error instanceof Error ? error.message : 'unknown_error';
      runtime.status = 'error';
      runtime.lastError = message;
      this.logger.warn(`wechat_poll_failed userId=${userId} reason=${message}`);
    });

    this.logger.log(`wechat_polling_started userId=${userId} ilinkBotId=${wechat.ilinkBotId}`);
    return runtime;
  }

  private async stopWechatBridge(userId: string): Promise<void> {
    const bridge = this.wechatBridges.get(userId);
    if (!bridge) return;

    bridge.loginAbortController?.abort();
    bridge.pollAbortController?.abort();
    this.wechatBridges.delete(userId);
    this.logger.log(`wechat_bridge_stopped userId=${userId}`);
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

  private async handleDingTalkRobotMessage(userId: string, message: Record<string, any>): Promise<void> {
    const headers = (message.headers || {}) as Record<string, any>;
    const messageId = String(headers.messageId || '').trim();
    if (messageId && this.recentDingTalkEventIds.has(messageId)) return;
    if (messageId) {
      this.addRecentDingTalkEventId(messageId);
    }

    let data: Record<string, any>;
    try {
      data = typeof message.data === 'string'
        ? JSON.parse(message.data)
        : ((message.data || {}) as Record<string, any>);
    } catch {
      this.logger.warn(`dingtalk_message_parse_failed userId=${userId} messageId=${messageId || '-'}`);
      return;
    }

    const chatId = String(data.conversationId || '').trim();
    const openId = String(data.senderId || '').trim();
    const senderNick = String(data.senderNick || '').trim();
    const robotCode = String(data.robotCode || '').trim();
    const sessionWebhook = String(data.sessionWebhook || '').trim();
    const text = this.extractDingTalkMessageText(data);
    const code = this.extractBindCode(text);

    const runtime = this.dingtalkBridges.get(userId);
    if (runtime && chatId && sessionWebhook) {
      runtime.webhookCache.set(chatId, sessionWebhook);
      if (runtime.webhookCache.size > 200) {
        const firstKey = runtime.webhookCache.keys().next().value;
        if (firstKey) runtime.webhookCache.delete(firstKey);
      }
    }

    this.logger.log(
      `dingtalk_message_received userId=${userId} chatId=${chatId || '-'} openId=${openId || '-'} sender=${senderNick || '-'} hasBindCode=${Boolean(code)}`,
    );

    if (!code) return;

    const bindResult = await this.bindProviderUser({
      provider: 'dingtalk',
      code,
      openId,
      chatId,
      chatName: senderNick || undefined,
      robotCode: robotCode || undefined,
    });

    if (sessionWebhook) {
      await this.replyDingTalkWebhook(sessionWebhook, bindResult.message).catch((error) => {
        const reason = error instanceof Error ? error.message : 'unknown_error';
        this.logger.warn(`dingtalk_bind_reply_failed userId=${userId} reason=${reason}`);
      });
    }
  }

  private async handleWecomMessage(userId: string, frame: WsFrame<Record<string, any>>): Promise<void> {
    const body = (frame.body || {}) as Record<string, any>;
    const msgId = String(body.msgid || '').trim();
    if (msgId && this.recentWecomEventIds.has(msgId)) return;
    if (msgId) {
      this.addRecentWecomEventId(msgId);
    }

    const chatType = String(body.chattype || '').trim();
    const chatId = String(body.chatid || body.from?.userid || '').trim();
    const openId = String(body.from?.userid || '').trim();
    const text = this.extractWecomMessageText(body);
    const code = this.extractBindCode(text);

    this.logger.log(
      `wecom_message_received userId=${userId} msgId=${msgId || '-'} chatId=${chatId || '-'} openId=${openId || '-'} chatType=${chatType || '-'} hasBindCode=${Boolean(code)}`,
    );

    if (!code) return;

    const bindResult = await this.bindProviderUser({
      provider: 'wecom',
      code,
      openId: openId || chatId,
      chatId,
      chatName: chatType === 'group' ? '企业微信群聊' : '企业微信单聊',
    });

    const runtime = this.wecomBridges.get(userId);
    if (runtime?.client) {
      await runtime.client.replyStream(
        frame,
        generateReqId('repo_pulse_bind'),
        bindResult.message,
        true,
      ).catch((error) => {
        const reason = error instanceof Error ? error.message : 'unknown_error';
        this.logger.warn(`wecom_bind_reply_failed userId=${userId} reason=${reason}`);
      });
    }
  }

  private async pollWechatLogin(userId: string, qrCodeKey: string, signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      const response = await axios.get(
        `${WECHAT_QR_STATUS_URL}${encodeURIComponent(qrCodeKey)}`,
        {
          timeout: 40_000,
          signal,
          validateStatus: () => true,
        },
      );
      const payload = response.data as {
        status?: string;
        bot_token?: string;
        ilink_bot_id?: string;
        baseurl?: string;
        ilink_user_id?: string;
      };

      const runtime = this.wechatBridges.get(userId);
      if (!runtime) return;

      if (payload.status === 'scaned') {
        runtime.status = 'scanned';
      } else if (payload.status === 'expired') {
        runtime.status = 'error';
        runtime.lastError = '微信二维码已过期，请重新扫码。';
        return;
      } else if (payload.status === 'confirmed') {
        if (!payload.bot_token || !payload.ilink_bot_id || !payload.ilink_user_id) {
          runtime.status = 'error';
          runtime.lastError = '微信扫码成功，但未返回完整凭证。';
          return;
        }

        await this.saveWechatConnection(userId, {
          botToken: payload.bot_token,
          ilinkBotId: payload.ilink_bot_id,
          ilinkUserId: payload.ilink_user_id,
          baseUrl: payload.baseurl || WECHAT_DEFAULT_BASE_URL,
        });
        return;
      }

      await this.sleep(2500);
    }
  }

  private async pollWechatMessages(userId: string, signal: AbortSignal): Promise<void> {
    const runtime = this.wechatBridges.get(userId);
    if (!runtime) return;

    let failures = 0;
    while (!signal.aborted) {
      try {
        const im = await this.getImPreferences(userId);
        const wechat = im.wechat;
        if (!wechat?.botToken || !wechat.ilinkBotId) {
          runtime.status = 'error';
          runtime.lastError = '微信凭证缺失，请重新扫码登录。';
          return;
        }

        const response = await this.postWechatApi<{
          ret?: number;
          errcode?: number;
          errmsg?: string;
          msgs?: Array<Record<string, any>>;
          get_updates_buf?: string;
        }>(
          wechat,
          '/ilink/bot/getupdates',
          {
            get_updates_buf: runtime.syncCursor || '',
            base_info: { channel_version: '1.0.0' },
          },
          WECHAT_LONG_POLL_TIMEOUT_MS + 5000,
          signal,
        );

        failures = 0;
        if (response.get_updates_buf) {
          runtime.syncCursor = response.get_updates_buf;
        }

        for (const message of response.msgs || []) {
          await this.handleWechatMessage(userId, message);
        }
      } catch (error) {
        if (signal.aborted) return;
        failures += 1;
        const delay = Math.min(3000 * failures, 60_000);
        const message = error instanceof Error ? error.message : 'unknown_error';
        this.logger.warn(`wechat_poll_retry userId=${userId} failures=${failures} delay=${delay} reason=${message}`);
        await this.sleep(delay);
      }
    }
  }

  private async handleWechatMessage(userId: string, message: Record<string, any>): Promise<void> {
    if (message.message_type !== WECHAT_MESSAGE_TYPE.USER) return;
    if (message.message_state !== WECHAT_MESSAGE_STATE.FINISH) return;

    const chatId = String(message.from_user_id || '').trim();
    const contextToken = String(message.context_token || '').trim();
    const text = (Array.isArray(message.item_list) ? message.item_list : [])
      .filter((item: Record<string, any>) => item.type === WECHAT_ITEM_TYPE.TEXT && item.text_item)
      .map((item: Record<string, any>) => String(item.text_item?.text || ''))
      .join('')
      .trim();
    const code = this.extractBindCode(text);

    this.logger.log(`wechat_message_received userId=${userId} chatId=${chatId || '-'} hasBindCode=${Boolean(code)}`);
    if (!code) return;

    const bindResult = await this.bindProviderUser({
      provider: 'wechat',
      code,
      openId: chatId,
      chatId,
      contextToken,
    });

    const im = await this.getImPreferences(userId);
    if (im.wechat) {
      await this.sendWechatText(im.wechat, chatId, bindResult.message, contextToken).catch((error) => {
        const reason = error instanceof Error ? error.message : 'unknown_error';
        this.logger.warn(`wechat_bind_reply_failed userId=${userId} reason=${reason}`);
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

  private addRecentDingTalkEventId(eventId: string): void {
    this.recentDingTalkEventIds.add(eventId);
    if (this.recentDingTalkEventIds.size <= 500) return;
    const oldest = this.recentDingTalkEventIds.values().next().value;
    if (oldest) {
      this.recentDingTalkEventIds.delete(oldest);
    }
  }

  private addRecentWecomEventId(eventId: string): void {
    this.recentWecomEventIds.add(eventId);
    if (this.recentWecomEventIds.size <= 500) return;
    const oldest = this.recentWecomEventIds.values().next().value;
    if (oldest) {
      this.recentWecomEventIds.delete(oldest);
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

  private extractDingTalkMessageText(message: Record<string, any>): string {
    if (message.msgtype === 'text') {
      return String((message.text as Record<string, any> | undefined)?.content || '').trim();
    }

    if (message.msgtype === 'richText') {
      const richText = ((message.richText as Record<string, any> | undefined)?.richText || []) as Array<Record<string, any>>;
      return richText.map((node) => String(node.text || '')).join('').trim();
    }

    return '';
  }

  private extractWecomMessageText(message: Record<string, any> | undefined): string {
    if (!message) return '';
    const msgType = String(message.msgtype || '').trim();
    if (msgType === 'text') {
      return String((message.text as Record<string, any> | undefined)?.content || '').trim();
    }
    if (msgType === 'voice') {
      return String((message.voice as Record<string, any> | undefined)?.content || '').trim();
    }
    if (msgType === 'mixed') {
      const items = ((message.mixed as Record<string, any> | undefined)?.msg_item || []) as Array<Record<string, any>>;
      return items
        .filter((item) => item.msgtype === 'text')
        .map((item) => String((item.text as Record<string, any> | undefined)?.content || ''))
        .join('')
        .trim();
    }
    return '';
  }

  private resolveFeishuNotificationChatIds(
    im: ImPreferences,
    event: RepositoryEventNotificationInput,
  ): string[] {
    return this.resolveProviderNotificationChatIds(im, 'feishu', event)
      .map((target) => target.chatId);
  }

  private resolveProviderNotificationChatIds(
    im: ImPreferences,
    provider: ImProvider,
    event: RepositoryEventNotificationInput,
  ): Array<{ chatId: string; binding?: NonNullable<ImPreferences['bindings']>[number] }> {
    const targets = new Map<string, { chatId: string; binding?: NonNullable<ImPreferences['bindings']>[number] }>();
    const allSubscriptions = this.getProviderSubscriptions(im, provider);
    const subscriptions = allSubscriptions.filter((subscription) => {
      return matchesFeishuSubscription(subscription, event);
    });

    for (const subscription of subscriptions) {
      if (subscription.chatId) {
        targets.set(subscription.chatId, {
          chatId: subscription.chatId,
          binding: this.findBindingByChatId(im, provider, subscription.chatId),
        });
      }
    }

    if (allSubscriptions.length === 0) {
      for (const binding of im.bindings || []) {
        if (binding.chatId && this.getBindingProvider(binding) === provider) {
          targets.set(binding.chatId, { chatId: binding.chatId, binding });
        }
      }
    }

    return Array.from(targets.values());
  }

  private resolveAllFeishuChatIds(im: ImPreferences): string[] {
    return this.resolveAllProviderTargets(im, 'feishu').map((target) => target.chatId);
  }

  private resolveAllProviderTargets(
    im: ImPreferences,
    provider: ImProvider,
  ): Array<{ chatId: string; binding?: NonNullable<ImPreferences['bindings']>[number] }> {
    const targets = new Map<string, { chatId: string; binding?: NonNullable<ImPreferences['bindings']>[number] }>();
    for (const subscription of this.getProviderSubscriptions(im, provider)) {
      if (subscription.enabled && subscription.chatId) {
        targets.set(subscription.chatId, {
          chatId: subscription.chatId,
          binding: this.findBindingByChatId(im, provider, subscription.chatId),
        });
      }
    }
    for (const binding of im.bindings || []) {
      if (binding.chatId && this.getBindingProvider(binding) === provider) {
        targets.set(binding.chatId, { chatId: binding.chatId, binding });
      }
    }
    return Array.from(targets.values());
  }

  private async sendDingTalkRepositoryEventNotification(
    userId: string,
    im: ImPreferences,
    event: RepositoryEventNotificationInput,
  ): Promise<{ sent: number; skippedReason?: string }> {
    const clientId = im.dingtalk?.clientId?.trim();
    const clientSecret = im.dingtalk?.clientSecret?.trim();
    if (!clientId || !clientSecret) {
      return { sent: 0, skippedReason: 'dingtalk_not_configured' };
    }

    const targets = this.resolveProviderNotificationChatIds(im, 'dingtalk', event);
    if (targets.length === 0) {
      return { sent: 0, skippedReason: 'dingtalk_chat_not_bound' };
    }

    const accessToken = await this.getDingTalkAccessToken(clientId, clientSecret);
    if (!accessToken) {
      return { sent: 0, skippedReason: 'dingtalk_token_unavailable' };
    }

    let sent = 0;
    for (const target of targets) {
      const robotCode = target.binding?.robotCode || clientId;
      const ok = await this.sendDingTalkGroupMarkdown({
        accessToken,
        robotCode,
        chatId: target.chatId,
        event,
      });
      if (ok) {
        sent += 1;
        this.logger.log(`dingtalk_event_sent userId=${userId} chatId=${target.chatId} eventId=${event.eventId}`);
      }
    }

    return { sent, skippedReason: sent > 0 ? undefined : 'dingtalk_send_failed' };
  }

  private async sendWecomRepositoryEventNotification(
    userId: string,
    im: ImPreferences,
    event: RepositoryEventNotificationInput,
  ): Promise<{ sent: number; skippedReason?: string }> {
    if (!im.wecom?.botId || !im.wecom?.secret) {
      return { sent: 0, skippedReason: 'wecom_not_configured' };
    }

    const targets = this.resolveProviderNotificationChatIds(im, 'wecom', event);
    if (targets.length === 0) {
      return { sent: 0, skippedReason: 'wecom_chat_not_bound' };
    }

    const runtime = await this.ensureWecomBridgeReady(userId, im);
    if (!runtime.client || runtime.status !== 'connected') {
      return { sent: 0, skippedReason: 'wecom_connection_unavailable' };
    }

    let sent = 0;
    const markdown = formatFeishuRepositoryEventText(event);
    for (const target of targets) {
      const ok = await runtime.client.sendMessage(target.chatId, {
        msgtype: 'markdown',
        markdown: { content: markdown },
      }).then(() => true).catch((error) => {
        const message = error instanceof Error ? error.message : 'unknown_error';
        this.logger.warn(`wecom_event_send_failed userId=${userId} chatId=${target.chatId} eventId=${event.eventId} reason=${message}`);
        return false;
      });
      if (ok) {
        sent += 1;
        this.logger.log(`wecom_event_sent userId=${userId} chatId=${target.chatId} eventId=${event.eventId}`);
      }
    }

    return { sent, skippedReason: sent > 0 ? undefined : 'wecom_send_failed' };
  }

  private async sendWechatRepositoryEventNotification(
    userId: string,
    im: ImPreferences,
    event: RepositoryEventNotificationInput,
  ): Promise<{ sent: number; skippedReason?: string }> {
    if (!im.wechat?.botToken || !im.wechat?.ilinkBotId) {
      return { sent: 0, skippedReason: 'wechat_not_configured' };
    }

    const targets = this.resolveProviderNotificationChatIds(im, 'wechat', event);
    if (targets.length === 0) {
      return { sent: 0, skippedReason: 'wechat_chat_not_bound' };
    }

    let sent = 0;
    const text = formatFeishuRepositoryEventText(event);
    for (const target of targets) {
      const contextToken = target.binding?.contextToken || '';
      const ok = await this.sendWechatText(im.wechat, target.chatId, text, contextToken).then(() => true).catch((error) => {
        const message = error instanceof Error ? error.message : 'unknown_error';
        this.logger.warn(`wechat_event_send_failed userId=${userId} chatId=${target.chatId} eventId=${event.eventId} reason=${message}`);
        return false;
      });
      if (ok) sent += 1;
    }

    return { sent, skippedReason: sent > 0 ? undefined : 'wechat_send_failed' };
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

  private async getDingTalkAccessToken(clientId: string, clientSecret: string): Promise<string | null> {
    const response = await axios.post(
      'https://api.dingtalk.com/v1.0/oauth2/accessToken',
      {
        appKey: clientId,
        appSecret: clientSecret,
      },
      {
        timeout: 8000,
        validateStatus: () => true,
      },
    );

    const payload = response.data as { accessToken?: string };
    return response.status >= 200 && response.status < 300 ? payload.accessToken || null : null;
  }

  private async sendDingTalkGroupMarkdown(params: {
    accessToken: string;
    robotCode: string;
    chatId: string;
    event: RepositoryEventNotificationInput;
  }): Promise<boolean> {
    const markdown = formatFeishuRepositoryEventText(params.event);
    const response = await axios.post(
      'https://api.dingtalk.com/v1.0/robot/groupMessages/send',
      {
        robotCode: params.robotCode,
        openConversationId: params.chatId,
        msgKey: 'sampleMarkdown',
        msgParam: JSON.stringify({
          title: `Repo-Pulse · ${params.event.repositoryName}`,
          text: markdown,
        }),
      },
      {
        timeout: 8000,
        headers: {
          'x-acs-dingtalk-access-token': params.accessToken,
        },
        validateStatus: () => true,
      },
    );

    if (response.status >= 200 && response.status < 300) return true;
    const payload = response.data as { code?: string; message?: string };
    this.logger.warn(
      `dingtalk_group_message_failed chatId=${params.chatId} status=${response.status} code=${payload.code || '-'} message=${payload.message || '-'}`,
    );
    return false;
  }

  private async replyDingTalkWebhook(webhook: string, text: string): Promise<void> {
    await axios.post(
      webhook,
      {
        msgtype: 'text',
        text: { content: text },
      },
      {
        timeout: 8000,
        validateStatus: () => true,
      },
    );
  }

  private async postWechatApi<T>(
    wechat: WechatConnectionPreferences,
    path: string,
    body: Record<string, any>,
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<T> {
    if (!wechat.botToken || !wechat.ilinkBotId) {
      throw new Error('微信凭证缺失');
    }

    const response = await axios.post(
      `${wechat.baseUrl || WECHAT_DEFAULT_BASE_URL}${path}`,
      body,
      {
        timeout: timeoutMs,
        signal,
        headers: {
          'Content-Type': 'application/json',
          AuthorizationType: 'ilink_bot_token',
          Authorization: `Bearer ${wechat.botToken}`,
          'X-WECHAT-UIN': this.generateWechatUin(),
        },
        validateStatus: () => true,
      },
    );

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`微信 API HTTP ${response.status}`);
    }

    return response.data as T;
  }

  private async sendWechatText(
    wechat: WechatConnectionPreferences,
    toUserId: string,
    text: string,
    contextToken = '',
  ): Promise<void> {
    const chunks = text.length <= 4000
      ? [text]
      : text.match(/[\s\S]{1,4000}/g) || [text];

    for (const chunk of chunks) {
      await this.postWechatApi(
        wechat,
        '/ilink/bot/sendmessage',
        {
          msg: {
            from_user_id: wechat.ilinkBotId,
            to_user_id: toUserId,
            client_id: `repo_pulse_${Date.now()}`,
            message_type: WECHAT_MESSAGE_TYPE.BOT,
            message_state: WECHAT_MESSAGE_STATE.FINISH,
            item_list: [{
              type: WECHAT_ITEM_TYPE.TEXT,
              text_item: { text: chunk },
            }],
            context_token: contextToken,
          },
          base_info: {},
        },
        WECHAT_SEND_TIMEOUT_MS,
      );
    }
  }

  private buildTestRepositoryEvent(provider: ImProvider): RepositoryEventNotificationInput {
    return {
      eventId: `test-${provider}-${Date.now()}`,
      repositoryId: 'test',
      repositoryName: 'repo-pulse/example',
      eventType: 'PR_OPENED',
      title: `测试 ${this.getProviderDisplayName(provider)} GitHub 事件推送`,
      content: '这是一条 Repo-Pulse 测试推送。真实 GitHub webhook 到达后，会按订阅规则推送类似内容。',
      author: 'Repo-Pulse',
      sourceBranch: `feature/${provider}-push`,
      targetBranch: 'main',
      externalUrl: 'https://github.com/',
    };
  }

  private toSkippedMessage(reason: string | undefined, fallback: string): string {
    const messages: Record<string, string> = {
      dingtalk_not_configured: '钉钉机器人未配置。',
      dingtalk_chat_not_bound: '还没有绑定钉钉群聊。',
      dingtalk_token_unavailable: '无法获取钉钉访问令牌。',
      wecom_not_configured: '企业微信机器人未配置。',
      wecom_chat_not_bound: '还没有绑定企业微信群聊。',
      wecom_connection_unavailable: '企业微信 Bot WebSocket 长连接不可用。',
      wecom_send_failed: '企业微信测试推送发送失败。',
      wechat_not_configured: '微信机器人未登录。',
      wechat_chat_not_bound: '还没有绑定微信会话。',
      wechat_send_failed: '微信测试推送发送失败。',
    };
    return reason ? messages[reason] || fallback : fallback;
  }

  private summarizeSkippedReasons(reasons: string[]): string {
    if (reasons.length === 0) return 'im_not_configured';
    const nonDefaultProviderReasons = reasons.filter((reason) =>
      reason !== 'dingtalk_not_configured' &&
      reason !== 'wechat_not_configured' &&
      reason !== 'wecom_not_configured',
    );
    return nonDefaultProviderReasons[0] || reasons[0] || 'im_not_configured';
  }

  private generateWechatUin(): string {
    return randomBytes(4).readUInt32LE(0).toString(10);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
    return this.bindProviderUser({
      provider: 'feishu',
      code: params.code,
      openId: params.openId,
      chatId: params.chatId,
      appId: params.appId,
    });
  }

  private async bindProviderUser(params: {
    provider: ImProvider;
    code: string;
    openId: string;
    chatId: string;
    appId?: string;
    chatName?: string;
    robotCode?: string;
    contextToken?: string;
  }): Promise<{ ok: boolean; message: string; userId?: string }> {
    if (!params.openId || !params.chatId) {
      return { ok: false, message: `绑定失败：缺少${this.getProviderDisplayName(params.provider)}用户或群聊信息。` };
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

      if (params.provider === 'feishu' && params.appId && im.feishu?.appId && im.feishu.appId !== params.appId) {
        continue;
      }

      const pairingCodes = im.pairingCodes || [];
      const matchedCode = pairingCodes.find((entry) => {
        return entry.provider === params.provider &&
          entry.code.toUpperCase() === params.code &&
          new Date(entry.expiresAt).getTime() > now;
      });

      if (!matchedCode) continue;

      const bindings = [
        ...(im.bindings || []).filter((binding) =>
          !(this.getBindingProvider(binding) === params.provider && binding.openId === params.openId),
        ),
        {
          provider: params.provider,
          openId: params.openId,
          chatId: params.chatId,
          chatName: params.chatName,
          robotCode: params.robotCode,
          contextToken: params.contextToken,
          boundAt: new Date().toISOString(),
        },
      ];

      const subscriptions = this.ensureDefaultSubscription(
        im.subscriptions || [],
        params.provider,
        params.chatId,
        params.chatName,
      );

      await this.updateImPreferences(user.id, {
        ...this.withProviderState(im, params.provider, 'ready'),
        bindings,
        subscriptions,
        pairingCodes: pairingCodes.filter((entry) =>
          !(entry.provider === params.provider && entry.code.toUpperCase() === params.code),
        ),
      });

      this.logger.log(`${params.provider}_user_bound userId=${user.id} chatId=${params.chatId}`);
      return {
        ok: true,
        userId: user.id,
        message: `绑定成功。这个${this.getProviderDisplayName(params.provider)}账号和当前会话已接入 Repo-Pulse。`,
      };
    }

    return { ok: false, message: '绑定失败：配对码无效或已过期。' };
  }

  private ensureDefaultSubscription(
    subscriptions: ImSubscriptionDto[],
    provider: ImProvider,
    chatId: string,
    chatName?: string,
  ): ImSubscriptionDto[] {
    const existing = subscriptions.find((subscription) =>
      subscription.chatId === chatId && this.getSubscriptionProvider(subscription) === provider,
    );
    if (existing) {
      return subscriptions.map((subscription) =>
        subscription.chatId === chatId && this.getSubscriptionProvider(subscription) === provider
          ? { ...subscription, enabled: true }
          : subscription,
      );
    }

    return [
      ...subscriptions,
      {
        id: `${provider}-${chatId}`,
        provider,
        chatName: chatName || `${this.getProviderDisplayName(provider)} chat`,
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

  private getSubscriptionProvider(subscription: ImSubscriptionDto): ImProvider {
    return subscription.provider || 'feishu';
  }

  private getBindingProvider(binding: NonNullable<ImPreferences['bindings']>[number]): ImProvider {
    return binding.provider || 'feishu';
  }

  private getProviderSubscriptions(im: ImPreferences, provider: ImProvider): ImSubscriptionDto[] {
    return (im.subscriptions || []).filter((subscription) => this.getSubscriptionProvider(subscription) === provider);
  }

  private withProviderState(im: ImPreferences, provider: ImProvider, state: ImConnectionState): ImPreferences {
    const updatedAt = new Date().toISOString();
    if (provider === 'feishu') return { ...im, feishu: { ...im.feishu, state, updatedAt } };
    if (provider === 'dingtalk') return { ...im, dingtalk: { ...im.dingtalk, state, updatedAt } };
    if (provider === 'wecom') return { ...im, wecom: { ...im.wecom, state, updatedAt } };
    return { ...im, wechat: { ...im.wechat, state, updatedAt } };
  }

  private getProviderDisplayName(provider: ImProvider): string {
    const labels: Record<ImProvider, string> = {
      feishu: '飞书',
      dingtalk: '钉钉',
      wecom: '企业微信',
      wechat: '微信',
    };
    return labels[provider];
  }

  private findBindingByChatId(
    im: ImPreferences,
    provider: ImProvider,
    chatId: string,
  ): NonNullable<ImPreferences['bindings']>[number] | undefined {
    return (im.bindings || []).find((binding) =>
      binding.chatId === chatId && this.getBindingProvider(binding) === provider,
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
