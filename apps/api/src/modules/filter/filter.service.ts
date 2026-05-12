import { Injectable, Logger } from '@nestjs/common';
import { prisma, FilterRule, FilterAction } from '@repo-pulse/database';

export interface FilterCondition {
  field: 'eventType' | 'repository' | 'author' | 'riskLevel' | 'customRegex';
  operator: 'eq' | 'contains' | 'regex' | 'in';
  value: string | string[];
}

export interface CreateFilterRuleDto {
  name: string;
  description?: string;
  conditions: FilterCondition[];
  action: FilterAction;
  isActive?: boolean;
  priority?: number;
}

export interface UpdateFilterRuleDto {
  name?: string;
  description?: string;
  conditions?: FilterCondition[];
  action?: FilterAction;
  isActive?: boolean;
  priority?: number;
}

export interface TestFilterDto {
  conditions: FilterCondition[];
  event: {
    type: string;
    repository: string;
    author: string;
    riskLevel?: string;
    body?: string;
  };
}

@Injectable()
export class FilterService {
  private readonly logger = new Logger(FilterService.name);

  /**
   * 获取用户的所有过滤规则
   */
  async getRules(userId: string): Promise<FilterRule[]> {
    return prisma.filterRule.findMany({
      where: { userId },
      orderBy: { priority: 'desc' },
    });
  }

  /**
   * 创建过滤规则
   */
  async createRule(userId: string, dto: CreateFilterRuleDto): Promise<FilterRule> {
    return prisma.filterRule.create({
      data: {
        userId,
        name: dto.name,
        description: dto.description,
        conditions: dto.conditions as any,
        action: dto.action,
        isActive: dto.isActive ?? true,
        priority: dto.priority ?? 0,
      },
    });
  }

  /**
   * 更新过滤规则
   */
  async updateRule(
    userId: string,
    ruleId: string,
    dto: UpdateFilterRuleDto,
  ): Promise<FilterRule> {
    const rule = await prisma.filterRule.findFirst({
      where: { id: ruleId, userId },
    });

    if (!rule) {
      throw new Error(`Filter rule not found: ${ruleId}`);
    }

    return prisma.filterRule.update({
      where: { id: ruleId },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.conditions && { conditions: dto.conditions as any }),
        ...(dto.action && { action: dto.action }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.priority !== undefined && { priority: dto.priority }),
      },
    });
  }

  /**
   * 删除过滤规则
   */
  async deleteRule(userId: string, ruleId: string): Promise<void> {
    const rule = await prisma.filterRule.findFirst({
      where: { id: ruleId, userId },
    });

    if (!rule) {
      throw new Error(`Filter rule not found: ${ruleId}`);
    }

    await prisma.filterRule.delete({
      where: { id: ruleId },
    });
  }

  /**
   * 测试规则匹配
   */
  testRule(dto: TestFilterDto): { matched: boolean; action: FilterAction | null } {
    const { conditions, event } = dto;

    let matched = true;

    for (const condition of conditions) {
      const fieldValue = this.getEventField(event, condition.field);
      const result = this.evaluateCondition(fieldValue, condition);

      if (!result) {
        matched = false;
        break;
      }
    }

    return {
      matched,
      action: matched ? FilterAction.INCLUDE : null,
    };
  }

  /**
   * 评估单个条件
   */
  private evaluateCondition(
    fieldValue: string | undefined,
    condition: FilterCondition,
  ): boolean {
    if (fieldValue === undefined) {
      return false;
    }

    const value = Array.isArray(condition.value)
      ? condition.value
      : condition.value;

    switch (condition.operator) {
      case 'eq':
        return fieldValue === value;

      case 'contains':
        return fieldValue.includes(value as string);

      case 'regex':
        try {
          const regex = new RegExp(value as string, 'i');
          return regex.test(fieldValue);
        } catch {
          return false;
        }

      case 'in':
        return (value as string[]).includes(fieldValue);

      default:
        return false;
    }
  }

  /**
   * 获取事件字段值
   */
  private getEventField(
    event: TestFilterDto['event'],
    field: FilterCondition['field'],
  ): string | undefined {
    switch (field) {
      case 'eventType':
        return event.type;
      case 'repository':
        return event.repository;
      case 'author':
        return event.author;
      case 'riskLevel':
        return event.riskLevel;
      case 'customRegex':
        return event.body;
      default:
        return undefined;
    }
  }

  /**
   * 对事件应用所有活跃规则
   */
  async applyRules(
    userId: string,
    event: {
      type: string;
      repository: string;
      author: string;
      riskLevel?: string;
      body?: string;
    },
  ): Promise<{ action: FilterAction; matchedRule?: FilterRule }> {
    const rules = await prisma.filterRule.findMany({
      where: { userId, isActive: true },
      orderBy: { priority: 'desc' },
    });

    const eventData = {
      type: event.type,
      repository: event.repository,
      author: event.author,
      riskLevel: event.riskLevel,
      body: event.body,
    };

    for (const rule of rules) {
      const testResult = this.testRule({
        conditions: rule.conditions as unknown as FilterCondition[],
        event: eventData,
      });

      if (testResult.matched) {
        return {
          action: rule.action,
          matchedRule: rule,
        };
      }
    }

    // 默认不拦截
    return { action: FilterAction.INCLUDE };
  }

  /**
   * 检查用户是否有活跃规则引用了指定字段。
   * 用于判断是否需要等待 AI 分析结果再做通知决策。
   */
  async hasRuleReferencingField(userId: string, field: string): Promise<boolean> {
    const rules = await prisma.filterRule.findMany({
      where: { userId, isActive: true },
      select: { conditions: true },
    });

    return rules.some((rule) => {
      const conditions = (rule.conditions as Array<{ field: string }>) || [];
      return conditions.some((c) => c.field === field);
    });
  }
}