import { useNavigate } from 'react-router-dom';
import { BarChart3, FileText, MessageSquare, Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useLanguage } from '@/contexts/LanguageContext';
import { useRepositoryListQuery } from '@/hooks/queries/use-repository-queries';
import { useUnreadNotificationCountQuery } from '@/hooks/queries/use-notification-queries';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

interface MiddlePanelProps {
  section: string;
  className?: string;
}

export function MiddlePanel({ section, className }: MiddlePanelProps) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const reposQuery = useRepositoryListQuery();
  const unreadCountQuery = useUnreadNotificationCountQuery();
  const repositories = reposQuery.data ?? [];
  const unreadCount = unreadCountQuery.data?.count ?? 0;

  const renderContent = () => {
    switch (section) {
      case 'chats':
        return (
          <>
            <div className="flex items-center justify-between px-4 py-3">
              <h2 className="font-semibold text-sm">{t('app.nav.chats')}</h2>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <Separator />
            <ScrollArea className="flex-1">
              {reposQuery.isLoading ? (
                <div className="p-4 text-sm text-muted-foreground">Loading...</div>
              ) : repositories.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground">
                  No repositories connected.
                </div>
              ) : (
                <div className="space-y-0.5 p-2">
                  {repositories.map((repo) => (
                    <button
                      key={repo.id}
                      className={cn(
                        'w-full flex items-center gap-2 px-3 py-2 rounded-md text-left text-sm transition-colors hover:bg-secondary',
                        location.pathname === `/chats/${repo.id}` && 'bg-primary/10 text-primary',
                      )}
                      onClick={() => navigate(`/chats/${repo.id}`)}
                    >
                      <Avatar className="h-6 w-6 shrink-0">
                        <AvatarImage src={repo.avatarUrl ?? undefined} />
                        <AvatarFallback className="text-xs">
                          {repo.name.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="truncate flex-1">{repo.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </>
        );

      case 'feed':
        return (
          <>
            <div className="px-4 py-3">
              <h2 className="font-semibold text-sm">{t('app.nav.feed')}</h2>
            </div>
            <Separator />
            <ScrollArea className="flex-1">
              <div className="p-4 text-sm text-muted-foreground">
                {t('app.feed.empty')}
              </div>
            </ScrollArea>
          </>
        );

      case 'discover':
        return (
          <>
            <div className="px-4 py-3">
              <h2 className="font-semibold text-sm">{t('app.nav.discover')}</h2>
            </div>
            <Separator />
            <div className="p-3">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder={t('app.search.placeholder')}
                  className="pl-8 h-8 text-sm"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const target = e.target as HTMLInputElement;
                      navigate(`/discover?keyword=${encodeURIComponent(target.value)}`);
                    }
                  }}
                />
              </div>
            </div>
            <Separator />
            <ScrollArea className="flex-1">
              <div className="p-4 text-sm text-muted-foreground">
                Search for repositories to follow.
              </div>
            </ScrollArea>
          </>
        );

      case 'inbox':
        return (
          <>
            <div className="flex items-center justify-between px-4 py-3">
              <h2 className="font-semibold text-sm">{t('app.nav.inbox')}</h2>
              {unreadCount > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                  {unreadCount}
                </span>
              )}
            </div>
            <Separator />
            <ScrollArea className="flex-1">
              <div className="space-y-0.5 p-2">
                <button
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2 rounded-md text-left text-sm transition-colors hover:bg-secondary',
                    location.pathname.startsWith('/inbox/approvals') && 'bg-primary/10 text-primary',
                  )}
                  onClick={() => navigate('/inbox/approvals')}
                >
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                  <span>{t('app.nav.approvals')}</span>
                </button>
                <button
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2 rounded-md text-left text-sm transition-colors hover:bg-secondary',
                    location.pathname.startsWith('/inbox/notifications') && 'bg-primary/10 text-primary',
                  )}
                  onClick={() => navigate('/inbox/notifications')}
                >
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  <span>{t('app.nav.notifications')}</span>
                </button>
              </div>
            </ScrollArea>
          </>
        );

      case 'reports':
        return (
          <>
            <div className="px-4 py-3">
              <h2 className="font-semibold text-sm">{t('app.nav.reports')}</h2>
            </div>
            <Separator />
            <ScrollArea className="flex-1">
              <div className="space-y-0.5 p-2">
                {[
                  { id: 'weekly', labelKey: 'reports.title.weekly' },
                  { id: 'security', labelKey: 'reports.title.security' },
                  { id: 'team', labelKey: 'reports.title.team' },
                ].map((r) => (
                  <button
                    key={r.id}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-left text-sm transition-colors hover:bg-secondary"
                    onClick={() => navigate(`/reports?type=${r.id}`)}
                  >
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span>{t(r.labelKey)}</span>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </>
        );

      case 'settings':
        return (
          <>
            <div className="px-4 py-3">
              <h2 className="font-semibold text-sm">{t('app.nav.settings')}</h2>
            </div>
            <Separator />
            <ScrollArea className="flex-1">
              <div className="space-y-0.5 p-2">
                {[
                  { id: 'profile', labelKey: 'settings.tabs.profile' },
                  { id: 'notifications', labelKey: 'settings.tabs.notifications' },
                  { id: 'integrations', labelKey: 'settings.tabs.integrations' },
                  { id: 'security', labelKey: 'settings.tabs.security' },
                  { id: 'ai', labelKey: 'settings.tabs.ai' },
                ].map((s) => (
                  <button
                    key={s.id}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-left text-sm transition-colors hover:bg-secondary"
                    onClick={() => navigate(`/settings?tab=${s.id}`)}
                  >
                    <span>{t(s.labelKey)}</span>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </>
        );

      default:
        return null;
    }
  };

  return (
    <div className={cn('flex flex-col h-full bg-card', className)}>
      {renderContent()}
    </div>
  );
}
