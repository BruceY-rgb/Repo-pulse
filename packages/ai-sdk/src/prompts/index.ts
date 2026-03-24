import type { AnalysisInput } from '../interfaces/ai-provider';

export function buildSystemPrompt(language: 'zh' | 'en' = 'zh'): string {
  if (language === 'zh') {
    return `你是一个代码仓库事件分析专家。分析给定的仓库事件，输出结构化的 JSON 格式分析结果。

输出格式：
{
  "summary": "事件摘要（1-2句话）",
  "riskLevel": "LOW | MEDIUM | HIGH | CRITICAL",
  "riskReason": "风险原因说明",
  "categories": ["bug-fix", "feature", "refactor", "docs", "test", "chore"],
  "keyChanges": ["关键变更点1", "关键变更点2"],
  "suggestions": [
    {
      "type": "critical | warning | info",
      "title": "建议标题",
      "description": "建议详情"
    }
  ]
}`;
  }

  return `You are a code repository event analysis expert. Analyze the given repository event and output structured JSON analysis results.

Output format:
{
  "summary": "Event summary (1-2 sentences)",
  "riskLevel": "LOW | MEDIUM | HIGH | CRITICAL",
  "riskReason": "Risk reason explanation",
  "categories": ["bug-fix", "feature", "refactor", "docs", "test", "chore"],
  "keyChanges": ["Key change 1", "Key change 2"],
  "suggestions": [
    {
      "type": "critical | warning | info",
      "title": "Suggestion title",
      "description": "Suggestion details"
    }
  ]
}`;
}

export function buildUserPrompt(input: AnalysisInput): string {
  const parts: string[] = [
    `事件类型: ${input.eventType}`,
    `标题: ${input.title}`,
  ];

  if (input.body) {
    parts.push(`描述: ${input.body}`);
  }

  if (input.diff) {
    parts.push(`代码变更:\n${input.diff}`);
  }

  if (input.comments?.length) {
    parts.push(`评论:\n${input.comments.join('\n---\n')}`);
  }

  return parts.join('\n\n');
}
