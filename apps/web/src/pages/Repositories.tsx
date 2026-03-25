import { useState, useEffect, useCallback } from 'react';
import {
  GitBranch,
  AlertCircle,
  Clock,
  Search,
  Plus,
  MoreHorizontal,
  ExternalLink,
  RefreshCw,
  Trash2,
  Loader2,
  Star,
  Code,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { repositoryService } from '@/services/repository.service';
import type { Repository, SearchResult } from '@/types/api';

const filters = [
  { value: 'all', label: '全部' },
  { value: 'monitored', label: '已监控' },
  { value: 'recent', label: '最近更新' },
];

export function Repositories() {
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [myRepos, setMyRepos] = useState<SearchResult[]>([]);
  const [starredRepos, setStarredRepos] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [myReposLoading, setMyReposLoading] = useState(false);
  const [starredLoading, setStarredLoading] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  // 搜索相关状态
  const [searchInput, setSearchInput] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    loadRepositories();
  }, []);

  const loadRepositories = async () => {
    try {
      setLoading(true);
      const data = await repositoryService.getAll();
      setRepositories(data);
    } catch (error) {
      console.error('Failed to load repositories:', error);
      toast.error('加载仓库失败');
    } finally {
      setLoading(false);
    }
  };

  const loadMyRepos = async () => {
    if (myRepos.length > 0) return; // 已有数据不重复加载
    try {
      setMyReposLoading(true);
      const data = await repositoryService.getMyRepos();
      setMyRepos(data);
      if (data.length === 0) {
        toast.info('暂无作为 contributor 的仓库');
      }
    } catch (error) {
      console.error('Failed to load my repos:', error);
      toast.error('加载我的仓库失败');
    } finally {
      setMyReposLoading(false);
    }
  };

  const loadStarredRepos = async () => {
    if (starredRepos.length > 0) return; // 已有数据不重复加载
    try {
      setStarredLoading(true);
      const data = await repositoryService.getStarred();
      setStarredRepos(data);
      if (data.length === 0) {
        toast.info('暂无 star 过的仓库');
      }
    } catch (error) {
      console.error('Failed to load starred repos:', error);
      toast.error('加载 starred 仓库失败');
    } finally {
      setStarredLoading(false);
    }
  };

  // 搜索仓库
  const handleSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    try {
      setIsSearching(true);
      const results = await repositoryService.search(query);
      setSearchResults(results);
    } catch (error) {
      console.error('Failed to search repositories:', error);
    } finally {
      setIsSearching(false);
    }
  }, []);

  // 防抖搜索
  useEffect(() => {
    const timer = setTimeout(() => {
      handleSearch(searchInput);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, handleSearch]);

  // 添加仓库（通过搜索结果）
  const handleAddFromSearch = async (repo: SearchResult) => {
    const [owner, name] = repo.fullName.split('/');
    try {
      setIsAdding(true);
      await repositoryService.create({
        platform: repo.platform,
        owner,
        repo: name,
      });
      toast.success(`已添加 ${repo.fullName}`);
      setIsAddDialogOpen(false);
      setSearchInput('');
      setSearchResults([]);
      loadRepositories();
    } catch (error) {
      console.error('Failed to add repository:', error);
      toast.error('添加仓库失败');
    } finally {
      setIsAdding(false);
    }
  };

  const handleSync = async (id: string) => {
    try {
      setSyncingId(id);
      await repositoryService.sync(id);
      toast.success('同步完成');
      loadRepositories();
    } catch (error) {
      console.error('Failed to sync repository:', error);
      toast.error('同步失败');
    } finally {
      setSyncingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await repositoryService.delete(id);
      toast.success('仓库已移除');
      loadRepositories();
    } catch (error) {
      console.error('Failed to delete repository:', error);
      toast.error('移除仓库失败');
    }
  };

  const filteredRepos = repositories.filter((repo) => {
    const matchesSearch =
      repo.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      repo.fullName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter =
      activeFilter === 'all' ||
      (activeFilter === 'monitored' && repo.isActive) ||
      (activeFilter === 'recent' && repo.lastSyncAt);
    return matchesSearch && matchesFilter;
  });

  // 检查仓库是否已添加
  const isRepoMonitored = (fullName: string) => {
    return repositories.some((r) => r.fullName === fullName);
  };

  const formatStars = (count: number) => {
    if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}k`;
    }
    return count.toString();
  };

  // 渲染仓库卡片
  const renderRepoCard = (repo: Repository) => (
    <Card
      key={repo.id}
      className="card-github hover:border-[var(--github-accent)]/30 transition-all duration-300 group"
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2">
              <GitBranch className="w-5 h-5 text-[var(--github-accent)]" />
              <h3 className="text-lg font-semibold text-white group-hover:text-[var(--github-accent)] transition-colors">
                {repo.fullName}
              </h3>
              <span className="px-2 py-0.5 text-xs rounded-full bg-[var(--github-border)] text-[var(--github-text-secondary)]">
                {repo.platform === 'GITHUB' ? 'GitHub' : 'GitLab'}
              </span>
            </div>
            <p className="text-sm text-[var(--github-text-secondary)] mb-3">{repo.url}</p>
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <div className="flex items-center gap-1 text-[var(--github-text-secondary)]">
                <GitBranch className="w-4 h-4" />
                {repo.defaultBranch}
              </div>
              <div className="flex items-center gap-1 text-[var(--github-text-secondary)]">
                <Clock className="w-4 h-4" />
                {repo.lastSyncAt
                  ? new Date(repo.lastSyncAt).toLocaleString('zh-CN')
                  : '未同步'}
              </div>
              <div className="flex items-center gap-1 text-[var(--github-text-secondary)]">
                <AlertCircle className="w-4 h-4" />
                {repo._count?.events || 0} 事件
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-3">
            <Badge variant={repo.isActive ? 'default' : 'secondary'} className={repo.isActive ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'}>
              {repo.isActive ? 'Active' : 'Inactive'}
            </Badge>
            <div className="w-24">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-[var(--github-text-secondary)]">事件</span>
                <span className="font-medium text-white">{repo._count?.events || 0}</span>
              </div>
              <Progress
                value={Math.min((repo._count?.events || 0) / 10, 1) * 100}
                className="h-1.5 bg-[var(--github-border)]"
              />
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-[var(--github-text-secondary)]"
                onClick={() => handleSync(repo.id)}
                disabled={syncingId === repo.id}
              >
                {syncingId === repo.id ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-[var(--github-text-secondary)]">
                    <MoreHorizontal className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="bg-[var(--github-surface)] border-[var(--github-border)]">
                  <DropdownMenuItem
                    className="text-sm text-[var(--github-text)] hover:bg-white/5"
                    onClick={() => window.open(repo.url, '_blank')}
                  >
                    <ExternalLink className="w-4 h-4 mr-2" />
                    在 {repo.platform === 'GITHUB' ? 'GitHub' : 'GitLab'} 查看
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-sm text-[var(--github-text)] hover:bg-white/5"
                    onClick={() => handleSync(repo.id)}
                    disabled={syncingId === repo.id}
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    同步事件
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-sm text-red-400 hover:bg-white/5"
                    onClick={() => handleDelete(repo.id)}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    移除仓库
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  // 渲染搜索结果卡片
  const renderSearchCard = (repo: SearchResult, isMonitored: boolean) => (
    <div
      key={repo.id}
      className={`p-4 rounded-lg border transition-all duration-200 ${
        isMonitored
          ? 'border-green-500/30 bg-green-500/5 cursor-default'
          : 'border-[var(--github-border)] hover:border-[var(--github-accent)]/50 bg-[var(--github-surface)] cursor-pointer'
      }`}
      onClick={() => !isMonitored && handleAddFromSearch(repo)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <img
              src={repo.owner.avatarUrl}
              alt={repo.owner.login}
              className="w-5 h-5 rounded-full"
            />
            <span className="text-sm text-[var(--github-text-secondary)]">
              {repo.owner.login}/
            </span>
            <span className="text-sm font-medium text-white">{repo.name}</span>
          </div>
          <p className="text-sm text-[var(--github-text-secondary)] line-clamp-1 mb-2">
            {repo.description || '暂无描述'}
          </p>
          <div className="flex items-center gap-4 text-xs text-[var(--github-text-secondary)]">
            <div className="flex items-center gap-1">
              <Star className="w-3.5 h-3.5" />
              {formatStars(repo.stargazersCount)}
            </div>
            {repo.language && (
              <div className="flex items-center gap-1">
                <Code className="w-3.5 h-3.5" />
                {repo.language}
              </div>
            )}
          </div>
        </div>
        <div className="flex-shrink-0">
          {isMonitored ? (
            <Badge variant="outline" className="border-green-500/30 text-green-400">
              已监控
            </Badge>
          ) : (
            <Button size="sm" className="btn-x-primary gap-1 h-8">
              <Plus className="w-3.5 h-3.5" />
              添加
            </Button>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">仓库管理</h1>
          <p className="text-sm text-[var(--github-text-secondary)] mt-1">
            管理并监控您连接的代码仓库
          </p>
        </div>
        <Button
          className="btn-x-primary gap-2"
          onClick={() => setIsAddDialogOpen(true)}
        >
          <Plus className="w-4 h-4" />
          添加仓库
        </Button>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--github-text-secondary)]" />
          <Input
            placeholder="搜索已监控的仓库..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-[var(--github-surface)] border-[var(--github-border)] text-sm"
          />
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-2 sm:pb-0">
          {filters.map((filter) => (
            <Button
              key={filter.value}
              variant={activeFilter === filter.value ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveFilter(filter.value)}
              className={`whitespace-nowrap text-xs ${
                activeFilter === filter.value
                  ? 'bg-orange-500 text-white hover:bg-orange-600'
                  : 'border-[var(--github-border)] text-[var(--github-text-secondary)] hover:text-white hover:bg-white/5'
              }`}
            >
              {filter.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="monitored" className="space-y-4">
        <TabsList className="bg-[var(--github-surface)] border border-[var(--github-border)]">
          <TabsTrigger
            value="monitored"
            className="data-[state=active]:bg-orange-500 data-[state=active]:text-white data-[state=active]:border-orange-500"
          >
            已监控 ({repositories.length})
          </TabsTrigger>
          <TabsTrigger
            value="myrepos"
            className="data-[state=active]:bg-orange-500 data-[state=active]:text-white data-[state=active]:border-orange-500"
            onClick={loadMyRepos}
          >
            我的仓库
          </TabsTrigger>
          <TabsTrigger
            value="starred"
            className="data-[state=active]:bg-orange-500 data-[state=active]:text-white data-[state=active]:border-orange-500"
            onClick={loadStarredRepos}
          >
            Starred
          </TabsTrigger>
        </TabsList>

        {/* 已监控的仓库 */}
        <TabsContent value="monitored" className="space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-[var(--github-accent)]" />
            </div>
          ) : filteredRepos.length > 0 ? (
            <div className="space-y-4">{filteredRepos.map(renderRepoCard)}</div>
          ) : (
            <div className="text-center py-16">
              <div className="w-16 h-16 rounded-full bg-[var(--github-surface)] flex items-center justify-center mx-auto mb-4">
                <GitBranch className="w-8 h-8 text-[var(--github-text-secondary)]" />
              </div>
              <h3 className="text-lg font-medium text-white mb-2">暂无仓库</h3>
              <p className="text-sm text-[var(--github-text-secondary)] mb-4">
                添加您的第一个代码仓库以开始监控
              </p>
              <Button onClick={() => setIsAddDialogOpen(true)} className="btn-x-primary gap-2">
                <Plus className="w-4 h-4" />
                添加仓库
              </Button>
            </div>
          )}
        </TabsContent>

        {/* 我的仓库 (作为 contributor) */}
        <TabsContent value="myrepos" className="space-y-4">
          {myReposLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-[var(--github-accent)]" />
            </div>
          ) : myRepos.length > 0 ? (
            <div className="space-y-3">
              {myRepos.map((repo) => renderSearchCard(repo, isRepoMonitored(repo.fullName)))}
            </div>
          ) : (
            <div className="text-center py-16">
              <div className="w-16 h-16 rounded-full bg-[var(--github-surface)] flex items-center justify-center mx-auto mb-4">
                <GitBranch className="w-8 h-8 text-[var(--github-text-secondary)]" />
              </div>
              <h3 className="text-lg font-medium text-white mb-2">暂无仓库</h3>
              <p className="text-sm text-[var(--github-text-secondary)]">
                您还没有作为 contributor 的仓库，或未绑定 GitHub 账号
              </p>
            </div>
          )}
        </TabsContent>

        {/* Starred 仓库 */}
        <TabsContent value="starred" className="space-y-4">
          {starredLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-[var(--github-accent)]" />
            </div>
          ) : starredRepos.length > 0 ? (
            <div className="space-y-3">
              {starredRepos.map((repo) => renderSearchCard(repo, isRepoMonitored(repo.fullName)))}
            </div>
          ) : (
            <div className="text-center py-16">
              <div className="w-16 h-16 rounded-full bg-[var(--github-surface)] flex items-center justify-center mx-auto mb-4">
                <Star className="w-8 h-8 text-[var(--github-text-secondary)]" />
              </div>
              <h3 className="text-lg font-medium text-white mb-2">暂无 Starred</h3>
              <p className="text-sm text-[var(--github-text-secondary)]">
                您还没有 star 过的仓库，或未绑定 GitHub 账号
              </p>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* 添加仓库对话框 - 搜索选择模式 */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>添加仓库</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-hidden flex flex-col gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--github-text-secondary)]" />
              <Input
                placeholder="搜索 GitHub 仓库..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-10"
                autoFocus
              />
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 min-h-[200px] max-h-[400px]">
              {isSearching ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-[var(--github-accent)]" />
                </div>
              ) : searchResults.length > 0 ? (
                <div className="space-y-2">
                  <Label className="text-xs text-[var(--github-text-secondary)]">
                    搜索结果
                  </Label>
                  {searchResults.map((repo) =>
                    renderSearchCard(repo, isRepoMonitored(repo.fullName))
                  )}
                </div>
              ) : searchInput ? (
                <div className="text-center py-8 text-sm text-[var(--github-text-secondary)]">
                  未找到相关仓库
                </div>
              ) : (
                <div className="text-center py-8 text-sm text-[var(--github-text-secondary)]">
                  输入关键词搜索 GitHub 仓库
                </div>
              )}
            </div>

            {isAdding && (
              <div className="absolute inset-0 bg-background/50 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-[var(--github-accent)]" />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
