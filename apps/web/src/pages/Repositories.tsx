import { useState, useEffect } from 'react';
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
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { repositoryService } from '@/services/repository.service';
import type { Repository, CreateRepositoryDto, Platform } from '@/types/api';

const filters = ['All', 'Active', 'Inactive'];

export function Repositories() {
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newRepo, setNewRepo] = useState<CreateRepositoryDto>({
    platform: 'GITHUB' as Platform,
    owner: '',
    repo: '',
  });
  const [isCreating, setIsCreating] = useState(false);

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

  const handleAddRepository = async () => {
    if (!newRepo.owner || !newRepo.repo) {
      toast.error('请填写仓库所有者 和仓库名称');
      return;
    }

    try {
      setIsCreating(true);
      await repositoryService.create(newRepo);
      toast.success('仓库添加成功');
      setIsAddDialogOpen(false);
      setNewRepo({
        platform: 'GITHUB' as Platform,
        owner: '',
        repo: '',
      });
      loadRepositories();
    } catch (error) {
      console.error('Failed to add repository:', error);
      toast.error('添加仓库失败');
    } finally {
      setIsCreating(false);
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
      activeFilter === 'All' ||
      (activeFilter === 'Active' && repo.isActive) ||
      (activeFilter === 'Inactive' && !repo.isActive);
    return matchesSearch && matchesFilter;
  });

  const getRiskBadge = (isActive: boolean) => {
    if (!isActive) return <span className="badge-warning">Inactive</span>;
    return <span className="badge-success">Active</span>;
  };

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
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button className="btn-x-primary gap-2">
              <Plus className="w-4 h-4" />
              添加仓库
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>添加仓库</DialogTitle>
              <DialogDescription>输入 GitHub 或 GitLab 仓库信息以连接到平台</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="platform">平台</Label>
                <Select
                  value={newRepo.platform}
                  onValueChange={(value: Platform) =>
                    setNewRepo({ ...newRepo, platform: value })
                  }
                >
                  <SelectTrigger id="platform">
                    <SelectValue placeholder="选择平台" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GITHUB">GitHub</SelectItem>
                    <SelectItem value="GITLAB">GitLab</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="owner">仓库所有者</Label>
                <Input
                  id="owner"
                  placeholder="例如: facebook"
                  value={newRepo.owner}
                  onChange={(e) => setNewRepo({ ...newRepo, owner: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="repo">仓库名称</Label>
                <Input
                  id="repo"
                  placeholder="例如: react"
                  value={newRepo.repo}
                  onChange={(e) => setNewRepo({ ...newRepo, repo: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                取消
              </Button>
              <Button onClick={handleAddRepository} disabled={isCreating}>
                {isCreating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    添加中...
                  </>
                ) : (
                  '添加仓库'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--github-text-secondary)]" />
          <Input
            placeholder="搜索仓库..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-[var(--github-surface)] border-[var(--github-border)] text-sm"
          />
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-2 sm:pb-0">
          {filters.map((filter) => (
            <Button
              key={filter}
              variant={activeFilter === filter ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveFilter(filter)}
              className={`whitespace-nowrap text-xs ${
                activeFilter === filter
                  ? 'bg-[var(--github-accent)] text-white hover:bg-[var(--github-accent-hover)]'
                  : 'border-[var(--github-border)] text-[var(--github-text-secondary)] hover:text-white hover:bg-white/5'
              }`}
            >
              {filter}
            </Button>
          ))}
        </div>
      </div>

      {/* Repository Cards */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-[var(--github-accent)]" />
        </div>
      ) : (
        <div className="space-y-4">
          {filteredRepos.map((repo) => (
            <Card
              key={repo.id}
              className="card-github hover:border-[var(--github-accent)]/30 transition-all duration-300 group"
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    {/* Header */}
                    <div className="flex items-center gap-3 mb-2">
                      <GitBranch className="w-5 h-5 text-[var(--github-accent)]" />
                      <h3 className="text-lg font-semibold text-white group-hover:text-[var(--github-accent)] transition-colors">
                        {repo.fullName}
                      </h3>
                      <span
                        className="px-2 py-0.5 text-xs rounded-full bg-[var(--github-border)] text-[var(--github-text-secondary)]"
                      >
                        {repo.platform === 'GITHUB' ? 'GitHub' : 'GitLab'}
                      </span>
                    </div>

                    {/* URL */}
                    <p className="text-sm text-[var(--github-text-secondary)] mb-3">
                      {repo.url}
                    </p>

                    {/* Info */}
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

                  {/* Right Side */}
                  <div className="flex flex-col items-end gap-3">
                    {getRiskBadge(repo.isActive)}

                    {/* Status */}
                    <div className="w-24">
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-[var(--github-text-secondary)]">事件</span>
                        <span className="font-medium text-white">
                          {repo._count?.events || 0}
                        </span>
                      </div>
                      <Progress
                        value={Math.min((repo._count?.events || 0) / 10, 1) * 100}
                        className="h-1.5 bg-[var(--github-border)]"
                      />
                    </div>

                    {/* Actions */}
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
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && filteredRepos.length === 0 && (
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
    </div>
  );
}
