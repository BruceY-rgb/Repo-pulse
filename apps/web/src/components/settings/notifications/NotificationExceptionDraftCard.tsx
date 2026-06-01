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
  isSaving?: boolean;
  onActionChange: (value: NotificationExceptionAction) => void;
  onClear: () => void;
  onDescriptionChange: (value: string) => void;
  onEnabledChange: (value: boolean) => void;
  onNameChange: (value: string) => void;
  onSave: () => void;
}

export function NotificationExceptionDraftCard({
  draft,
  isSaving = false,
  onActionChange,
  onClear,
  onDescriptionChange,
  onEnabledChange,
  onNameChange,
  onSave,
}: NotificationExceptionDraftCardProps) {
  const { t } = useLanguage();

  if (!draft) {
    return null;
  }

  return (
    <div className="space-y-4 rounded-xl border border-primary/40 bg-primary/5 p-5 shadow-md shadow-primary/5 glow-orange">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Badge className="bg-primary/20 text-primary border-none rounded-full px-2 py-0 text-[10px] font-semibold uppercase tracking-wider">
            {t('notifications.settings.draft.badge')}
          </Badge>
          <button
            onClick={onClear}
            className="text-xs text-muted-foreground hover:text-white transition-colors"
          >
            {t('notifications.settings.draft.actions.clear')}
          </button>
        </div>
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/20 shrink-0">
            <FilePenLine className="h-4 w-4" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-semibold text-white">
              {t('notifications.settings.draft.title')}
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {t('notifications.settings.draft.description')}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label className="text-xs font-semibold text-muted-foreground" htmlFor="draft-rule-name">
            {t('notifications.settings.draft.fields.name')}
          </Label>
          <Input
            className="bg-background border-border/60 rounded-lg text-sm text-white focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary transition-all"
            id="draft-rule-name"
            onChange={(event) => onNameChange(event.target.value)}
            value={draft.name}
          />
        </div>

        <div className="space-y-2">
          <Label className="text-xs font-semibold text-muted-foreground">
            {t('notifications.settings.draft.fields.action')}
          </Label>
          <Select
            onValueChange={(value) => onActionChange(value as NotificationExceptionAction)}
            value={draft.action}
          >
            <SelectTrigger className="bg-background border-border/60 rounded-lg text-sm text-white focus:ring-1 focus:ring-primary focus:border-primary transition-all">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#151922] border-border text-white">
              <SelectItem value="exclude" className="focus:bg-primary/10 focus:text-primary">
                {t('notifications.settings.draft.actions.exclude')}
              </SelectItem>
              <SelectItem value="include" className="focus:bg-primary/10 focus:text-primary">
                {t('notifications.settings.draft.actions.include')}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-xs font-semibold text-muted-foreground" htmlFor="draft-rule-description">
          {t('notifications.settings.draft.fields.description')}
        </Label>
        <Input
          className="bg-background border-border/60 rounded-lg text-sm text-white focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary transition-all"
          id="draft-rule-description"
          onChange={(event) => onDescriptionChange(event.target.value)}
          value={draft.description}
        />
      </div>

      {/* Preview Section */}
      <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-primary/80">
          {t('notifications.settings.draft.previewLabel')}
        </p>
        <p className="text-sm font-semibold text-white leading-relaxed">
          {draft.summary}
        </p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {draft.action === 'exclude'
            ? t('notifications.settings.draft.previewExclude')
            : t('notifications.settings.draft.previewInclude')}
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-border/50 bg-background/30 p-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-0.5">
          <p className="text-xs font-semibold text-white">
            {t('notifications.settings.draft.fields.enabled')}
          </p>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            {t('notifications.settings.draft.enabledHint')}
          </p>
        </div>
        <Switch
          checked={draft.enabled}
          onCheckedChange={onEnabledChange}
          className="data-[state=checked]:bg-primary"
        />
      </div>

      <div className="flex justify-end gap-2.5 pt-2">
        <Button 
          disabled={isSaving} 
          onClick={onClear} 
          size="sm" 
          variant="outline"
          className="h-9 text-xs font-medium border-border hover:bg-white/5 hover:border-primary/30 rounded-lg"
        >
          {t('notifications.settings.draft.actions.clear')}
        </Button>
        <Button 
          disabled={isSaving} 
          onClick={onSave} 
          size="sm"
          className="h-9 text-xs font-semibold bg-primary hover:bg-primary/95 text-white rounded-lg border-none"
        >
          {draft.id
            ? t('notifications.settings.draft.actions.update')
            : t('notifications.settings.draft.actions.next')}
        </Button>
      </div>
    </div>
  );
}
