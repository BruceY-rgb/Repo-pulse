export interface ApiResponse<T> {
  code: number;
  data: T;
  message: string;
  timestamp: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  avatar: string | null;
  role: 'ADMIN' | 'MANAGER' | 'MEMBER' | 'VIEWER';
  preferences: UserPreferences;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardPreferences {
  monitoredRepositoryIds?: string[];
}

export type RepositoryBranchScopeMap = Record<string, string[]>;

export interface MonitoringScopePreferences {
  repositoryIds?: string[];
  branchNames?: string[];
  repositoryBranchScopes?: RepositoryBranchScopeMap;
}

export interface UserPreferences {
  dashboard?: DashboardPreferences;
  monitoringScope?: MonitoringScopePreferences;
  [key: string]: unknown;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export type Platform = 'GITHUB' | 'GITLAB';

export interface Repository {
  id: string;
  name: string;
  fullName: string;
  platform: Platform;
  externalId: string;
  url: string;
  defaultBranch: string;
  webhookId: string | null;
  webhookSecret: string | null;
  isActive: boolean;
  lastSyncAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** 用户对该仓库的访问级别 */
  accessLevel?: RepositoryAccessLevel;
  /** 用户是否可操作该仓库（可编辑/写入） */
  canOperate?: boolean;
  /** 该仓库是否为可编辑仓库 */
  isEditable?: boolean;
  /** 该仓库是否为只读监控仓库 */
  isMonitored?: boolean;
  _count?: {
    events: number;
  };
}

export type RepositoryAccessLevel =
  | 'owner'
  | 'admin'
  | 'maintain'
  | 'write'
  | 'triage'
  | 'read'
  | 'none';

export type RepositoryChatKind = 'editable' | 'monitored-readonly';

/** 消息操作按钮（由后端返回） */
export interface MessageAction {
  key: string;
  label: string;
  method: 'POST' | 'GET';
  endpoint?: string;
  requiresConfirmation: boolean;
  /** 是否需要操作权限（canOperate=true 时才渲染） */
  requiresPermission: boolean;
}

/** 风险等级 */
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/** 风险分布计数 */
export interface RiskCounts {
  LOW: number;
  MEDIUM: number;
  HIGH: number;
  CRITICAL: number;
}

/** 侧边栏仓库聊天项 */
export interface ChatRepositoryItem {
  repository: Repository;
  kind: RepositoryChatKind;
  lastReadAt: string | null;
  latestMessageAt: string | null;
  latestMessageType: string | null;
  latestMessagePreview: string | null;
  unreadCount: number;
  unreadRiskLevel: RiskLevel | null;
  unreadRiskCounts: RiskCounts;
  highRiskCount: number;
  hasPendingApproval: boolean;
  pendingApprovalCount: number;
  hasPendingAgentAction: boolean;
  pendingAgentActionCount: number;
  requiresAttention: boolean;
}

/** 工作台仓库列表响应 */
export interface ChatRepositoriesResponse {
  editableRepositories: ChatRepositoryItem[];
  monitoredRepositories: ChatRepositoryItem[];
}

/** 会话状态（来自 Workbench API） */
export interface WorkbenchConversationState {
  repositoryId: string;
  lastReadAt: string | null;
  unreadCount: number;
  unreadRiskLevel: RiskLevel | null;
  unreadRiskCounts: RiskCounts;
  hasPendingApproval: boolean;
  pendingApprovalCount: number;
  hasPendingAgentAction: boolean;
  pendingAgentActionCount: number;
}

/** 会话消息（来自 Workbench API） */
export interface WorkbenchConversationMessage {
  id: string;
  repositoryId: string;
  repositoryAccessLevel: RepositoryAccessLevel;
  repositoryCanOperate: boolean;
  type: 'issue' | 'pull_request' | 'push' | 'release' | 'security' | 'approval' | 'agent' | 'notification';
  title: string;
  body: string;
  author: string;
  authorAvatar?: string;
  createdAt: string;
  externalUrl?: string;
  actions?: MessageAction[];
  /** 风险等级（由后端统一计算） */
  riskLevel?: RiskLevel;
  /** 是否未读 */
  isUnread?: boolean;
  /** 是否有待审批动作 */
  hasPendingApprovalAction?: boolean;
  /** 是否有待 Agent 动作 */
  hasPendingAgentAction?: boolean;
  /** 关联审批 ID */
  approvalId?: string;
  /** 审批状态 */
  approvalStatus?: string;
}

/** 会话消息响应 */
export interface ConversationMessagesResponse {
  conversation: WorkbenchConversationState;
  messages: WorkbenchConversationMessage[];
}

/** 标记已读请求体 */
export interface MarkConversationReadDto {
  readAt?: string;
  upToMessageAt?: string;
}

/** Watch Feed 事件类型 */
export type WatchFeedEventType = 'issue' | 'pull_request' | 'push' | 'release' | 'security';

/** Watch Feed 单项 */
export interface WatchFeedItem {
  id: string;
  repositoryId: string;
  repositoryFullName: string;
  repositoryAvatar?: string;
  type: WatchFeedEventType;
  title: string;
  summary: string;
  author: string;
  authorAvatar?: string;
  occurredAt: string;
  externalUrl?: string;
  aiInsight?: string;
  canAddToMonitoring: boolean;
}

/** Watch Feed 分页响应 */
export interface WatchFeedResponse {
  items: WatchFeedItem[];
  nextCursor: string | null;
}

export interface CreateRepositoryDto {
  platform: Platform;
  owner: string;
  repo: string;
  name?: string;
}

export interface UpdateRepositoryDto {
  name?: string;
  isActive?: boolean;
}

export interface Event {
  id: string;
  repositoryId: string;
  type: string;
  action: string;
  title: string;
  body: string | null;
  author: string;
  authorAvatar: string | null;
  externalId: string;
  externalUrl: string | null;
  branch: string | null;
  sourceBranch: string | null;
  targetBranch: string | null;
  branches: string[];
  metadata: Record<string, unknown>;
  rawPayload: Record<string, unknown> | null;
  occurredAt: string | null;
  createdAt: string;
  repository?: {
    id: string;
    name: string;
    fullName: string;
    platform: Platform;
  };
}

/**
 * 搜索结果仓库（用于添加仓库时的搜索选择）
 */
// ===== AI Analysis =====

export interface Suggestion {
  type: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
}

export interface EventAnalysis {
  id: string;
  eventId: string;
  model: string;
  summary: string;
  summaryShort: string;
  summaryLong: string;
  category: string;
  riskLevel: string;
  riskScore: number;
  riskReasons: string[];
  tags: string[];
  affectedAreas: string[];
  impactSummary: string;
  suggestedAction: string;
  confidence: number;
  keyChanges: string[];
  suggestions: Suggestion[];
  tokensUsed: number;
  latencyMs: number;
  status: string;
  errorMessage?: string;
  promptVersion?: string;
  createdAt: string;
  event?: Event | null;
}

export interface SearchResult {
  id: number;
  name: string;
  fullName: string;
  description: string | null;
  htmlUrl: string;
  stargazersCount: number;
  language: string | null;
  owner: {
    login: string;
    avatarUrl: string;
  };
  platform: Platform;
}

export interface RepositoryBranchScopeOption {
  name: string;
  isDefault: boolean;
  isObserved: boolean;
  isProtected?: boolean;
  lastCommitSha?: string;
}
