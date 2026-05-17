import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ElementType,
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  BookOpen,
  Bell,
  Brain,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
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
import { approvalService } from '@/services/approval.service';
import { useRepositoryRealtimeSubscription } from '@/hooks/use-web-socket';
import { isDesktopRuntime } from '@/lib/desktop';

interface NavItem {
  path: string;
  labelKey: string;
  icon: ElementType;
  badgeCount?: number;
}

const COLLAPSED_SIDEBAR_WIDTH = 72;
const DEFAULT_SIDEBAR_WIDTH = 264;
const MIN_SIDEBAR_WIDTH = 220;
const MAX_SIDEBAR_WIDTH = 360;
const SIDEBAR_KEYBOARD_STEP = 12;

function clampSidebarWidth(width: number) {
  return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, width));
}

export function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { t, language, setLanguage } = useLanguage();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isSidebarResizing, setIsSidebarResizing] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
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
  const [pendingApprovalCount, setPendingApprovalCount] = useState(0);
  const isDesktop = isDesktopRuntime();
  const sidebarOffset = isSidebarCollapsed ? COLLAPSED_SIDEBAR_WIDTH : sidebarWidth;
  const sidebarLayoutStyle = {
    '--sidebar-offset': `${sidebarOffset}px`,
  } as CSSProperties;

  useEffect(function () {
    function refresh() {
      approvalService.getPendingCount().then(function (r) { setPendingApprovalCount(r?.count ?? 0); }).catch(function () {});
    }
    refresh();
    window.addEventListener('approval-updated', refresh);
    return function () { window.removeEventListener('approval-updated', refresh); };
  }, []);

  useRepositoryRealtimeSubscription(repositoryIds);

  useEffect(() => {
    if (!isSidebarResizing) {
      return;
    }

    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;

    function handlePointerMove(event: globalThis.PointerEvent) {
      setSidebarWidth(clampSidebarWidth(event.clientX));
    }

    function handlePointerUp() {
      setIsSidebarResizing(false);
    }

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [isSidebarResizing]);

  const navItems = useMemo<NavItem[]>(
    () => [
      { path: '/dashboard', labelKey: 'app.nav.dashboard', icon: LayoutDashboard },
      { path: '/repositories', labelKey: 'app.nav.repositories', icon: GitBranch },
      { path: '/analysis', labelKey: 'app.nav.analysis', icon: Brain },
      { path: '/approvals', labelKey: 'app.nav.approvals', icon: CheckSquare, badgeCount: pendingApprovalCount },
      {
        path: '/notifications',
        labelKey: 'app.nav.notifications',
        icon: Bell,
        badgeCount: unreadNotificationCount,
      },
      { path: '/reports', labelKey: 'app.nav.reports', icon: FileText },
      { path: '/settings', labelKey: 'app.nav.settings', icon: Settings },
    ],
    [unreadNotificationCount, pendingApprovalCount],
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

  const handleSidebarResizePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (isSidebarCollapsed) {
      return;
    }

    event.preventDefault();
    setIsSidebarResizing(true);
  };

  const handleSidebarResizeKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      setSidebarWidth((current) => clampSidebarWidth(current - SIDEBAR_KEYBOARD_STEP));
      return;
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      setSidebarWidth((current) => clampSidebarWidth(current + SIDEBAR_KEYBOARD_STEP));
      return;
    }

    if (event.key === 'Home') {
      event.preventDefault();
      setSidebarWidth(MIN_SIDEBAR_WIDTH);
      return;
    }

    if (event.key === 'End') {
      event.preventDefault();
      setSidebarWidth(MAX_SIDEBAR_WIDTH);
    }
  };

  const sidebarContent = (collapsed = false) => (
    <div className="flex h-full flex-col">
      <div
        className={cn(
          'desktop-drag flex items-center border-b border-border px-4',
          isDesktop ? 'h-24 items-end pb-4 pt-9' : 'h-16',
          collapsed ? 'justify-center px-0' : 'px-5',
        )}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              to="/dashboard"
              className={cn(
                'desktop-no-drag flex min-w-0 items-center gap-3',
                collapsed && 'justify-center',
              )}
              aria-label="Repo-Pulse"
            >
              <img src="/avator.png" alt="Repo-Pulse" className="h-10 w-10 shrink-0 rounded-xl" />
              {!collapsed ? (
                <div className="space-y-0.5">
                  <p className="truncate text-[15px] font-semibold tracking-tight text-foreground">Repo-Pulse</p>
                  <p className="truncate text-xs text-muted-foreground">{t('app.layout.subtitle')}</p>
                </div>
              ) : null}
            </Link>
          </TooltipTrigger>
          {collapsed ? <TooltipContent side="right">Repo-Pulse</TooltipContent> : null}
        </Tooltip>
      </div>

      <ScrollArea className={cn('flex-1 py-4', collapsed ? 'px-3' : 'px-3')}>
        <nav className="space-y-2">
          {navItems.map((item) => {
            const isActive = location.pathname.startsWith(item.path);
            const navLink = (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setMobileOpen(false)}
                aria-label={t(item.labelKey)}
                className={cn(
                  'hover-x relative flex items-center text-sm font-medium transition-all duration-200 ease-out',
                  collapsed
                    ? 'h-10 justify-center rounded-xl px-0'
                    : 'gap-2 rounded-lg px-3 py-2',
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-white/5 hover:text-foreground',
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {!collapsed ? <span className="flex-1">{t(item.labelKey)}</span> : null}
                {typeof item.badgeCount === 'number' ? (
                  collapsed ? (
                    <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary" />
                  ) : (
                    <Badge variant="secondary" className="rounded-full text-xs">
                      {item.badgeCount}
                    </Badge>
                  )
                ) : null}
              </Link>
            );

            return (
              collapsed ? (
                <Tooltip key={item.path}>
                  <TooltipTrigger asChild>{navLink}</TooltipTrigger>
                  <TooltipContent side="right">{t(item.labelKey)}</TooltipContent>
                </Tooltip>
              ) : (
                navLink
              )
            );
          })}
        </nav>
      </ScrollArea>

      <Separator />

      <div className={cn('space-y-3', collapsed ? 'p-3' : 'p-4')}>
        {isUserLoading ? (
          <div className="flex items-center justify-center rounded-lg border border-border bg-card p-4">
            <Spinner className="h-5 w-5 text-primary" />
          </div>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  'flex items-center rounded-lg border border-border bg-card',
                  collapsed ? 'justify-center p-2' : 'gap-3 p-3',
                )}
              >
                <Avatar className="h-9 w-9 rounded-full">
                  <AvatarImage src={user?.avatar ?? undefined} alt={user?.name ?? 'user'} />
                  <AvatarFallback className="bg-primary/15 text-primary">
                    {user?.name?.slice(0, 1).toUpperCase() ?? 'U'}
                  </AvatarFallback>
                </Avatar>
                {!collapsed ? (
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{user?.name ?? t('app.user.unknown')}</p>
                    <p className="truncate text-xs text-muted-foreground">{user?.email ?? t('app.user.noEmail')}</p>
                  </div>
                ) : null}
              </div>
            </TooltipTrigger>
            {collapsed ? <TooltipContent side="right">{user?.name ?? t('app.user.unknown')}</TooltipContent> : null}
          </Tooltip>
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size={collapsed ? 'icon' : 'default'}
              className={cn('w-full gap-2', collapsed ? 'justify-center' : 'justify-start')}
              onClick={handleLogout}
              disabled={logoutMutation.isPending}
              aria-label={t('auth.actions.logout')}
            >
              <LogOut className="h-4 w-4" />
              {!collapsed ? t('auth.actions.logout') : null}
            </Button>
          </TooltipTrigger>
          {collapsed ? <TooltipContent side="right">{t('auth.actions.logout')}</TooltipContent> : null}
        </Tooltip>
      </div>
    </div>
  );

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background text-foreground">
        <aside
          style={{ width: sidebarOffset }}
          className={cn(
            'fixed left-0 top-0 hidden h-screen overflow-visible border-r border-border bg-card md:block',
            !isSidebarResizing && 'transition-[width] duration-200',
          )}
        >
          <div className="h-full overflow-hidden">
            {sidebarContent(isSidebarCollapsed)}
          </div>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="desktop-no-drag absolute right-[-15px] top-1/2 z-50 h-7 w-7 -translate-y-1/2 rounded-full border-border bg-card text-muted-foreground shadow-sm hover:bg-secondary hover:text-foreground"
                onClick={() => setIsSidebarCollapsed((prev) => !prev)}
                aria-label={t('app.layout.menu')}
              >
                {isSidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">{isSidebarCollapsed ? t('app.layout.menu') : t('app.layout.menu')}</TooltipContent>
          </Tooltip>

          {!isSidebarCollapsed ? (
            <div
              className="desktop-no-drag group absolute bottom-0 right-[-5px] top-0 z-40 w-2 cursor-col-resize outline-none"
              role="separator"
              tabIndex={0}
              aria-orientation="vertical"
              aria-valuemin={MIN_SIDEBAR_WIDTH}
              aria-valuemax={MAX_SIDEBAR_WIDTH}
              aria-valuenow={sidebarWidth}
              onPointerDown={handleSidebarResizePointerDown}
              onDoubleClick={() => setSidebarWidth(DEFAULT_SIDEBAR_WIDTH)}
              onKeyDown={handleSidebarResizeKeyDown}
            >
              <span className="absolute right-[3px] top-0 h-full w-px bg-transparent transition-colors group-hover:bg-primary/50 group-focus-visible:bg-primary" />
            </div>
          ) : null}
        </aside>

        <div
          style={sidebarLayoutStyle}
          className={cn(
            'min-h-screen md:pl-[var(--sidebar-offset)]',
            !isSidebarResizing && 'transition-[padding] duration-200',
          )}
        >
          <header
            className={cn(
              'desktop-drag sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur',
              isDesktop ? 'h-24' : 'h-16',
            )}
          >
            <div
              className="flex h-full items-center gap-4 px-4 md:px-6"
            >
              <div className="desktop-no-drag flex items-center gap-3">
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
                    {sidebarContent(false)}
                  </SheetContent>
                </Sheet>
              </div>

              <div className="desktop-no-drag flex min-w-0 flex-1 justify-center px-2">
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

              <div className="desktop-no-drag flex items-center gap-1">
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
