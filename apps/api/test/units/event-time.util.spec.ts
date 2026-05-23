import {
  resolveGithubWebhookOccurredAt,
  resolveGitlabWebhookOccurredAt,
  mergeMetadata,
} from '../../src/modules/event/event-time.util';

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
}));

const BASE_DATE = new Date('2024-01-15T10:00:00Z');

describe('resolveGithubWebhookOccurredAt', () => {
  // ── PUSH ──────────────────────────────────────────────────────────────────
  describe('PUSH', () => {
    it('uses head_commit.timestamp when present', () => {
      const ts = '2024-01-10T08:00:00Z';
      const result = resolveGithubWebhookOccurredAt('PUSH' as any, { head_commit: { timestamp: ts } }, BASE_DATE);
      expect(result.occurredAt).toEqual(new Date(ts));
    });

    it('falls back to last commit.timestamp when no head_commit', () => {
      const ts = '2024-01-11T09:00:00Z';
      const result = resolveGithubWebhookOccurredAt('PUSH' as any, {
        commits: [{ timestamp: '2024-01-09T00:00:00Z' }, { timestamp: ts }],
      }, BASE_DATE);
      expect(result.occurredAt).toEqual(new Date(ts));
    });

    it('falls back to receivedAt when no commit timestamps', () => {
      const result = resolveGithubWebhookOccurredAt('PUSH' as any, { commits: [] }, BASE_DATE);
      expect(result.occurredAt).toEqual(BASE_DATE);
    });

    it('uses head_commit.author.date as secondary timestamp', () => {
      const authorDate = '2024-01-12T07:00:00Z';
      const result = resolveGithubWebhookOccurredAt('PUSH' as any, {
        head_commit: { author: { date: authorDate } },
      }, BASE_DATE);
      expect(result.occurredAt).toEqual(new Date(authorDate));
    });
  });

  // ── PR events ─────────────────────────────────────────────────────────────
  it('PR_OPENED uses pull_request.created_at', () => {
    const ts = '2024-01-05T12:00:00Z';
    const result = resolveGithubWebhookOccurredAt('PR_OPENED' as any, { pull_request: { created_at: ts } }, BASE_DATE);
    expect(result.occurredAt).toEqual(new Date(ts));
  });

  it('PR_OPENED falls back to receivedAt when created_at missing', () => {
    const result = resolveGithubWebhookOccurredAt('PR_OPENED' as any, { pull_request: {} }, BASE_DATE);
    expect(result.occurredAt).toEqual(BASE_DATE);
  });

  it('PR_MERGED uses merged_at first', () => {
    const ts = '2024-01-06T00:00:00Z';
    const result = resolveGithubWebhookOccurredAt('PR_MERGED' as any, {
      pull_request: { merged_at: ts, closed_at: '2024-01-07T00:00:00Z' },
    }, BASE_DATE);
    expect(result.occurredAt).toEqual(new Date(ts));
  });

  it('PR_MERGED falls back to closed_at when merged_at missing', () => {
    const ts = '2024-01-07T00:00:00Z';
    const result = resolveGithubWebhookOccurredAt('PR_MERGED' as any, {
      pull_request: { closed_at: ts },
    }, BASE_DATE);
    expect(result.occurredAt).toEqual(new Date(ts));
  });

  it('PR_CLOSED uses closed_at', () => {
    const ts = '2024-01-08T00:00:00Z';
    const result = resolveGithubWebhookOccurredAt('PR_CLOSED' as any, {
      pull_request: { closed_at: ts },
    }, BASE_DATE);
    expect(result.occurredAt).toEqual(new Date(ts));
  });

  it('PR_REVIEW uses review.submitted_at', () => {
    const ts = '2024-01-09T00:00:00Z';
    const result = resolveGithubWebhookOccurredAt('PR_REVIEW' as any, { review: { submitted_at: ts } }, BASE_DATE);
    expect(result.occurredAt).toEqual(new Date(ts));
  });

  // ── ISSUE events ──────────────────────────────────────────────────────────
  it('ISSUE_OPENED uses issue.created_at', () => {
    const ts = '2024-01-03T00:00:00Z';
    const result = resolveGithubWebhookOccurredAt('ISSUE_OPENED' as any, { issue: { created_at: ts } }, BASE_DATE);
    expect(result.occurredAt).toEqual(new Date(ts));
  });

  it('ISSUE_CLOSED uses issue.closed_at', () => {
    const ts = '2024-01-04T00:00:00Z';
    const result = resolveGithubWebhookOccurredAt('ISSUE_CLOSED' as any, { issue: { closed_at: ts } }, BASE_DATE);
    expect(result.occurredAt).toEqual(new Date(ts));
  });

  it('ISSUE_COMMENT uses comment.created_at', () => {
    const ts = '2024-01-02T00:00:00Z';
    const result = resolveGithubWebhookOccurredAt('ISSUE_COMMENT' as any, { comment: { created_at: ts } }, BASE_DATE);
    expect(result.occurredAt).toEqual(new Date(ts));
  });

  // ── RELEASE ───────────────────────────────────────────────────────────────
  it('RELEASE uses release.published_at', () => {
    const ts = '2024-01-01T00:00:00Z';
    const result = resolveGithubWebhookOccurredAt('RELEASE' as any, { release: { published_at: ts } }, BASE_DATE);
    expect(result.occurredAt).toEqual(new Date(ts));
  });

  it('RELEASE falls back to release.created_at when published_at missing', () => {
    const ts = '2024-01-01T06:00:00Z';
    const result = resolveGithubWebhookOccurredAt('RELEASE' as any, { release: { created_at: ts } }, BASE_DATE);
    expect(result.occurredAt).toEqual(new Date(ts));
  });

  // ── BRANCH events ─────────────────────────────────────────────────────────
  it.each(['BRANCH_CREATED', 'BRANCH_DELETED'])(
    '%s uses receivedAt and sets timeSource in metadataPatch',
    (eventType) => {
      const result = resolveGithubWebhookOccurredAt(eventType as any, {}, BASE_DATE);
      expect(result.occurredAt).toEqual(BASE_DATE);
      expect(result.metadataPatch?.timeSource).toBe('delivery_time_fallback');
    },
  );

  // ── default ───────────────────────────────────────────────────────────────
  it('unknown eventType falls back to receivedAt', () => {
    const result = resolveGithubWebhookOccurredAt('UNKNOWN' as any, {}, BASE_DATE);
    expect(result.occurredAt).toEqual(BASE_DATE);
  });

  // ── invalid date handling ─────────────────────────────────────────────────
  it('ignores invalid date strings and falls back to receivedAt', () => {
    const result = resolveGithubWebhookOccurredAt('PR_OPENED' as any, {
      pull_request: { created_at: 'not-a-date' },
    }, BASE_DATE);
    expect(result.occurredAt).toEqual(BASE_DATE);
  });

  it('ignores non-string timestamp values', () => {
    const result = resolveGithubWebhookOccurredAt('PR_OPENED' as any, {
      pull_request: { created_at: 12345 },
    }, BASE_DATE);
    expect(result.occurredAt).toEqual(BASE_DATE);
  });
});

describe('resolveGitlabWebhookOccurredAt', () => {
  it('PUSH uses commit.timestamp', () => {
    const ts = '2024-02-01T08:00:00Z';
    const result = resolveGitlabWebhookOccurredAt('PUSH' as any, { commit: { timestamp: ts } }, BASE_DATE);
    expect(result.occurredAt).toEqual(new Date(ts));
  });

  it('PUSH falls back to last commits[].timestamp', () => {
    const ts = '2024-02-02T08:00:00Z';
    const result = resolveGitlabWebhookOccurredAt('PUSH' as any, {
      commits: [{ timestamp: '2024-01-01T00:00:00Z' }, { timestamp: ts }],
    }, BASE_DATE);
    expect(result.occurredAt).toEqual(new Date(ts));
  });

  it('PUSH falls back to receivedAt when no timestamps', () => {
    const result = resolveGitlabWebhookOccurredAt('PUSH' as any, {}, BASE_DATE);
    expect(result.occurredAt).toEqual(BASE_DATE);
  });

  it('PR_OPENED uses object_attributes.created_at', () => {
    const ts = '2024-02-05T00:00:00Z';
    const result = resolveGitlabWebhookOccurredAt('PR_OPENED' as any, { object_attributes: { created_at: ts } }, BASE_DATE);
    expect(result.occurredAt).toEqual(new Date(ts));
  });

  it('PR_MERGED uses object_attributes.merged_at first', () => {
    const ts = '2024-02-06T00:00:00Z';
    const result = resolveGitlabWebhookOccurredAt('PR_MERGED' as any, {
      object_attributes: { merged_at: ts, closed_at: '2024-02-07T00:00:00Z' },
    }, BASE_DATE);
    expect(result.occurredAt).toEqual(new Date(ts));
  });

  it('PR_CLOSED uses object_attributes.closed_at', () => {
    const ts = '2024-02-08T00:00:00Z';
    const result = resolveGitlabWebhookOccurredAt('PR_CLOSED' as any, { object_attributes: { closed_at: ts } }, BASE_DATE);
    expect(result.occurredAt).toEqual(new Date(ts));
  });

  it('PR_REVIEW uses object_attributes.created_at', () => {
    const ts = '2024-02-09T00:00:00Z';
    const result = resolveGitlabWebhookOccurredAt('PR_REVIEW' as any, { object_attributes: { created_at: ts } }, BASE_DATE);
    expect(result.occurredAt).toEqual(new Date(ts));
  });

  it('ISSUE_OPENED uses object_attributes.created_at', () => {
    const ts = '2024-02-10T00:00:00Z';
    const result = resolveGitlabWebhookOccurredAt('ISSUE_OPENED' as any, { object_attributes: { created_at: ts } }, BASE_DATE);
    expect(result.occurredAt).toEqual(new Date(ts));
  });

  it('ISSUE_CLOSED uses object_attributes.closed_at', () => {
    const ts = '2024-02-11T00:00:00Z';
    const result = resolveGitlabWebhookOccurredAt('ISSUE_CLOSED' as any, { object_attributes: { closed_at: ts } }, BASE_DATE);
    expect(result.occurredAt).toEqual(new Date(ts));
  });

  it('ISSUE_COMMENT uses object_attributes.created_at', () => {
    const ts = '2024-02-12T00:00:00Z';
    const result = resolveGitlabWebhookOccurredAt('ISSUE_COMMENT' as any, { object_attributes: { created_at: ts } }, BASE_DATE);
    expect(result.occurredAt).toEqual(new Date(ts));
  });

  it('RELEASE uses release.released_at first', () => {
    const ts = '2024-02-13T00:00:00Z';
    const result = resolveGitlabWebhookOccurredAt('RELEASE' as any, {
      release: { released_at: ts, created_at: '2024-02-14T00:00:00Z' },
    }, BASE_DATE);
    expect(result.occurredAt).toEqual(new Date(ts));
  });

  it('RELEASE falls back to release.created_at', () => {
    const ts = '2024-02-14T00:00:00Z';
    const result = resolveGitlabWebhookOccurredAt('RELEASE' as any, { release: { created_at: ts } }, BASE_DATE);
    expect(result.occurredAt).toEqual(new Date(ts));
  });

  it.each(['BRANCH_CREATED', 'BRANCH_DELETED'])(
    '%s uses receivedAt and sets timeSource',
    (eventType) => {
      const result = resolveGitlabWebhookOccurredAt(eventType as any, {}, BASE_DATE);
      expect(result.occurredAt).toEqual(BASE_DATE);
      expect(result.metadataPatch?.timeSource).toBe('delivery_time_fallback');
    },
  );

  it('unknown eventType falls back to receivedAt', () => {
    const result = resolveGitlabWebhookOccurredAt('UNKNOWN_GL' as any, {}, BASE_DATE);
    expect(result.occurredAt).toEqual(BASE_DATE);
  });
});

describe('mergeMetadata', () => {
  it('returns base when patch is undefined', () => {
    const base = { key: 'value' };
    expect(mergeMetadata(base, undefined)).toBe(base);
  });

  it('merges patch over base', () => {
    expect(mergeMetadata({ a: 1, b: 2 }, { b: 99, c: 3 })).toEqual({ a: 1, b: 99, c: 3 });
  });

  it('returns patch only when base is undefined', () => {
    expect(mergeMetadata(undefined, { x: 1 })).toEqual({ x: 1 });
  });

  it('returns empty-ish object when base is undefined and patch is empty', () => {
    expect(mergeMetadata(undefined, {})).toEqual({});
  });
});
