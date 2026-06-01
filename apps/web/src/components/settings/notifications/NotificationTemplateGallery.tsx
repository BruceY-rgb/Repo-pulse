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
    <div className="space-y-4">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="bg-[var(--github-accent)]/15 text-[var(--github-accent)] rounded-full px-2.5 py-0.5 border-none text-xs font-semibold">
            {t('notifications.settings.templates.badge')}
          </Badge>
        </div>
        <p className="text-sm font-semibold text-white">
          {t('notifications.settings.templates.title')}
        </p>
        <p className="text-xs text-muted-foreground">
          {t('notifications.settings.templates.description')}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {templateOptions.map((template) => {
          const Icon = template.icon;
          const isSelected = template.value === selectedTemplate;

          return (
            <div
              key={template.value}
              className={cn(
                'rounded-xl border p-4 flex flex-col justify-between min-h-[190px] transition-all duration-200',
                isSelected
                  ? 'border-primary bg-primary/5 shadow-md shadow-primary/5 glow-orange'
                  : 'border-border/60 bg-card/40 hover:bg-white/5 hover:border-primary/20'
              )}
            >
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-lg border transition-all duration-200 shrink-0',
                    isSelected 
                      ? 'bg-primary/10 border-primary/20 text-primary' 
                      : 'bg-white/5 border-border/40 text-muted-foreground'
                  )}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-white">{t(template.titleKey)}</p>
                      <Badge
                        className={cn(
                          'text-[10px] px-2 py-0 border-none font-medium rounded-full shadow-none',
                          isSelected
                            ? 'bg-primary/20 text-primary'
                            : 'bg-white/10 text-muted-foreground'
                        )}
                      >
                        {t(template.badgeKey)}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {t(template.descriptionKey)}
                    </p>
                  </div>
                </div>

                <div className="rounded-lg border border-border/40 bg-background/50 px-3 py-2 text-xs text-muted-foreground leading-relaxed">
                  {t(template.summaryKey)}
                </div>
              </div>

              <div className="mt-4 flex justify-end">
                <Button
                  className={cn(
                    'h-8 text-xs font-medium px-3 rounded-lg border',
                    isSelected
                      ? 'bg-primary text-white border-primary hover:bg-primary/95 hover:border-primary'
                      : 'bg-transparent border-border hover:bg-white/5 hover:border-primary/30 text-white'
                  )}
                  onClick={() => onSelectTemplate(template.value)}
                  size="sm"
                  variant="outline"
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
