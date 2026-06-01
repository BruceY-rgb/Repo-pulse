import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface PreparedAgentWorkspace {
  cwd: string;
  source: 'local' | 'managed';
  branch: string | null;
  remembered?: boolean;
}

export class AgentWorkspaceManager {
  private readonly baseDir: string;

  constructor() {
    this.baseDir = path.join(os.homedir(), '.repo-pulse', 'agent-workspaces');
  }

  getWorkspacePath(repositoryId: string): string {
    return path.join(this.baseDir, repositoryId);
  }

  /**
   * 确保本地工作区准备妥当
   * @param repositoryId 仓库ID
   * @param gitUrl 包含 Token 的 clone URL (例如 https://<token>@github.com/owner/repo.git)
   * @param defaultBranch 默认分支
   */
  async prepareWorkspace(
    repositoryId: string,
    gitUrl: string,
    defaultBranch = 'main',
    authorizedLocalCwd?: string | null,
  ): Promise<PreparedAgentWorkspace> {
    const rememberedWorkspace = await this.resolveRememberedWorkspace(gitUrl, authorizedLocalCwd);
    if (rememberedWorkspace) {
      return rememberedWorkspace;
    }

    const localWorkspace = await this.findLocalWorkspace(gitUrl);
    if (localWorkspace) {
      return localWorkspace;
    }

    const workspacePath = this.getWorkspacePath(repositoryId);

    // 确保基准目录存在
    await fs.mkdir(this.baseDir, { recursive: true });

    let exists = false;
    try {
      await fs.access(path.join(workspacePath, '.git'));
      exists = true;
    } catch {
      exists = false;
    }

    if (!exists) {
      // 目录不存在或不是 git 仓库，全新克隆
      await fs.rm(workspacePath, { recursive: true, force: true });
      await fs.mkdir(workspacePath, { recursive: true });
      
      // 执行 git clone
      await execFileAsync('git', ['clone', gitUrl, workspacePath]);
    } else {
      // 已存在且为有效 git 仓库，仅更新远程引用，保留本地工作产物
      try {
        // 更新 remote url，防止之前的 token 过期
        await execFileAsync('git', ['remote', 'set-url', 'origin', gitUrl], { cwd: workspacePath });
        
        // 仅拉取远程最新引用，不修改本地工作树
        await execFileAsync('git', ['fetch', 'origin'], { cwd: workspacePath });
      } catch (err) {
        // 如果 fetch 失败，说明本地仓库损坏，直接删掉重新克隆
        await fs.rm(workspacePath, { recursive: true, force: true });
        await fs.mkdir(workspacePath, { recursive: true });
        await execFileAsync('git', ['clone', gitUrl, workspacePath]);
      }
    }

    return {
      cwd: workspacePath,
      source: 'managed',
      branch: await this.getCurrentBranch(workspacePath),
      remembered: false,
    };
  }

  private async resolveRememberedWorkspace(
    gitUrl: string,
    authorizedLocalCwd?: string | null,
  ): Promise<PreparedAgentWorkspace | null> {
    if (!authorizedLocalCwd?.trim()) return null;

    const targetRemote = normalizeGitRemote(gitUrl);
    if (!targetRemote) return null;

    const gitRoot = await this.getGitRoot(authorizedLocalCwd);
    if (!gitRoot) return null;

    const remoteUrl = await this.getRemoteUrl(gitRoot);
    if (normalizeGitRemote(remoteUrl) !== targetRemote) return null;

    return {
      cwd: gitRoot,
      source: 'local',
      branch: await this.getCurrentBranch(gitRoot),
      remembered: true,
    };
  }

  private async findLocalWorkspace(gitUrl: string): Promise<PreparedAgentWorkspace | null> {
    const targetRemote = normalizeGitRemote(gitUrl);
    if (!targetRemote) return null;

    const candidates = await this.getLocalWorkspaceCandidates(gitUrl);
    for (const candidate of candidates) {
      const gitRoot = await this.getGitRoot(candidate);
      if (!gitRoot) continue;

      const remoteUrl = await this.getRemoteUrl(gitRoot);
      if (normalizeGitRemote(remoteUrl) !== targetRemote) continue;

      return {
        cwd: gitRoot,
        source: 'local',
        branch: await this.getCurrentBranch(gitRoot),
        remembered: false,
      };
    }

    return null;
  }

  private async getLocalWorkspaceCandidates(gitUrl: string): Promise<string[]> {
    const repoName = extractRepoName(gitUrl);
    const candidates = new Set<string>();
    const addCandidate = (value?: string | null) => {
      if (value) candidates.add(path.resolve(value));
    };

    addCandidate(process.cwd());
    for (const ancestor of getAncestors(process.cwd())) {
      addCandidate(ancestor);
    }

    const currentGitRoot = await this.getGitRoot(process.cwd());
    addCandidate(currentGitRoot);

    const searchRoots = [
      path.join(os.homedir(), 'Desktop'),
      path.join(os.homedir(), 'Projects'),
      path.join(os.homedir(), 'Code'),
      path.join(os.homedir(), 'Developer'),
    ];

    for (const root of searchRoots) {
      addCandidate(await findCaseInsensitiveChild(root, repoName));

      let entries: Array<{ name: string; isDirectory: () => boolean }> = [];
      try {
        entries = await fs.readdir(root, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const candidate = path.join(root, entry.name);
        try {
          await fs.access(path.join(candidate, '.git'));
          addCandidate(candidate);
        } catch {
          if (entry.name.toLowerCase() === repoName.toLowerCase()) {
            addCandidate(candidate);
          }
        }
      }
    }

    return [...candidates];
  }

  private async getGitRoot(candidate: string): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync('git', ['-C', candidate, 'rev-parse', '--show-toplevel']);
      return stdout.trim() || null;
    } catch {
      return null;
    }
  }

  private async getRemoteUrl(cwd: string): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync('git', ['-C', cwd, 'remote', 'get-url', 'origin']);
      return stdout.trim() || null;
    } catch {
      return null;
    }
  }

  private async getCurrentBranch(cwd: string): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync('git', ['-C', cwd, 'branch', '--show-current']);
      return stdout.trim() || null;
    } catch {
      return null;
    }
  }
}

function getAncestors(start: string): string[] {
  const ancestors: string[] = [];
  let current = path.resolve(start);
  for (let index = 0; index < 8; index += 1) {
    const parent = path.dirname(current);
    if (parent === current) break;
    ancestors.push(parent);
    current = parent;
  }
  return ancestors;
}

async function findCaseInsensitiveChild(root: string, childName: string): Promise<string | null> {
  if (!childName) return null;
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    const match = entries.find((entry) => entry.isDirectory() && entry.name.toLowerCase() === childName.toLowerCase());
    return match ? path.join(root, match.name) : null;
  } catch {
    return null;
  }
}

function extractRepoName(gitUrl: string): string {
  const withoutQuery = gitUrl.split('?')[0] ?? gitUrl;
  const normalized = withoutQuery.replace(/\/+$/, '').replace(/\.git$/i, '');
  const match = normalized.match(/([^/:]+)$/);
  return match?.[1] ?? '';
}

function normalizeGitRemote(rawUrl?: string | null): string | null {
  if (!rawUrl) return null;
  let value = rawUrl.trim();
  if (!value) return null;

  value = value.replace(/^git\+/i, '');
  value = value.replace(/^https?:\/\/[^/@]+@/i, 'https://');
  value = value.replace(/^ssh:\/\/git@/i, 'ssh://');
  value = value.replace(/^git@([^:]+):/i, 'ssh://$1/');
  value = value.replace(/^https?:\/\//i, '');
  value = value.replace(/^ssh:\/\//i, '');
  value = value.replace(/\/+$/, '');
  value = value.replace(/\.git$/i, '');

  return value.toLowerCase();
}
