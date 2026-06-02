import { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  GitBranch, 
  RotateCw, 
  ChevronRight, 
  ChevronDown, 
  FileCode, 
  History, 
  Sparkles, 
  Loader2, 
  Check, 
  AlertCircle,
  FolderPlus,
  Pencil
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { isDesktopRuntime } from '@/lib/desktop';
import { toast } from 'sonner';

interface GitFileChange {
  path: string;
  status: 'modified' | 'added' | 'deleted' | 'untracked' | 'renamed';
  staged: boolean;
}

interface GitCommit {
  hash: string;
  parents: string[];
  author: string;
  age: string;
  message: string;
  refs?: Array<{
    name: string;
    type: 'head' | 'local' | 'remote' | 'tag';
  }>;
}

const parseMergeMessage = (message: string) => {
  const mergeRegex = /merge\s+(?:branch\s+'([^']+)'|remote-tracking\s+branch\s+'([^']+)')(?:\s+of\s+\S+)?\s+into\s+(\S+)/i;
  const match = message.match(mergeRegex);
  if (match) {
    const source = match[1] || match[2];
    const target = match[3].replace(/['"]/g, '');
    return { source, target };
  }
  return null;
};

const computeCommitBranchInfo = (commits: GitCommit[], activeBranch: string) => {
  if (!commits || commits.length === 0) return [];

  // 1. Identify all branch heads and their hashes
  const branchHeads: { name: string; hash: string }[] = [];
  commits.forEach(c => {
    if (c.refs) {
      c.refs.forEach((ref) => {
        if (ref.type === 'local' || ref.type === 'remote' || ref.type === 'head') {
          const name = ref.name.replace(/^origin\//, '');
          if (!branchHeads.some(b => b.name === name)) {
            branchHeads.push({ name, hash: c.hash });
          }
        }
      });
    }
  });

  // Ensure activeBranch is tracked as a branch head, even if it's not explicitly in the refs list of the 20 commits
  if (activeBranch && !branchHeads.some(b => b.name === activeBranch) && commits.length > 0) {
    branchHeads.push({ name: activeBranch, hash: commits[0].hash });
  }

  // 2. Calculate distances from each branch head to all its ancestors via BFS
  const branchDistances: Record<string, Record<string, number>> = {};
  
  branchHeads.forEach(bh => {
    const distances: Record<string, number> = {};
    const queue: { hash: string; dist: number }[] = [{ hash: bh.hash, dist: 0 }];
    
    while (queue.length > 0) {
      const { hash, dist } = queue.shift()!;
      if (hash in distances && distances[hash] <= dist) continue;
      distances[hash] = dist;
      
      const commit = commits.find(c => c.hash === hash);
      if (commit && commit.parents) {
        commit.parents.forEach(pHash => {
          queue.push({ hash: pHash, dist: dist + 1 });
        });
      }
    }
    branchDistances[bh.name] = distances;
  });

  // 3. Define base branch rules
  const baseBranchNames = ['main', 'master', 'dev', 'develop', 'dev-electron', 'dev-web', 'master-electron'];

  const getBaseBranch = (branchName: string) => {
    if (baseBranchNames.includes(branchName)) return null;
    
    // Base branch of B is the closest base branch that has commits in B's history
    const distances = branchDistances[branchName];
    if (!distances) return null;
    
    let bestBase: string | null = null;
    let minDistance = Infinity;
    
    baseBranchNames.forEach(baseName => {
      if (baseName === branchName) return;
      const baseDistances = branchDistances[baseName];
      if (baseDistances) {
        // Find if there is a common commit
        for (const hash in distances) {
          if (hash in baseDistances) {
            // Find the split point (which has dist in distances)
            const splitDist = distances[hash];
            if (splitDist < minDistance) {
              minDistance = splitDist;
              bestBase = baseName;
            }
          }
        }
      }
    });
    
    // Fallback: look for any other branch that contains the split point
    if (!bestBase) {
      for (const otherName in branchDistances) {
        if (otherName === branchName) continue;
        const otherDistances = branchDistances[otherName];
        for (const hash in distances) {
          if (hash in otherDistances) {
            const splitDist = distances[hash];
            if (splitDist < minDistance) {
              minDistance = splitDist;
              bestBase = otherName;
            }
          }
        }
      }
    }
    
    return bestBase;
  };

  // Cache base branches
  const branchBases: Record<string, string | null> = {};
  branchHeads.forEach(bh => {
    branchBases[bh.name] = getBaseBranch(bh.name);
  });

  // 4. Map each commit to its closest branch and base branch
  return commits.map(commit => {
    let primaryBranch = activeBranch || 'main';
    let minDistance = Infinity;
    
    // Find the branch head that is closest to this commit
    for (const name in branchDistances) {
      const dists = branchDistances[name];
      if (commit.hash in dists) {
        const d = dists[commit.hash];
        // Prefer active branch if distances are tied, otherwise prefer the feature branch (non-base) or the closest one
        if (d < minDistance) {
          minDistance = d;
          primaryBranch = name;
        } else if (d === minDistance) {
          if (name === activeBranch) {
            primaryBranch = name;
          } else if (!baseBranchNames.includes(name) && baseBranchNames.includes(primaryBranch)) {
            primaryBranch = name;
          }
        }
      }
    }
    
    const baseBranch = branchBases[primaryBranch] || null;
    
    return {
      commit,
      primaryBranch,
      baseBranch,
    };
  });
};

interface GitTreePanelProps {
  repositoryId: string;
  repositoryUrl?: string;
  localCwd?: string | null;
  onAskAgent?: (prompt: string) => void;
  refreshTrigger?: number;
  onCwdAssociated?: (cwd: string) => void;
}

export function GitTreePanel({
  repositoryId,
  repositoryUrl,
  localCwd,
  onAskAgent,
  refreshTrigger = 0,
  onCwdAssociated
}: GitTreePanelProps) {
  const [isDesktop, setIsDesktop] = useState(false);
  const [loading, setLoading] = useState(false);
  const [cwd, setCwd] = useState<string | null | undefined>(localCwd);
  const [gitStatus, setGitStatus] = useState<{
    branch: string;
    cwd: string;
    changes: GitFileChange[];
    commits: GitCommit[];
  } | null>(null);

  // Accordion collapsible states
  const [expandedStaged, setExpandedStaged] = useState(true);
  const [expandedUnstaged, setExpandedUnstaged] = useState(true);
  const [expandedUntracked, setExpandedUntracked] = useState(true);

  // Sync internal cwd state when prop changes
  useEffect(() => {
    setCwd(localCwd);
  }, [localCwd]);

  // Check desktop runtime
  useEffect(() => {
    setIsDesktop(isDesktopRuntime());
  }, []);

  // Fetch git status from Electron main process
  const fetchGitStatus = useCallback(async () => {
    if (!isDesktopRuntime() || !cwd) return;
    setLoading(true);
    try {
      const result = await window.repoPulseDesktop!.git!.getStatus({ cwd });
      if (result && result.isGitRepo) {
        setGitStatus({
          branch: result.branch,
          cwd: result.cwd,
          changes: result.changes,
          commits: result.commits,
        });
      } else {
        setGitStatus(null);
      }
    } catch (err) {
      console.error('Failed to fetch git status via IPC:', err);
      toast.error('获取本地 Git 状态失败');
    } finally {
      // Add a slight delay so the gorgeous pull-down buffering animation is smooth and visible
      setTimeout(() => {
        setLoading(false);
      }, 800);
    }
  }, [cwd]);

  // Fetch on mount or Cwd / Trigger changes
  useEffect(() => {
    if (cwd) {
      fetchGitStatus();
    } else {
      setGitStatus(null);
    }
  }, [cwd, fetchGitStatus, refreshTrigger]);

  // 主进程本地 git 监听检测到变化时，若是当前面板的本地仓库则即时重载。
  useEffect(() => {
    if (!isDesktopRuntime() || !cwd) return;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ cwd?: string }>).detail;
      if (detail?.cwd === cwd) {
        void fetchGitStatus();
      }
    };
    window.addEventListener('repo-pulse:local-git-changed', handler);
    return () => window.removeEventListener('repo-pulse:local-git-changed', handler);
  }, [cwd, fetchGitStatus]);

  const handleAssociateLocalWorkspace = async () => {
    if (!isDesktopRuntime() || !repositoryUrl) return;
    try {
      setLoading(true);
      const result = await window.repoPulseDesktop!.git!.selectDirectory({
        repositoryUrl
      });
      
      if (result.canceled) return;
      
      if (result.success && result.cwd) {
        const memory = {
          cwd: result.cwd,
          branch: result.branch || 'HEAD',
          authorizedAt: new Date().toISOString(),
        };
        const key = `repo-pulse:agent-workspace-memory:${repositoryId}`;
        localStorage.setItem(key, JSON.stringify(memory));
        setCwd(result.cwd);
        toast.success('本地工作区关联成功！');
        if (onCwdAssociated) {
          onCwdAssociated(result.cwd);
        }
      } else {
        toast.error(result.error || '关联本地工作区失败，仓库不匹配或无效。');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error('选择目录出错：' + message);
    } finally {
      setLoading(false);
    }
  };

  // Split changes into categories
  const stagedChanges = gitStatus?.changes.filter(c => c.staged) || [];
  const unstagedChanges = gitStatus?.changes.filter(c => !c.staged && c.status !== 'untracked') || [];
  const untrackedChanges = gitStatus?.changes.filter(c => c.status === 'untracked') || [];

  const graphCommits = useMemo(() => {
    return computeCommitBranchInfo(gitStatus?.commits || [], gitStatus?.branch || '');
  }, [gitStatus?.commits, gitStatus?.branch]);

  const handleAskAgentAnalyze = () => {
    if (!onAskAgent) return;
    onAskAgent('当前工作区有哪些修改？帮我分析一下具体的代码变更，并生成一份符合规范的 Git commit message 模板。');
  };

  const handleAskAgentMerge = () => {
    if (!onAskAgent) return;
    onAskAgent('帮我对比当前分支和主分支的区别，并说明是否可以直接安全合并，或者有潜在风险。');
  };

  // Helper to get status badges
  const getStatusBadge = (status: GitFileChange['status']) => {
    switch (status) {
      case 'added':
        return <span className="text-[10px] font-bold text-emerald-500 w-4 h-4 flex items-center justify-center bg-emerald-500/10 rounded">A</span>;
      case 'modified':
        return <span className="text-[10px] font-bold text-amber-500 w-4 h-4 flex items-center justify-center bg-amber-500/10 rounded">M</span>;
      case 'deleted':
        return <span className="text-[10px] font-bold text-rose-500 w-4 h-4 flex items-center justify-center bg-rose-500/10 rounded">D</span>;
      case 'untracked':
        return <span className="text-[10px] font-bold text-emerald-400 w-4 h-4 flex items-center justify-center bg-emerald-500/5 rounded">U</span>;
      case 'renamed':
        return <span className="text-[10px] font-bold text-indigo-400 w-4 h-4 flex items-center justify-center bg-indigo-500/10 rounded">R</span>;
      default:
        return null;
    }
  };

  // Render a clean file list item (stacked layout to avoid squeezing in narrow sidebars)
  const renderFileItem = (change: GitFileChange) => {
    const parts = change.path.split('/');
    const filename = parts.pop() || '';
    const dirPath = parts.join('/') + (parts.length > 0 ? '/' : '');

    return (
      <div 
        key={change.path} 
        className={cn(
          "flex items-start justify-between py-1.5 px-2 rounded hover:bg-secondary/45 text-xs font-mono group select-none transition-colors",
          change.status === 'deleted' && "text-muted-foreground line-through opacity-70"
        )}
        title={change.path}
      >
        <div className="flex items-start gap-2 min-w-0 flex-1">
          <FileCode className={cn(
            "h-4 w-4 shrink-0 mt-0.5",
            change.status === 'added' || change.status === 'untracked' ? "text-emerald-500/80" :
            change.status === 'modified' ? "text-amber-500/80" :
            change.status === 'deleted' ? "text-rose-500/70" : "text-muted-foreground"
          )} />
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-foreground font-medium truncate leading-tight">{filename}</span>
            {dirPath && (
              <span className="text-[10px] text-muted-foreground/60 font-normal truncate mt-0.5 leading-none">
                {dirPath}
              </span>
            )}
          </div>
        </div>
        <div className="shrink-0 pl-1 mt-0.5">{getStatusBadge(change.status)}</div>
      </div>
    );
  };

  if (!isDesktop) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center space-y-4 text-muted-foreground bg-card/40">
        <AlertCircle className="h-8 w-8 text-muted-foreground/60" />
        <div>
          <p className="text-xs font-semibold text-foreground">本地 Git 树图状态不可用</p>
          <p className="text-[11px] text-muted-foreground/80 mt-1.5 leading-relaxed">
            该高级分析树仅在 Repo-Pulse 桌面客户端中可用。请在 Electron 桌面端运行程序以授权并监控本地 Git 仓库的实时工作树变化。
          </p>
        </div>
      </div>
    );
  }

  if (!cwd) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center space-y-4 text-muted-foreground bg-card/40">
        <GitBranch className="h-8 w-8 text-muted-foreground/40 animate-pulse" />
        <div>
          <p className="text-xs font-semibold text-foreground">未关联本地工作区</p>
          <p className="text-[11px] text-muted-foreground/80 mt-1.5 leading-relaxed">
            此项目尚未关联您的本地 Git 工作目录。您可以选择本地文件夹直接关联，实时追踪代码变更与提交历史。
          </p>
        </div>
        <Button
          size="sm"
          onClick={handleAssociateLocalWorkspace}
          className="gap-1.5 h-8 font-semibold text-xs rounded-lg mt-2 bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm"
        >
          <FolderPlus className="h-4 w-4" />
          <span>关联本地工作区</span>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-card/95 border-l border-border select-none divide-y divide-border/60">
      {/* Title Header (Stacked design to prevent overflow) */}
      <div className="px-4 py-3 flex flex-col gap-1 bg-card shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <GitBranch className="h-4 w-4 text-primary shrink-0" />
            <span className="text-xs font-bold text-foreground truncate">Git 工作区状态</span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-6 w-6 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground"
              onClick={handleAssociateLocalWorkspace}
              title="重新选择工作区路径"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-6 w-6 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground"
              onClick={fetchGitStatus}
              disabled={loading}
              title="刷新 Git 状态"
            >
              <RotateCw className={cn("h-3.5 w-3.5", loading && "animate-spin text-primary")} />
            </Button>
          </div>
        </div>
        {gitStatus?.branch && (
          <div className="flex items-center gap-1.5 mt-1 px-1">
            <span className="text-[10px] text-muted-foreground font-semibold">当前分支:</span>
            <span className="rounded bg-primary/10 border border-primary/20 px-2 py-0.5 text-[10px] font-mono font-semibold text-primary truncate max-w-[190px]" title={gitStatus.branch}>
              {gitStatus.branch}
            </span>
          </div>
        )}
      </div>

      {/* Changes list scroll area */}
      <div className="flex-1 overflow-y-auto scrollbar-thin px-3 py-3 relative overflow-x-hidden">
        {/* Pull down refresh buffering circle */}
        <div className={cn(
          "absolute top-0 left-0 right-0 flex items-center justify-center pointer-events-none transition-all duration-300 ease-out z-20",
          loading 
            ? "h-12 opacity-100 translate-y-2" 
            : "h-0 opacity-0 -translate-y-4"
        )}>
          <div className="bg-card border border-border shadow-md rounded-full p-2 flex items-center justify-center bg-card/95 backdrop-blur-sm">
            <Loader2 className="h-4 w-4 text-primary animate-spin" />
          </div>
        </div>

        {/* Content area that slides down */}
        <div className={cn(
          "space-y-4 transition-transform duration-300 ease-out",
          loading ? "translate-y-12" : "translate-y-0"
        )}>
        {/* If no changes, show clean state */}
        {gitStatus && gitStatus.changes.length === 0 ? (
          <div className="py-8 px-4 text-center rounded-lg border border-dashed border-border/80 bg-background/30">
            <Check className="h-5 w-5 mx-auto text-emerald-500" />
            <p className="text-xs font-semibold text-foreground mt-2">暂无未提交的代码变更</p>
            <p className="text-[10px] text-muted-foreground mt-1">工作区干净，无任何文件改动</p>
          </div>
        ) : (
          <div className="space-y-2">
            {/* 1. Staged changes */}
            {stagedChanges.length > 0 && (
              <div className="space-y-1">
                <button
                  onClick={() => setExpandedStaged(!expandedStaged)}
                  className="flex w-full items-center justify-between text-[11px] font-semibold text-muted-foreground hover:text-foreground py-1 px-1 text-left"
                >
                  <div className="flex items-center gap-1">
                    {expandedStaged ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    <span>暂存的更改</span>
                  </div>
                  <span className="rounded-full bg-primary/10 text-primary text-[10px] px-1.5">{stagedChanges.length}</span>
                </button>
                {expandedStaged && (
                  <div className="space-y-0.5 pl-1.5 border-l border-border/60 ml-2">
                    {stagedChanges.map(renderFileItem)}
                  </div>
                )}
              </div>
            )}

            {/* 2. Unstaged changes */}
            {unstagedChanges.length > 0 && (
              <div className="space-y-1 mt-2">
                <button
                  onClick={() => setExpandedUnstaged(!expandedUnstaged)}
                  className="flex w-full items-center justify-between text-[11px] font-semibold text-muted-foreground hover:text-foreground py-1 px-1 text-left"
                >
                  <div className="flex items-center gap-1">
                    {expandedUnstaged ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    <span>更改</span>
                  </div>
                  <span className="rounded-full bg-amber-500/10 text-amber-500 text-[10px] px-1.5">{unstagedChanges.length}</span>
                </button>
                {expandedUnstaged && (
                  <div className="space-y-0.5 pl-1.5 border-l border-border/60 ml-2">
                    {unstagedChanges.map(renderFileItem)}
                  </div>
                )}
              </div>
            )}

            {/* 3. Untracked files */}
            {untrackedChanges.length > 0 && (
              <div className="space-y-1 mt-2">
                <button
                  onClick={() => setExpandedUntracked(!expandedUntracked)}
                  className="flex w-full items-center justify-between text-[11px] font-semibold text-muted-foreground hover:text-foreground py-1 px-1 text-left"
                >
                  <div className="flex items-center gap-1">
                    {expandedUntracked ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    <span>未跟踪的文件</span>
                  </div>
                  <span className="rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] px-1.5">{untrackedChanges.length}</span>
                </button>
                {expandedUntracked && (
                  <div className="space-y-0.5 pl-1.5 border-l border-border/60 ml-2">
                    {untrackedChanges.map(renderFileItem)}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Git history / Recent Commits */}
        {gitStatus && graphCommits.length > 0 && (
          <div className="space-y-2.5 pt-2">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground px-1 border-b border-border/40 pb-1.5">
              <History className="h-3.5 w-3.5" />
              <span>最近提交记录 (Commit Log)</span>
            </div>
            <div className="space-y-0.5 py-1">
              {graphCommits.map((item, idx) => {
                const { commit, primaryBranch, baseBranch } = item;
                const isMerge = commit.parents && commit.parents.length > 1;
                const isHead = commit.refs && commit.refs.some((r) => r.type === 'head');
                const mergeInfo = parseMergeMessage(commit.message);

                return (
                  <div key={commit.hash || idx} className="flex min-h-[48px] relative group/commit">
                    {/* Simplified Timeline Column */}
                    <div className="w-6 shrink-0 relative">
                      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 24 100" preserveAspectRatio="none">
                        {/* Connecting Line */}
                        <path
                          d="M 12 0 L 12 100"
                          stroke="var(--border)"
                          strokeWidth="1.5"
                          vectorEffect="non-scaling-stroke"
                          className="opacity-50"
                        />
                        {/* Bullet Node */}
                        <circle
                          cx="12"
                          cy="50"
                          r={isHead ? "4" : "3"}
                          fill={isHead ? "var(--primary)" : "var(--card)"}
                          stroke={isHead ? "var(--primary)" : "var(--muted-foreground)"}
                          strokeWidth="1.5"
                        />
                        {/* Pulse for HEAD */}
                        {isHead && (
                          <circle
                            cx="12"
                            cy="50"
                            r="7"
                            fill="none"
                            stroke="var(--primary)"
                            strokeWidth="1"
                            className="animate-ping opacity-45"
                          />
                        )}
                      </svg>
                    </div>

                    {/* Commit details */}
                    <div className="flex-1 min-w-0 pl-2 pb-3.5 space-y-1">
                      {/* Branch & Base Branch Badge Row */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={cn(
                          "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-mono font-semibold border select-none leading-none",
                          baseBranch 
                            ? "bg-primary/5 border-primary/20 text-primary" 
                            : "bg-secondary border-border text-muted-foreground"
                        )}>
                          <GitBranch className="h-2.5 w-2.5 shrink-0" />
                          {baseBranch ? `${primaryBranch} ➔ ${baseBranch}` : `${primaryBranch}`}
                        </span>

                        {commit.refs && commit.refs.map((ref) => {
                          const name = ref.name.replace(/^origin\//, '');
                          if (name === primaryBranch) return null;
                          return (
                            <span 
                              key={ref.name} 
                              className="rounded px-1 py-0.5 text-[9px] font-mono leading-none border shrink-0 bg-secondary/50 border-border text-muted-foreground"
                            >
                              {ref.type === 'head' ? `★ ${ref.name}` : ref.name}
                            </span>
                          );
                        })}
                      </div>

                      {/* Commit Message */}
                      <div className="flex flex-wrap items-center gap-1">
                        <p className="text-xs text-foreground/90 font-medium font-sans leading-normal group-hover/commit:text-primary transition-colors break-words max-w-full" title={commit.message}>
                          {isMerge && mergeInfo ? `Merge branch '${mergeInfo.source}'` : commit.message}
                        </p>
                      </div>
                      
                      {/* Meta Details: SHA, Author, Age, Merge flow */}
                      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[10px] text-muted-foreground font-mono">
                        <span className="font-bold select-all leading-none bg-secondary/60 rounded px-1 py-0.5 text-muted-foreground/80">{commit.hash}</span>
                        <span>·</span>
                        <span className="truncate max-w-[80px]" title={commit.author}>{commit.author.split(' ')[0]}</span>
                        <span>·</span>
                        <span>{commit.age}</span>
                        
                        {isMerge && mergeInfo && (
                          <>
                            <span>·</span>
                            <span className="inline-flex items-center gap-1 bg-amber-500/10 text-amber-500 border border-amber-500/20 rounded px-1 py-0.5 leading-none max-w-full">
                              <span className="truncate max-w-[70px]" title={mergeInfo.source}>{mergeInfo.source}</span>
                              <span className="text-[8px] opacity-75">➔</span>
                              <span className="truncate max-w-[70px]" title={mergeInfo.target}>{mergeInfo.target}</span>
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        </div>
      </div>

      {/* AI Assistance Quick Commands */}
      {onAskAgent && gitStatus && (
        <div className="p-3 bg-secondary/20 shrink-0 space-y-2">
          {gitStatus.changes.length > 0 ? (
            <Button
              size="sm"
              onClick={handleAskAgentAnalyze}
              className="w-full text-[11px] h-8 bg-primary/90 hover:bg-primary text-primary-foreground font-semibold gap-1.5 shadow-sm"
            >
              <Sparkles className="h-3.5 w-3.5 animate-pulse" />
              让 Agent 分析工作区变更
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={handleAskAgentMerge}
              className="w-full text-[11px] h-8 border-border bg-card text-muted-foreground hover:text-foreground font-semibold gap-1.5 shadow-sm"
            >
              <GitBranch className="h-3.5 w-3.5" />
              对比主分支并评估合并风险
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
