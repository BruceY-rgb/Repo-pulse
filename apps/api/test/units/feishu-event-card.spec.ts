import { ImSubscriptionDto } from '../../src/modules/im/dto/im.dto';
import {
  DEFAULT_FEISHU_GITHUB_EVENTS,
  buildFeishuRepositoryEventCard,
  formatFeishuRepositoryEventText,
  matchesFeishuSubscription,
  normalizeFeishuSubscriptionEvents,
} from '../../src/modules/im/feishu-event-card';

function subscription(overrides: Partial<ImSubscriptionDto> = {}): ImSubscriptionDto {
  return {
    id: 'sub-1',
    chatId: 'oc_test',
    chatName: 'Repo Pulse',
    repositoryIds: [],
    branches: [],
    events: [],
    enabled: true,
    ...overrides,
  };
}

const event = {
  eventId: 'evt-1',
  repositoryId: 'repo-1',
  repositoryName: 'repo-pulse/api',
  eventType: 'PR_OPENED',
  title: 'Add Feishu event cards',
  content: 'Adds structured interactive cards for GitHub events.',
  author: 'alice',
  sourceBranch: 'feature/feishu-cards',
  targetBranch: 'main',
  externalUrl: 'https://github.com/example/repo/pull/1',
};

describe('Feishu event cards and subscription matching', () => {
  it('uses the default GitHub event set when subscription events are empty or legacy-only', () => {
    expect(normalizeFeishuSubscriptionEvents([])).toEqual(DEFAULT_FEISHU_GITHUB_EVENTS);
    expect(normalizeFeishuSubscriptionEvents(['highRisk', 'prUpdates', 'analysisComplete'])).toEqual(
      DEFAULT_FEISHU_GITHUB_EVENTS,
    );
  });

  it('matches all monitored repositories when repositoryIds is empty', () => {
    expect(matchesFeishuSubscription(subscription({ branches: ['main'] }), event)).toBe(true);
  });

  it('filters by repository id', () => {
    expect(matchesFeishuSubscription(subscription({ repositoryIds: ['repo-2'] }), event)).toBe(false);
    expect(matchesFeishuSubscription(subscription({ repositoryIds: ['repo-1'] }), event)).toBe(true);
  });

  it('filters by exact and wildcard branch scopes', () => {
    expect(matchesFeishuSubscription(subscription({ branches: ['release/*'] }), {
      ...event,
      sourceBranch: 'release/1.0',
      targetBranch: 'main',
    })).toBe(true);
    expect(matchesFeishuSubscription(subscription({ branches: ['develop'] }), event)).toBe(false);
    expect(matchesFeishuSubscription(subscription({ branches: ['*'] }), event)).toBe(true);
  });

  it('prefers repository-specific branch scopes when present', () => {
    expect(matchesFeishuSubscription(subscription({
      repositoryIds: ['repo-1'],
      branches: ['main'],
      repositoryBranchScopes: {
        'repo-1': ['release/*'],
      },
    }), {
      ...event,
      sourceBranch: 'release/1.0',
      targetBranch: 'main',
    })).toBe(true);

    expect(matchesFeishuSubscription(subscription({
      repositoryIds: ['repo-1'],
      branches: ['main'],
      repositoryBranchScopes: {
        'repo-1': ['develop'],
      },
    }), {
      ...event,
      sourceBranch: 'release/1.0',
      targetBranch: 'main',
    })).toBe(false);

    expect(matchesFeishuSubscription(subscription({
      repositoryIds: ['repo-1'],
      repositoryBranchScopes: {
        'repo-1': [],
      },
    }), event)).toBe(true);
  });

  it('filters by event type and skips disabled subscriptions without chatId', () => {
    expect(matchesFeishuSubscription(subscription({ events: ['PUSH'] }), event)).toBe(false);
    expect(matchesFeishuSubscription(subscription({ events: ['PR_OPENED'] }), event)).toBe(true);
    expect(matchesFeishuSubscription(subscription({ enabled: false }), event)).toBe(false);
    expect(matchesFeishuSubscription(subscription({ chatId: undefined }), event)).toBe(false);
  });

  it('builds an interactive Feishu card with required GitHub event fields', () => {
    const card = buildFeishuRepositoryEventCard(event);

    expect(card.header).toMatchObject({
      template: 'blue',
      title: { tag: 'plain_text', content: 'Repo-Pulse · PR 打开' },
    });
    expect(JSON.stringify(card)).toContain('repo-pulse/api');
    expect(JSON.stringify(card)).toContain('Add Feishu event cards');
    expect(JSON.stringify(card)).toContain('feature/feishu-cards -> main');
    expect(JSON.stringify(card)).toContain('查看 GitHub');
  });

  it('formats a text fallback with the external GitHub URL', () => {
    const text = formatFeishuRepositoryEventText(event);

    expect(text).toContain('Repo-Pulse GitHub 更新');
    expect(text).toContain('repo-pulse/api · PR 打开');
    expect(text).toContain('链接：https://github.com/example/repo/pull/1');
  });
});
