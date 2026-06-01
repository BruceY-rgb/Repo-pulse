import { EventType } from '@repo-pulse/database';
import {
  buildEventScopeWhere,
  parseRepositoryBranchScopesParam,
  normalizeRepositoryBranchScopes,
} from '../../src/common/utils/repository-branch-scope';

// ── parseRepositoryBranchScopesParam ──────────────────────────────────────
describe('parseRepositoryBranchScopesParam', () => {
  it('returns empty object when param is undefined', () => {
    expect(parseRepositoryBranchScopesParam(undefined)).toEqual({});
  });

  it('returns empty object when param is empty string', () => {
    expect(parseRepositoryBranchScopesParam('')).toEqual({});
  });

  it('parses valid JSON object', () => {
    const result = parseRepositoryBranchScopesParam('{"r1":["main","dev"]}');
    expect(result).toEqual({ r1: ['main', 'dev'] });
  });

  it('deduplicates and trims branch names', () => {
    const result = parseRepositoryBranchScopesParam('{"r1":["main"," main ","dev"]}');
    expect(result).toEqual({ r1: ['main', 'dev'] });
  });

  it('returns empty object for invalid JSON', () => {
    expect(parseRepositoryBranchScopesParam('not-json')).toEqual({});
  });

  it('returns empty object when JSON is an array', () => {
    expect(parseRepositoryBranchScopesParam('["r1","r2"]')).toEqual({});
  });

  it('returns empty object when JSON is a primitive', () => {
    expect(parseRepositoryBranchScopesParam('"string"')).toEqual({});
  });

  it('filters out non-string branch values', () => {
    const result = parseRepositoryBranchScopesParam('{"r1":[1,2,"main",null]}');
    expect(result).toEqual({ r1: ['main'] });
  });
});

// ── normalizeRepositoryBranchScopes ───────────────────────────────────────
describe('normalizeRepositoryBranchScopes', () => {
  it('removes repos not in repositoryIds', () => {
    const result = normalizeRepositoryBranchScopes(['r1'], { r1: ['main'], r2: ['dev'] });
    expect(result).toEqual({ r1: ['main'] });
  });

  it('returns empty object when repositoryIds is empty', () => {
    const result = normalizeRepositoryBranchScopes([], { r1: ['main'] });
    expect(result).toEqual({});
  });

  it('sanitizes branch names (dedup + trim)', () => {
    const result = normalizeRepositoryBranchScopes(['r1'], { r1: ['main', ' main ', 'dev'] });
    expect(result).toEqual({ r1: ['main', 'dev'] });
  });
});

// ── buildEventScopeWhere ──────────────────────────────────────────────────
describe('buildEventScopeWhere', () => {
  it('returns in:[] when repositoryIds is empty', () => {
    expect(buildEventScopeWhere([], {})).toEqual({ repositoryId: { in: [] } });
  });

  it('returns OR clause for multiple repos', () => {
    const result = buildEventScopeWhere(['r1', 'r2'], {});
    expect((result as any).OR).toHaveLength(2);
  });
  it('keeps repository scope broad when no branches are selected', () => {
    expect(buildEventScopeWhere(['repo-1'], { 'repo-1': [] })).toEqual({
      repositoryId: 'repo-1',
    });
  });

  it('filters by multi-branch ownership while keeping repository-level issue events', () => {
    expect(buildEventScopeWhere(['repo-1'], { 'repo-1': ['feature/a'] })).toEqual({
      repositoryId: 'repo-1',
      OR: [
        { branches: { hasSome: ['feature/a'] } },
        {
          AND: [
            { branches: { isEmpty: true } },
            {
              type: {
                in: [
                  EventType.ISSUE_OPENED,
                  EventType.ISSUE_CLOSED,
                  EventType.ISSUE_COMMENT,
                ],
              },
            },
          ],
        },
        { branch: { in: ['feature/a'] } },
        { sourceBranch: { in: ['feature/a'] } },
        { targetBranch: { in: ['feature/a'] } },
      ],
    });
  });
});
