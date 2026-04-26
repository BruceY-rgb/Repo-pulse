import type {
  CreateFilterRulePayload,
  FilterCondition,
  FilterRuleDto,
  UpdateFilterRulePayload,
} from '@repo-pulse/shared';

import type { NotificationTemplateValue } from '@/components/settings/notifications/NotificationTemplateGallery';

export type NotificationExceptionAction = 'exclude' | 'include';

export interface NotificationExceptionDraft {
  action: NotificationExceptionAction;
  conditions: FilterCondition[];
  description: string;
  enabled: boolean;
  id?: string;
  name: string;
  priority: number;
  summary: string;
  template?: NotificationTemplateValue;
}

export interface NotificationExceptionRule extends NotificationExceptionDraft {
  id: string;
}

type TranslateFn = (key: string) => string;

const templateDefinitions: Record<
  NotificationTemplateValue,
  {
    conditions: FilterCondition[];
    draftDescriptionKey: string;
    draftNameKey: string;
    summaryKey: string;
  }
> = {
  ignoreBots: {
    conditions: [{ field: 'author', operator: 'contains', value: 'bot' }],
    draftDescriptionKey: 'notifications.settings.templates.items.ignoreBots.draftDescription',
    draftNameKey: 'notifications.settings.templates.items.ignoreBots.draftName',
    summaryKey: 'notifications.settings.templates.items.ignoreBots.summary',
  },
  ignorePushes: {
    conditions: [{ field: 'eventType', operator: 'eq', value: 'PUSH' }],
    draftDescriptionKey: 'notifications.settings.templates.items.ignorePushes.draftDescription',
    draftNameKey: 'notifications.settings.templates.items.ignorePushes.draftName',
    summaryKey: 'notifications.settings.templates.items.ignorePushes.summary',
  },
  ignoreLowRisk: {
    conditions: [{ field: 'riskLevel', operator: 'eq', value: 'LOW' }],
    draftDescriptionKey: 'notifications.settings.templates.items.ignoreLowRisk.draftDescription',
    draftNameKey: 'notifications.settings.templates.items.ignoreLowRisk.draftName',
    summaryKey: 'notifications.settings.templates.items.ignoreLowRisk.summary',
  },
  ignoreComments: {
    conditions: [{ field: 'eventType', operator: 'in', value: ['ISSUE_COMMENT', 'PR_REVIEW'] }],
    draftDescriptionKey: 'notifications.settings.templates.items.ignoreComments.draftDescription',
    draftNameKey: 'notifications.settings.templates.items.ignoreComments.draftName',
    summaryKey: 'notifications.settings.templates.items.ignoreComments.summary',
  },
};

function cloneConditions(conditions: FilterCondition[]): FilterCondition[] {
  return conditions.map((condition) => ({
    ...condition,
    value: Array.isArray(condition.value) ? [...condition.value] : condition.value,
  }));
}

function normalizeCondition(condition: FilterCondition) {
  const normalizedValue = Array.isArray(condition.value)
    ? [...condition.value].sort()
    : condition.value;

  return {
    field: condition.field,
    operator: condition.operator,
    value: normalizedValue,
  };
}

function serializeConditions(conditions: FilterCondition[]): string {
  return JSON.stringify(
    conditions
      .map(normalizeCondition)
      .sort((left, right) =>
        `${left.field}:${left.operator}`.localeCompare(`${right.field}:${right.operator}`),
      ),
  );
}

function findTemplateForConditions(
  conditions: FilterCondition[],
): NotificationTemplateValue | undefined {
  const serializedConditions = serializeConditions(conditions);

  return (Object.entries(templateDefinitions) as Array<
    [NotificationTemplateValue, (typeof templateDefinitions)[NotificationTemplateValue]]
  >).find(([, definition]) =>
    serializeConditions(definition.conditions) === serializedConditions,
  )?.[0];
}

function toUiAction(action: FilterRuleDto['action']): NotificationExceptionAction {
  return action === 'EXCLUDE' ? 'exclude' : 'include';
}

function toFilterAction(action: NotificationExceptionAction): CreateFilterRulePayload['action'] {
  return action === 'exclude' ? 'EXCLUDE' : 'INCLUDE';
}

export function createExceptionDraftFromTemplate(
  template: NotificationTemplateValue,
  t: TranslateFn,
): NotificationExceptionDraft {
  const definition = templateDefinitions[template];

  return {
    action: 'exclude',
    conditions: cloneConditions(definition.conditions),
    description: t(definition.draftDescriptionKey),
    enabled: true,
    name: t(definition.draftNameKey),
    priority: 100,
    summary: t(definition.summaryKey),
    template,
  };
}

export function createExceptionRuleFromFilterRule(
  rule: FilterRuleDto,
  t: TranslateFn,
): NotificationExceptionRule {
  const template = findTemplateForConditions(rule.conditions);

  return {
    action: toUiAction(rule.action),
    conditions: cloneConditions(rule.conditions),
    description: rule.description ?? '',
    enabled: rule.isActive,
    id: rule.id,
    name: rule.name,
    priority: rule.priority,
    summary: template
      ? t(templateDefinitions[template].summaryKey)
      : t('notifications.settings.rules.customSummary'),
    template,
  };
}

export function createFilterRulePayloadFromDraft(
  draft: NotificationExceptionDraft,
): CreateFilterRulePayload {
  return {
    action: toFilterAction(draft.action),
    conditions: cloneConditions(draft.conditions),
    description: draft.description || undefined,
    isActive: draft.enabled,
    name: draft.name,
    priority: draft.priority,
  };
}

export function createFilterRuleUpdatePayloadFromDraft(
  draft: NotificationExceptionDraft,
): UpdateFilterRulePayload {
  return {
    action: toFilterAction(draft.action),
    conditions: cloneConditions(draft.conditions),
    description: draft.description || undefined,
    isActive: draft.enabled,
    name: draft.name,
    priority: draft.priority,
  };
}
