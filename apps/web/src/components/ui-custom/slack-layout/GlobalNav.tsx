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
  const [collapsed, setCollapsed] = useState(false);
  const { data: user, isLoading: isUserLoading } = useCurrentUserQuery();
  const logoutMutation = useLogoutMutation();

  const activeSection = NAV_ENTRIES.find((entry) =>
    location.pathname.startsWith(entry.path),
  )?.id;

  const handleLogout = async () => {
    await logoutMutation.mutateAsync();
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
        'flex flex-col items-center h-screen border-r border-border bg-card transition-all duration-200 shrink-0',
        collapsed ? 'w-0 border-r-0 overflow-hidden' : 'w-14',
      )}
    >
      {/* Collapse toggle */}
      <div
        className={cn(
          'flex justify-center w-full pt-2',
          collapsed && 'absolute -right-8 top-2 z-10',
        )}
      >
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
      </div>

      {!collapsed && (
        <>
          {/* Logo */}
          <div className="flex justify-center pt-3 pb-4">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-primary-foreground text-xs font-bold">RP</span>
            </div>
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
                    <AvatarImage src={user?.avatarUrl ?? undefined} />
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
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </>
      )}
    </aside>
  );
}
