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
  preferences: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
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
}
