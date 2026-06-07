import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
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
  action?: FilterAction;
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
    if (!this.isRecord(dto)) {
      throw new BadRequestException('filter rule payload is required');
    }
    if (!this.isNonEmptyString(dto.name)) {
      throw new BadRequestException('name is required');
    }
    this.validateConditions(dto.conditions);
    this.validateAction(dto.action);

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
    if (!this.isRecord(dto)) {
      throw new BadRequestException('filter rule update payload is required');
    }
    if (dto.name !== undefined && !this.isNonEmptyString(dto.name)) {
      throw new BadRequestException('name must be a non-empty string');
    }
    if (dto.conditions !== undefined) {
      this.validateConditions(dto.conditions);
    }
    if (dto.action !== undefined) {
      this.validateAction(dto.action);
    }
    if (dto.description !== undefined && typeof dto.description !== 'string') {
      throw new BadRequestException('description must be a string');
    }
    if (dto.isActive !== undefined && typeof dto.isActive !== 'boolean') {
      throw new BadRequestException('isActive must be a boolean');
    }
    if (dto.priority !== undefined && typeof dto.priority !== 'number') {
      throw new BadRequestException('priority must be a number');
    }

    const rule = await prisma.filterRule.findFirst({
      where: { id: ruleId, userId },
    });

    if (!rule) {
      throw new NotFoundException(`Filter rule not found: ${ruleId}`);
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
      throw new NotFoundException(`Filter rule not found: ${ruleId}`);
    }

    await prisma.filterRule.delete({
      where: { id: ruleId },
    });
  }

  /**
   * 测试规则匹配
   */
  testRule(dto: TestFilterDto): { matched: boolean; action: FilterAction | null } {
    this.validateTestPayload(dto);

    const { conditions, event } = dto;
    const action = dto.action ?? FilterAction.INCLUDE;
    const matched = this.matchConditions(conditions, event);

    return {
      matched,
      action: matched ? action : null,
    };
  }

  private matchConditions(
    conditions: FilterCondition[],
    event: TestFilterDto['event'],
  ): boolean {
    for (const condition of conditions) {
      const fieldValue = this.getEventField(event, condition.field);
      const result = this.evaluateCondition(fieldValue, condition);

      if (!result) {
        return false;
      }
    }

    return true;
  }

  private validateTestPayload(dto: unknown): asserts dto is TestFilterDto {
    if (!this.isRecord(dto)) {
      throw new BadRequestException('test payload is required');
    }

    this.validateConditions(dto.conditions);
    if (dto.action !== undefined) {
      this.validateAction(dto.action);
    }
    this.validateTestEvent(dto.event);
  }

  private validateTestEvent(event: unknown): asserts event is TestFilterDto['event'] {
    if (!this.isRecord(event)) {
      throw new BadRequestException('event is required');
    }

    if (!this.isNonEmptyString(event.type)) {
      throw new BadRequestException('event.type is required');
    }
    if (!this.isNonEmptyString(event.repository)) {
      throw new BadRequestException('event.repository is required');
    }
    if (!this.isNonEmptyString(event.author)) {
      throw new BadRequestException('event.author is required');
    }
    if (event.riskLevel !== undefined && typeof event.riskLevel !== 'string') {
      throw new BadRequestException('event.riskLevel must be a string');
    }
    if (event.body !== undefined && typeof event.body !== 'string') {
      throw new BadRequestException('event.body must be a string');
    }
  }

  private validateConditions(conditions: unknown): asserts conditions is FilterCondition[] {
    if (!Array.isArray(conditions)) {
      throw new BadRequestException('conditions must be an array');
    }

    conditions.forEach((condition, index) => {
      if (!this.isRecord(condition)) {
        throw new BadRequestException(`conditions[${index}] must be an object`);
      }

      if (!this.isFilterField(condition.field)) {
        throw new BadRequestException(
          `conditions[${index}].field must be one of: eventType, repository, author, riskLevel, customRegex`,
        );
      }
      if (!this.isFilterOperator(condition.operator)) {
        throw new BadRequestException(
          `conditions[${index}].operator must be one of: eq, contains, regex, in`,
        );
      }

      const { operator, value } = condition;
      if (operator === 'in') {
        if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
          throw new BadRequestException(`conditions[${index}].value must be a string array for operator "in"`);
        }
        return;
      }

      if (typeof value !== 'string') {
        throw new BadRequestException(`conditions[${index}].value must be a string`);
      }
      if (operator === 'regex') {
        try {
          new RegExp(value, 'i');
        } catch {
          throw new BadRequestException(`conditions[${index}].value must be a valid regex`);
        }
      }
    });
  }

  private validateAction(action: unknown): asserts action is FilterAction {
    if (action === undefined || action === null || action === '') {
      throw new BadRequestException('action is required');
    }
    if (!Object.values(FilterAction).includes(action as FilterAction)) {
      throw new BadRequestException('action must be one of: INCLUDE, EXCLUDE, TAG');
    }
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
  }

  private isFilterField(value: unknown): value is FilterCondition['field'] {
    return (
      value === 'eventType' ||
      value === 'repository' ||
      value === 'author' ||
      value === 'riskLevel' ||
      value === 'customRegex'
    );
  }

  private isFilterOperator(value: unknown): value is FilterCondition['operator'] {
    return value === 'eq' || value === 'contains' || value === 'regex' || value === 'in';
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
      let matched = false;
      try {
        const conditions = rule.conditions as unknown;
        this.validateConditions(conditions);
        matched = this.matchConditions(conditions, eventData);
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'unknown_error';
        this.logger.warn(`filter_rule_invalid ruleId=${rule.id} userId=${userId} reason=${reason}`);
        continue;
      }

      if (matched) {
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
