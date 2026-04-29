import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  GitPullRequest,
  GitCommit,
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
} from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Progress } from '@/components/ui/progress';
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
import {
  useCurrentUserQuery,
  useUpdateUserPreferencesMutation,
} from '@/hooks/queries/use-auth-queries';
import {
  useDashboardRecentEventsQuery,
  useDashboardRepositoriesQuery,
  useDashboardStatsQuery,
  usePendingApprovalsCountQuery,
  useUnreadNotificationsCountQuery,
} from '@/hooks/queries/use-dashboard-queries';
import { useRepositoryRealtimeSubscription } from '@/hooks/use-web-socket';
import { useDashboardActivity } from '@/hooks/use-dashboard';
import type { DashboardPreferences, Repository } from '@/types/api';

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

function getSavedMonitoredRepositoryIds(preferences: Record<string, unknown> | undefined) {
  const dashboardPrefs = preferences?.dashboard;

  if (!dashboardPrefs || typeof dashboardPrefs !== 'object' || Array.isArray(dashboardPrefs)) {
    return [];
  }

  const monitoredRepositoryIds = (dashboardPrefs as DashboardPreferences).monitoredRepositoryIds;

  if (!Array.isArray(monitoredRepositoryIds)) {
    return [];
  }

  return monitoredRepositoryIds.filter((value): value is string => typeof value === 'string');
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

export function Dashboard() {
  const cardsRef = useRef<HTMLDivElement>(null);
  const hasInitializedSelectionRef = useRef(false);
  const { t, language } = useLanguage();

  const repositoriesQuery = useDashboardRepositoriesQuery();
  const { data: currentUser, isLoading: isCurrentUserLoading } = useCurrentUserQuery();
  const updatePreferencesMutation = useUpdateUserPreferencesMutation();
  const repos = repositoriesQuery.data ?? [];
  const [isScopePopoverOpen, setIsScopePopoverOpen] = useState(false);
  const [selectedRepositoryIds, setSelectedRepositoryIds] = useState<string[]>([]);
  const availableRepositoryIds = useMemo(() => repos.map((repository) => repository.id), [repos]);
  const availableRepositoryIdSet = useMemo(
    () => new Set(availableRepositoryIds),
    [availableRepositoryIds],
  );
  const savedRepositoryIds = useMemo(
    () => getSavedMonitoredRepositoryIds(currentUser?.preferences),
    [currentUser?.preferences],
  );
  const selectedRepositories = useMemo(
    () => findRepositoriesBySelection(repos, selectedRepositoryIds),
    [repos, selectedRepositoryIds],
  );
  const hasAvailableRepositories = repos.length > 0;
  const hasSelection = selectedRepositoryIds.length > 0;

  const persistMonitoredRepositoryIds = (repositoryIds: string[]) => {
    updatePreferencesMutation.mutate({
      preferences: {
        dashboard: {
          monitoredRepositoryIds: repositoryIds,
        },
      },
    });
  };

  useEffect(() => {
    if (hasInitializedSelectionRef.current) {
      return;
    }

    if (repositoriesQuery.isLoading || isCurrentUserLoading) {
      return;
    }

    const sanitizedSavedRepositoryIds = savedRepositoryIds.filter((repositoryId) =>
      availableRepositoryIdSet.has(repositoryId),
    );

    setSelectedRepositoryIds(sanitizedSavedRepositoryIds);
    hasInitializedSelectionRef.current = true;

    if (!areStringArraysEqual(sanitizedSavedRepositoryIds, savedRepositoryIds)) {
      persistMonitoredRepositoryIds(sanitizedSavedRepositoryIds);
    }
  }, [
    availableRepositoryIdSet,
    isCurrentUserLoading,
    repositoriesQuery.isLoading,
    savedRepositoryIds,
  ]);

  useEffect(() => {
    if (!hasInitializedSelectionRef.current) {
      return;
    }

    const sanitizedCurrentSelection = selectedRepositoryIds.filter((repositoryId) =>
      availableRepositoryIdSet.has(repositoryId),
    );

    if (!areStringArraysEqual(sanitizedCurrentSelection, selectedRepositoryIds)) {
      setSelectedRepositoryIds(sanitizedCurrentSelection);
      persistMonitoredRepositoryIds(sanitizedCurrentSelection);
    }
  }, [availableRepositoryIdSet, selectedRepositoryIds]);

  const statsQuery = useDashboardStatsQuery(selectedRepositoryIds);
  const recentEventsQuery = useDashboardRecentEventsQuery(selectedRepositoryIds);
  const pendingApprovalsQuery = usePendingApprovalsCountQuery(selectedRepositoryIds);
  const unreadNotificationsQuery = useUnreadNotificationsCountQuery(selectedRepositoryIds);

  // 周活动数据 - 来自后端 /dashboard/activity
  const activityQuery = useDashboardActivity(7, selectedRepositoryIds);
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

  useRepositoryRealtimeSubscription(selectedRepositoryIds);

  const totalRepositories = selectedRepositoryIds.length;
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

    setSelectedRepositoryIds(normalizedSelection);
    persistMonitoredRepositoryIds(normalizedSelection);
  };

  const toggleRepository = (repositoryId: string) => {
    const nextRepositoryIds = selectedRepositoryIds.includes(repositoryId)
      ? selectedRepositoryIds.filter((id) => id !== repositoryId)
      : [...selectedRepositoryIds, repositoryId];

    applySelection(nextRepositoryIds);
  };

  const selectAllRepositories = () => {
    applySelection(availableRepositoryIds);
  };

  const clearSelectedRepositories = () => {
    applySelection([]);
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
      time: toRelativeTime(event.occurredAt ?? event.createdAt, language),
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
              <Popover open={isScopePopoverOpen} onOpenChange={setIsScopePopoverOpen}>
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
                  className="w-[340px] overflow-hidden rounded-2xl border-[var(--github-border)] bg-[#151922] p-0 shadow-2xl"
                >
                  <Command className="rounded-none bg-transparent">
                    <div className="border-b border-[var(--github-border)]/80 p-3 pb-2">
                      <CommandInput
                        placeholder={t('dashboard.scope.searchPlaceholder')}
                        wrapperClassName="h-12 rounded-2xl border border-[var(--github-border)] bg-white/[0.03] px-4 text-foreground shadow-inner shadow-black/10 transition-[background-color,box-shadow,border-color] focus-within:border-[var(--github-border)] focus-within:bg-white/[0.05] focus-within:ring-1 focus-within:ring-[var(--github-accent)]/35 focus-within:shadow-[0_0_0_4px_rgba(255,77,0,0.08)]"
                        className="h-10 border-0 py-0 text-base placeholder:text-[var(--github-text-secondary)] focus-visible:outline-none focus-visible:ring-0"
                      />
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
                      <CommandEmpty>{t('dashboard.scope.noSearchResult')}</CommandEmpty>
                      <CommandGroup className="space-y-1 p-0">
                        {repos.map((repo) => {
                          const checked = selectedRepositoryIds.includes(repo.id);

                          return (
                            <CommandItem
                              key={repo.id}
                              value={repo.fullName ?? repo.name}
                              keywords={[repo.name, repo.fullName]}
                              onSelect={() => toggleRepository(repo.id)}
                              className="gap-3 rounded-xl px-4 py-3 data-[selected=true]:bg-[var(--github-accent)] data-[selected=true]:text-white"
                            >
                              <Checkbox checked={checked} className="pointer-events-none" />
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm">{repo.fullName ?? repo.name}</p>
                              </div>
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
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
