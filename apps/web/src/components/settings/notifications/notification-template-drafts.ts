import type { NotificationTemplateValue } from '@/components/settings/notifications/NotificationTemplateGallery';

export type NotificationExceptionAction = 'exclude' | 'include';

export interface NotificationExceptionDraft {
  action: NotificationExceptionAction;
  description: string;
  enabled: boolean;
  name: string;
  template: NotificationTemplateValue;
}

type TranslateFn = (key: string) => string;

export function createExceptionDraftFromTemplate(
  template: NotificationTemplateValue,
  t: TranslateFn,
): NotificationExceptionDraft {
  return {
    action: 'exclude',
    description: t(`notifications.settings.templates.items.${template}.draftDescription`),
    enabled: true,
    name: t(`notifications.settings.templates.items.${template}.draftName`),
    template,
  };
}
