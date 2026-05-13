import { useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  FileText,
  Lock,
  MessageSquare,
  Plus,
  Search,
  Users,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';
import { useLanguage } from '@/contexts/LanguageContext';
import { useRepositoryListQuery } from '@/hooks/queries/use-repository-queries';
import { useUnreadNotificationCountQuery } from '@/hooks/queries/use-notification-queries';
import { cn } from '@/lib/utils';
import type { Repository } from '@/types/api';

interface MiddlePanelProps {
  section: string;
  className?: string;
}

function avatarUrlForRepo(repo: Repository): string {
  const owner = repo.fullName.split('/')[0];
  if (!owner) return '';
  return `https://github.com/${owner}.png`;
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

const GRADIENT_PAIRS: [string, string][] = [
  ['#3b1d5c', '#5c2d91'],
  ['#1a3a5c', '#2d6ba0'],
  ['#3b5c1d', '#5c912d'],
  ['#5c1a1a', '#a02d2d'],
  ['#1a5c4b', '#2d9178'],
  ['#5c4b1a', '#91782d'],
  ['#2d1a5c', '#4b2d91'],
  ['#1a5c5c', '#2d9191'],
];

function repoGradient(fullName: string): string {
  const idx = hashString(fullName) % GRADIENT_PAIRS.length;
  const [from, to] = GRADIENT_PAIRS[idx];
  return `linear-gradient(135deg, ${from}, ${to})`;
}

function formatRelativeTime(dateString?: string | null): string {
  if (!dateString) return '';
  const now = Date.now();
  const date = new Date(dateString).getTime();
  const diff = now - date;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w`;
}

function ConversationItem({
  repo,
  isActive,
  onClick,
}: {
  repo: Repository;
  isActive: boolean;
  onClick: () => void;
}) {
  const gradient = repoGradient(repo.fullName);
  const owner = repo.fullName.split('/')[0];
  const isPrivate = repo.fullName.split('/').length <= 2 && owner.length < 10;
  const eventCount = repo._count?.events ?? 0;

  return (
    <button
      className={cn(
        'w-full flex items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-secondary',
        isActive && 'bg-primary/5 border-l-2 border-l-primary',
      )}
      onClick={onClick}
    >
      {/* Avatar with fallback gradient */}
      <Avatar className="h-10 w-10 shrink-0 rounded-lg">
        <AvatarImage src={avatarUrlForRepo(repo)} className="object-cover" />
        <AvatarFallback
          className="rounded-lg text-white text-sm font-semibold"
          style={{ background: gradient }}
        >
          {repo.name.charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium text-foreground truncate">
            {repo.name}
          </span>
          {isPrivate ? (
            <Lock className="h-3 w-3 text-muted-foreground shrink-0" />
          ) : (
            <Users className="h-3 w-3 text-muted-foreground shrink-0" />
          )}
          <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
            {isPrivate ? 'Private' : 'Channel'}
          </span>
        </div>
        <p className="text-xs text-muted-foreground truncate mt-0.5">
          {eventCount > 0
            ? `${eventCount} events`
            : repo.lastSyncAt
              ? `Last sync ${formatRelativeTime(repo.lastSyncAt)}`
              : 'No events yet'}
        </p>
      </div>

      {/* Meta */}
      <div className="flex flex-col items-end gap-1 shrink-0">
        {repo.lastSyncAt && (
          <span className="text-[10px] text-muted-foreground">
            {formatRelativeTime(repo.lastSyncAt)}
          </span>
        )}
        {/* Risk indicator: show a dot if there are events */}
        {eventCount > 0 && (
          <span className="h-2 w-2 rounded-full bg-warning" />
        )}
      </div>
    </button>
  );
}

export function MiddlePanel({ section, className }: MiddlePanelProps) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const reposQuery = useRepositoryListQuery();
  const unreadCountQuery = useUnreadNotificationCountQuery();
  const repositories = reposQuery.data ?? [];
  const unreadCount = unreadCountQuery.data?.count ?? 0;

  const renderContent = () => {
    switch (section) {
      case 'chats':
        return (
          <>
            <div className="flex items-center justify-between px-4 py-3 shrink-0">
              <h2 className="font-semibold text-sm">{t('app.nav.chats')}</h2>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <Separator />
            <ScrollArea className="flex-1">
              {reposQuery.isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Spinner className="h-5 w-5" />
                </div>
              ) : repositories.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground text-center">
                  No repositories connected
                </div>
              ) : (
                <div className="py-1">
                  {repositories.map((repo) => (
                    <ConversationItem
                      key={repo.id}
                      repo={repo}
                      isActive={
                        location.pathname === `/chats/${repo.id}` ||
                        (location.pathname === '/chats' && false)
                      }
                      onClick={() => navigate(`/chats/${repo.id}`)}
                    />
                  ))}
                </div>
              )}
            </ScrollArea>
          </>
        );

      case 'feed':
        return (
          <>
            <div className="px-4 py-3 shrink-0">
              <h2 className="font-semibold text-sm">{t('app.nav.feed')}</h2>
            </div>
            <Separator />
            <ScrollArea className="flex-1">
              <div className="p-4 text-sm text-muted-foreground text-center">
                {t('app.feed.empty')}
              </div>
            </ScrollArea>
          </>
        );

      case 'discover':
        return (
          <>
            <div className="px-4 py-3 shrink-0">
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
              <div className="p-4 text-sm text-muted-foreground text-center">
                Search for repositories to follow.
              </div>
            </ScrollArea>
          </>
        );

      case 'inbox':
        return (
          <>
            <div className="flex items-center justify-between px-4 py-3 shrink-0">
              <h2 className="font-semibold text-sm">{t('app.nav.inbox')}</h2>
              {unreadCount > 0 && (
                <Badge variant="default" className="text-[10px] px-1.5 py-0">
                  {unreadCount}
                </Badge>
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
            <div className="px-4 py-3 shrink-0">
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
            <div className="px-4 py-3 shrink-0">
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
