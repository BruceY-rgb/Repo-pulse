import { ImSubscriptionDto } from './dto/im.dto';

export const GITHUB_EVENT_TYPES = [
  'PUSH',
  'PR_OPENED',
  'PR_MERGED',
  'PR_CLOSED',
  'PR_REVIEW',
  'ISSUE_OPENED',
  'ISSUE_CLOSED',
  'ISSUE_COMMENT',
  'RELEASE',
  'BRANCH_CREATED',
  'BRANCH_DELETED',
] as const;

export const DEFAULT_FEISHU_GITHUB_EVENTS = [
  'PUSH',
  'PR_OPENED',
  'PR_MERGED',
  'PR_CLOSED',
  'ISSUE_OPENED',
  'ISSUE_CLOSED',
] as const;

const GITHUB_EVENT_TYPE_SET = new Set<string>(GITHUB_EVENT_TYPES);
const LEGACY_EVENT_KEYS = new Set(['highRisk', 'prUpdates', 'analysisComplete']);

export interface RepositoryEventNotificationInput {
  eventId: string;
  repositoryId: string;
  repositoryName: string;
  eventType: string;
  title: string;
  content: string;
  author: string;
  externalUrl?: string;
  branch?: string;
  sourceBranch?: string;
  targetBranch?: string;
}

export function normalizeFeishuSubscriptionEvents(events: string[] | undefined): string[] {
  const explicitEvents = (events || []).filter((event) => GITHUB_EVENT_TYPE_SET.has(event));
  if (explicitEvents.length > 0) {
    return Array.from(new Set(explicitEvents));
  }

  const hasOnlyLegacyDefaults = (events || []).length > 0 && (events || []).every((event) => LEGACY_EVENT_KEYS.has(event));
  if (!events?.length || hasOnlyLegacyDefaults) {
    return [...DEFAULT_FEISHU_GITHUB_EVENTS];
  }

  return [];
}

export function matchesFeishuSubscription(
  subscription: ImSubscriptionDto,
  event: Pick<RepositoryEventNotificationInput, 'repositoryId' | 'eventType' | 'branch' | 'sourceBranch' | 'targetBranch'>,
): boolean {
  if (!subscription.enabled || !subscription.chatId) return false;

  const repositoryIds = Array.isArray(subscription.repositoryIds) ? subscription.repositoryIds : [];
  const branches = Array.isArray(subscription.branches) ? subscription.branches : [];
  const repositoryBranchScopes = subscription.repositoryBranchScopes || {};
  if (repositoryIds.length > 0 && !repositoryIds.includes(event.repositoryId)) {
    return false;
  }

  const eventTypes = normalizeFeishuSubscriptionEvents(subscription.events);
  if (eventTypes.length > 0 && !eventTypes.includes(event.eventType)) {
    return false;
  }

  const eventBranches = [event.branch, event.sourceBranch, event.targetBranch]
    .filter((branch): branch is string => typeof branch === 'string' && branch.trim().length > 0);
  const scopedBranches = repositoryBranchScopes[event.repositoryId];
  if (Array.isArray(scopedBranches)) {
    if (scopedBranches.length === 0 || scopedBranches.includes('*') || eventBranches.length === 0) {
      return true;
    }

    return eventBranches.some((branch) =>
      scopedBranches.some((scope) => matchesBranchScope(scope, branch)),
    );
  }

  if (branches.length > 0 && !branches.includes('*') && eventBranches.length > 0) {
    return eventBranches.some((branch) =>
      branches.some((scope) => matchesBranchScope(scope, branch)),
    );
  }

  return true;
}

export function matchesBranchScope(scope: string, branch: string): boolean {
  const normalizedScope = scope.trim();
  const normalizedBranch = branch.trim();
  if (!normalizedScope || normalizedScope === '*') return true;
  if (normalizedScope.endsWith('/*')) {
    return normalizedBranch.startsWith(normalizedScope.slice(0, -1));
  }
  return normalizedScope === normalizedBranch;
}

export function formatFeishuRepositoryEventText(event: RepositoryEventNotificationInput): string {
  return [
    'Repo-Pulse GitHub 更新',
    `${event.repositoryName} · ${getEventTypeLabel(event.eventType)}`,
    formatBranchLine(event),
    `标题：${event.title}`,
    `作者：${event.author}`,
    event.content && event.content !== event.title ? `摘要：${truncateText(event.content, 300)}` : undefined,
    event.externalUrl ? `链接：${event.externalUrl}` : undefined,
  ].filter(Boolean).join('\n');
}

export function buildFeishuRepositoryEventCard(event: RepositoryEventNotificationInput): Record<string, unknown> {
  const branchLine = formatBranchLine(event);
  const summary = event.content && event.content !== event.title
    ? truncateText(event.content, 500)
    : '暂无更多摘要。';

  return {
    config: { wide_screen_mode: true },
    header: {
      template: getEventCardTemplate(event.eventType),
      title: {
        tag: 'plain_text',
        content: `Repo-Pulse · ${getEventTypeLabel(event.eventType)}`,
      },
    },
    elements: [
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `**${escapeMarkdown(event.repositoryName)}**\n${escapeMarkdown(event.title)}`,
        },
      },
      {
        tag: 'div',
        fields: [
          {
            is_short: true,
            text: { tag: 'lark_md', content: `**作者**\n${escapeMarkdown(event.author)}` },
          },
          {
            is_short: true,
            text: { tag: 'lark_md', content: `**事件**\n${escapeMarkdown(event.eventType)}` },
          },
          ...(branchLine ? [{
            is_short: false,
            text: { tag: 'lark_md', content: `**分支**\n${escapeMarkdown(branchLine.replace(/^分支：/, ''))}` },
          }] : []),
        ],
      },
      { tag: 'hr' },
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: escapeMarkdown(summary),
        },
      },
      ...(event.externalUrl ? [
        {
          tag: 'action',
          actions: [
            {
              tag: 'button',
              text: { tag: 'plain_text', content: '查看 GitHub' },
              type: 'primary',
              url: event.externalUrl,
            },
          ],
        },
      ] : []),
    ],
  };
}

function getEventTypeLabel(eventType: string): string {
  const labels: Record<string, string> = {
    PUSH: 'Push',
    PR_OPENED: 'PR 打开',
    PR_MERGED: 'PR 合并',
    PR_CLOSED: 'PR 关闭',
    PR_REVIEW: 'PR Review',
    ISSUE_OPENED: 'Issue 打开',
    ISSUE_CLOSED: 'Issue 关闭',
    ISSUE_COMMENT: 'Issue 评论',
    RELEASE: 'Release',
    BRANCH_CREATED: '分支创建',
    BRANCH_DELETED: '分支删除',
  };
  return labels[eventType] || eventType;
}

function getEventCardTemplate(eventType: string): string {
  if (eventType === 'PR_MERGED' || eventType === 'RELEASE') return 'green';
  if (eventType === 'PR_CLOSED' || eventType === 'BRANCH_DELETED') return 'grey';
  if (eventType.startsWith('ISSUE_')) return 'orange';
  return 'blue';
}

function formatBranchLine(event: Pick<RepositoryEventNotificationInput, 'branch' | 'sourceBranch' | 'targetBranch'>): string | undefined {
  if (event.sourceBranch && event.targetBranch && event.sourceBranch !== event.targetBranch) {
    return `分支：${event.sourceBranch} -> ${event.targetBranch}`;
  }
  const branch = event.branch || event.targetBranch || event.sourceBranch;
  return branch ? `分支：${branch}` : undefined;
}

function truncateText(text: string, maxLength: number): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1)}...`;
}

function escapeMarkdown(text: string): string {
  return text.replace(/\*/g, '\\*').replace(/_/g, '\\_').replace(/`/g, '\\`');
}
