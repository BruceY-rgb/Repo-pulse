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

export interface MonitoringScopePreferences {
  repositoryIds?: string[];
  branchNames?: string[];
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
  _count?: {
    events: number;
  };
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
  metadata: Record<string, unknown>;
  rawPayload: Record<string, unknown> | null;
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
