import { AIEventNormalizer } from '../../src/modules/ai/ai-event-normalizer';

jest.mock('@repo-pulse/shared', () => ({
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

jest.mock('@repo-pulse/database', () => ({}));
jest.mock('@repo-pulse/ai-sdk', () => ({}));

function makeEvent(overrides: object = {}) {
  return {
    id: 'e1',
    repositoryId: 'r1',
    type: 'PUSH',
    title: 'Push to main branch with changes',
    body: 'feat: add new feature',
    author: 'alice',
    authorAvatar: null,
    externalId: 'sha1',
    externalUrl: null,
    action: null,
    branch: 'main',
    sourceBranch: null,
    targetBranch: null,
    branches: [],
    metadata: {},
    rawPayload: {},
    occurredAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as any;
}

describe('AIEventNormalizer', () => {
  let normalizer: AIEventNormalizer;

  beforeEach(() => {
    normalizer = new AIEventNormalizer();
  });

  // ── shouldAnalyze — event type filter ─────────────────────────────────────
  describe('shouldAnalyze', () => {
    it.each(['PUSH', 'PR_OPENED', 'ISSUE_OPENED'])(
      'returns should=true for MVP event type %s',
      (type) => {
        const result = normalizer.shouldAnalyze(makeEvent({ type, body: 'some content here' }));
        expect(result.should).toBe(true);
      },
    );

    it.each(['PR_MERGED', 'PR_CLOSED', 'PR_REVIEW', 'ISSUE_CLOSED', 'ISSUE_COMMENT', 'RELEASE', 'BRANCH_CREATED', 'BRANCH_DELETED'])(
      'returns should=false for non-MVP event type %s',
      (type) => {
        const result = normalizer.shouldAnalyze(makeEvent({ type }));
        expect(result.should).toBe(false);
        expect(result.reason).toBe(`unsupported_event_type:${type}`);
      },
    );

    it('returns should=false for empty body and short title', () => {
      const result = normalizer.shouldAnalyze(makeEvent({ type: 'PUSH', body: '', title: 'short' }));
      expect(result.should).toBe(false);
      expect(result.reason).toBe('empty_content');
    });

    it('returns should=true when title is >= 10 chars even with no body', () => {
      const result = normalizer.shouldAnalyze(makeEvent({ type: 'PUSH', body: null, title: 'Long enough title here' }));
      expect(result.should).toBe(true);
    });

    it('returns should=true when body is non-empty even with short title', () => {
      const result = normalizer.shouldAnalyze(makeEvent({ type: 'PUSH', body: 'has content', title: 'x' }));
      expect(result.should).toBe(true);
    });

    it('returns should=false when body is only whitespace and title is short', () => {
      const result = normalizer.shouldAnalyze(makeEvent({ type: 'PUSH', body: '   ', title: 'hi' }));
      expect(result.should).toBe(false);
      expect(result.reason).toBe('empty_content');
    });

    it('returns should=false when both title and body are null', () => {
      const result = normalizer.shouldAnalyze(makeEvent({ type: 'PUSH', body: null, title: null }));
      expect(result.should).toBe(false);
    });
  });

  // ── buildAnalysisInput ─────────────────────────────────────────────────────
  describe('buildAnalysisInput', () => {
    it('builds input with event fields', () => {
      const event = makeEvent({ type: 'PUSH', title: 'Push to main', body: 'commit message', author: 'alice' });
      const input = normalizer.buildAnalysisInput(event);
      expect(input.eventType).toBe('PUSH');
      expect(input.title).toBe('Push to main');
      expect(input.body).toBe('commit message');
      expect(input.language).toBe('zh');
      expect(input.context?.repository).toBe('r1');
      expect(input.context?.author).toBe('alice');
    });

    it('uses empty string when body is null', () => {
      const event = makeEvent({ body: null });
      const input = normalizer.buildAnalysisInput(event);
      expect(input.body).toBe('');
    });

    it('sanitizes body before returning', () => {
      const event = makeEvent({ body: 'token = sk-abc123abc123abc123abc123' });
      const input = normalizer.buildAnalysisInput(event);
      expect(input.body).not.toContain('sk-abc123abc123abc123abc123');
    });

    it('truncates very long body', () => {
      const longBody = 'a'.repeat(5000);
      const event = makeEvent({ body: longBody });
      const input = normalizer.buildAnalysisInput(event);
      expect(input.body).toContain('[truncated]');
    });
  });

  // ── sanitizeBody ──────────────────────────────────────────────────────────
  describe('sanitizeBody', () => {
    it('returns empty string for empty input', () => {
      expect(normalizer.sanitizeBody('')).toBe('');
    });

    it('redacts GitHub personal access tokens (ghu_ prefix)', () => {
      const text = 'token: ghu_AbCdEfGhIjKlMnOpQrStUvWxYz12345678901234';
      const result = normalizer.sanitizeBody(text);
      expect(result).toContain('[REDACTED:github_token]');
      expect(result).not.toContain('ghu_');
    });

    it('redacts GitHub personal access tokens (ghp_ prefix)', () => {
      const text = 'const token = ghp_AbCdEfGhIjKlMnOpQrStUvWxYz12345678901234';
      const result = normalizer.sanitizeBody(text);
      expect(result).toContain('[REDACTED:github_token]');
    });

    it('redacts Bearer tokens in Authorization headers', () => {
      const text = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9';
      const result = normalizer.sanitizeBody(text);
      expect(result).toContain('[REDACTED:bearer_token]');
      expect(result).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
    });

    it('redacts api_key credential patterns', () => {
      const text = 'api_key: "sk-abc123def456ghi789jkl012mno345pqr"';
      const result = normalizer.sanitizeBody(text);
      expect(result).toContain('[REDACTED:credential]');
    });

    it('redacts secret patterns', () => {
      const text = 'secret=mysupersecretvalue1234567890';
      const result = normalizer.sanitizeBody(text);
      expect(result).toContain('[REDACTED:credential]');
    });

    it('redacts password patterns', () => {
      const text = 'password: mypassword1234567890abcdef';
      const result = normalizer.sanitizeBody(text);
      expect(result).toContain('[REDACTED:credential]');
    });

    it('redacts PEM private key blocks', () => {
      const text = [
        '-----BEGIN RSA PRIVATE KEY-----',
        'MIIEowIBAAKCAQEA0Z3VS5JJcds3xHn/ygWep4PAtEsHAcwpYzu6Ub0='  ,
        '-----END RSA PRIVATE KEY-----',
      ].join('\n');
      const result = normalizer.sanitizeBody(text);
      expect(result).toContain('[REDACTED:private_key]');
    });

    it('redacts .env style variable assignments', () => {
      const text = 'DATABASE_URL=postgresql://user:pass@host/db\nNODE_ENV=production';
      const result = normalizer.sanitizeBody(text);
      expect(result).toContain('DATABASE_URL=[REDACTED]');
    });

    it('redacts email addresses', () => {
      const text = 'Contact alice@example.com for support';
      const result = normalizer.sanitizeBody(text);
      expect(result).toContain('[REDACTED:email]');
      expect(result).not.toContain('alice@example.com');
    });

    it('leaves non-sensitive text unchanged', () => {
      const text = 'This is a normal commit message with no secrets.';
      expect(normalizer.sanitizeBody(text)).toBe(text);
    });

    it('handles multiple sensitive patterns in one string', () => {
      const text = 'token: Bearer abc123def456, email: user@test.com';
      const result = normalizer.sanitizeBody(text);
      expect(result).toContain('[REDACTED:bearer_token]');
      expect(result).toContain('[REDACTED:email]');
    });
  });

  // ── truncateBody ──────────────────────────────────────────────────────────
  describe('truncateBody', () => {
    it('returns text unchanged when within limit', () => {
      const text = 'short text';
      expect(normalizer.truncateBody(text, 100)).toBe(text);
    });

    it('truncates and appends [truncated] when over limit', () => {
      const text = 'a'.repeat(50);
      const result = normalizer.truncateBody(text, 20);
      expect(result).toBe('a'.repeat(20) + '... [truncated]');
    });

    it('uses default MAX_BODY_LENGTH when maxLength not provided', () => {
      const text = 'x'.repeat(10);
      expect(normalizer.truncateBody(text)).toBe(text);
    });

    it('handles empty string', () => {
      expect(normalizer.truncateBody('', 100)).toBe('');
    });

    it('handles text exactly at limit', () => {
      const text = 'a'.repeat(20);
      expect(normalizer.truncateBody(text, 20)).toBe(text);
    });
  });
});
