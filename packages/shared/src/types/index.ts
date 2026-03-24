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
