import { useEffect, useMemo, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { enUS, zhCN } from 'date-fns/locale';
import {
  Bell,
  Check,
  Loader2,
  Mail,
  MessageSquare,
  Settings,
  Trash2,
  Webhook,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useLanguage } from '@/contexts/LanguageContext';
import { useRepositoryRealtimeSubscription } from '@/hooks/use-web-socket';
import {
  useDeleteNotificationMutation,
  useMarkAllNotificationReadMutation,
  useMarkNotificationReadMutation,
  useNotificationPreferencesQuery,
  useNotificationsQuery,
  useUnreadNotificationCountQuery,
  useUpdateNotificationPreferencesMutation,
} from '@/hooks/queries/use-notification-queries';
import { useRepositoryListQuery } from '@/hooks/queries/use-repository-queries';
import type { NotificationChannel } from '@/services/notification.service';

type NotificationTab = 'all' | 'unread';

function NotificationSkeletonList() {
  return (
    <div className="rounded-lg border border-border bg-card p-8">
      <div className="flex items-center justify-center">
        <Spinner className="h-6 w-6 text-primary" />
      </div>
    </div>
  );
}

function ChannelBadge({ channel }: { channel: NotificationChannel | string }) {
  if (channel === 'EMAIL') {
    return <span className="badge-info">EMAIL</span>;
  }

  if (channel === 'DINGTALK') {
    return <span className="badge-warning">DINGTALK</span>;
  }

  if (channel === 'FEISHU') {
    return <span className="badge-success">FEISHU</span>;
  }

  if (channel === 'WEBHOOK') {
    return <span className="badge-destructive">WEBHOOK</span>;
  }

  return (
    <Badge variant="secondary" className="rounded-full">
      IN_APP
    </Badge>
  );
}

export function Notifications() {
  const { t, language } = useLanguage();
  const [activeTab, setActiveTab] = useState<NotificationTab>('all');
  const [emailDraft, setEmailDraft] = useState('');
  const [webhookDraft, setWebhookDraft] = useState('');

  const notificationsQuery = useNotificationsQuery();
  const repositoriesQuery = useRepositoryListQuery();
  const unreadCountQuery = useUnreadNotificationCountQuery();
  const preferencesQuery = useNotificationPreferencesQuery();

  const monitoredRepositoryIds = useMemo(
    () => (repositoriesQuery.data ?? []).map((repository) => repository.id),
    [repositoriesQuery.data],
  );

  useRepositoryRealtimeSubscription(monitoredRepositoryIds);

  const markReadMutation = useMarkNotificationReadMutation();
  const markAllReadMutation = useMarkAllNotificationReadMutation();
  const deleteMutation = useDeleteNotificationMutation();
  const updatePrefsMutation = useUpdateNotificationPreferencesMutation();

  const notifications = notificationsQuery.data?.notifications ?? [];
  const visibleNotifications =
    activeTab === 'unread'
      ? notifications.filter((item) => !item.readAt)
      : notifications;
  const total = notificationsQuery.data?.total ?? 0;
  const unreadCount = unreadCountQuery.data?.count ?? 0;
  const prefs = preferencesQuery.data;

  useEffect(() => {
    setEmailDraft(prefs?.email ?? '');
    setWebhookDraft(prefs?.webhookUrl ?? '');
  }, [prefs?.email, prefs?.webhookUrl]);

  const locale = language === 'zh' ? zhCN : enUS;

  const isBusy =
    markReadMutation.isPending ||
    markAllReadMutation.isPending ||
    deleteMutation.isPending ||
    updatePrefsMutation.isPending;

  const channelOptions = useMemo(
    () => [
      {
        key: 'EMAIL' as const,
        label: t('notifications.channels.email'),
        icon: Mail,
      },
      {
        key: 'DINGTALK' as const,
        label: t('notifications.channels.dingtalk'),
        icon: MessageSquare,
      },
      {
        key: 'FEISHU' as const,
        label: t('notifications.channels.feishu'),
        icon: MessageSquare,
      },
      {
        key: 'WEBHOOK' as const,
        label: t('notifications.channels.webhook'),
        icon: Webhook,
      },
      {
        key: 'IN_APP' as const,
        label: t('notifications.channels.inApp'),
        icon: Bell,
      },
    ],
    [t],
  );

  const toggleChannel = async (channel: NotificationChannel) => {
    if (!prefs) {
      return;
    }

    const exists = prefs.channels.includes(channel);
    const channels = exists
      ? prefs.channels.filter((item) => item !== channel)
      : [...prefs.channels, channel];

    await updatePrefsMutation.mutateAsync({
      ...prefs,
      channels,
    });
  };

  const toggleEvent = async (eventKey: keyof NonNullable<typeof prefs>['events']) => {
    if (!prefs) {
      return;
    }

    await updatePrefsMutation.mutateAsync({
      ...prefs,
      events: {
        ...prefs.events,
        [eventKey]: !prefs.events[eventKey],
      },
    });
  };

  const saveContactSettings = async () => {
    if (!prefs) {
      return;
    }

    const normalizedEmail = emailDraft.trim();
    const normalizedWebhookUrl = webhookDraft.trim();

    await updatePrefsMutation.mutateAsync({
      ...prefs,
      email: normalizedEmail || null,
      webhookUrl: normalizedWebhookUrl || null,
    });
  };

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <section className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            {t('notifications.page.title')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t('notifications.page.description')}
          </p>
        </section>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-foreground">
              {t('notifications.list.title')}
            </CardTitle>
            <CardDescription>{t('notifications.list.description')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <Tabs
                value={activeTab}
                onValueChange={(value) => setActiveTab(value as NotificationTab)}
              >
                <TabsList>
                  <TabsTrigger value="all" className="gap-2">
                    {t('notifications.tabs.all')}
                    <Badge variant="secondary" className="rounded-full text-xs">
                      {total}
                    </Badge>
                  </TabsTrigger>
                  <TabsTrigger value="unread" className="gap-2">
                    {t('notifications.tabs.unread')}
                    <Badge variant="secondary" className="rounded-full text-xs">
                      {unreadCount}
                    </Badge>
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              <Button
                variant="outline"
                className="gap-2"
                onClick={() => markAllReadMutation.mutateAsync(undefined)}
                disabled={isBusy || unreadCount === 0}
              >
                <Check className="h-4 w-4" />
                {t('notifications.actions.markAllRead')}
              </Button>
            </div>

            {notificationsQuery.isLoading ? (
              <NotificationSkeletonList />
            ) : notificationsQuery.isError ? (
              <Card>
                <CardContent className="flex items-center justify-between gap-4 p-4">
                  <p className="text-sm text-destructive">
                    {t('notifications.error.loadFailed')}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => notificationsQuery.refetch()}
                  >
                    {t('notifications.error.retry')}
                  </Button>
                </CardContent>
              </Card>
            ) : visibleNotifications.length === 0 ? (
              <Card>
                <CardContent className="space-y-2 p-6 text-center">
                  <p className="text-base font-medium text-foreground">
                    {t('notifications.empty.title')}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {t('notifications.empty.description')}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {visibleNotifications.map((item) => {
                  const isRead = Boolean(item.readAt);
                  const isMarking =
                    markReadMutation.isPending &&
                    markReadMutation.variables === item.id;
                  const isDeleting =
                    deleteMutation.isPending &&
                    deleteMutation.variables === item.id;

                  return (
                    <Card key={item.id}>
                      <CardContent className="space-y-3 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              {!isRead ? (
                                <span className="badge-warning">
                                  {t('notifications.badges.unread')}
                                </span>
                              ) : null}
                              <ChannelBadge channel={item.channel} />
                            </div>
                            <p className="text-base font-medium text-foreground">
                              {item.title}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {item.content}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(item.createdAt), {
                                addSuffix: true,
                                locale,
                              })}
                            </p>
                          </div>

                          <div className="flex items-center gap-2">
                            {!isRead ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => markReadMutation.mutateAsync(item.id)}
                                    disabled={isMarking || isBusy}
                                  >
                                    {isMarking ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <Check className="h-4 w-4" />
                                    )}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  {t('notifications.actions.markRead')}
                                </TooltipContent>
                              </Tooltip>
                            ) : null}

                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => deleteMutation.mutateAsync(item.id)}
                                  disabled={isDeleting || isBusy}
                                >
                                  {isDeleting ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Trash2 className="h-4 w-4" />
                                  )}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                {t('notifications.actions.delete')}
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <Settings className="h-4 w-4 text-primary" />
              {t('notifications.settings.title')}
            </CardTitle>
            <CardDescription>
              {t('notifications.settings.description')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <section className="space-y-3">
              <p className="text-sm font-medium text-foreground">
                {t('notifications.settings.channels')}
              </p>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {channelOptions.map((option) => {
                  const enabled = prefs?.channels.includes(option.key) ?? false;
                  const Icon = option.icon;

                  return (
                    <div
                      key={option.key}
                      className="flex items-center justify-between rounded-lg border border-border bg-card p-3"
                    >
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm text-foreground">
                          {option.label}
                        </span>
                      </div>
                      <Switch
                        checked={enabled}
                        onCheckedChange={() => toggleChannel(option.key)}
                        disabled={updatePrefsMutation.isPending}
                      />
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="space-y-3">
              <p className="text-sm font-medium text-foreground">
                {t('notifications.settings.events')}
              </p>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="flex items-center justify-between rounded-lg border border-border bg-card p-3">
                  <Label htmlFor="notify-high-risk" className="text-sm text-foreground">
                    {t('notifications.settings.event.highRisk')}
                  </Label>
                  <Switch
                    id="notify-high-risk"
                    checked={prefs?.events.highRisk ?? false}
                    onCheckedChange={() => toggleEvent('highRisk')}
                    disabled={updatePrefsMutation.isPending}
                  />
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border bg-card p-3">
                  <Label htmlFor="notify-pr-updates" className="text-sm text-foreground">
                    {t('notifications.settings.event.prUpdates')}
                  </Label>
                  <Switch
                    id="notify-pr-updates"
                    checked={prefs?.events.prUpdates ?? false}
                    onCheckedChange={() => toggleEvent('prUpdates')}
                    disabled={updatePrefsMutation.isPending}
                  />
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border bg-card p-3">
                  <Label htmlFor="notify-analysis-complete" className="text-sm text-foreground">
                    {t('notifications.settings.event.analysisComplete')}
                  </Label>
                  <Switch
                    id="notify-analysis-complete"
                    checked={prefs?.events.analysisComplete ?? false}
                    onCheckedChange={() => toggleEvent('analysisComplete')}
                    disabled={updatePrefsMutation.isPending}
                  />
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border bg-card p-3">
                  <Label htmlFor="notify-weekly-report" className="text-sm text-foreground">
                    {t('notifications.settings.event.weeklyReport')}
                  </Label>
                  <Switch
                    id="notify-weekly-report"
                    checked={prefs?.events.weeklyReport ?? false}
                    onCheckedChange={() => toggleEvent('weeklyReport')}
                    disabled={updatePrefsMutation.isPending}
                  />
                </div>
              </div>
            </section>

            <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="notify-email">
                  {t('notifications.settings.email')}
                </Label>
                <Input
                  id="notify-email"
                  value={emailDraft}
                  onChange={(event) => setEmailDraft(event.target.value)}
                  placeholder={t('notifications.settings.emailPlaceholder')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="notify-webhook">
                  {t('notifications.settings.webhook')}
                </Label>
                <Input
                  id="notify-webhook"
                  value={webhookDraft}
                  onChange={(event) => setWebhookDraft(event.target.value)}
                  placeholder={t('notifications.settings.webhookPlaceholder')}
                />
              </div>
            </section>

            <div className="flex justify-end">
              <Button
                onClick={saveContactSettings}
                disabled={!prefs || updatePrefsMutation.isPending}
              >
                {updatePrefsMutation.isPending ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t('notifications.settings.saving')}
                  </span>
                ) : (
                  t('notifications.settings.save')
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}
