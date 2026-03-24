export const APP_NAME = 'Repo-Pulse';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export const AI_TIMEOUT_MS = 30000;
export const AI_MAX_RETRIES = 3;

export const QUEUE_NAMES = {
  WEBHOOK_EVENTS: 'webhook-events',
  AI_ANALYSIS: 'ai-analysis',
  NOTIFICATIONS: 'notifications',
  REPORT_GENERATION: 'report-generation',
  REPOSITORY_SYNC: 'repository-sync',
} as const;
