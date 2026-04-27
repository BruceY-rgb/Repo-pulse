// ===== Enums =====

export enum Role {
  ADMIN = 'ADMIN',
  MANAGER = 'MANAGER',
  MEMBER = 'MEMBER',
  VIEWER = 'VIEWER',
}

export enum Platform {
  GITHUB = 'GITHUB',
  GITLAB = 'GITLAB',
}

export enum EventType {
  PUSH = 'PUSH',
  PR_OPENED = 'PR_OPENED',
  PR_MERGED = 'PR_MERGED',
  PR_CLOSED = 'PR_CLOSED',
  PR_REVIEW = 'PR_REVIEW',
  ISSUE_OPENED = 'ISSUE_OPENED',
  ISSUE_CLOSED = 'ISSUE_CLOSED',
  ISSUE_COMMENT = 'ISSUE_COMMENT',
  RELEASE = 'RELEASE',
  BRANCH_CREATED = 'BRANCH_CREATED',
  BRANCH_DELETED = 'BRANCH_DELETED',
}

export enum RiskLevel {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export enum AnalysisStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export enum FilterAction {
  INCLUDE = 'INCLUDE',
  EXCLUDE = 'EXCLUDE',
  TAG = 'TAG',
}

export enum ApprovalStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  EDITED = 'EDITED',
}

export enum NotificationChannel {
  EMAIL = 'EMAIL',
  DINGTALK = 'DINGTALK',
  FEISHU = 'FEISHU',
  WEBHOOK = 'WEBHOOK',
  IN_APP = 'IN_APP',
}

export enum NotificationStatus {
  PENDING = 'PENDING',
  SENT = 'SENT',
  FAILED = 'FAILED',
  READ = 'READ',
}

export enum ReportType {
  WEEKLY = 'WEEKLY',
  MONTHLY = 'MONTHLY',
  CUSTOM = 'CUSTOM',
}

export enum ReportFormat {
  MARKDOWN = 'MARKDOWN',
  PDF = 'PDF',
  HTML = 'HTML',
}

export enum ReportStatus {
  GENERATING = 'GENERATING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

// ===== API Response Types =====

export interface ApiResponse<T> {
  code: number;
  data: T;
  message: string;
  timestamp: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface PaginationQuery {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// ===== WebSocket Event Types =====

export enum WsEvent {
  EVENT_NEW = 'event:new',
  ANALYSIS_PROGRESS = 'analysis:progress',
  ANALYSIS_COMPLETE = 'analysis:complete',
  APPROVAL_NEW = 'approval:new',
  APPROVAL_UPDATED = 'approval:updated',
  NOTIFICATION_NEW = 'notification:new',
  DASHBOARD_UPDATE = 'dashboard:update',
}

// ===== AI Provider Types =====

export type AIProvider =
  | 'openai'
  | 'anthropic'
  | 'deepseek'
  | 'google'
  | 'moonshot'
  | 'zhipu'
  | 'minimax'
  | 'doubao'
  | 'qwen'
  | 'custom';

export const PROVIDER_DEFAULT_URLS: Record<AIProvider, string> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com',
  deepseek: 'https://api.deepseek.com/anthropic',
  google: 'https://generativelanguage.googleapis.com',
  moonshot: 'https://api.moonshot.cn/v1',
  zhipu: 'https://open.bigmodel.cn/api/paas/v4',
  minimax: 'https://api.minimax.chat/v1',
  doubao: 'https://ark.cn-beijing.volces.com/api/v3',
  qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  custom: '',
};

export const PROVIDER_LABELS: Record<AIProvider, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  deepseek: 'DeepSeek',
  google: 'Google Gemini',
  moonshot: 'Moonshot / Kimi',
  zhipu: '智谱 AI',
  minimax: 'MiniMax',
  doubao: '豆包',
  qwen: '通义千问',
  custom: '自定义端点',
};

export const PROVIDER_DEFAULT_MODELS: Record<AIProvider, string> = {
  openai: 'gpt-4o',
  anthropic: 'claude-sonnet-4-20250514',
  deepseek: 'deepseek-chat',
  google: 'gemini-2.0-flash-exp',
  moonshot: 'kimi-longtext-chat',
  zhipu: 'glm-4-flash',
  minimax: 'MiniMax-M2.1',
  doubao: 'doubao-pro-32k',
  qwen: 'qwen-turbo',
  custom: '',
};

export const PROVIDER_CHAT_PATHS: Record<AIProvider, string> = {
  openai: '/chat/completions',
  anthropic: '/v1/messages',
  deepseek: '/messages',
  google: '/v1beta/models/{model}:generateContent',
  moonshot: '/chat/completions',
  zhipu: '/chat/completions',
  minimax: '/chat/completions',
  doubao: '/chat/completions',
  qwen: '/chat/completions',
  custom: '/chat/completions',
};

export interface AIConfig {
  aiProvider?: AIProvider;
  aiApiKey?: string;
  aiBaseUrl?: string;
  aiModel?: string;
}

export interface ConnectionTestResult {
  success: boolean;
  message: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  enabled: boolean;
}

// ===== Filter Rule Types =====

export type FilterConditionField =
  | 'eventType'
  | 'repository'
  | 'author'
  | 'riskLevel'
  | 'customRegex';

export type FilterConditionOperator = 'eq' | 'contains' | 'regex' | 'in';

export type FilterActionValue = 'INCLUDE' | 'EXCLUDE' | 'TAG';

export interface FilterCondition {
  field: FilterConditionField;
  operator: FilterConditionOperator;
  value: string | string[];
}

export interface FilterRuleDto {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  conditions: FilterCondition[];
  action: FilterActionValue;
  isActive: boolean;
  priority: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateFilterRulePayload {
  name: string;
  description?: string;
  conditions: FilterCondition[];
  action: FilterActionValue;
  isActive?: boolean;
  priority?: number;
}

export interface UpdateFilterRulePayload {
  name?: string;
  description?: string;
  conditions?: FilterCondition[];
  action?: FilterActionValue;
  isActive?: boolean;
  priority?: number;
}

export interface TestFilterPayload {
  conditions: FilterCondition[];
  event: {
    type: string;
    repository: string;
    author: string;
    riskLevel?: string;
    body?: string;
  };
}

export interface TestFilterResult {
  matched: boolean;
  action: FilterActionValue | null;
}
