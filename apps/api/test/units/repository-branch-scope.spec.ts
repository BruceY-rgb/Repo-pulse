import { EventType } from '@repo-pulse/database';
import { buildEventScopeWhere } from '../../src/common/utils/repository-branch-scope';

describe('buildEventScopeWhere', () => {
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
