import { BadRequestException } from '@nestjs/common';
import { EventProcessor } from '../../src/modules/event/event.processor';

jest.mock('@repo-pulse/database', () => ({
  EventType: {
    PUSH: 'PUSH',
    PR_OPENED: 'PR_OPENED',
    PR_MERGED: 'PR_MERGED',
    PR_CLOSED: 'PR_CLOSED',
    PR_REVIEW: 'PR_REVIEW',
    ISSUE_OPENED: 'ISSUE_OPENED',
    ISSUE_CLOSED: 'ISSUE_CLOSED',
    ISSUE_COMMENT: 'ISSUE_COMMENT',
    RELEASE: 'RELEASE',
    BRANCH_CREATED: 'BRANCH_CREATED',
    BRANCH_DELETED: 'BRANCH_DELETED',
  },
  PrismaClient: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('@nestjs/bullmq', () => ({
  Processor: () => () => {},
  WorkerHost: class {
    async process(_job: any) {}
  },
  OnWorkerEvent: () => () => {},
  InjectQueue: () => () => {},
}));

jest.mock('../../src/modules/event/event.service', () => ({
  EventService: jest.fn(),
}));

const mockResolveGithub = jest.fn();
const mockResolveGitlab = jest.fn();
const mockMergeMetadata = jest.fn();

jest.mock('../../src/modules/event/event-time.util', () => ({
  resolveGithubWebhookOccurredAt: (...a: any[]) => mockResolveGithub(...a),
  resolveGitlabWebhookOccurredAt: (...a: any[]) => mockResolveGitlab(...a),
  mergeMetadata: (...a: any[]) => mockMergeMetadata(...a),
}));

function makeJob(data: object) {
  return { data, id: 'job-1' } as any;
}

function makeTimeResolution() {
  return { occurredAt: new Date('2024-01-01'), metadataPatch: {} };
}

describe('EventProcessor', () => {
  let processor: EventProcessor;
  let mockEventService: { findByExternalId: jest.Mock; create: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    mockResolveGithub.mockReturnValue(makeTimeResolution());
    mockResolveGitlab.mockReturnValue(makeTimeResolution());
    mockMergeMetadata.mockImplementation((meta: object, patch: object) => ({ ...meta, ...patch }));

    mockEventService = {
      findByExternalId: jest.fn(),
      create: jest.fn().mockResolvedValue({}),
    };
    processor = new EventProcessor(mockEventService as any);
  });

  // ── process — duplicate skip ──────────────────────────────────────────────
  it('skips processing when event already exists', async () => {
    mockEventService.findByExternalId.mockResolvedValue({ id: 'existing' });
    await processor.process(makeJob({
      repositoryId: 'r1', platform: 'github', eventType: 'PUSH',
      payload: { after: 'sha123' },
    }));
    expect(mockEventService.create).not.toHaveBeenCalled();
  });

  // ── process — successful creation ─────────────────────────────────────────
  it('creates event when no duplicate exists', async () => {
    mockEventService.findByExternalId.mockResolvedValue(null);
    await processor.process(makeJob({
      repositoryId: 'r1', platform: 'github', eventType: 'PUSH',
      payload: {
        after: 'sha123',
        ref: 'refs/heads/main',
        commits: [{ message: 'fix: bug', author: { name: 'Alice' } }],
        sender: { login: 'alice', avatar_url: 'https://av.com' },
      },
    }));
    expect(mockEventService.create).toHaveBeenCalledWith(
      expect.objectContaining({ repositoryId: 'r1', type: 'PUSH', externalId: 'sha123', branch: 'main', author: 'Alice' }),
    );
  });

  // ── process — uses receivedAt when provided ───────────────────────────────
  it('uses provided receivedAt timestamp', async () => {
    mockEventService.findByExternalId.mockResolvedValue(null);
    const receivedAt = '2024-06-01T12:00:00.000Z';
    await processor.process(makeJob({
      repositoryId: 'r1', platform: 'github', eventType: 'PUSH',
      payload: { after: 'sha1', ref: 'refs/heads/main', commits: [], sender: { login: 'u', avatar_url: '' } },
      receivedAt,
    }));
    expect(mockResolveGithub).toHaveBeenCalledWith(
      expect.anything(), expect.anything(), new Date(receivedAt),
    );
  });

  // ── process — error wrapping ──────────────────────────────────────────────
  it('throws BadRequestException when processing fails', async () => {
    mockEventService.findByExternalId.mockRejectedValue(new Error('DB error'));
    await expect(processor.process(makeJob({
      repositoryId: 'r1', platform: 'github', eventType: 'PUSH',
      payload: { after: 'sha123' },
    }))).rejects.toThrow(BadRequestException);
  });

  // ── extractExternalId — GitHub ────────────────────────────────────────────
  describe('GitHub extractExternalId', () => {
    beforeEach(() => {
      mockEventService.findByExternalId.mockResolvedValue({ id: 'existing' });
    });

    it('uses payload.after for PUSH', async () => {
      await processor.process(makeJob({ repositoryId: 'r1', platform: 'github', eventType: 'PUSH', payload: { after: 'sha-abc' } }));
      expect(mockEventService.findByExternalId).toHaveBeenCalledWith('r1', 'sha-abc');
    });

    it.each(['PR_OPENED', 'PR_MERGED', 'PR_CLOSED', 'PR_REVIEW'])(
      'uses pull_request.id for %s',
      async (eventType) => {
        await processor.process(makeJob({ repositoryId: 'r1', platform: 'github', eventType, payload: { pull_request: { id: 9999 } } }));
        expect(mockEventService.findByExternalId).toHaveBeenCalledWith('r1', '9999');
      },
    );

    it.each(['ISSUE_OPENED', 'ISSUE_CLOSED'])(
      'uses issue.id for %s',
      async (eventType) => {
        await processor.process(makeJob({ repositoryId: 'r1', platform: 'github', eventType, payload: { issue: { id: 8888 } } }));
        expect(mockEventService.findByExternalId).toHaveBeenCalledWith('r1', '8888');
      },
    );

    it('uses comment.id for ISSUE_COMMENT', async () => {
      await processor.process(makeJob({ repositoryId: 'r1', platform: 'github', eventType: 'ISSUE_COMMENT', payload: { comment: { id: 7777 } } }));
      expect(mockEventService.findByExternalId).toHaveBeenCalledWith('r1', '7777');
    });

    it('uses release.tag_name for RELEASE', async () => {
      await processor.process(makeJob({ repositoryId: 'r1', platform: 'github', eventType: 'RELEASE', payload: { release: { tag_name: 'v1.0.0' } } }));
      expect(mockEventService.findByExternalId).toHaveBeenCalledWith('r1', 'v1.0.0');
    });
  });

  // ── extractExternalId — GitLab ────────────────────────────────────────────
  describe('GitLab extractExternalId', () => {
    beforeEach(() => {
      mockEventService.findByExternalId.mockResolvedValue({ id: 'existing' });
    });

    it('uses checkout_sha for PUSH', async () => {
      await processor.process(makeJob({ repositoryId: 'r1', platform: 'gitlab', eventType: 'PUSH', payload: { checkout_sha: 'gl-sha' } }));
      expect(mockEventService.findByExternalId).toHaveBeenCalledWith('r1', 'gl-sha');
    });

    it.each(['PR_OPENED', 'PR_MERGED', 'PR_CLOSED', 'ISSUE_OPENED', 'ISSUE_CLOSED', 'ISSUE_COMMENT'])(
      'uses object_attributes.id for %s',
      async (eventType) => {
        await processor.process(makeJob({ repositoryId: 'r1', platform: 'gitlab', eventType, payload: { object_attributes: { id: 5555 } } }));
        expect(mockEventService.findByExternalId).toHaveBeenCalledWith('r1', '5555');
      },
    );
  });

  // ── normalizeGithubEvent ──────────────────────────────────────────────────
  describe('normalizeGithubEvent', () => {
    beforeEach(() => {
      mockEventService.findByExternalId.mockResolvedValue(null);
    });

    it('normalizes PUSH: extracts branch, author, commitsCount', async () => {
      await processor.process(makeJob({
        repositoryId: 'r1', platform: 'github', eventType: 'PUSH',
        payload: {
          after: 'sha1', ref: 'refs/heads/feature',
          commits: [{ message: 'feat: add X', author: { name: 'Bob' } }],
          sender: { login: 'bob', avatar_url: 'av' },
        },
      }));
      expect(mockEventService.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'PUSH', title: 'Push to feature', branch: 'feature', author: 'Bob' }),
      );
    });

    it('normalizes PR_OPENED: extracts title, author, sourceBranch, targetBranch', async () => {
      await processor.process(makeJob({
        repositoryId: 'r1', platform: 'github', eventType: 'PR_OPENED',
        payload: {
          pull_request: {
            id: 1, title: 'Add feature', body: 'desc',
            user: { login: 'alice', avatar_url: 'av' },
            html_url: 'https://github.com/pr/1', number: 42,
            head: { ref: 'feature' }, base: { ref: 'main' },
          },
        },
      }));
      expect(mockEventService.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'PR_OPENED', title: 'Add feature', author: 'alice', sourceBranch: 'feature', targetBranch: 'main' }),
      );
    });

    it('normalizes PR_MERGED: includes mergedAt in metadata', async () => {
      await processor.process(makeJob({
        repositoryId: 'r1', platform: 'github', eventType: 'PR_MERGED',
        payload: {
          pull_request: {
            id: 2, title: 'Merge feat', body: '', user: { login: 'alice', avatar_url: 'av' },
            html_url: 'url', number: 10, merged_at: '2024-01-01T00:00:00Z',
            head: { ref: 'feat' }, base: { ref: 'main' },
          },
        },
      }));
      expect(mockEventService.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'PR_MERGED', title: 'Merge feat', action: 'merged' }),
      );
    });

    it('normalizes PR_CLOSED', async () => {
      await processor.process(makeJob({
        repositoryId: 'r1', platform: 'github', eventType: 'PR_CLOSED',
        payload: {
          pull_request: {
            id: 3, title: 'Close PR', body: '', user: { login: 'alice', avatar_url: 'av' },
            html_url: 'url', number: 11, head: { ref: 'feat' }, base: { ref: 'main' },
          },
        },
      }));
      expect(mockEventService.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'PR_CLOSED', action: 'closed' }),
      );
    });

    it('normalizes PR_REVIEW: uses review.user as author', async () => {
      await processor.process(makeJob({
        repositoryId: 'r1', platform: 'github', eventType: 'PR_REVIEW',
        payload: {
          pull_request: { id: 4, title: 'Review PR', user: { login: 'alice', avatar_url: 'av' }, html_url: 'url', number: 12, head: { ref: 'feat' }, base: { ref: 'main' } },
          review: { body: 'LGTM', user: { login: 'reviewer', avatar_url: 'rav' } },
          action: 'submitted',
        },
      }));
      expect(mockEventService.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'PR_REVIEW', author: 'reviewer', action: 'submitted' }),
      );
    });

    it('normalizes ISSUE_OPENED', async () => {
      await processor.process(makeJob({
        repositoryId: 'r1', platform: 'github', eventType: 'ISSUE_OPENED',
        payload: {
          issue: { id: 100, title: 'Bug report', body: 'details', user: { login: 'carol', avatar_url: 'av' }, html_url: 'url', number: 5 },
        },
      }));
      expect(mockEventService.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'ISSUE_OPENED', title: 'Bug report', author: 'carol', action: 'opened' }),
      );
    });

    it('normalizes ISSUE_CLOSED', async () => {
      await processor.process(makeJob({
        repositoryId: 'r1', platform: 'github', eventType: 'ISSUE_CLOSED',
        payload: {
          issue: { id: 101, title: 'Fixed bug', body: '', user: { login: 'carol', avatar_url: 'av' }, html_url: 'url', number: 6 },
        },
      }));
      expect(mockEventService.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'ISSUE_CLOSED', action: 'closed' }),
      );
    });

    it('normalizes ISSUE_COMMENT: title includes issue title', async () => {
      await processor.process(makeJob({
        repositoryId: 'r1', platform: 'github', eventType: 'ISSUE_COMMENT',
        payload: {
          comment: { id: 200, body: 'nice fix', user: { login: 'dave', avatar_url: 'av' }, html_url: 'url' },
          issue: { title: 'Bug report', number: 5 },
        },
      }));
      expect(mockEventService.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'ISSUE_COMMENT', title: 'Comment on: Bug report', author: 'dave' }),
      );
    });

    it('normalizes RELEASE', async () => {
      await processor.process(makeJob({
        repositoryId: 'r1', platform: 'github', eventType: 'RELEASE',
        payload: {
          release: { tag_name: 'v2.0.0', name: 'Release v2.0.0', body: 'notes', author: { login: 'alice', avatar_url: 'av' }, html_url: 'url' },
        },
      }));
      expect(mockEventService.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'RELEASE', title: 'Release v2.0.0', author: 'alice' }),
      );
    });

    it('normalizes BRANCH_CREATED', async () => {
      await processor.process(makeJob({
        repositoryId: 'r1', platform: 'github', eventType: 'BRANCH_CREATED',
        payload: { ref: 'feature-x', sender: { login: 'alice', avatar_url: 'av' } },
      }));
      expect(mockEventService.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'BRANCH_CREATED', title: 'Branch created: feature-x', branch: 'feature-x' }),
      );
    });

    it('normalizes BRANCH_DELETED with branch refType', async () => {
      await processor.process(makeJob({
        repositoryId: 'r1', platform: 'github', eventType: 'BRANCH_DELETED',
        payload: { ref: 'old-branch', ref_type: 'branch', sender: { login: 'alice', avatar_url: 'av' } },
      }));
      expect(mockEventService.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'BRANCH_DELETED', title: 'Branch deleted: old-branch' }),
      );
    });

    it('normalizes BRANCH_DELETED with tag refType', async () => {
      await processor.process(makeJob({
        repositoryId: 'r1', platform: 'github', eventType: 'BRANCH_DELETED',
        payload: { ref: 'v1.0.0', ref_type: 'tag', sender: { login: 'alice', avatar_url: 'av' } },
      }));
      expect(mockEventService.create).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Tag deleted: v1.0.0' }),
      );
    });

    it('normalizes unknown eventType to fallback (PUSH/Unknown Event)', async () => {
      await processor.process(makeJob({
        repositoryId: 'r1', platform: 'github', eventType: 'STAR_ADDED',
        payload: { sender: { login: 'alice', avatar_url: 'av' } },
      }));
      expect(mockEventService.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'PUSH', title: 'Unknown Event', action: 'unknown' }),
      );
    });
  });

  // ── normalizeGitlabEvent ──────────────────────────────────────────────────
  describe('normalizeGitlabEvent', () => {
    beforeEach(() => {
      mockEventService.findByExternalId.mockResolvedValue(null);
    });

    it('normalizes PUSH: extracts branch from ref', async () => {
      await processor.process(makeJob({
        repositoryId: 'r1', platform: 'gitlab', eventType: 'PUSH',
        payload: {
          checkout_sha: 'gl-sha', ref: 'refs/heads/develop',
          commits: [{ message: 'fix: bug', author: { name: 'GitUser' } }],
          user: { username: 'gituser', avatar_url: 'av' },
          project: { path_with_namespace: 'org/repo', web_url: 'https://gl.com/repo' },
        },
      }));
      expect(mockEventService.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'PUSH', title: 'Push to develop', branch: 'develop', author: 'GitUser' }),
      );
    });

    it('normalizes PR_OPENED: extracts sourceBranch and targetBranch', async () => {
      await processor.process(makeJob({
        repositoryId: 'r1', platform: 'gitlab', eventType: 'PR_OPENED',
        payload: {
          object_attributes: { id: 100, iid: 10, title: 'New MR', description: 'desc', url: 'https://gl.com/mr', source_branch: 'feat', target_branch: 'main', author_id: 42 },
          user: { username: 'gituser', avatar_url: 'av' },
        },
      }));
      expect(mockEventService.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'PR_OPENED', title: 'New MR', sourceBranch: 'feat', targetBranch: 'main' }),
      );
    });

    it('normalizes PR_MERGED', async () => {
      await processor.process(makeJob({
        repositoryId: 'r1', platform: 'gitlab', eventType: 'PR_MERGED',
        payload: {
          object_attributes: { id: 101, title: 'Merged MR', description: '', url: 'url', source_branch: 'feat', target_branch: 'main', author_id: 1 },
          user: { username: 'gituser', avatar_url: 'av' },
        },
      }));
      expect(mockEventService.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'PR_MERGED', action: 'merge' }),
      );
    });

    it('normalizes PR_CLOSED', async () => {
      await processor.process(makeJob({
        repositoryId: 'r1', platform: 'gitlab', eventType: 'PR_CLOSED',
        payload: {
          object_attributes: { id: 102, title: 'Closed MR', description: '', url: 'url', source_branch: 'feat', target_branch: 'main', author_id: 1 },
          user: { username: 'gituser', avatar_url: 'av' },
        },
      }));
      expect(mockEventService.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'PR_CLOSED', action: 'close' }),
      );
    });

    it('normalizes PR_REVIEW: uses note.body', async () => {
      await processor.process(makeJob({
        repositoryId: 'r1', platform: 'gitlab', eventType: 'PR_REVIEW',
        payload: {
          object_attributes: { id: 103, title: 'MR Review', url: 'url', action: 'approval', source_branch: 'feat', target_branch: 'main' },
          note: { body: 'Approved!' },
          user: { username: 'reviewer', avatar_url: 'av' },
        },
      }));
      expect(mockEventService.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'PR_REVIEW', author: 'reviewer' }),
      );
    });

    it('normalizes ISSUE_OPENED', async () => {
      await processor.process(makeJob({
        repositoryId: 'r1', platform: 'gitlab', eventType: 'ISSUE_OPENED',
        payload: {
          object_attributes: { id: 200, iid: 20, title: 'GL Bug', description: 'desc', url: 'url', author_id: 1 },
          user: { username: 'gituser', avatar_url: 'av' },
        },
      }));
      expect(mockEventService.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'ISSUE_OPENED', title: 'GL Bug', action: 'open' }),
      );
    });

    it('normalizes ISSUE_CLOSED', async () => {
      await processor.process(makeJob({
        repositoryId: 'r1', platform: 'gitlab', eventType: 'ISSUE_CLOSED',
        payload: {
          object_attributes: { id: 201, title: 'Resolved', description: '', url: 'url', author_id: 1 },
          user: { username: 'gituser', avatar_url: 'av' },
        },
      }));
      expect(mockEventService.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'ISSUE_CLOSED', action: 'close' }),
      );
    });

    it('normalizes ISSUE_COMMENT: title includes object_attributes.title', async () => {
      await processor.process(makeJob({
        repositoryId: 'r1', platform: 'gitlab', eventType: 'ISSUE_COMMENT',
        payload: {
          object_attributes: { id: 300, title: 'Bug #1', url: 'url' },
          note: { body: 'Fixed in next release' },
          user: { username: 'gituser', avatar_url: 'av' },
        },
      }));
      expect(mockEventService.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'ISSUE_COMMENT', title: 'Comment on: Bug #1', author: 'gituser' }),
      );
    });

    it('normalizes RELEASE', async () => {
      await processor.process(makeJob({
        repositoryId: 'r1', platform: 'gitlab', eventType: 'RELEASE',
        payload: {
          tag: { name: 'v3.0.0' },
          object_attributes: { description: 'release notes' },
          user: { username: 'gituser', avatar_url: 'av' },
          project: { web_url: 'https://gl.com/repo' },
        },
      }));
      expect(mockEventService.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'RELEASE', title: 'Release v3.0.0', author: 'gituser' }),
      );
    });

    it('normalizes unknown GitLab eventType to fallback', async () => {
      await processor.process(makeJob({
        repositoryId: 'r1', platform: 'gitlab', eventType: 'UNKNOWN_GL',
        payload: { user: { username: 'gituser', avatar_url: 'av' }, project: { web_url: 'url' } },
      }));
      expect(mockEventService.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'PUSH', title: 'Unknown Event', action: 'unknown' }),
      );
    });
  });
});
