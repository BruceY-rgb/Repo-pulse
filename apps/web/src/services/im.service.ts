import { apiClient } from './api-client';
import type { ApiResponse } from '@/types/api';

export type ImProvider = 'feishu';
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
  botName?: string;
  summary?: string;
  nextStep?: string;
  stages?: ImStageStatus[];
}

export interface ImStatus {
  feishu?: FeishuConnectionStatus;
}

export interface SaveFeishuConnectionInput {
  appId: string;
  appSecret: string;
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

export interface PairingCodeResult {
  code: string;
  expiresAt: string;
}

export interface ImSubscription {
  id: string;
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
    const { data } = await apiClient.get<ApiResponse<ImStatus> | ImStatus>('/im/status');
    return unwrap(data);
  },

  async saveFeishuConnection(input: SaveFeishuConnectionInput): Promise<FeishuConnectionStatus> {
    const { data } = await apiClient.post<ApiResponse<FeishuConnectionStatus> | FeishuConnectionStatus>(
      '/im/feishu/connections',
      input,
    );
    return unwrap(data);
  },

  async testFeishuConnection(input: SaveFeishuConnectionInput): Promise<FeishuConnectionTestResult> {
    const { data } = await apiClient.post<ApiResponse<FeishuConnectionTestResult> | FeishuConnectionTestResult>(
      '/im/feishu/test',
      input,
    );
    return unwrap(data);
  },

  async createPairingCode(): Promise<PairingCodeResult> {
    const { data } = await apiClient.post<ApiResponse<PairingCodeResult> | PairingCodeResult>(
      '/im/pairing-codes',
      { provider: 'feishu' },
    );
    return unwrap(data);
  },

  async sendFeishuTestNotification(): Promise<FeishuTestNotificationResult> {
    const { data } = await apiClient.post<ApiResponse<FeishuTestNotificationResult> | FeishuTestNotificationResult>(
      '/im/feishu/test-notification',
    );
    return unwrap(data);
  },

  async listSubscriptions(): Promise<ImSubscription[]> {
    const { data } = await apiClient.get<ApiResponse<ImSubscription[]> | ImSubscription[]>(
      '/im/subscriptions',
      { params: { provider: 'feishu' } },
    );
    return unwrap(data);
  },

  async saveSubscriptions(input: SaveSubscriptionsInput): Promise<ImSubscription[]> {
    const { data } = await apiClient.post<ApiResponse<ImSubscription[]> | ImSubscription[]>(
      '/im/subscriptions',
      { provider: 'feishu', ...input },
    );
    return unwrap(data);
  },
};
