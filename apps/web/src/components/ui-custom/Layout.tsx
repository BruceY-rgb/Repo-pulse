import { useMemo, useState, type ElementType, type FormEvent } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  BookOpen,
  Bell,
  Brain,
  CheckSquare,
  FileText,
  Github,
  GitBranch,
  LayoutDashboard,
  Languages,
  LogOut,
  Menu,
  MessageCircle,
  Search,
  Settings,
  X,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Spinner } from '@/components/ui/spinner';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  useCurrentUserQuery,
  useLogoutMutation,
} from '@/hooks/queries/use-auth-queries';
import { useLanguage } from '@/contexts/LanguageContext';
import { useUnreadNotificationCountQuery } from '@/hooks/queries/use-notification-queries';
import { useRepositoryListQuery } from '@/hooks/queries/use-repository-queries';
import { useRepositoryRealtimeSubscription } from '@/hooks/use-web-socket';

interface NavItem {
  path: string;
  labelKey: string;
  icon: ElementType;
  badgeCount?: number;
}

export function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { t, language, setLanguage } = useLanguage();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');
  const { data: user, isLoading: isUserLoading } = useCurrentUserQuery();
  const logoutMutation = useLogoutMutation();
  const repositoriesQuery = useRepositoryListQuery();
  const unreadNotificationCountQuery = useUnreadNotificationCountQuery();
  const repositoryIds = useMemo(
    () => (repositoriesQuery.data ?? []).map((repository) => repository.id),
    [repositoriesQuery.data],
  );
  const unreadNotificationCount = unreadNotificationCountQuery.data?.count ?? 0;

  useRepositoryRealtimeSubscription(repositoryIds);

  const navItems = useMemo<NavItem[]>(
    () => [
      { path: '/dashboard', labelKey: 'app.nav.dashboard', icon: LayoutDashboard },
      { path: '/repositories', labelKey: 'app.nav.repositories', icon: GitBranch },
      { path: '/analysis', labelKey: 'app.nav.analysis', icon: Brain },
      { path: '/approvals', labelKey: 'app.nav.approvals', icon: CheckSquare },
      {
        path: '/notifications',
        labelKey: 'app.nav.notifications',
        icon: Bell,
        badgeCount: unreadNotificationCount,
      },
      { path: '/reports', labelKey: 'app.nav.reports', icon: FileText },
      { path: '/settings', labelKey: 'app.nav.settings', icon: Settings },
    ],
    [unreadNotificationCount],
  );

  const handleLogout = async () => {
    await logoutMutation.mutateAsync(undefined);
    navigate('/login', { replace: true });
  };

  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const keyword = searchKeyword.trim();
    if (!keyword) {
      navigate('/repositories');
      return;
    }
    navigate(`/repositories?keyword=${encodeURIComponent(keyword)}`);
  };

  const sidebarContent = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center border-b border-border px-4">
        <Link to="/landing" className="flex items-center gap-2">
          <img src="/avator.png" alt="Repo-Pulse" className="h-8 w-8 rounded-full" />
          <div className="space-y-0.5">
            <p className="text-sm font-semibold tracking-tight text-foreground">Repo-Pulse</p>
            <p className="text-xs text-muted-foreground">{t('app.layout.subtitle')}</p>
          </div>
        </Link>
      </div>

      <ScrollArea className="flex-1 px-3 py-4">
        <nav className="space-y-2">
          {navItems.map((item) => {
            const isActive = location.pathname.startsWith(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  'hover-x flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 ease-out',
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-white/5 hover:text-foreground',
                )}
              >
                <item.icon className="h-4 w-4" />
                <span className="flex-1">{t(item.labelKey)}</span>
                {typeof item.badgeCount === 'number' ? (
                  <Badge variant="secondary" className="rounded-full text-xs">
                    {item.badgeCount}
                  </Badge>
                ) : null}
              </Link>
            );
          })}
        </nav>
      </ScrollArea>

      <Separator />

      <div className="space-y-3 p-4">
        {isUserLoading ? (
          <div className="flex items-center justify-center rounded-lg border border-border bg-card p-4">
            <Spinner className="h-5 w-5 text-primary" />
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
            <Avatar className="h-9 w-9 rounded-full">
              <AvatarImage src={user?.avatar ?? undefined} alt={user?.name ?? 'user'} />
              <AvatarFallback className="bg-primary/15 text-primary">
                {user?.name?.slice(0, 1).toUpperCase() ?? 'U'}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{user?.name ?? t('app.user.unknown')}</p>
              <p className="truncate text-xs text-muted-foreground">{user?.email ?? t('app.user.noEmail')}</p>
            </div>
          </div>
        )}

        <Button
          variant="outline"
          className="w-full justify-start gap-2"
          onClick={handleLogout}
          disabled={logoutMutation.isPending}
        >
          <LogOut className="h-4 w-4" />
          {t('auth.actions.logout')}
        </Button>
      </div>
    </div>
  );

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background text-foreground">
        <aside
          className={cn(
            'fixed left-0 top-0 hidden h-screen overflow-hidden bg-card transition-all duration-200 md:block',
            isSidebarCollapsed ? 'w-0 border-r-0' : 'w-[264px] border-r border-border',
          )}
        >
          {!isSidebarCollapsed ? sidebarContent : null}
        </aside>

        <div
          className={cn(
            'min-h-screen transition-[padding] duration-200',
            isSidebarCollapsed ? 'md:pl-0' : 'md:pl-[264px]',
          )}
        >
          <header className="sticky top-0 z-40 h-16 border-b border-border bg-background/95 backdrop-blur">
            <div className="flex h-full items-center gap-4 px-4 md:px-6">
              <div className="flex items-center gap-3">
                <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <SheetTrigger asChild>
                        <Button variant="ghost" size="icon" className="md:hidden">
                          <Menu className="h-5 w-5" />
                        </Button>
                      </SheetTrigger>
                    </TooltipTrigger>
                    <TooltipContent>{t('app.layout.menu')}</TooltipContent>
                  </Tooltip>
                  <SheetContent side="left" className="w-[264px] bg-card p-0">
                    <SheetHeader className="sr-only">
                      <SheetTitle>{t('app.layout.menu')}</SheetTitle>
                      <SheetDescription>{t('app.layout.subtitle')}</SheetDescription>
                    </SheetHeader>
                    {sidebarContent}
                  </SheetContent>
                </Sheet>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="hidden md:inline-flex"
                  onClick={() => setIsSidebarCollapsed((prev) => !prev)}
                  aria-label={t('app.layout.menu')}
                >
                  {isSidebarCollapsed ? <Menu className="h-5 w-5" /> : <X className="h-5 w-5" />}
                </Button>

              </div>

              <div className="flex min-w-0 flex-1 justify-center px-2">
                <form onSubmit={handleSearchSubmit} className="relative w-full max-w-md">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={searchKeyword}
                    onChange={(event) => setSearchKeyword(event.target.value)}
                    placeholder={t('app.search.placeholder')}
                    className="pl-9"
                    aria-label={t('app.search.placeholder')}
                  />
                </form>
              </div>

              <div className="flex items-center gap-1">
                <DropdownMenu>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="hover-x" aria-label={t('app.language.switch')}>
                          <Languages className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                    </TooltipTrigger>
                    <TooltipContent>{t('app.language.switch')}</TooltipContent>
                  </Tooltip>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setLanguage('en')}>
                      <span className={language === 'en' ? 'font-semibold text-foreground' : 'text-muted-foreground'}>
                        {t('app.language.english')}
                      </span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setLanguage('zh')}>
                      <span className={language === 'zh' ? 'font-semibold text-foreground' : 'text-muted-foreground'}>
                        {t('app.language.chinese')}
                      </span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="hover-x" aria-label={t('app.layout.notifications')}>
                      <Bell className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t('app.layout.notifications')}</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="hover-x" asChild>
                      <a
                        href="https://github.com/BruceY-rgb/Repo-pulse"
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={t('app.layout.github')}
                      >
                        <Github className="h-4 w-4" />
                      </a>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t('app.layout.github')}</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="hover-x" asChild>
                      <a
                        href="https://brucey-rgb.github.io/Repo-pulse-docs/"
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={t('app.layout.docs')}
                      >
                        <BookOpen className="h-4 w-4" />
                      </a>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t('app.layout.docs')}</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="hover-x" aria-label={t('app.layout.support')}>
                      <MessageCircle className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t('app.layout.support')}</TooltipContent>
                </Tooltip>
              </div>
            </div>
          </header>

          <main className="p-6 md:p-8">
            <div className="space-y-6">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}
