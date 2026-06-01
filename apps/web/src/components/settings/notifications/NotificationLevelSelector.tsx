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
    <div className="space-y-4">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="bg-[var(--github-accent)]/15 text-[var(--github-accent)] rounded-full px-2.5 py-0.5 border-none text-xs font-semibold">
            {t('notifications.settings.focus.badge')}
          </Badge>
        </div>
        <p className="text-sm font-semibold text-white">{t('notifications.settings.focus.title')}</p>
        <p className="text-xs text-muted-foreground">
          {t('notifications.settings.focus.description')}
        </p>
      </div>

      <RadioGroup
        className="grid grid-cols-1 md:grid-cols-3 gap-4"
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
                'relative flex flex-col items-center text-center justify-between cursor-pointer rounded-xl border p-5 transition-all duration-200 select-none min-h-[175px]',
                isSelected 
                  ? 'border-primary bg-primary/5 shadow-md shadow-primary/5 glow-orange' 
                  : 'border-border/60 bg-card/40 hover:bg-white/5 hover:border-primary/20'
              )}
              htmlFor={`notification-focus-${option.value}`}
            >
              {/* Radio Indicator (Top Right) */}
              <div className="absolute top-3 right-3">
                <RadioGroupItem
                  id={`notification-focus-${option.value}`}
                  value={option.value}
                  className={cn(
                    'h-4 w-4 border-border',
                    isSelected && 'border-primary text-primary'
                  )}
                />
              </div>

              {/* Icon Container */}
              <div className={cn(
                'flex h-12 w-12 items-center justify-center rounded-full border transition-all duration-200 mb-2',
                isSelected 
                  ? 'bg-primary/10 border-primary/30 text-primary' 
                  : 'bg-white/5 border-border/40 text-muted-foreground'
              )}>
                <Icon className={cn('h-5 w-5', isSelected ? 'text-primary' : 'text-foreground')} />
              </div>

              {/* Title & Badge */}
              <div className="space-y-1.5 flex flex-col items-center">
                <div className="flex flex-col items-center gap-1">
                  <p className="text-sm font-semibold text-white">{t(option.titleKey)}</p>
                  <Badge
                    className={cn(
                      'text-[10px] px-2 py-0 border-none font-medium rounded-full shadow-none',
                      isSelected
                        ? 'bg-primary/20 text-primary'
                        : 'bg-white/10 text-muted-foreground'
                    )}
                  >
                    {t(option.badgeKey)}
                  </Badge>
                </div>
              </div>

              {/* Description */}
              <p className="text-xs text-muted-foreground mt-3 leading-relaxed max-w-[200px]">
                {t(option.descriptionKey)}
              </p>
            </label>
          );
        })}
      </RadioGroup>
    </div>
  );
}
