import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface GitFileChange {
  path: string;
  status: 'modified' | 'added' | 'deleted' | 'untracked' | 'renamed';
  staged: boolean;
}

export interface GitCommit {
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

export interface GitStatusResult {
  isGitRepo: boolean;
  branch: string;
  cwd: string;
  changes: GitFileChange[];
  commits: GitCommit[];
}

export class GitManager {
  async getStatus(cwd: string): Promise<GitStatusResult> {
    try {
      // 1. Check if git repo
      const gitRoot = await this.getGitRoot(cwd);
      if (!gitRoot) {
        return { isGitRepo: false, branch: '', cwd, changes: [], commits: [] };
      }

      // 2. Get current branch
      const branch = await this.getCurrentBranch(gitRoot);

      // 3. Get status --porcelain
      const changes = await this.getPorcelainStatus(gitRoot);

      // 4. Get recent commits
      const commits = await this.getRecentCommits(gitRoot);

      return {
        isGitRepo: true,
        branch,
        cwd: gitRoot,
        changes,
        commits,
      };
    } catch (error) {
      console.error('[GitManager] Error getting status:', error);
      return { isGitRepo: false, branch: '', cwd, changes: [], commits: [] };
    }
  }

  async getRemoteUrl(cwd: string): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync('git', ['-C', cwd, 'remote', 'get-url', 'origin']);
      return stdout.trim() || null;
    } catch {
      return null;
    }
  }

  async verifyRepository(cwd: string, targetRemoteUrl: string): Promise<{ success: boolean; error?: string; gitRoot?: string; branch?: string }> {
    const gitRoot = await this.getGitRoot(cwd);
    if (!gitRoot) {
      return { success: false, error: '选择的目录不是一个有效的 Git 仓库。' };
    }
    
    const remoteUrl = await this.getRemoteUrl(gitRoot);
    if (!remoteUrl) {
      return { success: false, error: '未能获取所选 Git 仓库的远程 origin 地址。' };
    }
    
    const targetRemote = normalizeGitRemote(targetRemoteUrl);
    const pickedRemote = normalizeGitRemote(remoteUrl);
    if (targetRemote !== pickedRemote) {
      return {
        success: false,
        error: `仓库地址不匹配！当前需要关联: ${targetRemoteUrl}，但所选目录关联的是: ${remoteUrl}`,
      };
    }
    
    const branch = await this.getCurrentBranch(gitRoot);
    return {
      success: true,
      gitRoot,
      branch,
    };
  }

  async getGitRoot(cwd: string): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync('git', ['-C', cwd, 'rev-parse', '--show-toplevel']);
      return stdout.trim() || null;
    } catch {
      return null;
    }
  }

  private async getCurrentBranch(cwd: string): Promise<string> {
    try {
      const { stdout } = await execFileAsync('git', ['-C', cwd, 'branch', '--show-current']);
      return stdout.trim() || 'HEAD';
    } catch {
      return 'HEAD';
    }
  }

  private async getPorcelainStatus(cwd: string): Promise<GitFileChange[]> {
    try {
      const { stdout } = await execFileAsync('git', ['-C', cwd, 'status', '--porcelain', '-u']);
      const lines = stdout.split('\n').filter(line => line.trim().length > 0);
      
      return lines.map(line => {
        const x = line[0];
        const y = line[1];
        const rawPath = line.substring(3).trim();
        
        let status: GitFileChange['status'] = 'modified';
        
        if (x === '?' && y === '?') {
          status = 'untracked';
        } else if (x === 'A' || y === 'A') {
          status = 'added';
        } else if (x === 'D' || y === 'D') {
          status = 'deleted';
        } else if (x === 'R' || y === 'R') {
          status = 'renamed';
        } else if (x === 'M' || y === 'M') {
          status = 'modified';
        }

        // Staged status check (if x is not space or ?)
        const isStaged = x !== ' ' && x !== '?';

        return {
          path: rawPath,
          status,
          staged: isStaged,
        };
      });
    } catch {
      return [];
    }
  }

  private async getRecentCommits(cwd: string): Promise<any[]> {
    try {
      const { stdout } = await execFileAsync('git', [
        '-C',
        cwd,
        'log',
        '-n',
        '20',
        '--pretty=format:%h|%P|%an|%cr|%s|%D'
      ]);
      const lines = stdout.split('\n').filter(line => line.trim().length > 0);
      
      return lines.map(line => {
        const [hash, parentsStr, author, age, message, refField] = line.split('|');
        const refsStr = refField || '';
        const rawRefs = refsStr 
          ? refsStr.split(', ').map(r => r.trim()).filter(r => r !== 'origin/HEAD' && r.length > 0) 
          : [];
        
        const refs = rawRefs.map(ref => {
          if (ref.startsWith('HEAD -> ')) {
            return {
              name: ref.replace('HEAD -> ', ''),
              type: 'head',
            };
          } else if (ref.startsWith('refs/tags/')) {
            return {
              name: ref.replace('refs/tags/', ''),
              type: 'tag',
            };
          } else if (ref.startsWith('origin/')) {
            return {
              name: ref,
              type: 'remote',
            };
          } else {
            return {
              name: ref,
              type: 'local',
            };
          }
        });

        const parents = parentsStr 
          ? parentsStr.split(' ').map(p => p.trim()).filter(p => p.length > 0)
          : [];

        return {
          hash: hash || '',
          parents,
          author: author || '',
          age: age || '',
          message: message || '',
          refs,
        };
      });
    } catch {
      return [];
    }
  }
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
