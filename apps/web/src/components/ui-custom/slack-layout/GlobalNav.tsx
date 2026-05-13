import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  Inbox,
  LogOut,
  MessageSquare,
  Rss,
  Search,
  Settings,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import { useCurrentUserQuery, useLogoutMutation } from '@/hooks/queries/use-auth-queries';
import { useLanguage } from '@/contexts/LanguageContext';

interface NavEntry {
  id: string;
  path: string;
  labelKey: string;
  icon: typeof MessageSquare;
}

const NAV_ENTRIES: NavEntry[] = [
  { id: 'chats', path: '/chats', labelKey: 'app.nav.chats', icon: MessageSquare },
  { id: 'feed', path: '/feed', labelKey: 'app.nav.feed', icon: Rss },
  { id: 'discover', path: '/discover', labelKey: 'app.nav.discover', icon: Search },
  { id: 'inbox', path: '/inbox', labelKey: 'app.nav.inbox', icon: Inbox },
  { id: 'reports', path: '/reports', labelKey: 'app.nav.reports', icon: FileText },
  { id: 'settings', path: '/settings', labelKey: 'app.nav.settings', icon: Settings },
];

export function GlobalNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [collapsed, setCollapsed] = useState(true);
  const { data: user, isLoading: isUserLoading } = useCurrentUserQuery();
  const logoutMutation = useLogoutMutation();

  const activeSection = NAV_ENTRIES.find((entry) =>
    location.pathname.startsWith(entry.path),
  )?.id;

  const handleLogout = async () => {
    await logoutMutation.mutateAsync(undefined);
  };

  const userInitials = user
    ? user.name
      ? user.name.charAt(0).toUpperCase()
      : user.email
        ? user.email.charAt(0).toUpperCase()
        : 'U'
    : 'U';

  return (
    <aside
      className={cn(
        'flex h-dvh shrink-0 flex-col border-r border-border bg-card transition-[width] duration-200',
        collapsed ? 'w-14 items-center' : 'w-52',
      )}
      aria-label="Global navigation"
    >
      {/* Collapse toggle */}
      <div className={cn('flex w-full pt-2', collapsed ? 'justify-center' : 'justify-end px-3')}>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
      </div>

      {collapsed ? (
        <>
          {/* Logo */}
          <div className="flex justify-center pt-3 pb-4">
            <img
              src="/logo.png"
              alt="Repo Pulse"
              className="h-8 w-8 rounded-lg object-contain"
            />
          </div>

          {/* Navigation icons */}
          <nav className="flex-1 flex flex-col items-center gap-2 px-2">
            {NAV_ENTRIES.map((entry) => {
              const isActive = activeSection === entry.id;
              return (
                <Tooltip key={entry.id}>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={cn(
                        'h-9 w-9 rounded-lg transition-colors',
                        isActive && 'bg-primary/10 text-primary',
                      )}
                      onClick={() => navigate(entry.path)}
                    >
                      <entry.icon className="h-5 w-5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    {t(entry.labelKey)}
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </nav>

          {/* User avatar */}
          <div className="flex flex-col items-center gap-2 pb-4 px-2">
            {isUserLoading ? (
              <Spinner className="h-6 w-6" />
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Avatar className="h-8 w-8 cursor-pointer">
                    <AvatarImage src={user?.avatar ?? undefined} />
                    <AvatarFallback>{userInitials}</AvatarFallback>
                  </Avatar>
                </TooltipTrigger>
                <TooltipContent side="right">
                  {user?.name ?? user?.email ?? t('app.user.unknown')}
                </TooltipContent>
              </Tooltip>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              onClick={handleLogout}
              aria-label="Log out"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </>
      ) : (
        <>
          {/* Logo */}
          <div className="flex items-center gap-3 px-4 pt-3 pb-4">
            <img
              src="/logo.png"
              alt="Repo Pulse"
              className="h-8 w-8 shrink-0 rounded-lg object-contain"
            />
            <span className="truncate text-sm font-semibold text-foreground">Repo Pulse</span>
          </div>

          {/* Navigation items */}
          <nav className="flex-1 flex flex-col gap-1 px-3">
            {NAV_ENTRIES.map((entry) => {
              const isActive = activeSection === entry.id;
              return (
                <Button
                  key={entry.id}
                  variant="ghost"
                  className={cn(
                    'h-9 w-full justify-start gap-3 rounded-lg px-3 text-muted-foreground transition-colors',
                    isActive && 'bg-primary/10 text-primary',
                  )}
                  onClick={() => navigate(entry.path)}
                >
                  <entry.icon className="h-4 w-4 shrink-0" />
                  <span className="truncate text-sm">{t(entry.labelKey)}</span>
                </Button>
              );
            })}
          </nav>

          {/* User avatar */}
          <div className="flex items-center gap-3 px-4 pb-4">
            {isUserLoading ? (
              <Spinner className="h-6 w-6" />
            ) : (
              <Avatar className="h-8 w-8 shrink-0">
                <AvatarImage src={user?.avatar ?? undefined} />
                <AvatarFallback>{userInitials}</AvatarFallback>
              </Avatar>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {user?.name ?? t('app.user.unknown')}
              </p>
              {user?.email && (
                <p className="truncate text-xs text-muted-foreground">{user.email}</p>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
              onClick={handleLogout}
              aria-label="Log out"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </>
      )}
    </aside>
  );
}
