import { useMemo, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { enUS, zhCN } from 'date-fns/locale';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Check,
  Loader2,
  Trash2,
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
import { Spinner } from '@/components/ui/spinner';
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
  useNotificationsQuery,
  useUnreadNotificationCountQuery,
} from '@/hooks/queries/use-notification-queries';
import { useRepositoryListQuery } from '@/hooks/queries/use-repository-queries';

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

  const notificationsQuery = useNotificationsQuery();
  const repositoriesQuery = useRepositoryListQuery();
  const unreadCountQuery = useUnreadNotificationCountQuery();

  const monitoredRepositoryIds = useMemo(
    () => (repositoriesQuery.data ?? []).map((repository) => repository.id),
    [repositoriesQuery.data],
  );

  useRepositoryRealtimeSubscription(monitoredRepositoryIds);

  const markReadMutation = useMarkNotificationReadMutation();
  const markAllReadMutation = useMarkAllNotificationReadMutation();
  const deleteMutation = useDeleteNotificationMutation();

  const notifications = notificationsQuery.data?.notifications ?? [];
  const visibleNotifications =
    activeTab === 'unread'
      ? notifications.filter((item) => !item.readAt)
      : notifications;
  const total = notificationsQuery.data?.total ?? 0;
  const unreadCount = unreadCountQuery.data?.count ?? 0;

  const locale = language === 'zh' ? zhCN : enUS;

  const isBusy =
    markReadMutation.isPending ||
    markAllReadMutation.isPending ||
    deleteMutation.isPending;

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
                            <div className="prose prose-sm prose-invert max-w-none text-muted-foreground">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {item.content}
                              </ReactMarkdown>
                            </div>
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

      </div>
    </TooltipProvider>
  );
}
