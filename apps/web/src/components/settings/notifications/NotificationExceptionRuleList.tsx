import { BellOff, FilePenLine, Trash2 } from 'lucide-react';

import type { NotificationExceptionRule } from '@/components/settings/notifications/notification-template-drafts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';

interface NotificationExceptionRuleListProps {
  onEdit: (rule: NotificationExceptionRule) => void;
  onRemove: (ruleId: string) => void;
  rules: NotificationExceptionRule[];
}

export function NotificationExceptionRuleList({
  onEdit,
  onRemove,
  rules,
}: NotificationExceptionRuleListProps) {
  const { t } = useLanguage();

  return (
    <div className="space-y-4 rounded-lg border border-[var(--github-border)] bg-white/5 p-4">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="bg-[var(--github-accent)]/15 text-[var(--github-accent)]">
            {t('notifications.settings.rules.badge')}
          </Badge>
        </div>
        <p className="text-sm font-medium text-white">
          {t('notifications.settings.rules.title')}
        </p>
        <p className="text-xs text-[var(--github-text-secondary)]">
          {t('notifications.settings.rules.description')}
        </p>
      </div>

      {rules.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--github-border)] bg-[var(--github-surface)]/80 p-6 text-center">
          <BellOff className="mx-auto h-8 w-8 text-[var(--github-text-secondary)]" />
          <p className="mt-3 text-sm font-medium text-white">
            {t('notifications.settings.rules.emptyTitle')}
          </p>
          <p className="mt-1 text-xs text-[var(--github-text-secondary)]">
            {t('notifications.settings.rules.emptyDescription')}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className="rounded-lg border border-[var(--github-border)] bg-[var(--github-surface)]/80 p-4"
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-white">{rule.name}</p>
                    <Badge
                      className={
                        rule.action === 'exclude'
                          ? 'bg-destructive text-white'
                          : 'bg-[var(--github-accent)] text-white'
                      }
                    >
                      {rule.action === 'exclude'
                        ? t('notifications.settings.draft.actions.exclude')
                        : t('notifications.settings.draft.actions.include')}
                    </Badge>
                    <Badge className="bg-white/10 text-[var(--github-text-secondary)]">
                      {rule.enabled
                        ? t('notifications.settings.rules.status.enabled')
                        : t('notifications.settings.rules.status.disabled')}
                    </Badge>
                  </div>
                  <p className="text-xs text-[var(--github-text-secondary)]">
                    {rule.description}
                  </p>
                  <p className="text-xs text-[var(--github-text-secondary)]">
                    {t(`notifications.settings.templates.items.${rule.template}.summary`)}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    className="gap-2"
                    onClick={() => onEdit(rule)}
                    size="sm"
                    variant="outline"
                  >
                    <FilePenLine className="h-4 w-4" />
                    {t('notifications.settings.rules.actions.edit')}
                  </Button>
                  <Button
                    className="gap-2 text-destructive hover:text-destructive"
                    onClick={() => onRemove(rule.id)}
                    size="sm"
                    variant="outline"
                  >
                    <Trash2 className="h-4 w-4" />
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
