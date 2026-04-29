import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  GitPullRequest,
  GitCommit,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  TrendingUp,
  Clock,
  Users,
  Activity,
  Shield,
  Zap,
  ArrowUpRight,
  ArrowDownRight,
  MoreHorizontal,
  RefreshCcw,
  ChevronsUpDown,
  Loader2,
} from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Command,
  CommandInput,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import gsap from 'gsap';
import { useLanguage } from '@/contexts/LanguageContext';
import { useMonitoringScopePreferences } from '@/hooks/use-monitoring-scope-preferences';
import {
  useDashboardRecentEventsQuery,
  useDashboardRepositoriesQuery,
  useDashboardStatsQuery,
  usePendingApprovalsCountQuery,
  useUnreadNotificationsCountQuery,
} from '@/hooks/queries/use-dashboard-queries';
import { useRepositoryBranchesQuery } from '@/hooks/queries/use-repository-queries';
import { useRepositoryRealtimeSubscription } from '@/hooks/use-web-socket';
import { useDashboardActivity } from '@/hooks/use-dashboard';
import type { Repository, RepositoryBranchScopeMap } from '@/types/api';

function toRelativeTime(dateString: string, language: 'en' | 'zh') {
  const now = Date.now();
  const target = new Date(dateString).getTime();
  const deltaMin = Math.max(1, Math.floor((now - target) / 60000));

  if (deltaMin < 60) {
    return language === 'zh' ? `${deltaMin} 分钟前` : `${deltaMin} min ago`;
  }

  const deltaHour = Math.floor(deltaMin / 60);
  if (deltaHour < 24) {
    return language === 'zh' ? `${deltaHour} 小时前` : `${deltaHour} hour ago`;
  }

  const deltaDay = Math.floor(deltaHour / 24);
  return language === 'zh' ? `${deltaDay} 天前` : `${deltaDay} day ago`;
}

function getRiskByType(type: string): 'low' | 'medium' | 'high' {
  if (type.includes('PUSH') || type.includes('RELEASE')) {
    return 'high';
  }

  if (type.includes('PR') || type.includes('ISSUE')) {
    return 'medium';
  }

  return 'low';
}

function areStringArraysEqual(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function findRepositoriesBySelection(repositories: Repository[], selectedRepositoryIds: string[]) {
  const repositoryMap = new Map(repositories.map((repository) => [repository.id, repository]));

  return selectedRepositoryIds
    .map((repositoryId) => repositoryMap.get(repositoryId))
    .filter((repository): repository is Repository => Boolean(repository));
}

function formatBranchSummary(branches: string[], fallbackLabel: string) {
  if (branches.length === 0) {
    return fallbackLabel;
  }

  if (branches.length === 1) {
    return branches[0];
  }

  return `${branches[0]} +${branches.length - 1}`;
}

function areRepositoryBranchScopesEqual(
  left: RepositoryBranchScopeMap,
  right: RepositoryBranchScopeMap,
) {
  const leftEntries = Object.entries(left).sort(([leftKey], [rightKey]) =>
    leftKey.localeCompare(rightKey),
  );
  const rightEntries = Object.entries(right).sort(([leftKey], [rightKey]) =>
    leftKey.localeCompare(rightKey),
  );

  if (leftEntries.length !== rightEntries.length) {
    return false;
  }

  return leftEntries.every(([repositoryId, branches], index) => {
    const [rightRepositoryId, rightBranches] = rightEntries[index];
    return (
      repositoryId === rightRepositoryId &&
      areStringArraysEqual(branches, rightBranches)
    );
  });
}

interface ScopeRepositoryItemProps {
  repo: Repository;
  checked: boolean;
  expanded: boolean;
  branchSummary: string;
  selectedBranches: string[];
  allBranchesLabel: string;
  notInScopeLabel: string;
  onToggleRepository: (repositoryId: string) => void;
  onToggleExpanded: (repositoryId: string) => void;
  onToggleBranch: (repositoryId: string, branchName: string) => void;
  onResetBranches: (repositoryId: string) => void;
  t: (key: string) => string;
}

function ScopeRepositoryItem({
  repo,
  checked,
  expanded,
  branchSummary,
  selectedBranches,
  allBranchesLabel,
  notInScopeLabel,
  onToggleRepository,
  onToggleExpanded,
  onToggleBranch,
  onResetBranches,
  t,
}: ScopeRepositoryItemProps) {
  const branchesQuery = useRepositoryBranchesQuery(repo.id, expanded);
  const branchOptions = branchesQuery.data ?? [];

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--github-border)]/80 bg-white/[0.02]">
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          className="flex flex-1 items-center gap-3 text-left"
          onClick={() => onToggleRepository(repo.id)}
        >
          <Checkbox checked={checked} className="pointer-events-none" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{repo.fullName}</p>
            <p className="truncate text-xs text-[var(--github-text-secondary)]">
              {checked ? branchSummary : notInScopeLabel}
            </p>
          </div>
        </button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-lg text-[var(--github-text-secondary)] hover:bg-white/5 hover:text-white"
          onClick={() => onToggleExpanded(repo.id)}
        >
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </Button>
      </div>

      {expanded ? (
        <div className="space-y-3 border-t border-[var(--github-border)]/80 bg-black/10 px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--github-text-secondary)]">
                {t('dashboard.scope.branches.title')}
              </p>
              <p className="mt-1 text-xs text-[var(--github-text-secondary)]">
                {t('dashboard.scope.branches.description')}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 rounded-lg px-2 text-xs text-[var(--github-accent)] hover:bg-[var(--github-accent)]/10 hover:text-white"
              onClick={() => onResetBranches(repo.id)}
            >
              {allBranchesLabel}
            </Button>
          </div>

          {branchesQuery.isLoading ? (
            <div className="flex items-center gap-2 rounded-xl border border-[var(--github-border)]/70 bg-white/[0.03] px-3 py-3 text-sm text-[var(--github-text-secondary)]">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('dashboard.scope.branches.loading')}
            </div>
          ) : branchOptions.length === 0 ? (
            <div className="rounded-xl border border-[var(--github-border)]/70 bg-white/[0.03] px-3 py-3 text-sm text-[var(--github-text-secondary)]">
              {t('dashboard.scope.branches.empty')}
            </div>
          ) : (
            <div className="grid gap-2">
              {branchOptions.map((branch) => {
                const branchChecked = selectedBranches.includes(branch.name);

                return (
                  <button
                    key={`${repo.id}-${branch.name}`}
                    type="button"
                    className="flex items-center gap-3 rounded-xl border border-[var(--github-border)]/70 bg-white/[0.02] px-3 py-2 text-left transition-colors hover:border-[var(--github-accent)]/40 hover:bg-white/[0.05]"
                    onClick={() => onToggleBranch(repo.id, branch.name)}
                  >
                    <Checkbox checked={branchChecked} className="pointer-events-none" />
                    <span className="truncate text-sm text-white">{branch.name}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function Dashboard() {
  const cardsRef = useRef<HTMLDivElement>(null);
  const { t, language } = useLanguage();

  const repositoriesQuery = useDashboardRepositoriesQuery();
  const {
    currentUserQuery,
    monitoringScope,
    persistMonitoringScope,
  } = useMonitoringScopePreferences();
  const { isLoading: isCurrentUserLoading } = currentUserQuery;
  const repos = useMemo(
    () => repositoriesQuery.data ?? [],
    [repositoriesQuery.data],
  );
  const [isScopePopoverOpen, setIsScopePopoverOpen] = useState(false);
  const [scopeTab, setScopeTab] = useState<'selected' | 'all'>('selected');
  const [scopeSearchValue, setScopeSearchValue] = useState('');
  const [expandedRepositoryIds, setExpandedRepositoryIds] = useState<string[]>([]);
  const availableRepositoryIds = useMemo(() => repos.map((repository) => repository.id), [repos]);
  const availableRepositoryIdSet = useMemo(
    () => new Set(availableRepositoryIds),
    [availableRepositoryIds],
  );
  const monitoredRepositoryIds = useMemo(
    () => (monitoringScope.repositoryIds ?? []).filter((repositoryId) => availableRepositoryIdSet.has(repositoryId)),
    [availableRepositoryIdSet, monitoringScope.repositoryIds],
  );
  const selectedRepositories = useMemo(
    () => findRepositoriesBySelection(repos, monitoredRepositoryIds),
    [monitoredRepositoryIds, repos],
  );
  const repositoryBranchScopes = useMemo(
    () => monitoringScope.repositoryBranchScopes ?? {},
    [monitoringScope.repositoryBranchScopes],
  );
  const normalizedRepositoryBranchScopes = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(repositoryBranchScopes)
          .filter(([repositoryId]) => availableRepositoryIdSet.has(repositoryId))
          .map(([repositoryId, branches]) => [
            repositoryId,
            Array.from(new Set(branches)).sort((left, right) => left.localeCompare(right)),
          ]),
      ),
    [availableRepositoryIdSet, repositoryBranchScopes],
  );
  const repositoriesForCurrentScopeTab = useMemo(
    () => (scopeTab === 'selected' ? selectedRepositories : repos),
    [repos, scopeTab, selectedRepositories],
  );
  const filteredRepositoriesForCurrentScopeTab = useMemo(() => {
    const normalizedKeyword = scopeSearchValue.trim().toLowerCase();
    if (!normalizedKeyword) {
      return repositoriesForCurrentScopeTab;
    }

    return repositoriesForCurrentScopeTab.filter((repository) =>
      repository.fullName.toLowerCase().includes(normalizedKeyword) ||
      repository.name.toLowerCase().includes(normalizedKeyword),
    );
  }, [repositoriesForCurrentScopeTab, scopeSearchValue]);
  const hasAvailableRepositories = repos.length > 0;
  const hasSelection = monitoredRepositoryIds.length > 0;

  const persistMonitoredRepositoryIds = (repositoryIds: string[]) => {
    void persistMonitoringScope({
      repositoryIds,
      branchNames: [],
      repositoryBranchScopes: normalizedRepositoryBranchScopes,
    });
  };
  const persistMonitoredRepositoryIdsInEffect = useEffectEvent((repositoryIds: string[]) => {
    persistMonitoredRepositoryIds(repositoryIds);
  });

  useEffect(() => {
    if (repositoriesQuery.isLoading || isCurrentUserLoading) {
      return;
    }

    const rawRepositoryIds = monitoringScope.repositoryIds ?? [];
    if (!areStringArraysEqual(rawRepositoryIds, monitoredRepositoryIds)) {
      persistMonitoredRepositoryIdsInEffect(monitoredRepositoryIds);
    }
  }, [
    isCurrentUserLoading,
    monitoredRepositoryIds,
    monitoringScope.repositoryIds,
    repositoriesQuery.isLoading,
  ]);

  useEffect(() => {
    if (repositoriesQuery.isLoading || isCurrentUserLoading) {
      return;
    }

    if (
      !areRepositoryBranchScopesEqual(
        repositoryBranchScopes,
        normalizedRepositoryBranchScopes,
      )
    ) {
      void persistMonitoringScope({
        repositoryIds: monitoredRepositoryIds,
        branchNames: [],
        repositoryBranchScopes: normalizedRepositoryBranchScopes,
      });
    }
  }, [
    isCurrentUserLoading,
    monitoredRepositoryIds,
    normalizedRepositoryBranchScopes,
    persistMonitoringScope,
    repositoriesQuery.isLoading,
    repositoryBranchScopes,
  ]);

  const statsQuery = useDashboardStatsQuery(
    monitoredRepositoryIds,
    normalizedRepositoryBranchScopes,
  );
  const recentEventsQuery = useDashboardRecentEventsQuery(
    monitoredRepositoryIds,
    normalizedRepositoryBranchScopes,
  );
  const pendingApprovalsQuery = usePendingApprovalsCountQuery(
    monitoredRepositoryIds,
    normalizedRepositoryBranchScopes,
  );
  const unreadNotificationsQuery = useUnreadNotificationsCountQuery(
    monitoredRepositoryIds,
    normalizedRepositoryBranchScopes,
  );

  // 周活动数据 - 来自后端 /dashboard/activity
  const activityQuery = useDashboardActivity(
    7,
    monitoredRepositoryIds,
    normalizedRepositoryBranchScopes,
  );
  const activityData = useMemo(() => {
    const data = activityQuery.data ?? [];
    return data.map(item => ({ name: item.date, commits: item.commits, prs: item.prs, issues: item.issues }));
  }, [activityQuery.data]);

  // 风险分布 - 从事件类型动态计算
  const riskDistribution = useMemo(() => {
    const byType = statsQuery.data?.byType ?? [];
    let low = 0, medium = 0, high = 0;
    for (const item of byType) {
      if (item.type.includes('PUSH') || item.type.includes('RELEASE')) high += item.count;
      else if (item.type.includes('PR') || item.type.includes('ISSUE')) medium += item.count;
      else low += item.count;
    }
    return [
      { name: 'Low', value: low || 1, color: '#238636' },
      { name: 'Medium', value: medium || 1, color: '#f0883e' },
      { name: 'High', value: high || 1, color: '#f85149' },
    ];
  }, [statsQuery.data?.byType]);

  // DORA 指标 - 后端暂无 API，暂用占位数据
  const doraMetrics = [
    { label: 'Deployment Frequency', value: '--', target: '--', progress: 0 },
    { label: 'Lead Time for Changes', value: '--', target: '--', progress: 0 },
    { label: 'Change Failure Rate', value: '--', target: '--', progress: 0 },
    { label: 'Time to Recovery', value: '--', target: '--', progress: 0 },
  ];

  useRepositoryRealtimeSubscription(monitoredRepositoryIds);

  const totalRepositories = monitoredRepositoryIds.length;
  const totalEvents = statsQuery.data?.total ?? 0;
  const pendingApprovals = pendingApprovalsQuery.data?.count ?? 0;
  const unreadNotifications = unreadNotificationsQuery.data?.count ?? 0;
  const scopeSummary = hasSelection
    ? selectedRepositories.length === 0
      ? t('dashboard.scope.placeholder')
      : selectedRepositories.length === 1
      ? selectedRepositories[0].fullName
      : `${selectedRepositories[0]?.fullName ?? t('dashboard.repo.fallback')} +${selectedRepositories.length - 1}`
    : t('dashboard.scope.placeholder');

  const applySelection = (nextRepositoryIds: string[]) => {
    const nextRepositoryIdSet = new Set(nextRepositoryIds);
    const normalizedSelection = availableRepositoryIds.filter((repositoryId) =>
      nextRepositoryIdSet.has(repositoryId),
    );

    void persistMonitoringScope({
      repositoryIds: normalizedSelection,
      branchNames: [],
      repositoryBranchScopes: normalizedRepositoryBranchScopes,
    });
  };

  const toggleRepository = (repositoryId: string) => {
    const nextRepositoryIds = monitoredRepositoryIds.includes(repositoryId)
      ? monitoredRepositoryIds.filter((id) => id !== repositoryId)
      : [...monitoredRepositoryIds, repositoryId];

    applySelection(nextRepositoryIds);
  };

  const selectAllRepositories = () => {
    applySelection(availableRepositoryIds);
  };

  const clearSelectedRepositories = () => {
    applySelection([]);
  };

  const toggleExpandedRepository = (repositoryId: string) => {
    setExpandedRepositoryIds((current) =>
      current.includes(repositoryId)
        ? current.filter((id) => id !== repositoryId)
        : [...current, repositoryId],
    );
  };

  const toggleRepositoryBranch = (repositoryId: string, branchName: string) => {
    const repositoryIds = monitoredRepositoryIds.includes(repositoryId)
      ? monitoredRepositoryIds
      : [...monitoredRepositoryIds, repositoryId];
    const currentBranches = normalizedRepositoryBranchScopes[repositoryId] ?? [];
    const nextBranches = currentBranches.includes(branchName)
      ? currentBranches.filter((branch) => branch !== branchName)
      : [...currentBranches, branchName].sort((left, right) => left.localeCompare(right));

    void persistMonitoringScope({
      repositoryIds,
      branchNames: [],
      repositoryBranchScopes: {
        ...normalizedRepositoryBranchScopes,
        [repositoryId]: nextBranches,
      },
    });
  };

  const resetRepositoryBranches = (repositoryId: string) => {
    if (!monitoredRepositoryIds.includes(repositoryId)) {
      return;
    }

    void persistMonitoringScope({
      repositoryIds: monitoredRepositoryIds,
      branchNames: [],
      repositoryBranchScopes: {
        ...normalizedRepositoryBranchScopes,
        [repositoryId]: [],
      },
    });
  };

  const statsCards = useMemo(
    () => [
      {
        title: t('dashboard.cards.repositories'),
        value: String(totalRepositories),
        change: '--',
        trend: 'up' as const,
        icon: GitPullRequest,
        color: 'text-blue-400',
        bgColor: 'bg-blue-400/10',
      },
      {
        title: t('dashboard.cards.events'),
        value: String(totalEvents),
        change: '--',
        trend: 'up' as const,
        icon: GitCommit,
        color: 'text-green-400',
        bgColor: 'bg-green-400/10',
      },
      {
        title: t('dashboard.cards.pendingApprovals'),
        value: String(pendingApprovals),
        change: '--',
        trend: 'down' as const,
        icon: AlertCircle,
        color: 'text-red-400',
        bgColor: 'bg-red-400/10',
      },
      {
        title: t('dashboard.cards.unreadNotifications'),
        value: String(unreadNotifications),
        change: '--',
        trend: 'up' as const,
        icon: Clock,
        color: 'text-purple-400',
        bgColor: 'bg-purple-400/10',
      },
    ],
    [pendingApprovals, t, totalEvents, totalRepositories, unreadNotifications],
  );

  const recentActivity = useMemo(() => {
    const events = recentEventsQuery.data?.items ?? [];
    return events.map((event, index) => ({
      id: index + 1,
      type: event.type,
      title: event.title,
      repo: event.repository?.fullName ?? t('dashboard.repo.fallback'),
      author: event.author,
      time: toRelativeTime(event.createdAt, language),
      risk: getRiskByType(event.type),
    }));
  }, [language, recentEventsQuery.data?.items, t]);

  useEffect(() => {
    if (cardsRef.current) {
      gsap.fromTo(
        cardsRef.current.children,
        { opacity: 0, y: 20 },
        {
          opacity: 1,
          y: 0,
          duration: 0.5,
          stagger: 0.1,
          ease: 'power2.out',
        },
      );
    }
  }, []);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">{t('dashboard.page.title')}</h1>
          <p className="mt-1 text-sm text-[var(--github-text-secondary)]">
            {t('dashboard.hero.description')}
          </p>
          {hasAvailableRepositories ? (
            <div className="mt-1 flex items-center gap-2">
              <span className="text-xs text-[var(--github-text-secondary)]">
                {t('dashboard.scope.label')}:
              </span>
              <Popover
                open={isScopePopoverOpen}
                onOpenChange={(open) => {
                  setIsScopePopoverOpen(open);
                  if (open) {
                    setScopeTab(hasSelection ? 'selected' : 'all');
                    setScopeSearchValue('');
                  }
                }}
              >
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="h-7 min-w-[220px] justify-between border-[var(--github-border)] bg-transparent px-2 text-xs text-[var(--github-text-secondary)]"
                  >
                    <span className="truncate">{scopeSummary}</span>
                    <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  className="w-[380px] overflow-hidden rounded-2xl border-[var(--github-border)] bg-[#151922] p-0 shadow-2xl"
                >
                  <Command className="rounded-none bg-transparent">
                    <div className="border-b border-[var(--github-border)]/80 p-3 pb-2">
                      <CommandInput
                        value={scopeSearchValue}
                        onValueChange={setScopeSearchValue}
                        placeholder={t('dashboard.scope.searchPlaceholder')}
                        wrapperClassName="h-12 rounded-2xl border border-[var(--github-border)] bg-white/[0.03] px-4 text-foreground shadow-inner shadow-black/10 transition-[background-color,box-shadow,border-color] focus-within:border-[var(--github-border)] focus-within:bg-white/[0.05] focus-within:ring-1 focus-within:ring-[var(--github-accent)]/35 focus-within:shadow-[0_0_0_4px_rgba(255,77,0,0.08)]"
                        className="h-10 border-0 py-0 text-base placeholder:text-[var(--github-text-secondary)] focus-visible:outline-none focus-visible:ring-0"
                      />
                    </div>
                    <div className="border-b border-[var(--github-border)]/80 px-3 py-2">
                      <Tabs
                        value={scopeTab}
                        onValueChange={(value) => setScopeTab(value as 'selected' | 'all')}
                        className="gap-0"
                      >
                        <TabsList className="h-9 w-full rounded-xl bg-white/[0.04] p-1">
                          <TabsTrigger
                            value="selected"
                            className="rounded-lg border border-transparent text-xs text-[var(--github-text-secondary)] transition-colors hover:text-white data-[state=active]:border-[var(--github-accent)]/60 data-[state=active]:bg-[var(--github-accent)] data-[state=active]:text-white data-[state=active]:shadow-[0_0_0_1px_rgba(255,255,255,0.08)_inset]"
                          >
                            {t('dashboard.scope.tabs.selected')}
                            <span className="ml-1 text-[10px] opacity-80">
                              {selectedRepositories.length}
                            </span>
                          </TabsTrigger>
                          <TabsTrigger
                            value="all"
                            className="rounded-lg border border-transparent text-xs text-[var(--github-text-secondary)] transition-colors hover:text-white data-[state=active]:border-[var(--github-accent)]/60 data-[state=active]:bg-[var(--github-accent)] data-[state=active]:text-white data-[state=active]:shadow-[0_0_0_1px_rgba(255,255,255,0.08)_inset]"
                          >
                            {t('dashboard.scope.tabs.all')}
                            <span className="ml-1 text-[10px] opacity-80">{repos.length}</span>
                          </TabsTrigger>
                        </TabsList>
                      </Tabs>
                    </div>
                    <div className="flex items-center justify-between border-b border-[var(--github-border)]/80 px-3 py-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 rounded-lg px-2 text-xs text-[var(--github-text-secondary)] hover:bg-white/5 hover:text-white"
                        onClick={selectAllRepositories}
                        type="button"
                      >
                        {t('dashboard.scope.selectAll')}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 rounded-lg px-2 text-xs text-[var(--github-text-secondary)] hover:bg-white/5 hover:text-white"
                        onClick={clearSelectedRepositories}
                        type="button"
                      >
                        {t('dashboard.scope.clear')}
                      </Button>
                    </div>
                    <CommandList className="max-h-[320px] px-2 py-2">
                      {filteredRepositoriesForCurrentScopeTab.length === 0 ? (
                        <div className="py-6 text-center text-sm text-[var(--github-text-secondary)]">
                          {scopeTab === 'selected'
                            ? t('dashboard.scope.emptySelectedTab')
                            : t('dashboard.scope.noSearchResult')}
                        </div>
                      ) : (
                        <div className="space-y-2 p-1">
                          {filteredRepositoriesForCurrentScopeTab.map((repo) => {
                            const checked = monitoredRepositoryIds.includes(repo.id);
                            const selectedBranches = normalizedRepositoryBranchScopes[repo.id] ?? [];
                            const branchSummary = formatBranchSummary(
                              selectedBranches,
                              t('dashboard.scope.row.allBranches'),
                            );

                            return (
                              <ScopeRepositoryItem
                                key={repo.id}
                                repo={repo}
                                checked={checked}
                                expanded={expandedRepositoryIds.includes(repo.id)}
                                branchSummary={branchSummary}
                                selectedBranches={selectedBranches}
                                allBranchesLabel={t('dashboard.scope.row.allBranches')}
                                notInScopeLabel={t('dashboard.scope.row.notInScope')}
                                onToggleRepository={toggleRepository}
                                onToggleExpanded={toggleExpandedRepository}
                                onToggleBranch={toggleRepositoryBranch}
                                onResetBranches={resetRepositoryBranches}
                                t={t}
                              />
                            );
                          })}
                        </div>
                      )}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" className="border-[var(--github-border)] text-sm">
            {t('dashboard.filters.last7Days')}
          </Button>
          <Button className="btn-x-primary gap-2 text-sm">
            <Activity className="h-4 w-4" />
            {t('dashboard.actions.liveView')}
          </Button>
        </div>
      </div>

      {repositoriesQuery.isError ? (
        <Card className="card-github">
          <CardContent className="flex items-center justify-between gap-4 p-4">
            <div className="text-sm text-red-400">{t('dashboard.error.partialLoadFailed')}</div>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => {
                repositoriesQuery.refetch();
              }}
            >
              <RefreshCcw className="h-4 w-4" />
              {t('dashboard.error.retry')}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {!hasAvailableRepositories && !repositoriesQuery.isLoading && !repositoriesQuery.isError ? (
        <Card className="card-github">
          <CardContent className="flex items-center justify-between p-5">
            <p className="text-sm text-[var(--github-text-secondary)]">
              {t('dashboard.empty.description')}
            </p>
            <Button asChild className="btn-x-primary">
              <Link to="/repositories">{t('dashboard.empty.action')}</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {hasAvailableRepositories && !hasSelection && !repositoriesQuery.isLoading ? (
        <Card className="card-github">
          <CardContent className="flex items-center justify-between gap-4 p-5">
            <p className="text-sm text-[var(--github-text-secondary)]">
              {t('dashboard.scope.emptySelection')}
            </p>
            <Button className="btn-x-primary" type="button" onClick={selectAllRepositories}>
              {t('dashboard.scope.selectAll')}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {hasSelection ? (
        <>
          <div ref={cardsRef} className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statsCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.title} className="card-github transition-all duration-300 hover:border-[var(--github-accent)]/30">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${stat.bgColor}`}>
                    <Icon className={`h-5 w-5 ${stat.color}`} />
                  </div>
                  <div className={`flex items-center gap-1 text-xs ${stat.trend === 'up' ? 'text-green-400' : 'text-red-400'}`}>
                    {stat.trend === 'up' ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                    {stat.change}
                  </div>
                </div>
                <div className="mt-4">
                  <p className="text-2xl font-bold text-white">{stat.value}</p>
                  <p className="text-sm text-[var(--github-text-secondary)]">{stat.title}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="card-github lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base font-semibold text-white">
                <Activity className="h-4 w-4 text-[var(--github-accent)]" />
                {t('dashboard.sections.weeklyActivity')}
              </CardTitle>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-[var(--github-text-secondary)]">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={activityData}>
                  <defs>
                    <linearGradient id="colorCommits" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ff4d00" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#ff4d00" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorPrs" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#58a6ff" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#58a6ff" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#30363d" vertical={false} />
                  <XAxis dataKey="name" stroke="#8b949e" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#8b949e" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: '#161b22', border: '1px solid #30363d', borderRadius: '8px' }} />
                  <Area type="monotone" dataKey="commits" stroke="#ff4d00" strokeWidth={2} fillOpacity={1} fill="url(#colorCommits)" />
                  <Area type="monotone" dataKey="prs" stroke="#58a6ff" strokeWidth={2} fillOpacity={1} fill="url(#colorPrs)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="card-github">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base font-semibold text-white">
              <Shield className="h-4 w-4 text-[var(--github-accent)]" />
              {t('dashboard.sections.riskDistribution')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={riskDistribution} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={5} dataKey="value">
                    {riskDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: '#161b22', border: '1px solid #30363d', borderRadius: '8px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 flex justify-center gap-4">
              {riskDistribution.map((item) => (
                <div key={item.name} className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-xs text-[var(--github-text-secondary)]">
                    {item.name === 'Low'
                      ? t('dashboard.risk.low')
                      : item.name === 'Medium'
                        ? t('dashboard.risk.medium')
                        : t('dashboard.risk.high')}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="card-github">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base font-semibold text-white">
              <TrendingUp className="h-4 w-4 text-[var(--github-accent)]" />
              {t('dashboard.sections.doraMetrics')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {doraMetrics.map((metric) => (
              <div key={metric.label} className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[var(--github-text-secondary)]">
                    {metric.label === 'Deployment Frequency'
                      ? t('dashboard.dora.deploymentFrequency')
                      : metric.label === 'Lead Time for Changes'
                        ? t('dashboard.dora.leadTime')
                        : metric.label === 'Change Failure Rate'
                          ? t('dashboard.dora.changeFailureRate')
                          : t('dashboard.dora.timeToRecovery')}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-white">{metric.value}</span>
                    <span className="text-xs text-[var(--github-text-secondary)]">/ {metric.target}</span>
                  </div>
                </div>
                <div className="relative">
                  <Progress value={metric.progress} className="h-2 bg-[var(--github-border)]" />
                  <div className="absolute left-0 top-0 h-2 rounded-full bg-gradient-to-r from-[#ff4d00] to-[#ff8c00]" style={{ width: `${metric.progress}%` }} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="card-github">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base font-semibold text-white">
                <Zap className="h-4 w-4 text-[var(--github-accent)]" />
                {t('dashboard.sections.recentActivity')}
              </CardTitle>
              <Button variant="ghost" size="sm" className="text-xs text-[var(--github-accent)]">
                {t('dashboard.actions.viewAll')}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentActivity.length > 0 ? (
                recentActivity.map((activity) => (
                  <div key={activity.id} className="cursor-pointer rounded-lg bg-white/5 p-3 transition-colors hover:bg-white/10">
                    <div className="flex items-start gap-3">
                      <div className={`mt-2 h-2 w-2 flex-shrink-0 rounded-full ${activity.risk === 'high' ? 'bg-red-400' : activity.risk === 'medium' ? 'bg-yellow-400' : 'bg-green-400'}`} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-white">{activity.title}</p>
                        <div className="mt-1 flex items-center gap-2">
                          <Badge variant="secondary" className="bg-[var(--github-border)] text-xs text-[var(--github-text-secondary)]">
                            {activity.repo}
                          </Badge>
                          <span className="text-xs text-[var(--github-text-secondary)]">{activity.time}</span>
                        </div>
                      </div>
                      <Avatar className="h-6 w-6">
                        <AvatarFallback className="bg-[var(--github-accent)] text-xs text-white">
                          {activity.author.split(' ').map((word) => word[0]).join('')}
                        </AvatarFallback>
                      </Avatar>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-lg border border-[var(--github-border)] p-4 text-sm text-[var(--github-text-secondary)]">
                  {t('dashboard.events.empty')}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
          </div>

          <Card className="card-github">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base font-semibold text-white">
            <Users className="h-4 w-4 text-[var(--github-accent)]" />
            {t('dashboard.sections.teamContributions')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={activityData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#30363d" vertical={false} />
                <XAxis dataKey="name" stroke="#8b949e" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#8b949e" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ backgroundColor: '#161b22', border: '1px solid #30363d', borderRadius: '8px' }} />
                <Bar dataKey="commits" fill="#ff4d00" radius={[4, 4, 0, 0]} />
                <Bar dataKey="issues" fill="#f85149" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
          </Card>

          {(statsQuery.isError ||
            recentEventsQuery.isError ||
            activityQuery.isError ||
            pendingApprovalsQuery.isError ||
            unreadNotificationsQuery.isError) ? (
            <Card className="card-github">
              <CardContent className="flex items-center justify-between gap-4 p-4">
                <div className="text-sm text-red-400">{t('dashboard.error.partialLoadFailed')}</div>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => {
                    repositoriesQuery.refetch();
                    statsQuery.refetch();
                    recentEventsQuery.refetch();
                    activityQuery.refetch();
                    pendingApprovalsQuery.refetch();
                    unreadNotificationsQuery.refetch();
                  }}
                >
                  <RefreshCcw className="h-4 w-4" />
                  {t('dashboard.error.retry')}
                </Button>
              </CardContent>
            </Card>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
