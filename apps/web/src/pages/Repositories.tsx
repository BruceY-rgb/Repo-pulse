import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import {
  ExternalLink,
  GitBranch,
  Loader2,
  Plus,
  RefreshCcw,
  Search,
  ShieldAlert,
  Star,
  Trash2,
} from 'lucide-react';
import { format } from 'date-fns';
import { enUS, zhCN } from 'date-fns/locale';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useLanguage } from '@/contexts/LanguageContext';
import { useRepositoryRealtimeSubscription } from '@/hooks/use-web-socket';
import { useMonitoringScopePreferences } from '@/hooks/use-monitoring-scope-preferences';
import {
  repositoryQueryKeys,
  useCreateRepositoryMutation,
  useDeleteRepositoryMutation,
  useMyRepositoryCandidatesQuery,
  useRepositoryListQuery,
  useSearchRepositoryCandidatesQuery,
  useStarredRepositoryCandidatesQuery,
  useSyncRepositoryMutation,
  useUpdateRepositoryMutation,
} from '@/hooks/queries/use-repository-queries';
import { dashboardQueryKeys } from '@/hooks/queries/use-dashboard-queries';
import type { Repository, SearchResult } from '@/types/api';

type CandidateSource = 'search' | 'my' | 'starred';
type FilterMode = 'all' | 'active' | 'inactive';

function RepositoryCardSkeleton() {
  return (
    <Card>
      <CardContent className="flex items-center justify-center p-8">
        <Spinner className="h-6 w-6 text-primary" />
      </CardContent>
    </Card>
  );
}

function CandidateItemSkeleton() {
  return (
    <div className="flex items-center justify-center rounded-lg border border-border bg-card p-8">
      <Spinner className="h-5 w-5 text-primary" />
    </div>
  );
}

export function Repositories() {
  const { t, language } = useLanguage();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();

  const [filter, setFilter] = useState<FilterMode>('all');
  const [keyword, setKeyword] = useState(searchParams.get('keyword') ?? '');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [source, setSource] = useState<CandidateSource>('search');
  const [searchInput, setSearchInput] = useState('');
  const [searchKeyword, setSearchKeyword] = useState('');

  const repositoriesQuery = useRepositoryListQuery();
  const { monitoringScope, persistMonitoringScope, updatePreferencesMutation } =
    useMonitoringScopePreferences();
  const createMutation = useCreateRepositoryMutation();
  const syncMutation = useSyncRepositoryMutation();
  const deleteMutation = useDeleteRepositoryMutation();
  const updateMutation = useUpdateRepositoryMutation();

  const myCandidatesQuery = useMyRepositoryCandidatesQuery(dialogOpen && source === 'my');
  const starredCandidatesQuery = useStarredRepositoryCandidatesQuery(dialogOpen && source === 'starred');
  const searchCandidatesQuery = useSearchRepositoryCandidatesQuery(
    searchKeyword,
    dialogOpen && source === 'search' && searchKeyword.length > 1,
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearchKeyword(searchInput.trim());
    }, 350);

    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    setKeyword(searchParams.get('keyword') ?? '');
  }, [searchParams]);

  const repositories = useMemo(
    () => repositoriesQuery.data ?? [],
    [repositoriesQuery.data],
  );
  const scopeRepositoryIds = useMemo(
    () => monitoringScope.repositoryIds ?? [],
    [monitoringScope.repositoryIds],
  );
  const scopeRepositoryIdSet = useMemo(
    () => new Set(scopeRepositoryIds),
    [scopeRepositoryIds],
  );
  const repositoryIds = useMemo(
    () => repositories.map((repository) => repository.id),
    [repositories],
  );

  useRepositoryRealtimeSubscription(repositoryIds);

  const filteredRepositories = useMemo(() => {
    return repositories.filter((item) => {
      const matchesKeyword =
        item.name.toLowerCase().includes(keyword.toLowerCase()) ||
        item.fullName.toLowerCase().includes(keyword.toLowerCase());

      if (filter === 'active') {
        return matchesKeyword && item.isActive;
      }

      if (filter === 'inactive') {
        return matchesKeyword && !item.isActive;
      }

      return matchesKeyword;
    });
  }, [filter, keyword, repositories]);

  const monitoredRepositories = useMemo(
    () => filteredRepositories.filter((repository) => scopeRepositoryIdSet.has(repository.id)),
    [filteredRepositories, scopeRepositoryIdSet],
  );

  const otherRepositories = useMemo(
    () => filteredRepositories.filter((repository) => !scopeRepositoryIdSet.has(repository.id)),
    [filteredRepositories, scopeRepositoryIdSet],
  );

  const currentCandidates = useMemo<SearchResult[]>(() => {
    if (source === 'my') {
      return myCandidatesQuery.data ?? [];
    }

    if (source === 'starred') {
      return starredCandidatesQuery.data ?? [];
    }

    return searchCandidatesQuery.data ?? [];
  }, [myCandidatesQuery.data, searchCandidatesQuery.data, source, starredCandidatesQuery.data]);

  const currentCandidatesLoading =
    (source === 'my' && myCandidatesQuery.isLoading) ||
    (source === 'starred' && starredCandidatesQuery.isLoading) ||
    (source === 'search' && searchCandidatesQuery.isLoading);

  const monitoredMap = useMemo(
    () => new Map(repositories.map((item) => [item.fullName, item])),
    [repositories],
  );

  const formatDateTime = (dateString?: string | null) => {
    if (!dateString) {
      return t('repositories.repo.neverSynced');
    }

    const locale = language === 'zh' ? zhCN : enUS;
    return format(new Date(dateString), 'PP p', { locale });
  };

  const refreshRepositories = async () => {
    await queryClient.invalidateQueries({ queryKey: repositoryQueryKeys.list() });
    await queryClient.invalidateQueries({ queryKey: dashboardQueryKeys.repositories() });
    await repositoriesQuery.refetch();
  };

  const addRepository = async (candidate: SearchResult) => {
    const [owner, repo] = candidate.fullName.split('/');

    if (!owner || !repo) {
      return;
    }

    const createdRepository = await createMutation.mutateAsync({
      platform: candidate.platform,
      owner,
      repo,
    });

    await persistMonitoringScope({
      repositoryIds: Array.from(new Set([...scopeRepositoryIds, createdRepository.id])),
      branchNames: [],
      repositoryBranchScopes: monitoringScope.repositoryBranchScopes,
    });

    await refreshRepositories();
  };

  const addRepositoryToScope = async (id: string) => {
    await persistMonitoringScope({
      repositoryIds: Array.from(new Set([...scopeRepositoryIds, id])),
      branchNames: [],
      repositoryBranchScopes: monitoringScope.repositoryBranchScopes,
    });
  };

  const removeRepositoryFromScope = async (id: string) => {
    await persistMonitoringScope({
      repositoryIds: scopeRepositoryIds.filter((repositoryId) => repositoryId !== id),
      branchNames: [],
      repositoryBranchScopes: monitoringScope.repositoryBranchScopes,
    });
  };

  const syncRepository = async (id: string) => {
    await syncMutation.mutateAsync(id);
    await refreshRepositories();
  };

  const removeRepository = async (id: string) => {
    await deleteMutation.mutateAsync(id);
    if (scopeRepositoryIdSet.has(id)) {
      await removeRepositoryFromScope(id);
    }
    await refreshRepositories();
  };

  const updateRepositoryStatus = async (id: string, isActive: boolean) => {
    await updateMutation.mutateAsync({ id, isActive });
    await refreshRepositories();
  };

  const openSourceLink = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const isAnyActionPending =
    updatePreferencesMutation.isPending ||
    createMutation.isPending ||
    syncMutation.isPending ||
    deleteMutation.isPending ||
    updateMutation.isPending;

  const renderRepositoryCard = (repo: Repository, isInScope: boolean) => {
    const isSyncing = syncMutation.isPending && syncMutation.variables === repo.id;
    const isDeleting = deleteMutation.isPending && deleteMutation.variables === repo.id;
    const isUpdating = updateMutation.isPending && updateMutation.variables?.id === repo.id;
    const isUpdatingScope = updatePreferencesMutation.isPending;
    const cardStyle = repo.isActive
      ? 'border-emerald-500/30 bg-emerald-500/5'
      : 'border-border/80 bg-muted/35 opacity-90';
    const urlStyle = repo.isActive ? '' : 'text-muted-foreground/80';
    const statusBadgeStyle = repo.isActive
      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
      : 'border-border/70 bg-muted/60 text-muted-foreground';

    return (
      <Card key={repo.id} className={cardStyle}>
        <CardHeader className="space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <CardTitle className="text-lg font-semibold tracking-tight text-foreground">
                {repo.fullName}
              </CardTitle>
              <CardDescription className={urlStyle}>{repo.url}</CardDescription>
            </div>
            <Badge variant="outline" className={`rounded-full ${statusBadgeStyle}`}>
              {repo.isActive ? t('repositories.repo.active') : t('repositories.repo.inactive')}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 text-sm text-muted-foreground md:grid-cols-3">
            <div className="flex items-center gap-2">
              <GitBranch className="h-4 w-4" />
              <span>{repo.defaultBranch}</span>
            </div>
            <div className="flex items-center gap-2">
              <RefreshCcw className="h-4 w-4" />
              <span>{formatDateTime(repo.lastSyncAt)}</span>
            </div>
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4" />
              <span>
                {t('repositories.repo.eventCount')}: {repo._count?.events ?? 0}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant={isInScope ? 'secondary' : 'default'}
              size="sm"
              className="gap-2"
              onClick={() => {
                if (isInScope) {
                  removeRepositoryFromScope(repo.id);
                  return;
                }

                addRepositoryToScope(repo.id);
              }}
              disabled={isUpdatingScope || isAnyActionPending}
            >
              {isUpdatingScope ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {isInScope
                ? t('repositories.actions.removeFromScope')
                : t('repositories.actions.addToScope')}
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => updateRepositoryStatus(repo.id, !repo.isActive)}
              disabled={isUpdating || isAnyActionPending}
            >
              {isUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldAlert className="h-4 w-4" />}
              {repo.isActive ? t('repositories.actions.disable') : t('repositories.actions.enable')}
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => syncRepository(repo.id)}
              disabled={isSyncing || isAnyActionPending}
            >
              {isSyncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
              {t('repositories.actions.sync')}
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => openSourceLink(repo.url)}
            >
              <ExternalLink className="h-4 w-4" />
              {t('repositories.actions.open')}
            </Button>

            <Button
              variant="destructive"
              size="sm"
              className="gap-2"
              onClick={() => removeRepository(repo.id)}
              disabled={isDeleting || isAnyActionPending}
            >
              {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {t('repositories.actions.remove')}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <section className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">{t('repositories.page.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('repositories.page.description')}</p>
        </section>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-foreground">{t('repositories.toolbar.title')}</CardTitle>
            <CardDescription>{t('repositories.toolbar.description')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="relative w-full md:max-w-md">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                  placeholder={t('repositories.toolbar.searchPlaceholder')}
                  className="pl-9"
                />
              </div>

              <div className="flex items-center gap-2">
                <Tabs value={filter} onValueChange={(value) => setFilter(value as FilterMode)}>
                  <TabsList>
                    <TabsTrigger value="all">{t('repositories.filters.all')}</TabsTrigger>
                    <TabsTrigger value="active">{t('repositories.filters.active')}</TabsTrigger>
                    <TabsTrigger value="inactive">{t('repositories.filters.inactive')}</TabsTrigger>
                  </TabsList>
                </Tabs>

                <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button className="gap-2" onClick={() => setDialogOpen(true)}>
                        <Plus className="h-4 w-4" />
                        {t('repositories.actions.add')}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t('repositories.actions.add')}</TooltipContent>
                  </Tooltip>

                  <DialogContent className="max-w-2xl">
                    <DialogHeader>
                      <DialogTitle>{t('repositories.dialog.title')}</DialogTitle>
                      <DialogDescription>{t('repositories.dialog.description')}</DialogDescription>
                    </DialogHeader>

                    <Tabs value={source} onValueChange={(value) => setSource(value as CandidateSource)}>
                      <TabsList>
                        <TabsTrigger value="search">{t('repositories.dialog.tabs.search')}</TabsTrigger>
                        <TabsTrigger value="my">{t('repositories.dialog.tabs.my')}</TabsTrigger>
                        <TabsTrigger value="starred">{t('repositories.dialog.tabs.starred')}</TabsTrigger>
                      </TabsList>

                      <TabsContent value="search" className="space-y-3">
                        <div className="space-y-2">
                          <Label htmlFor="repo-search-input">{t('repositories.dialog.searchLabel')}</Label>
                          <Input
                            id="repo-search-input"
                            value={searchInput}
                            onChange={(event) => setSearchInput(event.target.value)}
                            placeholder={t('repositories.dialog.searchPlaceholder')}
                          />
                        </div>
                      </TabsContent>

                      <TabsContent value="my" />
                      <TabsContent value="starred" />
                    </Tabs>

                    <ScrollArea className="h-[320px] max-w-full overflow-x-hidden rounded-lg border border-border p-3">
                      <div className="max-w-full space-y-3 overflow-x-hidden">
                        {currentCandidatesLoading ? (
                          <>
                            <CandidateItemSkeleton />
                            <CandidateItemSkeleton />
                          </>
                        ) : currentCandidates.length === 0 ? (
                          <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
                            {t('repositories.dialog.empty')}
                          </div>
                        ) : (
                          currentCandidates.map((candidate) => {
                            const existingRepository = monitoredMap.get(candidate.fullName);
                            const alreadyAdded = Boolean(existingRepository);
                            const alreadyInScope = Boolean(
                              existingRepository && scopeRepositoryIdSet.has(existingRepository.id),
                            );
                            const canEnable = Boolean(existingRepository && !existingRepository.isActive);
                            const canAddToScope = Boolean(
                              existingRepository && existingRepository.isActive && !alreadyInScope,
                            );
                            const isCreating =
                              createMutation.isPending &&
                              createMutation.variables?.owner === candidate.owner.login &&
                              createMutation.variables?.repo === candidate.name;
                            const isEnabling =
                              updateMutation.isPending &&
                              updateMutation.variables?.id === existingRepository?.id;
                            const isUpdatingScope = updatePreferencesMutation.isPending;

                            return (
                              <div
                                key={`${candidate.platform}-${candidate.id}`}
                                className={[
                                  'w-full max-w-full space-y-3 overflow-hidden rounded-lg border p-4 transition-all',
                                  alreadyAdded
                                    ? 'border-primary/30 bg-primary/5'
                                    : 'border-border bg-card hover:border-primary/20 hover:bg-white/5',
                                ].join(' ')}
                              >
                                <div className="flex items-start gap-3">
                                  <Avatar className="h-10 w-10 rounded-full border border-border">
                                    <AvatarImage src={candidate.owner.avatarUrl} alt={candidate.owner.login} />
                                    <AvatarFallback className="bg-muted text-foreground">
                                      {candidate.owner.login.slice(0, 1).toUpperCase()}
                                    </AvatarFallback>
                                  </Avatar>

                                  <div className="min-w-0 flex-1 space-y-1">
                                    <p className="truncate text-sm font-medium text-foreground">{candidate.fullName}</p>
                                    <p className="line-clamp-2 text-sm text-muted-foreground">
                                      {candidate.description || t('repositories.dialog.noDescription')}
                                    </p>
                                  </div>
                                </div>

                                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                  <Badge variant="secondary" className="rounded-full">
                                    {candidate.platform}
                                  </Badge>
                                  <span className="flex items-center gap-1">
                                    <Star className="h-3 w-3" />
                                    {candidate.stargazersCount}
                                  </span>
                                  {candidate.language ? (
                                    <span className="flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                                      <span className="font-mono">&lt;&gt;</span>
                                      {candidate.language}
                                    </span>
                                  ) : null}
                                </div>

                                <div className="grid min-w-0 max-w-full grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center">
                                  <Button
                                    size="sm"
                                    onClick={() => {
                                      if (canEnable && existingRepository) {
                                        updateRepositoryStatus(existingRepository.id, true);
                                        return;
                                      }
                                      if (canAddToScope && existingRepository) {
                                        addRepositoryToScope(existingRepository.id);
                                        return;
                                      }
                                      addRepository(candidate);
                                    }}
                                    disabled={
                                      (!canEnable && !canAddToScope && alreadyAdded) ||
                                      isCreating ||
                                      isEnabling ||
                                      isUpdatingScope ||
                                      isAnyActionPending
                                    }
                                    className="w-full gap-2 sm:w-auto"
                                  >
                                    {isCreating || isEnabling || isUpdatingScope ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <Plus className="h-4 w-4" />
                                    )}
                                    {canEnable
                                      ? t('repositories.dialog.enableButton')
                                      : canAddToScope
                                        ? t('repositories.dialog.addToScopeButton')
                                        : alreadyInScope
                                          ? t('repositories.dialog.inScope')
                                          : alreadyAdded
                                            ? t('repositories.dialog.added')
                                            : t('repositories.dialog.addButton')}
                                  </Button>

                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="w-full gap-2 sm:w-auto"
                                    onClick={() => openSourceLink(candidate.htmlUrl)}
                                  >
                                    <ExternalLink className="h-4 w-4" />
                                    {t('repositories.actions.open')}
                                  </Button>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </ScrollArea>

                    <DialogFooter>
                      <Button variant="outline" onClick={() => setDialogOpen(false)}>
                        {t('repositories.dialog.close')}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </CardContent>
        </Card>

        {repositoriesQuery.isLoading ? (
          <section className="space-y-4">
            <RepositoryCardSkeleton />
            <RepositoryCardSkeleton />
          </section>
        ) : repositoriesQuery.isError ? (
          <Card>
            <CardContent className="flex items-center justify-between gap-4 p-4">
              <div className="flex items-center gap-2 text-sm text-destructive">
                <ShieldAlert className="h-4 w-4" />
                <span>{t('repositories.error.loadFailed')}</span>
              </div>
              <Button variant="outline" size="sm" onClick={() => repositoriesQuery.refetch()}>
                {t('repositories.error.retry')}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            <section className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-1">
                  <h2 className="text-lg font-semibold text-foreground">
                    {t('repositories.scope.title')}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {t('repositories.scope.description')}
                  </p>
                </div>
                <Badge variant="secondary" className="rounded-full">
                  {monitoredRepositories.length}
                </Badge>
              </div>

              {monitoredRepositories.length === 0 ? (
                <Card>
                  <CardContent className="p-6 text-sm text-muted-foreground">
                    {t('repositories.scope.empty')}
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4">
                  {monitoredRepositories.map((repo) => renderRepositoryCard(repo, true))}
                </div>
              )}
            </section>

            <section className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-1">
                  <h2 className="text-lg font-semibold text-foreground">
                    {t('repositories.other.title')}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {t('repositories.other.description')}
                  </p>
                </div>
                <Badge variant="outline" className="rounded-full">
                  {otherRepositories.length}
                </Badge>
              </div>

              {otherRepositories.length === 0 ? (
                <Card>
                  <CardContent className="p-6 text-sm text-muted-foreground">
                    {filteredRepositories.length === 0
                      ? t('repositories.empty.list')
                      : t('repositories.other.empty')}
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4">
                  {otherRepositories.map((repo) => renderRepositoryCard(repo, false))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
