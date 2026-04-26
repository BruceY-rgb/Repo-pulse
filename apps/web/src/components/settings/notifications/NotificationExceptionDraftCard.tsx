import { FilePenLine } from 'lucide-react';

import type {
  NotificationExceptionAction,
  NotificationExceptionDraft,
} from '@/components/settings/notifications/notification-template-drafts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useLanguage } from '@/contexts/LanguageContext';

interface NotificationExceptionDraftCardProps {
  draft: NotificationExceptionDraft | null;
  onActionChange: (value: NotificationExceptionAction) => void;
  onClear: () => void;
  onDescriptionChange: (value: string) => void;
  onEnabledChange: (value: boolean) => void;
  onNameChange: (value: string) => void;
}

export function NotificationExceptionDraftCard({
  draft,
  onActionChange,
  onClear,
  onDescriptionChange,
  onEnabledChange,
  onNameChange,
}: NotificationExceptionDraftCardProps) {
  const { t } = useLanguage();

  if (!draft) {
    return null;
  }

  return (
    <div className="space-y-4 rounded-lg border border-primary/30 bg-primary/10 p-4">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="bg-[var(--github-accent)] text-white">
            {t('notifications.settings.draft.badge')}
          </Badge>
        </div>
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10">
            <FilePenLine className="h-4 w-4 text-white" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium text-white">
              {t('notifications.settings.draft.title')}
            </p>
            <p className="text-xs text-[var(--github-text-secondary)]">
              {t('notifications.settings.draft.description')}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label className="text-sm text-white" htmlFor="draft-rule-name">
            {t('notifications.settings.draft.fields.name')}
          </Label>
          <Input
            className="bg-[var(--github-surface)] border-[var(--github-border)]"
            id="draft-rule-name"
            onChange={(event) => onNameChange(event.target.value)}
            value={draft.name}
          />
        </div>

        <div className="space-y-2">
          <Label className="text-sm text-white">
            {t('notifications.settings.draft.fields.action')}
          </Label>
          <Select
            onValueChange={(value) => onActionChange(value as NotificationExceptionAction)}
            value={draft.action}
          >
            <SelectTrigger className="bg-[var(--github-surface)] border-[var(--github-border)]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="exclude">
                {t('notifications.settings.draft.actions.exclude')}
              </SelectItem>
              <SelectItem value="include">
                {t('notifications.settings.draft.actions.include')}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-sm text-white" htmlFor="draft-rule-description">
          {t('notifications.settings.draft.fields.description')}
        </Label>
        <Input
          className="bg-[var(--github-surface)] border-[var(--github-border)]"
          id="draft-rule-description"
          onChange={(event) => onDescriptionChange(event.target.value)}
          value={draft.description}
        />
      </div>

      <div className="rounded-lg border border-[var(--github-border)] bg-white/5 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--github-text-secondary)]">
          {t('notifications.settings.draft.previewLabel')}
        </p>
        <p className="mt-2 text-sm text-white">
          {t(`notifications.settings.templates.items.${draft.template}.summary`)}
        </p>
        <p className="mt-1 text-xs text-[var(--github-text-secondary)]">
          {draft.action === 'exclude'
            ? t('notifications.settings.draft.previewExclude')
            : t('notifications.settings.draft.previewInclude')}
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-[var(--github-border)] bg-white/5 p-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium text-white">
            {t('notifications.settings.draft.fields.enabled')}
          </p>
          <p className="text-xs text-[var(--github-text-secondary)]">
            {t('notifications.settings.draft.enabledHint')}
          </p>
        </div>
        <Switch
          checked={draft.enabled}
          onCheckedChange={onEnabledChange}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={onClear} size="sm" variant="outline">
          {t('notifications.settings.draft.actions.clear')}
        </Button>
        <Button size="sm">
          {t('notifications.settings.draft.actions.next')}
        </Button>
      </div>
    </div>
  );
}
