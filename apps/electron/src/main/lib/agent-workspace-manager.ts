import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

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
  ): Promise<string> {
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
      await execAsync(`git clone "${gitUrl}" "${workspacePath}"`);
    } else {
      // 已存在且为有效 git 仓库，仅更新远程引用，保留本地工作产物
      try {
        // 更新 remote url，防止之前的 token 过期
        await execAsync(`git remote set-url origin "${gitUrl}"`, { cwd: workspacePath });
        
        // 仅拉取远程最新引用，不修改本地工作树
        await execAsync('git fetch origin', { cwd: workspacePath });
      } catch (err) {
        // 如果 fetch 失败，说明本地仓库损坏，直接删掉重新克隆
        await fs.rm(workspacePath, { recursive: true, force: true });
        await fs.mkdir(workspacePath, { recursive: true });
        await execAsync(`git clone "${gitUrl}" "${workspacePath}"`);
      }
    }

    return workspacePath;
  }
}
