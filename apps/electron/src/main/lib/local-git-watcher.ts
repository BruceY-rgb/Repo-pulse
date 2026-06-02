import type { BrowserWindow } from 'electron';
import {
  DESKTOP_LOCAL_EVENTS,
  type DesktopRealtimeMessage,
  type LocalGitChangedPayload,
} from '@repo-pulse/shared';
import { AgentWorkspaceManager } from './agent-workspace-manager';
import { GitManager } from './git-manager';

const REALTIME_CHANNEL = 'desktop:realtime';
const POLL_INTERVAL_MS = 10_000;

interface WatchEntry {
  cwd: string;
  timer: ReturnType<typeof setInterval>;
  lastHead: string;
  lastBranch: string;
  lastPending: number;
}

interface GitSnapshot {
  headCommit: string;
  headMessage: string;
  branch: string;
  pendingChanges: number;
}

/**
 * LocalGitWatcher —— 本地 git 状态监听（主进程，仅前端刷新，不落库）。
 *
 * 实现「本地有仓库就监听本地 git，否则用 webhook」：被订阅的仓库若在本机存在
 * remote 匹配的 clone（AgentWorkspaceManager.locateLocalRepo），就起一个轮询器，
 * 定期读本地 git 状态（HEAD / 分支 / 工作树改动，纯本地、无网络），变化即经
 * 'desktop:realtime' 推 local.git.changed 给渲染进程刷新；找不到本地 clone 的仓库
 * 不本地监听，其动态仍由 RealtimeBridge 的 socket（webhook 来源）覆盖。
 */
export class LocalGitWatcher {
  private readonly workspaceManager = new AgentWorkspaceManager();
  private readonly gitManager = new GitManager();
  private readonly watching = new Map<string, WatchEntry>();
  /** 正在解析本地 clone 的仓库，避免并发重复定位。 */
  private readonly resolving = new Set<string>();

  constructor(
    private readonly mainWindow: BrowserWindow,
    private readonly apiBaseUrl: string,
    private readonly getToken: () => Promise<string | null>,
  ) {}

  /** 开始监听某仓库的本地 git 状态（若本地存在该 clone）。幂等。 */
  async watch(repositoryId: string): Promise<void> {
    if (this.watching.has(repositoryId) || this.resolving.has(repositoryId)) {
      return;
    }
    this.resolving.add(repositoryId);
    try {
      const remoteUrl = await this.fetchRepositoryRemote(repositoryId);
      if (!remoteUrl) {
        return;
      }
      const cwd = await this.workspaceManager.locateLocalRepo(remoteUrl);
      if (!cwd) {
        console.log(
          `[local-git-watcher] no local clone for repo=${repositoryId}, fallback to webhook/socket`,
        );
        return;
      }
      // 解析期间可能已被 unwatch（用户离开页面）；此时不再启动。
      if (!this.resolving.has(repositoryId)) {
        return;
      }

      const initial = await this.readSnapshot(cwd);
      const timer = setInterval(() => {
        void this.poll(repositoryId);
      }, POLL_INTERVAL_MS);
      this.watching.set(repositoryId, {
        cwd,
        timer,
        lastHead: initial.headCommit,
        lastBranch: initial.branch,
        lastPending: initial.pendingChanges,
      });
      console.log(`[local-git-watcher] watching repo=${repositoryId} cwd=${cwd}`);
    } catch (error) {
      console.warn(`[local-git-watcher] watch failed repo=${repositoryId}`, error);
    } finally {
      this.resolving.delete(repositoryId);
    }
  }

  unwatch(repositoryId: string): void {
    this.resolving.delete(repositoryId);
    const entry = this.watching.get(repositoryId);
    if (entry) {
      clearInterval(entry.timer);
      this.watching.delete(repositoryId);
    }
  }

  disposeAll(): void {
    for (const entry of this.watching.values()) {
      clearInterval(entry.timer);
    }
    this.watching.clear();
    this.resolving.clear();
  }

  private async poll(repositoryId: string): Promise<void> {
    const entry = this.watching.get(repositoryId);
    if (!entry) {
      return;
    }
    try {
      const snap = await this.readSnapshot(entry.cwd);
      const changed =
        snap.headCommit !== entry.lastHead ||
        snap.branch !== entry.lastBranch ||
        snap.pendingChanges !== entry.lastPending;
      if (!changed) {
        return;
      }

      entry.lastHead = snap.headCommit;
      entry.lastBranch = snap.branch;
      entry.lastPending = snap.pendingChanges;

      const payload: LocalGitChangedPayload = {
        repositoryId,
        cwd: entry.cwd,
        branch: snap.branch,
        headCommit: snap.headCommit,
        headMessage: snap.headMessage,
        pendingChanges: snap.pendingChanges,
        detectedAt: new Date().toISOString(),
      };
      this.emitToRenderer({ name: DESKTOP_LOCAL_EVENTS.LOCAL_GIT_CHANGED, payload });
      console.log(
        `[local-git-watcher] change repo=${repositoryId} head=${snap.headCommit} branch=${snap.branch} pending=${snap.pendingChanges}`,
      );
    } catch (error) {
      console.warn(`[local-git-watcher] poll failed repo=${repositoryId}`, error);
    }
  }

  private async readSnapshot(cwd: string): Promise<GitSnapshot> {
    const status = await this.gitManager.getStatus(cwd);
    const head = status.commits[0];
    return {
      headCommit: head?.hash ?? '',
      headMessage: head?.message ?? '',
      branch: status.branch,
      pendingChanges: status.changes.length,
    };
  }

  /** 向 API 查仓库远程地址（用于定位本地 clone）；主进程持登录态 token。 */
  private async fetchRepositoryRemote(repositoryId: string): Promise<string | null> {
    try {
      const token = await this.getToken();
      const res = await fetch(`${this.apiBaseUrl}/repositories/${repositoryId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        return null;
      }
      const json = (await res.json()) as { data?: { url?: string }; url?: string };
      return json.data?.url ?? json.url ?? null;
    } catch (error) {
      console.warn(`[local-git-watcher] fetch repo remote failed repo=${repositoryId}`, error);
      return null;
    }
  }

  private emitToRenderer(message: DesktopRealtimeMessage): void {
    try {
      if (this.mainWindow.isDestroyed()) {
        return;
      }
      this.mainWindow.webContents.send(REALTIME_CHANNEL, message);
    } catch (error) {
      console.warn('[local-git-watcher] emit failed', error);
    }
  }
}
