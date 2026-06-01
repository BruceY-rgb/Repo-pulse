import { apiClient } from './api-client';
import type { ApiResponse } from '@/types/api';

export type ImProvider = 'feishu' | 'dingtalk' | 'wecom' | 'wechat';
export type ImConnectionState = 'not_configured' | 'configured' | 'connected' | 'ready' | 'error';

export interface ImStageStatus {
  id: 'configured' | 'credential_valid' | 'ws_connected' | 'bot_reachable' | 'subscription_ready';
  state: 'verified' | 'missing' | 'unknown' | 'error';
  message?: string;
}

export interface FeishuConnectionStatus {
  provider: ImProvider;
  state: ImConnectionState;
  connected: boolean;
  appId?: string;
  clientId?: string;
  botId?: string;
  ilinkBotId?: string;
  qrCodeUrl?: string;
  botName?: string;
  summary?: string;
  nextStep?: string;
  stages?: ImStageStatus[];
}

export type ImConnectionStatus = FeishuConnectionStatus;

export interface ImStatus {
  feishu?: ImConnectionStatus;
  dingtalk?: ImConnectionStatus;
  wecom?: ImConnectionStatus;
  wechat?: ImConnectionStatus;
}

export interface SaveFeishuConnectionInput {
  appId: string;
  appSecret: string;
}

export interface SaveDingTalkConnectionInput {
  clientId: string;
  clientSecret: string;
  botName?: string;
}

export interface SaveWecomConnectionInput {
  botId: string;
  secret: string;
  botName?: string;
}

export interface SaveWechatConnectionInput {
  botToken: string;
  ilinkBotId: string;
  ilinkUserId: string;
  baseUrl?: string;
}

export interface FeishuConnectionTestResult {
  success: boolean;
  state: ImConnectionState;
  message: string;
  nextStep?: string;
  stages?: ImStageStatus[];
}

export interface FeishuTestNotificationResult {
  sent: number;
  message: string;
}

export type ImTestNotificationResult = FeishuTestNotificationResult;

export interface WecomQrGenerateResult {
  ok: boolean;
  status: 'pending' | 'success' | 'error';
  scode?: string;
  authUrl?: string;
  error?: string;
}

export interface WecomQrCheckResult {
  ok: boolean;
  status: 'pending' | 'success' | 'error';
  pollStatus?: string;
  botId?: string;
  secret?: string;
  botName?: string;
  connection?: ImConnectionStatus;
  error?: string;
}

export interface PairingCodeResult {
  code: string;
  expiresAt: string;
}

export interface ImSubscription {
  id: string;
  provider?: ImProvider;
  chatName?: string;
  chatId?: string;
  repositoryIds: string[];
  branches: string[];
  repositoryBranchScopes?: Record<string, string[]>;
  events: string[];
  enabled: boolean;
}

export interface SaveSubscriptionsInput {
  subscriptions: ImSubscription[];
}

const READ_CACHE_TTL_MS = 1500;
let imStatusReadCache: { expiresAt: number; promise: Promise<ImStatus> } | null = null;
const subscriptionReadCache = new Map<ImProvider, { expiresAt: number; promise: Promise<ImSubscription[]> }>();

function clearImReadCache(provider?: ImProvider) {
  imStatusReadCache = null;
  if (provider) {
    subscriptionReadCache.delete(provider);
  } else {
    subscriptionReadCache.clear();
  }
}

function unwrap<T>(payload: ApiResponse<T> | T): T {
  if (
    payload &&
    typeof payload === 'object' &&
    'data' in payload &&
    'code' in payload
  ) {
    return (payload as ApiResponse<T>).data;
  }

  return payload as T;
}

export const imService = {
  async getImStatus(): Promise<ImStatus> {
    const now = Date.now();
    if (imStatusReadCache && imStatusReadCache.expiresAt > now) {
      return imStatusReadCache.promise;
    }

    const promise = apiClient
      .get<ApiResponse<ImStatus> | ImStatus>('/im/status')
      .then(({ data }) => unwrap(data))
      .catch((error) => {
        if (imStatusReadCache?.promise === promise) {
          imStatusReadCache = null;
        }
        throw error;
      });

    imStatusReadCache = { expiresAt: now + READ_CACHE_TTL_MS, promise };
    return promise;
  },

  async saveFeishuConnection(input: SaveFeishuConnectionInput): Promise<FeishuConnectionStatus> {
    const { data } = await apiClient.post<ApiResponse<FeishuConnectionStatus> | FeishuConnectionStatus>(
      '/im/feishu/connections',
      input,
    );
    clearImReadCache('feishu');
    return unwrap(data);
  },

  async saveDingTalkConnection(input: SaveDingTalkConnectionInput): Promise<ImConnectionStatus> {
    const { data } = await apiClient.post<ApiResponse<ImConnectionStatus> | ImConnectionStatus>(
      '/im/dingtalk/connections',
      input,
    );
    clearImReadCache('dingtalk');
    return unwrap(data);
  },

  async testDingTalkConnection(input: SaveDingTalkConnectionInput): Promise<FeishuConnectionTestResult> {
    const { data } = await apiClient.post<ApiResponse<FeishuConnectionTestResult> | FeishuConnectionTestResult>(
      '/im/dingtalk/test',
      input,
    );
    return unwrap(data);
  },

  async saveWecomConnection(input: SaveWecomConnectionInput): Promise<ImConnectionStatus> {
    const { data } = await apiClient.post<ApiResponse<ImConnectionStatus> | ImConnectionStatus>(
      '/im/wecom/connections',
      input,
    );
    clearImReadCache('wecom');
    return unwrap(data);
  },

  async generateWecomQrCode(): Promise<WecomQrGenerateResult> {
    const { data } = await apiClient.post<ApiResponse<WecomQrGenerateResult> | WecomQrGenerateResult>(
      '/im/wecom/qr-codes',
    );
    return unwrap(data);
  },

  async checkWecomQrCode(scode: string): Promise<WecomQrCheckResult> {
    const { data } = await apiClient.get<ApiResponse<WecomQrCheckResult> | WecomQrCheckResult>(
      '/im/wecom/qr-codes',
      { params: { scode } },
    );
    return unwrap(data);
  },

  async startWecom(): Promise<ImConnectionStatus> {
    const { data } = await apiClient.post<ApiResponse<ImConnectionStatus> | ImConnectionStatus>(
      '/im/wecom/start',
    );
    clearImReadCache('wecom');
    return unwrap(data);
  },

  async startWechatLogin(): Promise<ImConnectionStatus> {
    const { data } = await apiClient.post<ApiResponse<ImConnectionStatus> | ImConnectionStatus>(
      '/im/wechat/login',
    );
    clearImReadCache('wechat');
    return unwrap(data);
  },

  async saveWechatConnection(input: SaveWechatConnectionInput): Promise<ImConnectionStatus> {
    const { data } = await apiClient.post<ApiResponse<ImConnectionStatus> | ImConnectionStatus>(
      '/im/wechat/connections',
      input,
    );
    clearImReadCache('wechat');
    return unwrap(data);
  },

  async startWechat(): Promise<ImConnectionStatus> {
    const { data } = await apiClient.post<ApiResponse<ImConnectionStatus> | ImConnectionStatus>(
      '/im/wechat/start',
    );
    clearImReadCache('wechat');
    return unwrap(data);
  },

  async stopWechat(): Promise<ImConnectionStatus> {
    const { data } = await apiClient.post<ApiResponse<ImConnectionStatus> | ImConnectionStatus>(
      '/im/wechat/stop',
    );
    clearImReadCache('wechat');
    return unwrap(data);
  },

  async logoutWechat(): Promise<ImConnectionStatus> {
    const { data } = await apiClient.post<ApiResponse<ImConnectionStatus> | ImConnectionStatus>(
      '/im/wechat/logout',
    );
    clearImReadCache('wechat');
    return unwrap(data);
  },

  async testFeishuConnection(input: SaveFeishuConnectionInput): Promise<FeishuConnectionTestResult> {
    const { data } = await apiClient.post<ApiResponse<FeishuConnectionTestResult> | FeishuConnectionTestResult>(
      '/im/feishu/test',
      input,
    );
    return unwrap(data);
  },

  async createPairingCode(provider: ImProvider = 'feishu'): Promise<PairingCodeResult> {
    const { data } = await apiClient.post<ApiResponse<PairingCodeResult> | PairingCodeResult>(
      '/im/pairing-codes',
      { provider },
    );
    return unwrap(data);
  },

  async sendFeishuTestNotification(): Promise<FeishuTestNotificationResult> {
    const { data } = await apiClient.post<ApiResponse<FeishuTestNotificationResult> | FeishuTestNotificationResult>(
      '/im/feishu/test-notification',
    );
    return unwrap(data);
  },

  async sendProviderTestNotification(provider: ImProvider): Promise<ImTestNotificationResult> {
    if (provider === 'feishu') return this.sendFeishuTestNotification();
    const { data } = await apiClient.post<ApiResponse<ImTestNotificationResult> | ImTestNotificationResult>(
      `/im/${provider}/test-notification`,
    );
    return unwrap(data);
  },

  async listSubscriptions(provider: ImProvider = 'feishu'): Promise<ImSubscription[]> {
    const now = Date.now();
    const cached = subscriptionReadCache.get(provider);
    if (cached && cached.expiresAt > now) {
      return cached.promise;
    }

    const promise = apiClient
      .get<ApiResponse<ImSubscription[]> | ImSubscription[]>(
        '/im/subscriptions',
        { params: { provider } },
      )
      .then(({ data }) => unwrap(data))
      .catch((error) => {
        if (subscriptionReadCache.get(provider)?.promise === promise) {
          subscriptionReadCache.delete(provider);
        }
        throw error;
      });

    subscriptionReadCache.set(provider, { expiresAt: now + READ_CACHE_TTL_MS, promise });
    return promise;
  },

  async saveSubscriptions(input: SaveSubscriptionsInput, provider: ImProvider = 'feishu'): Promise<ImSubscription[]> {
    const { data } = await apiClient.post<ApiResponse<ImSubscription[]> | ImSubscription[]>(
      '/im/subscriptions',
      { provider, ...input },
    );
    clearImReadCache(provider);
    return unwrap(data);
  },
};
