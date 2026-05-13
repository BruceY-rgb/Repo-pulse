import { useMemo, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  KBarProvider,
  KBarPortal,
  KBarPositioner,
  KBarAnimator,
  KBarSearch,
  KBarResults,
  useMatches,
  type Action,
} from 'kbar';
import {
  Bell,
  Brain,
  CheckSquare,
  FileText,
  GitBranch,
  Inbox,
  LayoutDashboard,
  MessageSquare,
  Rss,
  Search,
  Settings,
} from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { cn } from '@/lib/utils';

function RenderResults() {
  const { results } = useMatches();

  return (
    <KBarResults
      items={results}
      onRender={({ item, active }) => {
        if (typeof item === 'string') {
          return (
            <div className="px-3 py-2 text-xs font-medium text-muted-foreground">
              {item}
            </div>
          );
        }

        const action = item as Action;

        return (
          <div
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 cursor-pointer rounded-md text-sm transition-colors',
              active ? 'bg-primary/10 text-primary' : 'text-foreground',
            )}
          >
            {action.icon && (
              <span className="flex items-center justify-center h-5 w-5 shrink-0">
                {action.icon}
              </span>
            )}
            <div className="flex flex-col min-w-0">
              <span className="truncate">{action.name}</span>
              {action.subtitle && (
                <span className="text-xs text-muted-foreground truncate">
                  {action.subtitle}
                </span>
              )}
            </div>
            {action.shortcut?.length && (
              <div className="ml-auto flex items-center gap-1">
                {action.shortcut.map((key) => (
                  <kbd
                    key={key}
                    className="h-5 min-w-[20px] inline-flex items-center justify-center rounded border border-border bg-muted px-1.5 text-xs font-mono text-muted-foreground"
                  >
                    {key}
                  </kbd>
                ))}
              </div>
            )}
          </div>
        );
      }}
    />
  );
}

export function KBarSearchProvider({ children }: { children: ReactNode }) {
  const { t } = useLanguage();
  const navigate = useNavigate();

  const actions: Action[] = useMemo(
    () => [
      {
        id: 'chats',
        name: t('app.nav.chats'),
        subtitle: 'Repository event conversations',
        section: t('app.nav.chats'),
        icon: <MessageSquare className="h-4 w-4" />,
        shortcut: ['g', 'c'],
        keywords: 'chats conversations repositories',
        perform: () => navigate('/chats'),
      },
      {
        id: 'feed',
        name: t('app.nav.feed'),
        subtitle: 'Followed repository activity',
        section: t('app.nav.feed'),
        icon: <Rss className="h-4 w-4" />,
        shortcut: ['g', 'f'],
        keywords: 'feed activity stream timeline',
        perform: () => navigate('/feed'),
      },
      {
        id: 'discover',
        name: t('app.nav.discover'),
        subtitle: 'Search GitHub repositories',
        section: t('app.nav.discover'),
        icon: <Search className="h-4 w-4" />,
        shortcut: ['g', 'd'],
        keywords: 'discover search explore find repositories',
        perform: () => navigate('/discover'),
      },
      {
        id: 'inbox',
        name: t('app.nav.inbox'),
        subtitle: 'Approvals and notifications',
        section: t('app.nav.inbox'),
        icon: <Inbox className="h-4 w-4" />,
        shortcut: ['g', 'i'],
        keywords: 'inbox approvals notifications pending',
        perform: () => navigate('/inbox'),
      },
      {
        id: 'reports',
        name: t('app.nav.reports'),
        subtitle: 'View reports',
        section: t('app.nav.reports'),
        icon: <FileText className="h-4 w-4" />,
        shortcut: ['g', 'r'],
        keywords: 'reports analytics weekly security team',
        perform: () => navigate('/reports'),
      },
      {
        id: 'settings',
        name: t('app.nav.settings'),
        subtitle: 'Configure preferences',
        section: t('app.nav.settings'),
        icon: <Settings className="h-4 w-4" />,
        shortcut: ['g', 's'],
        keywords: 'settings preferences configure profile ai',
        perform: () => navigate('/settings'),
      },
      {
        id: 'dashboard',
        name: 'Dashboard',
        subtitle: 'Repository monitoring overview',
        section: t('app.nav.chats'),
        icon: <LayoutDashboard className="h-4 w-4" />,
        keywords: 'dashboard overview metrics stats',
        perform: () => navigate('/chats'),
      },
      {
        id: 'analysis',
        name: 'AI Analysis',
        subtitle: 'View AI analysis results',
        section: t('app.nav.chats'),
        icon: <Brain className="h-4 w-4" />,
        keywords: 'ai analysis intelligence',
        perform: () => navigate('/analysis'),
      },
      {
        id: 'approvals',
        name: 'Approvals',
        subtitle: 'Review pending approvals',
        section: t('app.nav.inbox'),
        icon: <CheckSquare className="h-4 w-4" />,
        keywords: 'approvals review pending',
        perform: () => navigate('/inbox/approvals'),
      },
      {
        id: 'notifications',
        name: 'Notifications',
        subtitle: 'View notification history',
        section: t('app.nav.inbox'),
        icon: <Bell className="h-4 w-4" />,
        keywords: 'notifications alerts',
        perform: () => navigate('/inbox/notifications'),
      },
      {
        id: 'repositories',
        name: 'Repositories',
        subtitle: 'Manage connected repositories',
        section: t('app.nav.discover'),
        icon: <GitBranch className="h-4 w-4" />,
        keywords: 'repositories manage connections',
        perform: () => navigate('/discover'),
      },
    ],
    [t, navigate],
  );

  return (
    <KBarProvider
      actions={actions}
      options={{
        enableHistory: true,
        callbacks: {
          onOpen: () => {
            document.documentElement.style.setProperty('overflow', 'hidden');
          },
          onClose: () => {
            document.documentElement.style.removeProperty('overflow');
          },
        },
      }}
    >
      <KBarPortal>
        <KBarPositioner className="z-50 fixed inset-0 bg-foreground/20 backdrop-blur-sm">
          <KBarAnimator className="w-full max-w-xl bg-card border border-border rounded-xl shadow-lg overflow-hidden">
            <div className="flex items-center border-b border-border px-4">
              <Search className="h-4 w-4 text-muted-foreground shrink-0" />
              <KBarSearch
                className="w-full py-3 px-3 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none border-0 focus:ring-0"
                defaultPlaceholder={t('search.placeholder')}
              />
            </div>
            <div className="max-h-72 overflow-auto scrollbar-thin">
              <RenderResults />
            </div>
            <div className="border-t border-border px-4 py-2 text-xs text-muted-foreground flex items-center justify-between">
              <div className="flex gap-3">
                <span>
                  <kbd className="inline-flex items-center justify-center h-5 min-w-[20px] rounded border border-border bg-muted px-1.5 text-xs font-mono">↑↓</kbd> navigate
                </span>
                <span>
                  <kbd className="inline-flex items-center justify-center h-5 min-w-[20px] rounded border border-border bg-muted px-1.5 text-xs font-mono">↩</kbd> select
                </span>
                <span>
                  <kbd className="inline-flex items-center justify-center h-5 min-w-[20px] rounded border border-border bg-muted px-1.5 text-xs font-mono">esc</kbd> close
                </span>
              </div>
            </div>
          </KBarAnimator>
        </KBarPositioner>
      </KBarPortal>
      {children}
    </KBarProvider>
  );
}
