import type {
  MonitoringScopePreferences,
  RepositoryBranchScopeMap,
  UserPreferences,
} from '@/types/api';

function sanitizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === 'string');
}

function sanitizeRepositoryBranchScopes(value: unknown): RepositoryBranchScopeMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).map(([repositoryId, branches]) => [
      repositoryId,
      sanitizeStringArray(branches),
    ]),
  );
}

export function getMonitoringScopePreferences(
  preferences: UserPreferences | undefined,
): MonitoringScopePreferences {
  const monitoringScope = preferences?.monitoringScope;

  if (monitoringScope && typeof monitoringScope === 'object' && !Array.isArray(monitoringScope)) {
    return {
      repositoryIds: sanitizeStringArray(monitoringScope.repositoryIds),
      branchNames: sanitizeStringArray(monitoringScope.branchNames),
      repositoryBranchScopes: sanitizeRepositoryBranchScopes(
        monitoringScope.repositoryBranchScopes,
      ),
    };
  }

  const dashboard = preferences?.dashboard;
  if (dashboard && typeof dashboard === 'object' && !Array.isArray(dashboard)) {
    return {
      repositoryIds: sanitizeStringArray(dashboard.monitoredRepositoryIds),
      branchNames: [],
      repositoryBranchScopes: {},
    };
  }

  return {
    repositoryIds: [],
    branchNames: [],
    repositoryBranchScopes: {},
  };
}

export function getMonitoringScopeRepositoryIds(
  preferences: UserPreferences | undefined,
): string[] {
  return getMonitoringScopePreferences(preferences).repositoryIds ?? [];
}

export function buildMonitoringScopePreferencesPayload(
  currentPreferences: UserPreferences | undefined,
  nextScope: MonitoringScopePreferences,
): UserPreferences {
  const repositoryIds = sanitizeStringArray(nextScope.repositoryIds);
  const branchNames = sanitizeStringArray(nextScope.branchNames);
  const repositoryBranchScopes = sanitizeRepositoryBranchScopes(
    nextScope.repositoryBranchScopes,
  );

  return {
    ...(currentPreferences ?? {}),
    monitoringScope: {
      repositoryIds,
      branchNames,
      repositoryBranchScopes,
    },
  };
}
