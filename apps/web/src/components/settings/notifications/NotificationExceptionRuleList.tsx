import { BellOff, FilePenLine, Trash2 } from 'lucide-react';

import type { NotificationExceptionRule } from '@/components/settings/notifications/notification-template-drafts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import { cn } from '@/lib/utils';

interface NotificationExceptionRuleListProps {
  isDeleting?: boolean;
  isLoading?: boolean;
  onEdit: (rule: NotificationExceptionRule) => void;
  onRemove: (ruleId: string) => void;
  rules: NotificationExceptionRule[];
}

export function NotificationExceptionRuleList({
  isDeleting = false,
  isLoading = false,
  onEdit,
  onRemove,
  rules,
}: NotificationExceptionRuleListProps) {
  const { t } = useLanguage();

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="bg-[var(--github-accent)]/15 text-[var(--github-accent)] rounded-full px-2.5 py-0.5 border-none text-xs font-semibold">
            {t('notifications.settings.rules.badge')}
          </Badge>
        </div>
        <p className="text-sm font-semibold text-white">
          {t('notifications.settings.rules.title')}
        </p>
        <p className="text-xs text-muted-foreground">
          {t('notifications.settings.rules.description')}
        </p>
      </div>

      {isLoading ? (
        <div className="rounded-xl border border-border/60 bg-card/40 p-8 text-center">
          <p className="text-sm font-medium text-white">
            {t('notifications.settings.rules.loading')}
          </p>
        </div>
      ) : rules.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/80 bg-card/20 p-8 text-center">
          <BellOff className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm font-semibold text-white">
            {t('notifications.settings.rules.emptyTitle')}
          </p>
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
            {t('notifications.settings.rules.emptyDescription')}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className="rounded-xl border border-border/60 bg-card/45 p-4 transition-all duration-200 hover:border-primary/20 hover:bg-card/60"
            >
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="space-y-1.5 min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-white truncate max-w-[240px]">{rule.name}</p>
                    <Badge
                      className={cn(
                        'text-[10px] px-2 py-0 border-none font-medium rounded-full shadow-none',
                        rule.action === 'exclude'
                          ? 'bg-red-500/10 text-[var(--github-danger)]'
                          : 'bg-green-500/10 text-[var(--github-success)]'
                      )}
                    >
                      {rule.action === 'exclude'
                        ? t('notifications.settings.draft.actions.exclude')
                        : t('notifications.settings.draft.actions.include')}
                    </Badge>
                    <Badge
                      className={cn(
                        'text-[10px] px-2 py-0 border-none font-medium rounded-full shadow-none',
                        rule.enabled
                          ? 'bg-primary/20 text-primary'
                          : 'bg-white/10 text-muted-foreground'
                      )}
                    >
                      {rule.enabled
                        ? t('notifications.settings.rules.status.enabled')
                        : t('notifications.settings.rules.status.disabled')}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {rule.description}
                  </p>
                  <div className="inline-block mt-1 text-[11px] text-primary/80 font-medium px-2 py-0.5 rounded bg-primary/5 border border-primary/10">
                    {rule.summary}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 shrink-0 md:justify-end">
                  <Button
                    className="h-8 text-xs gap-1.5 border-border hover:bg-white/5 hover:border-primary/30 text-white rounded-lg"
                    disabled={isDeleting}
                    onClick={() => onEdit(rule)}
                    size="sm"
                    variant="outline"
                  >
                    <FilePenLine className="h-3.5 w-3.5" />
                    {t('notifications.settings.rules.actions.edit')}
                  </Button>
                  <Button
                    className="h-8 text-xs gap-1.5 border-border text-red-400 hover:text-red-300 hover:bg-red-500/5 hover:border-red-500/30 rounded-lg"
                    disabled={isDeleting}
                    onClick={() => onRemove(rule.id)}
                    size="sm"
                    variant="outline"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {t('notifications.settings.rules.actions.remove')}
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
