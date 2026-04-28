/**
 * AI 事件规范化层
 *
 * 职责：
 * 1. 事件类型过滤 —— 仅 MVP 类型 (PUSH/PR_OPENED/ISSUE_OPENED) 允许分析
 * 2. body 脱敏 —— 移除 token/secret/email 等敏感信息后再发给 AI
 * 3. body 截断 —— 控制单次分析 token 消耗
 * 4. 构建 AnalysisInput —— 统一组装 AI Provider 需要的输入格式
 *
 * 处理顺序固定：sanitize → truncate → buildInput → send to AI
 */
import { Injectable, Logger } from '@nestjs/common';
import { EventType } from '@repo-pulse/shared';
import type { AnalysisInput } from '@repo-pulse/ai-sdk';
import type { Event } from '@repo-pulse/database';

@Injectable()
export class AIEventNormalizer {
  private readonly logger = new Logger(AIEventNormalizer.name);

  private readonly MAX_BODY_LENGTH = parseInt(
    process.env.AI_MAX_BODY_CHARS || '4000',
    10,
  );

  private readonly MVP_EVENT_TYPES: EventType[] = [
    EventType.PUSH,
    EventType.PR_OPENED,
    EventType.ISSUE_OPENED,
  ];

  /**
   * 判断事件是否应该被分析。
   *
   * force=true 可绕过部分条件（配额、仓库关闭），但不能绕过：
   * - 事件类型不支持
   * - 内容为空
   * - provider 未配置
   */
  shouldAnalyze(
    event: Event,
    force = false,
  ): { should: boolean; reason?: string } {
    // 事件类型检查（force 不可绕过）
    if (!this.MVP_EVENT_TYPES.includes(event.type as EventType)) {
      return {
        should: false,
        reason: `unsupported_event_type:${event.type}`,
      };
    }

    // 内容为空检查（force 不可绕过）
    const hasContent =
      (event.body && event.body.trim().length > 0) ||
      (event.title && event.title.trim().length >= 10);
    if (!hasContent) {
      return {
        should: false,
        reason: 'empty_content',
      };
    }

    // 以下是可被 force 绕过的检查（后续步骤在 AIService 中处理）
    return { should: true };
  }

  /**
   * 构建 AI 分析输入。
   * 调用顺序：sanitize → truncate → 装配
   */
  buildAnalysisInput(event: Event): AnalysisInput {
    const body = this.truncateBody(
      this.sanitizeBody(event.body || ''),
    );

    return {
      eventType: event.type,
      title: event.title,
      body,
      language: 'zh' as const, // 默认中文，后续可基于仓库/用户配置
      context: {
        repository: event.repositoryId,
        author: event.author,
        metadata: event.metadata,
      },
    };
  }

  /**
   * 脱敏 body 内容。
   * 移除 token/secret/email/private key 等敏感信息后，再发送给 AI。
   *
   * force=true 不能绕过脱敏 —— 这是安全红线。
   */
  sanitizeBody(text: string): string {
    if (!text) return '';

    let sanitized = text;

    // GitHub Personal Access Token
    sanitized = sanitized.replace(
      /gh[pousr]_[A-Za-z0-9]{36,}/g,
      '[REDACTED:github_token]',
    );

    // Bearer / Authorization header token
    sanitized = sanitized.replace(
      /Bearer\s+[A-Za-z0-9._\-]+/gi,
      '[REDACTED:bearer_token]',
    );

    // Generic API key / secret / password patterns
    sanitized = sanitized.replace(
      /(api[_-]?key|secret|password|token)\s*[:=]\s*['"]?[A-Za-z0-9_\-+=\/]{16,}['"]?/gi,
      '$1: [REDACTED:credential]',
    );

    // Private key PEM blocks
    sanitized = sanitized.replace(
      /-----BEGIN [A-Z ]+PRIVATE KEY-----[\s\S]+?-----END [A-Z ]+PRIVATE KEY-----/g,
      '[REDACTED:private_key]',
    );

    // .env style lines (multi-line aware)
    sanitized = sanitized.replace(
      /^[A-Z][A-Z0-9_]+=.+$/gm,
      (match) => {
        const key = match.split('=')[0];
        return `${key}=[REDACTED]`;
      },
    );

    // Email addresses
    sanitized = sanitized.replace(
      /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g,
      '[REDACTED:email]',
    );

    return sanitized;
  }

  /**
   * 截断 body 到最大长度。
   */
  truncateBody(text: string, maxLength?: number): string {
    const max = maxLength ?? this.MAX_BODY_LENGTH;
    if (text.length <= max) return text;
    return text.slice(0, max) + '... [truncated]';
  }
}
