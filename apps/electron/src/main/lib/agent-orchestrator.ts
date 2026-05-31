import { query, PermissionResult, CanUseTool } from '@anthropic-ai/claude-agent-sdk';
import { BrowserWindow } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';

const REPO_PULSE_AGENT_SYSTEM_PROMPT = `
Repo-Pulse Agent commit policy:
- When creating Git commits for the user, write commit messages as Repo-Pulse Agent.
- If a co-author trailer is appropriate, use exactly: Co-Authored-By: Repo-Pulse Agent <noreply@repo-pulse.local>
- Do not add Claude, Anthropic, or model-provider co-author trailers to commit messages.
`;

export class AgentOrchestrator {
  private activeQuery: any = null;
  private pendingPermissions = new Map<string, {
    resolve: (result: PermissionResult) => void;
    input: Record<string, unknown>;
  }>();

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
    workspaceSource?: 'local' | 'managed';
    workspaceBranch?: string | null;
    workspaceRemembered?: boolean;
    sdkSessionId?: string | null;
  }): Promise<void> {
    if (this.activeQuery) {
      this.stopSession();
    }

    const {
      prompt,
      cwd,
      apiKey,
      model,
      baseUrl,
      workspaceSource,
      workspaceBranch,
      workspaceRemembered,
      sdkSessionId,
    } = params;

    // 检测当前仓库工作区目录及 .git 是否存在
    try {
      const stat = await fs.stat(cwd);
      if (!stat.isDirectory()) {
        throw new Error(`当前仓库工作区路径不是一个有效的目录: ${cwd}`);
      }
      await fs.access(path.join(cwd, '.git'));
    } catch (err: any) {
      this.mainWindow.webContents.send('agent:message', {
        type: 'error',
        message: `当前仓库工作区文件或 .git 目录不存在或损坏，无法开展 Agent 操作: ${cwd}`,
      });
      return;
    }


    const stringifyToolResult = (content: unknown) => {
      if (typeof content === 'string') return content;
      if (Array.isArray(content)) {
        return content
          .map((block) => {
            if (typeof block === 'string') return block;
            if (block && typeof block === 'object' && 'text' in block) {
              return String((block as { text?: unknown }).text ?? '');
            }
            return '';
          })
          .join('');
      }
      if (content == null) return '';
      try {
        return JSON.stringify(content);
      } catch {
        return String(content);
      }
    };

    const sendToolUse = (toolUseID: string, toolName: string, input: Record<string, unknown>) => {
      this.mainWindow.webContents.send('agent:message', {
        type: 'tool_use',
        toolUseID,
        name: toolName,
        input,
      });
    };

    this.mainWindow.webContents.send('agent:message', {
      type: 'workspace_ready',
      cwd,
      source: workspaceSource ?? 'managed',
      branch: workspaceBranch,
      remembered: workspaceRemembered === true,
    });

    const emittedSessionIds = new Set<string>();
    const sendSessionState = (sessionId: unknown) => {
      if (typeof sessionId !== 'string' || !sessionId.trim()) return;
      if (emittedSessionIds.has(sessionId)) return;
      emittedSessionIds.add(sessionId);
      this.mainWindow.webContents.send('agent:message', {
        type: 'session_state',
        sessionId,
        resumed: sdkSessionId === sessionId,
      });
    };

    const canUseTool: CanUseTool = async (toolName, input, options) => {
      const command = (input.command as string || '').trim();
      const toolUseID = options.toolUseID;

      sendToolUse(toolUseID, toolName, input);

      // 所有操作均向渲染层发送授权请求，并等待用户确认
      return new Promise<PermissionResult>((resolve) => {
        this.pendingPermissions.set(toolUseID, { resolve, input });

        this.mainWindow.webContents.send('agent:permission-request', {
          toolUseID,
          toolName,
          command,
          input,
          displayName: options.displayName,
          blockedPath: options.blockedPath,
          decisionReason: options.decisionReason,
          title: options.title || (command ? `Claude 申请执行命令: ${command}` : `Claude 申请使用 ${toolName}`),
          description: options.description || '当前配置为：在执行任何操作前，均需获得您的授权。',
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
          resume: sdkSessionId || undefined,
          systemPrompt: {
            type: 'preset',
            preset: 'claude_code',
            append: REPO_PULSE_AGENT_SYSTEM_PROMPT,
          },
          env: {
            ...process.env,
            ANTHROPIC_API_KEY: apiKey,
            ...(baseUrl ? { ANTHROPIC_BASE_URL: baseUrl } : {}),
          },
          hooks: {
            PostToolUse: [{
              hooks: [async (input: any) => {
                this.mainWindow.webContents.send('agent:message', {
                  type: 'tool_result',
                  toolUseID: input.tool_use_id,
                  output: stringifyToolResult(input.tool_response),
                });
                return { continue: true };
              }],
            }],
            PostToolUseFailure: [{
              hooks: [async (input: any) => {
                this.mainWindow.webContents.send('agent:message', {
                  type: 'tool_result',
                  toolUseID: input.tool_use_id,
                  output: '',
                  error: stringifyToolResult(input.error),
                });
                return { continue: true };
              }],
            }],
          },
          includeHookEvents: true,
          includePartialMessages: true,
        },
      });

      // 迭代异步生成器，实时推送并映射消息到渲染进程
      let accumulatedText = '';
      let accumulatedThought = '';
      const streamingToolBlocks = new Map<number, { id: string; name: string; inputJson: string }>();

      const parseToolInput = (inputJson: string, fallback: unknown) => {
        if (!inputJson.trim()) return fallback ?? {};
        try {
          return JSON.parse(inputJson);
        } catch {
          return fallback ?? {};
        }
      };

      for await (const message of this.activeQuery) {
        sendSessionState(message.session_id);

        if (message.type === 'stream_event') {
          const event = message.event;
          
          if (event.type === 'content_block_start') {
            if (event.content_block.type === 'text') {
              accumulatedText = '';
            } else if (event.content_block.type === 'thought' || event.content_block.type === 'thinking') {
              accumulatedThought = '';
            } else if (event.content_block.type === 'tool_use') {
              streamingToolBlocks.set(event.index, {
                id: event.content_block.id,
                name: event.content_block.name,
                inputJson: '',
              });
            }
          }
          
          else if (event.type === 'content_block_delta') {
            if (event.delta.type === 'text_delta') {
              accumulatedText += event.delta.text;
              this.mainWindow.webContents.send('agent:message', {
                type: 'text',
                text: accumulatedText,
              });
            } else if (event.delta.type === 'thought_delta' || event.delta.type === 'thinking_delta') {
              accumulatedThought += event.delta.thought ?? event.delta.thinking ?? '';
              this.mainWindow.webContents.send('agent:message', {
                type: 'thought',
                text: accumulatedThought,
              });
            } else if (event.delta.type === 'input_json_delta') {
              const toolBlock = streamingToolBlocks.get(event.index);
              if (toolBlock) {
                toolBlock.inputJson += event.delta.partial_json ?? '';
              }
            }
          }

          else if (event.type === 'content_block_stop') {
            const toolBlock = streamingToolBlocks.get(event.index);
            if (toolBlock) {
              const input = parseToolInput(toolBlock.inputJson, {});
              if (input && typeof input === 'object' && Object.keys(input as Record<string, unknown>).length > 0) {
                sendToolUse(toolBlock.id, toolBlock.name, input as Record<string, unknown>);
              }
              streamingToolBlocks.delete(event.index);
            }
          }
        }

        else if (message.type === 'assistant') {
          const content = message.message?.content ?? [];
          for (const block of content) {
            if (block.type === 'tool_use') {
              this.mainWindow.webContents.send('agent:message', {
                type: 'tool_use',
                toolUseID: block.id,
                name: block.name,
                input: block.input ?? {},
              });
            }
          }
        }

        else if (message.type === 'user') {
          const content = message.message?.content ?? [];
          for (const block of content) {
            if (block.type === 'tool_result') {
              this.mainWindow.webContents.send('agent:message', {
                type: 'tool_result',
                toolUseID: block.tool_use_id,
                output: stringifyToolResult(block.content),
                error: block.is_error ? stringifyToolResult(block.content) : undefined,
              });
            }
          }
        }
        
        else if (message.type === 'system') {
          if (message.subtype === 'hook_response') {
            if (message.hook_name === 'Bash' || message.stdout !== undefined || message.stderr !== undefined) {
              const isError = message.outcome !== 'success' || message.exit_code !== 0;
              this.mainWindow.webContents.send('agent:message', {
                type: 'tool_result',
                toolUseID: message.hook_id,
                output: message.stdout || message.output || '',
                error: isError ? (message.stderr || message.output || `Exit code: ${message.exit_code}`) : undefined,
              });
            }
          }
        }
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
  resolvePermission(toolUseID: string, approve: boolean, message?: string): void {
    const pending = this.pendingPermissions.get(toolUseID);
    if (pending) {
      if (approve) {
        pending.resolve({ behavior: 'allow', updatedInput: pending.input });
      } else {
        pending.resolve({ behavior: 'deny', message: message?.trim() || 'User rejected command execution.' });
      }
      this.pendingPermissions.delete(toolUseID);
    }
  }
}
