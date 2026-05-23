import { BadRequestException } from '@nestjs/common';
import { createHmac } from 'crypto';
import { WebhookService } from '../../src/modules/webhook/webhook.service';

const mockRepoFindFirst = jest.fn();

jest.mock('@repo-pulse/database', () => ({
  Platform: { GITHUB: 'GITHUB', GITLAB: 'GITLAB' },
  PrismaClient: jest.fn().mockImplementation(() => ({
    repository: { findFirst: mockRepoFindFirst },
  })),
}));

function sign(secret: string, body: string): string {
  return 'sha256=' + createHmac('sha256', secret).update(Buffer.from(body)).digest('hex');
}

const SECRET = 'test-secret-abc';

function makeRepo(overrides: object = {}) {
  return { id: 'repo-1', webhookSecret: SECRET, fullName: 'org/repo', ...overrides };
}

describe('WebhookService', () => {
  let service: WebhookService;
  let mockQueueAdd: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockQueueAdd = jest.fn().mockResolvedValue({ id: 'job-1' });
    service = new WebhookService({ add: mockQueueAdd } as any);
  });

  // ── GitHub payload validation ─────────────────────────────────────────────
  it('throws when github payload missing repository field', async () => {
    await expect(service.handleGithubWebhook(undefined, 'push', undefined, {}))
      .rejects.toThrow(BadRequestException);
  });

  it('returns silently when github repo not registered', async () => {
    mockRepoFindFirst.mockResolvedValue(null);
    await expect(
      service.handleGithubWebhook(undefined, 'push', undefined, {
        repository: { id: 999, full_name: 'ghost/repo' },
      }),
    ).resolves.toBeUndefined();
    expect(mockQueueAdd).not.toHaveBeenCalled();
  });

  // ── GitHub signature ──────────────────────────────────────────────────────
  it('throws when rawBody missing during signature check', async () => {
    mockRepoFindFirst.mockResolvedValue(makeRepo());
    await expect(
      service.handleGithubWebhook('sha256=xxx', 'push', undefined, {
        repository: { id: 1, full_name: 'org/repo' },
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws on wrong signature', async () => {
    mockRepoFindFirst.mockResolvedValue(makeRepo());
    const raw = Buffer.from('{}');
    await expect(
      service.handleGithubWebhook('sha256=bad', 'push', raw, {
        repository: { id: 1, full_name: 'org/repo' },
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws when secret set but signature header absent', async () => {
    mockRepoFindFirst.mockResolvedValue(makeRepo());
    await expect(
      service.handleGithubWebhook(undefined, 'push', Buffer.from('{}'), {
        repository: { id: 1, full_name: 'org/repo' },
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('queues event with valid HMAC signature', async () => {
    mockRepoFindFirst.mockResolvedValue(makeRepo());
    const payload = { repository: { id: 1, full_name: 'org/repo' } };
    const body = JSON.stringify(payload);
    await service.handleGithubWebhook(sign(SECRET, body), 'push', Buffer.from(body), payload);
    expect(mockQueueAdd).toHaveBeenCalledWith(
      'process-webhook-event',
      expect.objectContaining({ repositoryId: 'repo-1', eventType: 'PUSH' }),
    );
  });

  it('skips signature check when repo has no webhookSecret', async () => {
    mockRepoFindFirst.mockResolvedValue(makeRepo({ webhookSecret: null }));
    await service.handleGithubWebhook(undefined, 'push', Buffer.from(''), {
      repository: { id: 1, full_name: 'org/repo' },
    });
    expect(mockQueueAdd).toHaveBeenCalled();
  });

  // ── GitHub event type mapping ─────────────────────────────────────────────
  async function triggerGithub(event: string, extra: object = {}) {
    jest.clearAllMocks();
    mockRepoFindFirst.mockResolvedValue(makeRepo({ webhookSecret: null }));
    mockQueueAdd.mockResolvedValue({ id: 'j' });
    const payload = { repository: { id: 1, full_name: 'org/repo' }, ...extra };
    await service.handleGithubWebhook(undefined, event, Buffer.from(''), payload);
    return mockQueueAdd.mock.calls[0]?.[1]?.eventType ?? null;
  }

  it('push → PUSH', async () => expect(await triggerGithub('push')).toBe('PUSH'));
  it('pull_request opened → PR_OPENED', async () =>
    expect(await triggerGithub('pull_request', { action: 'opened' })).toBe('PR_OPENED'));
  it('pull_request closed+merged → PR_MERGED', async () =>
    expect(await triggerGithub('pull_request', { action: 'closed', pull_request: { merged: true } })).toBe('PR_MERGED'));
  it('pull_request closed → PR_CLOSED', async () =>
    expect(await triggerGithub('pull_request', { action: 'closed', pull_request: { merged: false } })).toBe('PR_CLOSED'));
  it('pull_request submitted → PR_REVIEW', async () =>
    expect(await triggerGithub('pull_request', { action: 'submitted' })).toBe('PR_REVIEW'));
  it('issues opened → ISSUE_OPENED', async () =>
    expect(await triggerGithub('issues', { action: 'opened' })).toBe('ISSUE_OPENED'));
  it('issues closed → ISSUE_CLOSED', async () =>
    expect(await triggerGithub('issues', { action: 'closed' })).toBe('ISSUE_CLOSED'));
  it('issue_comment → ISSUE_COMMENT', async () =>
    expect(await triggerGithub('issue_comment')).toBe('ISSUE_COMMENT'));
  it('release published → RELEASE', async () =>
    expect(await triggerGithub('release', { action: 'published' })).toBe('RELEASE'));
  it('create → BRANCH_CREATED', async () =>
    expect(await triggerGithub('create')).toBe('BRANCH_CREATED'));
  it('delete branch → BRANCH_DELETED', async () =>
    expect(await triggerGithub('delete', { ref_type: 'branch' })).toBe('BRANCH_DELETED'));
  it('unknown github event → not queued', async () =>
    expect(await triggerGithub('ping')).toBeNull());

  // ── GitLab ────────────────────────────────────────────────────────────────
  it('throws when gitlab payload missing project field', async () => {
    await expect(service.handleGitlabWebhook(undefined, {})).rejects.toThrow(BadRequestException);
  });

  it('returns silently for unregistered gitlab repo', async () => {
    mockRepoFindFirst.mockResolvedValue(null);
    await expect(
      service.handleGitlabWebhook(undefined, { project: { id: 1, path_with_namespace: 'g/r' } }),
    ).resolves.toBeUndefined();
    expect(mockQueueAdd).not.toHaveBeenCalled();
  });

  it('throws on wrong gitlab token', async () => {
    mockRepoFindFirst.mockResolvedValue(makeRepo());
    await expect(
      service.handleGitlabWebhook('bad', { project: { id: 1, path_with_namespace: 'g/r' } }),
    ).rejects.toThrow(BadRequestException);
  });

  it('queues gitlab push with correct token', async () => {
    mockRepoFindFirst.mockResolvedValue(makeRepo());
    await service.handleGitlabWebhook(SECRET, {
      project: { id: 1, path_with_namespace: 'g/r' },
      object_kind: 'push',
    });
    expect(mockQueueAdd).toHaveBeenCalledWith(
      'process-webhook-event',
      expect.objectContaining({ platform: 'gitlab', eventType: 'PUSH' }),
    );
  });

  // ── GitLab event type mapping ─────────────────────────────────────────────
  async function triggerGitlab(kind: string, extra: object = {}) {
    jest.clearAllMocks();
    mockRepoFindFirst.mockResolvedValue(makeRepo({ webhookSecret: null }));
    mockQueueAdd.mockResolvedValue({ id: 'j' });
    const payload = { project: { id: 1, path_with_namespace: 'g/r' }, object_kind: kind, ...extra };
    await service.handleGitlabWebhook(undefined, payload);
    return mockQueueAdd.mock.calls[0]?.[1]?.eventType ?? null;
  }

  it('gitlab push → PUSH', async () => expect(await triggerGitlab('push')).toBe('PUSH'));
  it('gitlab merge_request open → PR_OPENED', async () =>
    expect(await triggerGitlab('merge_request', { object_attributes: { action: 'open' } })).toBe('PR_OPENED'));
  it('gitlab merge_request merge → PR_MERGED', async () =>
    expect(await triggerGitlab('merge_request', { object_attributes: { action: 'merge' } })).toBe('PR_MERGED'));
  it('gitlab merge_request close → PR_CLOSED', async () =>
    expect(await triggerGitlab('merge_request', { object_attributes: { action: 'close' } })).toBe('PR_CLOSED'));
  it('gitlab issue opened → ISSUE_OPENED', async () =>
    expect(await triggerGitlab('issue', { object_attributes: { state: 'opened' } })).toBe('ISSUE_OPENED'));
  it('gitlab issue closed → ISSUE_CLOSED', async () =>
    expect(await triggerGitlab('issue', { object_attributes: { state: 'closed' } })).toBe('ISSUE_CLOSED'));
  it('gitlab note on Issue → ISSUE_COMMENT', async () =>
    expect(await triggerGitlab('note', { object_attributes: { noteable_type: 'Issue' } })).toBe('ISSUE_COMMENT'));
  it('gitlab tag_push → RELEASE', async () =>
    expect(await triggerGitlab('tag_push')).toBe('RELEASE'));
});
