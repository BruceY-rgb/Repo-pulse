import { BellDot, BellOff, BellRing } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useLanguage } from '@/contexts/LanguageContext';
import { cn } from '@/lib/utils';

export type NotificationLevelValue = 'all' | 'important' | 'focused';

interface NotificationLevelSelectorProps {
  onValueChange: (value: NotificationLevelValue) => void;
  value: NotificationLevelValue;
}

const levelOptions: Array<{
  badgeKey: string;
  descriptionKey: string;
  icon: typeof BellRing;
  titleKey: string;
  value: NotificationLevelValue;
}> = [
  {
    badgeKey: 'notifications.settings.focus.levels.all.badge',
    descriptionKey: 'notifications.settings.focus.levels.all.description',
    icon: BellRing,
    titleKey: 'notifications.settings.focus.levels.all.title',
    value: 'all',
  },
  {
    badgeKey: 'notifications.settings.focus.levels.important.badge',
    descriptionKey: 'notifications.settings.focus.levels.important.description',
    icon: BellDot,
    titleKey: 'notifications.settings.focus.levels.important.title',
    value: 'important',
  },
  {
    badgeKey: 'notifications.settings.focus.levels.focused.badge',
    descriptionKey: 'notifications.settings.focus.levels.focused.description',
    icon: BellOff,
    titleKey: 'notifications.settings.focus.levels.focused.title',
    value: 'focused',
  },
];

export function NotificationLevelSelector({
  onValueChange,
  value,
}: NotificationLevelSelectorProps) {
  const { t } = useLanguage();

  return (
    <div className="space-y-4 rounded-lg border border-[var(--github-border)] bg-white/5 p-4">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="bg-[var(--github-accent)]/15 text-[var(--github-accent)]">
            {t('notifications.settings.focus.badge')}
          </Badge>
        </div>
        <p className="text-sm font-medium text-white">{t('notifications.settings.focus.title')}</p>
        <p className="text-xs text-[var(--github-text-secondary)]">
          {t('notifications.settings.focus.description')}
        </p>
      </div>

      <RadioGroup
        className="gap-3"
        onValueChange={(nextValue) => onValueChange(nextValue as NotificationLevelValue)}
        value={value}
      >
        {levelOptions.map((option) => {
          const Icon = option.icon;
          const isSelected = option.value === value;

          return (
            <label
              key={option.value}
              className={cn(
                'flex cursor-pointer items-start gap-4 rounded-lg border border-[var(--github-border)] bg-[var(--github-surface)]/80 p-4 transition-colors',
                isSelected && 'border-primary bg-primary/10',
              )}
              htmlFor={`notification-focus-${option.value}`}
            >
              <RadioGroupItem
                className="mt-1"
                id={`notification-focus-${option.value}`}
                value={option.value}
              />
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5">
                  <Icon className="h-4 w-4 text-white" />
                </div>
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-white">{t(option.titleKey)}</p>
                    <Badge
                      className={cn(
                        'text-xs',
                        isSelected
                          ? 'bg-[var(--github-accent)] text-white'
                          : 'bg-white/10 text-[var(--github-text-secondary)]',
                      )}
                    >
                      {t(option.badgeKey)}
                    </Badge>
                  </div>
                  <p className="text-xs text-[var(--github-text-secondary)]">
                    {t(option.descriptionKey)}
                  </p>
                </div>
              </div>
            </label>
          );
        })}
      </RadioGroup>
    </div>
  );
}
