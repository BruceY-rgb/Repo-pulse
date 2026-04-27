import {
  Bot,
  GitCommitHorizontal,
  MessageSquareOff,
  TriangleAlert,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import { cn } from '@/lib/utils';

export type NotificationTemplateValue =
  | 'ignoreBots'
  | 'ignorePushes'
  | 'ignoreLowRisk'
  | 'ignoreComments';

interface NotificationTemplateGalleryProps {
  onSelectTemplate: (value: NotificationTemplateValue) => void;
  selectedTemplate: NotificationTemplateValue | null;
}

const templateOptions: Array<{
  badgeKey: string;
  descriptionKey: string;
  icon: typeof Bot;
  summaryKey: string;
  titleKey: string;
  value: NotificationTemplateValue;
}> = [
  {
    badgeKey: 'notifications.settings.templates.items.ignoreBots.badge',
    descriptionKey: 'notifications.settings.templates.items.ignoreBots.description',
    icon: Bot,
    summaryKey: 'notifications.settings.templates.items.ignoreBots.summary',
    titleKey: 'notifications.settings.templates.items.ignoreBots.title',
    value: 'ignoreBots',
  },
  {
    badgeKey: 'notifications.settings.templates.items.ignorePushes.badge',
    descriptionKey: 'notifications.settings.templates.items.ignorePushes.description',
    icon: GitCommitHorizontal,
    summaryKey: 'notifications.settings.templates.items.ignorePushes.summary',
    titleKey: 'notifications.settings.templates.items.ignorePushes.title',
    value: 'ignorePushes',
  },
  {
    badgeKey: 'notifications.settings.templates.items.ignoreLowRisk.badge',
    descriptionKey: 'notifications.settings.templates.items.ignoreLowRisk.description',
    icon: TriangleAlert,
    summaryKey: 'notifications.settings.templates.items.ignoreLowRisk.summary',
    titleKey: 'notifications.settings.templates.items.ignoreLowRisk.title',
    value: 'ignoreLowRisk',
  },
  {
    badgeKey: 'notifications.settings.templates.items.ignoreComments.badge',
    descriptionKey: 'notifications.settings.templates.items.ignoreComments.description',
    icon: MessageSquareOff,
    summaryKey: 'notifications.settings.templates.items.ignoreComments.summary',
    titleKey: 'notifications.settings.templates.items.ignoreComments.title',
    value: 'ignoreComments',
  },
];

export function NotificationTemplateGallery({
  onSelectTemplate,
  selectedTemplate,
}: NotificationTemplateGalleryProps) {
  const { t } = useLanguage();

  return (
    <div className="space-y-4 rounded-lg border border-[var(--github-border)] bg-white/5 p-4">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="bg-[var(--github-accent)]/15 text-[var(--github-accent)]">
            {t('notifications.settings.templates.badge')}
          </Badge>
        </div>
        <p className="text-sm font-medium text-white">
          {t('notifications.settings.templates.title')}
        </p>
        <p className="text-xs text-[var(--github-text-secondary)]">
          {t('notifications.settings.templates.description')}
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {templateOptions.map((template) => {
          const Icon = template.icon;
          const isSelected = template.value === selectedTemplate;

          return (
            <div
              key={template.value}
              className={cn(
                'rounded-lg border border-[var(--github-border)] bg-[var(--github-surface)]/80 p-4 transition-colors',
                isSelected && 'border-primary bg-primary/10',
              )}
            >
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5">
                  <Icon className="h-4 w-4 text-white" />
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-white">{t(template.titleKey)}</p>
                    <Badge
                      className={cn(
                        'text-xs',
                        isSelected
                          ? 'bg-[var(--github-accent)] text-white'
                          : 'bg-white/10 text-[var(--github-text-secondary)]',
                      )}
                    >
                      {t(template.badgeKey)}
                    </Badge>
                  </div>
                  <p className="text-xs text-[var(--github-text-secondary)]">
                    {t(template.descriptionKey)}
                  </p>
                </div>
              </div>

              <div className="mt-3 rounded-lg border border-[var(--github-border)] bg-white/5 px-3 py-2">
                <p className="text-xs text-[var(--github-text-secondary)]">
                  {t(template.summaryKey)}
                </p>
              </div>

              <div className="mt-3">
                <Button
                  className="gap-2"
                  onClick={() => onSelectTemplate(template.value)}
                  size="sm"
                  variant={isSelected ? 'default' : 'outline'}
                >
                  {isSelected
                    ? t('notifications.settings.templates.actions.selected')
                    : t('notifications.settings.templates.actions.use')}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
