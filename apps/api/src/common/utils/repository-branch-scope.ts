import { Prisma } from '@repo-pulse/database';

export type RepositoryBranchScopeMap = Record<string, string[]>;

function sanitizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

export function parseRepositoryBranchScopesParam(
  repositoryBranchScopesParam?: string,
): RepositoryBranchScopeMap {
  if (!repositoryBranchScopesParam) {
    return {};
  }

  try {
    const parsed = JSON.parse(repositoryBranchScopesParam) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).map(([repositoryId, branches]) => [
        repositoryId,
        sanitizeStringArray(branches),
      ]),
    );
  } catch {
    return {};
  }
}

export function normalizeRepositoryBranchScopes(
  repositoryIds: string[],
  repositoryBranchScopes: RepositoryBranchScopeMap,
): RepositoryBranchScopeMap {
  const repositoryIdSet = new Set(repositoryIds);

  return Object.fromEntries(
    Object.entries(repositoryBranchScopes)
      .filter(([repositoryId]) => repositoryIdSet.has(repositoryId))
      .map(([repositoryId, branches]) => [repositoryId, sanitizeStringArray(branches)]),
  );
}

export function buildEventScopeWhere(
  repositoryIds: string[],
  repositoryBranchScopes: RepositoryBranchScopeMap,
): Prisma.EventWhereInput {
  if (repositoryIds.length === 0) {
    return { repositoryId: { in: [] } };
  }

  const clauses = repositoryIds.map((repositoryId) => {
    const branches = repositoryBranchScopes[repositoryId] ?? [];

    if (branches.length === 0) {
      return { repositoryId };
    }

    return {
      repositoryId,
      OR: [
        { branch: { in: branches } },
        { sourceBranch: { in: branches } },
        { targetBranch: { in: branches } },
      ],
    };
  });

  return clauses.length === 1 ? clauses[0] : { OR: clauses };
}
