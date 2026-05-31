import { query, SDKMessage, PermissionResult, CanUseTool } from '@anthropic-ai/claude-agent-sdk';
import { BrowserWindow } from 'electron';

export class AgentOrchestrator {
  private activeQuery: any = null;
  private pendingPermissions = new Map<string, (result: PermissionResult) => void>();

  constructor(private readonly mainWindow: BrowserWindow) {}

  /**
   * 启动 Agent 会话并执行查询
   */
  async startSession(params: {
    prompt: string;
    cwd: string;
    apiKey: string;
    model?: string;
    baseUrl?: string;
  }): Promise<void> {
    if (this.activeQuery) {
      this.stopSession();
    }

    const { prompt, cwd, apiKey, model, baseUrl } = params;

    const canUseTool: CanUseTool = async (toolName, input, options) => {
      // 1. 对于只读的工具或只读 Git 命令，直接允许
      if (toolName !== 'Bash') {
        return { behavior: 'allow' };
      }

      const command = (input.command as string || '').trim();
      const isReadOnlyGit = this.isReadOnlyGitCommand(command);

      if (isReadOnlyGit) {
        return { behavior: 'allow' };
      }

      // 2. 对于写入操作或危险命令，向渲染层发送授权请求，并等待用户确认
      return new Promise<PermissionResult>((resolve) => {
        const toolUseID = options.toolUseID;
        this.pendingPermissions.set(toolUseID, resolve);

        this.mainWindow.webContents.send('agent:permission-request', {
          toolUseID,
          toolName,
          command,
          title: options.title || `Claude 申请执行命令: ${command}`,
          description: options.description || '此命令可能会对仓库的 Git 历史或代码文件进行修改。',
        });
      });
    };

    try {
      this.activeQuery = query({
        prompt,
        options: {
          cwd,
          canUseTool,
          model: model || 'claude-3-5-sonnet-latest',
          env: {
            ...process.env,
            ANTHROPIC_API_KEY: apiKey,
            ...(baseUrl ? { ANTHROPIC_BASE_URL: baseUrl } : {}),
          },
          includeHookEvents: true,
          includePartialMessages: true,
        },
      });

      // 迭代异步生成器，实时推送消息到渲染进程
      for await (const message of this.activeQuery) {
        this.mainWindow.webContents.send('agent:message', message);
      }
      this.mainWindow.webContents.send('agent:message', { type: 'finished' });
    } catch (err: any) {
      this.mainWindow.webContents.send('agent:message', {
        type: 'error',
        message: err.message || String(err),
      });
    } finally {
      this.activeQuery = null;
    }
  }

  /**
   * 停止当前会话
   */
  stopSession(): void {
    if (this.activeQuery && typeof this.activeQuery.return === 'function') {
      void this.activeQuery.return();
    }
    this.activeQuery = null;
    this.pendingPermissions.clear();
  }

  /**
   * 解决挂起的权限请求
   */
  resolvePermission(toolUseID: string, approve: boolean): void {
    const resolve = this.pendingPermissions.get(toolUseID);
    if (resolve) {
      if (approve) {
        resolve({ behavior: 'allow' });
      } else {
        resolve({ behavior: 'deny', message: 'User rejected command execution.' });
      }
      this.pendingPermissions.delete(toolUseID);
    }
  }

  /**
   * 判断是否是只读的 Git 命令
   */
  private isReadOnlyGitCommand(command: string): boolean {
    const args = command.split(/\s+/);
    if (args[0] !== 'git') {
      return false; // 非 git 命令一律触发二次确认
    }

    const subCommand = args[1];
    const readOnlySubcommands = [
      'status',
      'diff',
      'log',
      'show',
      'branch',
      'remote',
      'config',
      'rev-parse',
      'describe',
      'tag',
      'reflog',
      'cat-file',
      'ls-files',
    ];

    if (readOnlySubcommands.includes(subCommand)) {
      return true;
    }

    return false;
  }
}
