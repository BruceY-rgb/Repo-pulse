import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Bell,
  Bot,
  CheckCircle2,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Command,
  Copy,
  Eye,
  EyeOff,
  ExternalLink,
  FileText,
  GitBranch,
  Github,
  LayoutDashboard,
  Loader2,
  LogOut,
  MessageSquare,
  PauseCircle,
  Plus,
  RotateCcw,
  Search,
  Send,
  Settings,
  ShieldAlert,
  Sparkles,
  Star,
  TestTube2,
  Trash2,
  VolumeX,
  Webhook,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { useSyncProgressStore } from '@/stores/sync-progress.store';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useApiQuery } from '@/lib/query-hooks';
import {
  useRepositoryBranchesQuery,
  useRepositoryListQuery,
  useStarredRepositoryCandidatesQuery,
  repositoryQueryKeys,
} from '@/hooks/queries/use-repository-queries';
import { useMonitoringScopePreferences } from '@/hooks/use-monitoring-scope-preferences';
import {
  useNotificationsQuery,
  notificationQueryKeys,
  useUnreadNotificationCountQuery,
} from '@/hooks/queries/use-notification-queries';
import {
  useRetryWebhookMutation,
  useTestWebhookMutation,
  useWebhookStatusQuery,
} from '@/hooks/queries/use-webhook-queries';
import { WebhookStatus } from '@repo-pulse/shared';
import {
  useCurrentUserQuery,
  useLogoutMutation,
} from '@/hooks/queries/use-auth-queries';
import { useRepositoryRealtimeSubscription } from '@/hooks/use-web-socket';
import { eventService } from '@/services/event.service';
import { approvalService, type Approval } from '@/services/approval.service';
import { repositoryService } from '@/services/repository.service';
import { authService } from '@/services/auth.service';
import { isDesktopRuntime } from '@/lib/desktop';
import type { Notification } from '@/services/notification.service';
import { Dashboard } from '@/pages/Dashboard';
import { Repositories } from '@/pages/Repositories';
import { Reports } from '@/pages/Reports';
import { Settings as SettingsPage } from '@/pages/Settings';
import type { Event, Repository, SearchResult } from '@/types/api';

type WorkbenchView = 'inbox' | 'repository' | 'repositories' | 'watch' | 'dashboard' | 'reports' | 'agent' | 'settings';

interface ConversationMessage {
  id: string;
  kind: 'event' | 'approval' | 'analysis' | 'notification';
  title: string;
  body: string;
  author: string;
  time: string;
  createdAtMs: number;
  risk: 'low' | 'medium' | 'high';
  eventTypeLabel?: string;
  branch?: string | null;
  externalUrl?: string | null;
  authorAvatar?: string | null;
  approvalId?: string;
  approvalStatus?: Approval['status'];
  sourceRepositoryId?: string;
  sourceEvent?: Event;
}

interface ContextMenuState {
  x: number;
  y: number;
  message: ConversationMessage;
}

interface RepositoryContextMenuState {
  x: number;
  y: number;
  repository: Repository;
}

type MessageFilterKey =
  | 'all'
  | 'approval'
  | 'notification'
  | 'issue'
  | 'pull-request'
  | 'push'
  | 'release';

const routeByView: Record<Exclude<WorkbenchView, 'repository'>, string> = {
  inbox: '/workbench',
  repositories: '/workbench/repositories',
  watch: '/workbench/watch',
  dashboard: '/workbench/dashboard',
  reports: '/workbench/reports',
  agent: '/workbench/agent',
  settings: '/workbench/settings',
};

const messageFilters: Array<{ key: MessageFilterKey; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'issue', label: 'Issue' },
  { key: 'pull-request', label: 'PR' },
  { key: 'push', label: 'Push' },
  { key: 'release', label: 'Release' },
  { key: 'approval', label: '审批' },
  { key: 'notification', label: '通知' },
];

const markdownComponents: Components = {
  a({ children, href, title }) {
    return (
      <a href={href} title={title} target="_blank" rel="noreferrer">
        {children}
      </a>
    );
  },
  p({ children }) {
    return <p className="my-2 leading-7">{children}</p>;
  },
  h1({ children }) {
    return <h1 className="mb-3 mt-4 text-2xl font-semibold leading-tight text-foreground">{children}</h1>;
  },
  h2({ children }) {
    return <h2 className="mb-2 mt-4 text-xl font-semibold leading-tight text-foreground">{children}</h2>;
  },
  h3({ children }) {
    return <h3 className="mb-2 mt-3 text-lg font-semibold leading-tight text-foreground">{children}</h3>;
  },
  h4({ children }) {
    return <h4 className="mb-2 mt-3 text-base font-semibold leading-tight text-foreground">{children}</h4>;
  },
  ul({ children }) {
    return <ul className="my-3 list-disc space-y-1 pl-5">{children}</ul>;
  },
  ol({ children }) {
    return <ol className="my-3 list-decimal space-y-1 pl-5">{children}</ol>;
  },
  li({ children }) {
    return <li className="pl-1 leading-7">{children}</li>;
  },
  blockquote({ children }) {
    return (
      <blockquote className="my-3 border-l-2 border-primary/60 pl-4 text-muted-foreground">
        {children}
      </blockquote>
    );
  },
  code({ children, className }) {
    return (
      <code className={cn('rounded bg-secondary px-1 py-0.5 text-[0.9em] text-foreground', className)}>
        {children}
      </code>
    );
  },
  pre({ children }) {
    return (
      <pre className="my-3 overflow-x-auto rounded-lg border border-border bg-background p-3 text-xs leading-5">
        {children}
      </pre>
    );
  },
  hr() {
    return <hr className="my-5 border-border" />;
  },
  table({ children }) {
    return (
      <div className="my-3 overflow-x-auto rounded-lg border border-border">
        <table className="w-full border-collapse text-sm">
          {children}
        </table>
      </div>
    );
  },
  thead({ children }) {
    return <thead className="bg-secondary/80">{children}</thead>;
  },
  tr({ children }) {
    return <tr className="border-b border-border last:border-b-0">{children}</tr>;
  },
  th({ children }) {
    return <th className="px-3 py-2 text-left font-medium text-foreground">{children}</th>;
  },
  td({ children }) {
    return <td className="px-3 py-2 align-top text-muted-foreground">{children}</td>;
  },
  input(props: ComponentProps<'input'>) {
    return <input {...props} className="mr-2 align-middle accent-primary" disabled />;
  },
  img({ src, alt, title }) {
    return (
      <img
        src={src}
        alt={alt ?? ''}
        title={title}
        loading="lazy"
        className="my-3 max-h-80 rounded-lg border border-border object-contain"
      />
    );
  },
};

function MarkdownContent({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  return (
    <div className={cn(
      'prose prose-sm prose-invert max-w-none text-muted-foreground',
      'prose-headings:text-foreground prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-1',
      'prose-a:text-info-foreground prose-strong:text-foreground prose-hr:border-border',
      className,
    )}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={markdownComponents}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

const COLLAPSED_PRIMARY_RAIL_WIDTH = 72;
const EXPANDED_PRIMARY_RAIL_WIDTH = 244;
const DEFAULT_REPOSITORY_SIDEBAR_WIDTH = 320;
const COLLAPSED_REPOSITORY_SIDEBAR_WIDTH = 68;
const MIN_REPOSITORY_SIDEBAR_WIDTH = 260;
const MAX_REPOSITORY_SIDEBAR_WIDTH = 440;
const SIDEBAR_KEYBOARD_STEP = 12;

function clampRepositorySidebarWidth(width: number) {
  return Math.min(MAX_REPOSITORY_SIDEBAR_WIDTH, Math.max(MIN_REPOSITORY_SIDEBAR_WIDTH, width));
}

function formatRelativeTime(dateString?: string | null) {
  if (!dateString) {
    return '刚刚';
  }

  const deltaMinutes = Math.max(1, Math.floor((Date.now() - new Date(dateString).getTime()) / 60000));
  if (deltaMinutes < 60) {
    return `${deltaMinutes} 分钟前`;
  }

  const deltaHours = Math.floor(deltaMinutes / 60);
  if (deltaHours < 24) {
    return `${deltaHours} 小时前`;
  }

  return `${Math.floor(deltaHours / 24)} 天前`;
}

function getRepoInitial(repo: Pick<Repository, 'name' | 'fullName'>) {
  return (repo.name || repo.fullName || 'R').slice(0, 1).toUpperCase();
}

function getRepositoryOwner(repo: Pick<Repository, 'fullName' | 'url'>) {
  const [ownerFromFullName] = repo.fullName.split('/');
  if (ownerFromFullName) {
    return ownerFromFullName;
  }

  try {
    const url = new URL(repo.url);
    return url.pathname.split('/').filter(Boolean)[0] ?? '';
  } catch {
    return '';
  }
}

function getRepositoryAvatarUrl(repo: Pick<Repository, 'fullName' | 'platform' | 'url'>) {
  const owner = getRepositoryOwner(repo);
  if (!owner) {
    return undefined;
  }

  if (repo.platform === 'GITHUB') {
    return `https://github.com/${encodeURIComponent(owner)}.png`;
  }

  try {
    const url = new URL(repo.url);
    return `${url.origin}/${encodeURIComponent(owner)}.png`;
  } catch {
    return undefined;
  }
}

function getAuthorAvatarUrl(message: ConversationMessage) {
  if (message.authorAvatar) {
    return message.authorAvatar;
  }

  const author = message.author?.trim();
  if (!author || author === 'GitHub' || author === 'Repo-Pulse') {
    return undefined;
  }

  if (/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(author)) {
    return `https://github.com/${encodeURIComponent(author)}.png`;
  }

  return undefined;
}

function getMessageAvatarFallback(message: ConversationMessage, repository: Repository) {
  const author = message.author?.trim();
  if (author && author !== 'GitHub' && author !== 'Repo-Pulse') {
    return author.slice(0, 1).toUpperCase();
  }

  return getRepoInitial(repository);
}

function getEventRisk(event: Event): ConversationMessage['risk'] {
  const type = `${event.type} ${event.action}`.toLowerCase();
  if (type.includes('release') || type.includes('security') || type.includes('push')) {
    return 'high';
  }
  if (type.includes('pull') || type.includes('issue')) {
    return 'medium';
  }
  return 'low';
}

function getRiskBadgeClass(risk: ConversationMessage['risk']) {
  if (risk === 'high') {
    return 'border-destructive/40 bg-destructive/10 text-destructive-foreground';
  }
  if (risk === 'medium') {
    return 'border-warning/40 bg-warning/10 text-warning-foreground';
  }
  return 'border-border bg-secondary text-muted-foreground';
}

function getEventTypeLabel(event?: Event | null) {
  if (!event) {
    return undefined;
  }

  const value = `${event.type} ${event.action} ${event.title}`.toLowerCase();
  if (value.includes('release')) {
    return 'Release';
  }
  if (value.includes('issue')) {
    return 'Issue';
  }
  if (value.includes('pull_request') || value.includes('pull request') || value.includes(' pr ') || value.includes('merge')) {
    return 'Pull Request';
  }
  if (value.includes('push') || value.includes('commit')) {
    return 'Push';
  }
  if (value.includes('review')) {
    return 'Review';
  }
  if (value.includes('comment')) {
    return 'Comment';
  }
  if (value.includes('branch')) {
    return 'Branch';
  }
  if (value.includes('tag')) {
    return 'Tag';
  }
  if (value.includes('security') || value.includes('dependabot')) {
    return 'Security';
  }

  return event.type
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ') || 'Event';
}

function getMessageKindLabel(message: ConversationMessage) {
  switch (message.kind) {
    case 'approval':
      return message.eventTypeLabel ? `审批 · ${message.eventTypeLabel}` : '审批';
    case 'analysis':
      return 'AI 分析';
    case 'notification':
      return message.eventTypeLabel ? `通知 · ${message.eventTypeLabel}` : '通知';
    case 'event':
    default:
      return message.eventTypeLabel ?? '仓库事件';
  }
}

function getMessageKindBadgeClass(message: ConversationMessage) {
  switch (message.kind) {
    case 'approval':
      return 'border-warning/40 bg-warning/10 text-warning-foreground';
    case 'analysis':
      return 'border-info/40 bg-info/10 text-info-foreground';
    case 'notification':
      return 'border-primary/40 bg-primary/10 text-primary';
    case 'event':
    default:
      if (message.eventTypeLabel === 'Issue') {
        return 'border-info/40 bg-info/10 text-info-foreground';
      }
      if (message.eventTypeLabel === 'Release') {
        return 'border-success/40 bg-success/10 text-success-foreground';
      }
      if (message.eventTypeLabel === 'Pull Request') {
        return 'border-primary/40 bg-primary/10 text-primary';
      }
      if (message.eventTypeLabel === 'Push') {
        return 'border-warning/40 bg-warning/10 text-warning-foreground';
      }
      return 'border-border bg-secondary text-muted-foreground';
  }
}

function toConversationMessage(event: Event): ConversationMessage {
  const risk = getEventRisk(event);
  const title = event.title || `${event.type} ${event.action}`;
  const body = event.body || [
    event.type,
    event.action,
    event.branch || event.targetBranch || event.sourceBranch,
  ].filter(Boolean).join(' · ');

  return {
    id: `event:${event.id}`,
    kind: risk === 'high' ? 'approval' : 'event',
    title,
    body: body || title,
    author: event.author || 'GitHub',
    time: formatRelativeTime(event.occurredAt ?? event.createdAt),
    createdAtMs: new Date(event.occurredAt ?? event.createdAt).getTime(),
    risk,
    eventTypeLabel: getEventTypeLabel(event),
    branch: event.branch || event.targetBranch || event.sourceBranch,
    externalUrl: event.externalUrl,
    authorAvatar: event.authorAvatar,
    sourceRepositoryId: event.repositoryId,
    sourceEvent: event,
  };
}

function toApprovalMessage(approval: Approval): ConversationMessage | null {
  const event = approval.event;
  const repositoryId = event?.repositoryId;
  if (!repositoryId) {
    return null;
  }

  const createdAtMs = new Date(approval.createdAt).getTime();

  return {
    id: `approval:${approval.id}`,
    kind: 'approval',
    title: event?.title || '待审批事项',
    body: approval.editedContent || approval.originalContent || event?.body || approval.comment || '审批记录暂无正文',
    author: event?.author || 'Repo-Pulse',
    time: formatRelativeTime(approval.createdAt),
    createdAtMs,
    risk: approval.status === 'PENDING' ? 'high' : 'medium',
    eventTypeLabel: getEventTypeLabel(event),
    branch: event?.branch || event?.targetBranch || event?.sourceBranch,
    externalUrl: event?.externalUrl,
    authorAvatar: event?.authorAvatar,
    approvalId: approval.id,
    approvalStatus: approval.status,
    sourceRepositoryId: repositoryId,
    sourceEvent: event ?? undefined,
  };
}

function toNotificationMessage(notification: Notification): ConversationMessage | null {
  const event = notification.event;
  const repositoryId = event?.repositoryId;
  if (!repositoryId) {
    return null;
  }

  return {
    id: `notification:${notification.id}`,
    kind: 'notification',
    title: notification.title,
    body: notification.content,
    author: notification.channel,
    time: formatRelativeTime(notification.createdAt),
    createdAtMs: new Date(notification.createdAt).getTime(),
    risk: notification.readAt ? 'low' : 'medium',
    eventTypeLabel: getEventTypeLabel(event),
    branch: event?.branch || event?.targetBranch || event?.sourceBranch,
    externalUrl: event?.externalUrl,
    authorAvatar: event?.authorAvatar,
    sourceRepositoryId: repositoryId,
    sourceEvent: event ?? undefined,
  };
}

function getLatestRepoMessage(repo: Repository, messages: ConversationMessage[]) {
  const message = messages
    .filter((item) => item.sourceRepositoryId === repo.id)
    .sort((left, right) => right.createdAtMs - left.createdAtMs)[0];
  if (message) {
    return message.title;
  }
  if (repo.lastSyncAt) {
    return `上次同步 ${formatRelativeTime(repo.lastSyncAt)}`;
  }
  return '等待新的仓库事件';
}

function getRepoMessages(repositoryId: string | undefined, messages: ConversationMessage[]) {
  if (!repositoryId) {
    return [];
  }

  return messages.filter((item) => item.sourceRepositoryId === repositoryId);
}

function getRepositorySortTime(repo: Repository, messages: ConversationMessage[]) {
  const latestMessageTime = Math.max(
    ...messages
      .filter((item) => item.sourceRepositoryId === repo.id)
      .map((item) => item.createdAtMs)
      .filter(Number.isFinite),
  );
  if (Number.isFinite(latestMessageTime)) {
    return latestMessageTime;
  }

  if (repo.lastSyncAt) {
    const lastSyncAt = new Date(repo.lastSyncAt).getTime();
    if (Number.isFinite(lastSyncAt)) {
      return lastSyncAt;
    }
  }

  const fallbackTime = new Date(repo.updatedAt || repo.createdAt).getTime();
  return Number.isFinite(fallbackTime) ? fallbackTime : 0;
}

function hasRepositoryMessages(repo: Repository, messages: ConversationMessage[]) {
  return messages.some((item) => item.sourceRepositoryId === repo.id);
}

function getRepositoryContextMenuItems({
  repository,
  isMonitored,
  isSyncing,
  syncProgress,
  onRemoveFromMonitoring,
  onToggleRepositoryActive,
  onSyncRepository,
  onOpenRepository,
  onDeleteRepository,
}: {
  repository: Repository;
  isMonitored: boolean;
  isSyncing: boolean;
  syncProgress?: number;
  onRemoveFromMonitoring: (repository: Repository) => void;
  onToggleRepositoryActive: (repository: Repository) => void;
  onSyncRepository: (repository: Repository) => void;
  onOpenRepository: (repository: Repository) => void;
  onDeleteRepository: (repository: Repository) => void;
}) {
  return [
    {
      key: 'remove-monitoring',
      label: '移出监控范围',
      icon: Plus,
      disabled: !isMonitored,
      onSelect: () => onRemoveFromMonitoring(repository),
    },
    {
      key: 'toggle-active',
      label: repository.isActive ? '停用' : '启用',
      icon: PauseCircle,
      onSelect: () => onToggleRepositoryActive(repository),
    },
    {
      key: 'sync',
      label: isSyncing
        ? `同步中 ${Math.round(syncProgress ?? 0)}%`
        : '同步',
      icon: isSyncing ? Loader2 : RotateCcw,
      disabled: isSyncing,
      onSelect: () => onSyncRepository(repository),
    },
    {
      key: 'open',
      label: '打开',
      icon: ExternalLink,
      onSelect: () => onOpenRepository(repository),
    },
    { key: 'separator-1', separator: true },
    {
      key: 'mute',
      label: '消息免打扰',
      icon: VolumeX,
      disabled: true,
      onSelect: () => {},
    },
    {
      key: 'hide',
      label: '不显示此会话',
      icon: EyeOff,
      disabled: true,
      onSelect: () => {},
    },
    {
      key: 'settings',
      label: '会话设置',
      icon: Settings,
      disabled: true,
      onSelect: () => {},
    },
    { key: 'separator-2', separator: true },
    {
      key: 'delete',
      label: '移除仓库',
      icon: Trash2,
      destructive: true,
      onSelect: () => onDeleteRepository(repository),
    },
  ];
}

function getWatchDescription(item: SearchResult) {
  const language = item.language ? `${item.language} · ` : '';
  return `${language}${item.stargazersCount.toLocaleString()} stars · ${item.description || '关注仓库正在发生新的生态变化'}`;
}

function doesMessageMatchFilter(message: ConversationMessage, filter: MessageFilterKey) {
  if (filter === 'all') {
    return true;
  }

  if (filter === 'approval' || filter === 'notification') {
    return message.kind === filter;
  }

  if (filter === 'pull-request') {
    return message.eventTypeLabel === 'Pull Request';
  }

  const expectedLabelMap: Record<Exclude<MessageFilterKey, 'all' | 'approval' | 'notification' | 'pull-request'>, string> = {
    issue: 'Issue',
    push: 'Push',
    release: 'Release',
  };

  return message.eventTypeLabel === expectedLabelMap[filter];
}

function PrimaryRail({
  activeView,
  unreadCount,
  collapsed,
  onToggleCollapsed,
}: {
  activeView: WorkbenchView;
  unreadCount: number;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const navigate = useNavigate();
  const { data: user, isLoading: isUserLoading } = useCurrentUserQuery();
  const logoutMutation = useLogoutMutation();
  const railItems = [
    { view: 'inbox' as const, label: '仓库会话', icon: MessageSquare },
    { view: 'watch' as const, label: '关注动态', icon: Star },
    { view: 'agent' as const, label: 'Agent 会话', icon: Bot },
    { view: 'settings' as const, label: '设置', icon: Settings },
  ];
  const railWidth = collapsed ? COLLAPSED_PRIMARY_RAIL_WIDTH : EXPANDED_PRIMARY_RAIL_WIDTH;
  const userName = user?.name ?? '未知用户';
  const userEmail = user?.email ?? '暂无邮箱';
  const userInitial = userName.slice(0, 1).toUpperCase() || 'U';

  const handleLogout = async () => {
    await logoutMutation.mutateAsync(undefined);
    navigate('/login', { replace: true });
  };

  return (
    <aside
      style={{ width: railWidth }}
      className="desktop-drag relative flex h-screen shrink-0 flex-col overflow-visible border-r border-border bg-card transition-[width] duration-200"
    >
      <div className={cn(
        'flex h-24 items-end border-b border-border pb-4 pt-9',
        collapsed ? 'justify-center px-0' : 'px-5',
      )}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              to="/workbench"
              className={cn(
                'desktop-no-drag flex min-w-0 items-center gap-3',
                collapsed && 'justify-center',
              )}
              aria-label="Repo-Pulse"
            >
              <img src="/avator.png" alt="Repo-Pulse" className="h-10 w-10 shrink-0 rounded-xl" />
              {!collapsed ? (
                <div className="min-w-0 space-y-0.5">
                  <p className="truncate text-[15px] font-semibold tracking-tight text-foreground">Repo-Pulse</p>
                  <p className="truncate text-xs text-muted-foreground">Desktop Workbench</p>
                </div>
              ) : null}
            </Link>
          </TooltipTrigger>
          {collapsed ? <TooltipContent side="right">Repo-Pulse</TooltipContent> : null}
        </Tooltip>
      </div>

      <nav className={cn('desktop-no-drag flex flex-1 flex-col gap-2 py-4', collapsed ? 'items-center px-3' : 'px-3')}>
        {railItems.map((item) => {
          const Icon = item.icon;
          const active = activeView === item.view || (item.view === 'inbox' && activeView === 'repository');
          const link = (
            <Link
              key={item.view}
              to={routeByView[item.view]}
              className={cn(
                'relative flex items-center text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground',
                collapsed ? 'h-10 w-10 justify-center rounded-xl' : 'h-10 gap-2 rounded-lg px-3',
                active && 'bg-primary/10 text-primary',
              )}
              aria-label={item.label}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed ? <span className="min-w-0 flex-1 truncate">{item.label}</span> : null}
              {item.view === 'inbox' && unreadCount > 0 ? (
                collapsed ? (
                  <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary" />
                ) : (
                  <Badge variant="secondary" className="rounded-full text-xs">
                    {unreadCount}
                  </Badge>
                )
              ) : null}
            </Link>
          );

          return collapsed ? (
            <Tooltip key={item.view}>
              <TooltipTrigger asChild>{link}</TooltipTrigger>
              <TooltipContent side="right">{item.label}</TooltipContent>
            </Tooltip>
          ) : link;
        })}
      </nav>

      <div className={cn('desktop-no-drag border-t border-border', collapsed ? 'space-y-3 p-3' : 'space-y-3 p-4')}>
        {isUserLoading ? (
          <div
            className={cn(
              'flex items-center rounded-xl border border-border bg-background/40',
              collapsed ? 'h-10 justify-center p-0' : 'h-[62px] justify-center px-3',
            )}
          >
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  'flex items-center rounded-xl border border-border bg-background/40',
                  collapsed ? 'h-10 justify-center p-0' : 'gap-3 p-3',
                )}
              >
                <Avatar className="h-9 w-9 shrink-0 rounded-full">
                  <AvatarImage src={user?.avatar ?? undefined} alt={userName} className="object-cover" />
                  <AvatarFallback className="bg-primary/15 text-sm font-semibold text-primary">
                    {userInitial}
                  </AvatarFallback>
                </Avatar>
                {!collapsed ? (
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{userName}</p>
                    <p className="truncate text-xs text-muted-foreground">{userEmail}</p>
                  </div>
                ) : null}
              </div>
            </TooltipTrigger>
            {collapsed ? <TooltipContent side="right">{userName}</TooltipContent> : null}
          </Tooltip>
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size={collapsed ? 'icon' : 'default'}
              className={cn('gap-2 rounded-xl', collapsed ? 'h-10 w-10' : 'h-10 w-full justify-start')}
              onClick={handleLogout}
              disabled={logoutMutation.isPending}
              aria-label="退出登录"
            >
              <LogOut className="h-4 w-4" />
              {!collapsed ? <span>退出登录</span> : null}
            </Button>
          </TooltipTrigger>
          {collapsed ? <TooltipContent side="right">退出登录</TooltipContent> : null}
        </Tooltip>
      </div>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="desktop-no-drag absolute right-[-15px] top-1/2 z-50 h-7 w-7 -translate-y-1/2 rounded-full border-border bg-card text-muted-foreground shadow-sm hover:bg-secondary hover:text-foreground"
            onClick={onToggleCollapsed}
            aria-label="切换侧边栏"
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">{collapsed ? '展开侧边栏' : '收起侧边栏'}</TooltipContent>
      </Tooltip>
    </aside>
  );
}

function RepositorySidebar({
  repositories,
  selectedRepositoryId,
  messages,
  monitoredRepositoryIds,
  syncingRepoIds,
  collapsed,
  onToggleCollapsed,
  onRemoveFromMonitoring,
  onToggleRepositoryActive,
  onSyncRepository,
  onOpenRepository,
  onDeleteRepository,
}: {
  repositories: Repository[];
  selectedRepositoryId?: string;
  messages: ConversationMessage[];
  monitoredRepositoryIds: string[];
  syncingRepoIds: Set<string>;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onRemoveFromMonitoring: (repository: Repository) => void;
  onToggleRepositoryActive: (repository: Repository) => void;
  onSyncRepository: (repository: Repository) => void;
  onOpenRepository: (repository: Repository) => void;
  onDeleteRepository: (repository: Repository) => void;
}) {
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_REPOSITORY_SIDEBAR_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const [contextMenu, setContextMenu] = useState<RepositoryContextMenuState | null>(null);
  const [repositorySearch, setRepositorySearch] = useState('');
  const syncProgressByRepoId = useSyncProgressStore((s) => s.byRepoId);
  const resizeStartRef = useRef({
    clientX: 0,
    width: DEFAULT_REPOSITORY_SIDEBAR_WIDTH,
  });
  const normalizedRepositorySearch = repositorySearch.trim().toLowerCase();
  const sortedRepositories = useMemo(
    () => repositories
      .filter((repository) => {
        if (!normalizedRepositorySearch) {
          return true;
        }

        return [
          repository.name,
          repository.fullName,
          repository.defaultBranch,
          getLatestRepoMessage(repository, messages),
        ].join(' ').toLowerCase().includes(normalizedRepositorySearch);
      })
      .sort((left, right) => {
        const leftHasMessages = hasRepositoryMessages(left, messages);
        const rightHasMessages = hasRepositoryMessages(right, messages);
        if (leftHasMessages !== rightHasMessages) {
          return rightHasMessages ? 1 : -1;
        }

        const rightLatestAt = getRepositorySortTime(right, messages);
        const leftLatestAt = getRepositorySortTime(left, messages);
        return rightLatestAt - leftLatestAt;
      }),
    [messages, normalizedRepositorySearch, repositories],
  );

  useEffect(() => {
    if (!isResizing) {
      return;
    }

    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;

    function handlePointerMove(event: globalThis.PointerEvent) {
      const delta = event.clientX - resizeStartRef.current.clientX;
      setSidebarWidth(clampRepositorySidebarWidth(resizeStartRef.current.width + delta));
    }

    function handlePointerUp() {
      setIsResizing(false);
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
  }, [isResizing]);

  useEffect(() => {
    if (!contextMenu) {
      return;
    }

    function close() {
      setContextMenu(null);
    }

    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [contextMenu]);

  const handleResizePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (collapsed) {
      return;
    }

    event.preventDefault();
    resizeStartRef.current = {
      clientX: event.clientX,
      width: sidebarWidth,
    };
    setIsResizing(true);
  };

  const handleResizeKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (collapsed) {
      return;
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      setSidebarWidth((current) => clampRepositorySidebarWidth(current - SIDEBAR_KEYBOARD_STEP));
      return;
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      setSidebarWidth((current) => clampRepositorySidebarWidth(current + SIDEBAR_KEYBOARD_STEP));
      return;
    }

    if (event.key === 'Home') {
      event.preventDefault();
      setSidebarWidth(MIN_REPOSITORY_SIDEBAR_WIDTH);
      return;
    }

    if (event.key === 'End') {
      event.preventDefault();
      setSidebarWidth(MAX_REPOSITORY_SIDEBAR_WIDTH);
    }
  };

  if (collapsed) {
    return (
      <aside
        style={{ width: COLLAPSED_REPOSITORY_SIDEBAR_WIDTH }}
        className="relative hidden h-screen shrink-0 overflow-visible border-r border-border bg-background/60 transition-[width] duration-200 lg:block"
      >
        <div className="desktop-drag flex h-24 items-end justify-center border-b border-border pb-4 pt-9">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="desktop-no-drag h-10 w-10 rounded-xl"
                onClick={onToggleCollapsed}
                aria-label="展开仓库会话列表"
              >
                <MessageSquare className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">展开仓库会话列表</TooltipContent>
          </Tooltip>
        </div>

        <ScrollArea className="h-[calc(100vh-208px)]">
          <div className="desktop-no-drag flex flex-col items-center gap-3 px-2 py-3">
            {sortedRepositories.map((repo) => {
              const repoMessages = getRepoMessages(repo.id, messages);
              const selected = repo.id === selectedRepositoryId;
              const unread = Math.min(repoMessages.filter((message) => message.risk !== 'low').length || repo._count?.events || 0, 99);
              const avatarUrl = getRepositoryAvatarUrl(repo);
              const isSyncing = syncingRepoIds.has(repo.id);

              const compactLink = (
                <Link
                  key={repo.id}
                  to={`/workbench/repository/${repo.id}`}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setContextMenu({
                      x: event.clientX,
                      y: event.clientY,
                      repository: repo,
                    });
                  }}
                  className={cn(
                    'relative flex h-11 w-11 items-center justify-center rounded-xl border border-transparent transition-colors hover:bg-secondary',
                    selected && 'border-primary/40 bg-primary/10',
                  )}
                  aria-label={repo.fullName}
                >
                  <Avatar className="h-9 w-9 rounded-xl">
                    <AvatarImage src={avatarUrl} alt={repo.fullName} className="object-cover" />
                    <AvatarFallback className="rounded-xl bg-secondary text-xs font-semibold">
                      {getRepoInitial(repo)}
                    </AvatarFallback>
                  </Avatar>
                  {unread > 0 ? (
                    <span className="absolute right-0 top-0 h-2.5 w-2.5 rounded-full border border-background bg-primary" />
                  ) : null}
                  {isSyncing ? (
                    <span
                      className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border border-background bg-background"
                      aria-label="同步中"
                    >
                      <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                    </span>
                  ) : null}
                </Link>
              );

              return (
                <Tooltip key={repo.id}>
                  <TooltipTrigger asChild>{compactLink}</TooltipTrigger>
                  <TooltipContent side="right">
                    <div className="max-w-[240px]">
                      <p className="font-medium">{repo.fullName}</p>
                      <p className="truncate text-xs text-muted-foreground">{getLatestRepoMessage(repo, messages)}</p>
                    </div>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </ScrollArea>

        <div className="desktop-no-drag absolute bottom-3 left-0 right-0 flex flex-col items-center gap-2 px-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" variant="outline" className="h-10 w-10 rounded-xl" asChild>
                <Link to="/workbench/repositories" aria-label="添加仓库">
                  <Plus className="h-4 w-4" />
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">添加仓库</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-10 w-10 rounded-xl text-muted-foreground hover:text-foreground"
                onClick={onToggleCollapsed}
                aria-label="展开仓库会话列表"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">展开</TooltipContent>
          </Tooltip>
        </div>

        {contextMenu ? (
          <div
            className="fixed z-50 w-[280px] overflow-hidden rounded-2xl border border-border bg-popover/95 p-2 shadow-2xl backdrop-blur"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={(event) => event.stopPropagation()}
          >
            {getRepositoryContextMenuItems({
              repository: contextMenu.repository,
              isMonitored: monitoredRepositoryIds.includes(contextMenu.repository.id),
              isSyncing: syncingRepoIds.has(contextMenu.repository.id),
              syncProgress: syncProgressByRepoId[contextMenu.repository.id]?.progress,
              onRemoveFromMonitoring,
              onToggleRepositoryActive,
              onSyncRepository,
              onOpenRepository,
              onDeleteRepository,
            }).map((item) => {
              if ('separator' in item) {
                return <div key={item.key} className="my-2 h-px bg-border" />;
              }

              const Icon = item.icon;

              return (
                <button
                  key={item.key}
                  type="button"
                  className={cn(
                    'flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium transition-colors',
                    item.destructive
                      ? 'text-destructive hover:bg-destructive/10'
                      : 'text-foreground hover:bg-secondary',
                    item.disabled && 'cursor-not-allowed opacity-45 hover:bg-transparent',
                  )}
                  disabled={item.disabled}
                  onClick={() => {
                    item.onSelect();
                    setContextMenu(null);
                  }}
                >
                  <Icon className={cn('h-5 w-5 shrink-0', Icon === Loader2 && 'animate-spin')} />
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                </button>
              );
            })}
          </div>
        ) : null}
      </aside>
    );
  }

  return (
    <aside
      style={{ width: sidebarWidth }}
      className={cn(
        'relative hidden h-screen shrink-0 overflow-visible border-r border-border bg-background/60 lg:block',
        !isResizing && 'transition-[width] duration-200',
      )}
    >
      <div className="desktop-drag border-b border-border px-4 pb-4 pt-9">
        <div className="desktop-no-drag flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground">Editable repositories</p>
            <h2 className="text-lg font-semibold text-foreground">仓库会话</h2>
          </div>
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-9 w-9 text-muted-foreground hover:text-foreground"
                  onClick={onToggleCollapsed}
                  aria-label="收起仓库会话列表"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>收起仓库会话列表</TooltipContent>
            </Tooltip>
            <Button size="icon" variant="outline" className="h-9 w-9" asChild>
              <Link to="/workbench/repositories" aria-label="添加仓库">
                <Plus className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
        <div className="desktop-no-drag relative mt-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={repositorySearch}
            onChange={(event) => setRepositorySearch(event.target.value)}
            placeholder="搜索仓库会话"
            className="h-8 rounded-lg border-border bg-background/70 pl-8 text-xs"
          />
        </div>
      </div>

      <ScrollArea className="h-[calc(100vh-98px)] overflow-hidden">
        <div className="w-full max-w-full space-y-1 overflow-hidden p-3">
          {sortedRepositories.map((repo) => {
            const repoMessages = getRepoMessages(repo.id, messages);
            const selected = repo.id === selectedRepositoryId;
            const unread = Math.min(repoMessages.filter((message) => message.risk !== 'low').length || repo._count?.events || 0, 99);
            const avatarUrl = getRepositoryAvatarUrl(repo);
            const latestMessage = getLatestRepoMessage(repo, messages);
            const isSyncing = syncingRepoIds.has(repo.id);
            return (
              <Link
                key={repo.id}
                to={`/workbench/repository/${repo.id}`}
                onContextMenu={(event) => {
                  event.preventDefault();
                  setContextMenu({
                    x: event.clientX,
                    y: event.clientY,
                    repository: repo,
                  });
                }}
                className={cn(
                  'relative flex w-full min-w-0 overflow-hidden gap-3 rounded-xl border border-transparent px-3 py-3 text-left transition-colors hover:bg-secondary/70',
                  selected && 'border-primary/30 bg-primary/10',
                )}
              >
                {unread > 0 ? (
                  <Badge className="absolute right-3 top-3 z-10 h-5 max-w-12 shrink-0 rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">
                    {unread}
                  </Badge>
                ) : null}
                <Avatar className="h-11 w-11 shrink-0 rounded-xl">
                  <AvatarImage src={avatarUrl} alt={repo.fullName} className="object-cover" />
                  <AvatarFallback className="rounded-xl bg-secondary text-sm font-semibold">
                    {getRepoInitial(repo)}
                  </AvatarFallback>
                </Avatar>
                <div className={cn('min-w-0 flex-1 overflow-hidden', unread > 0 && 'pr-14')}>
                  <div className="flex min-w-0 items-center gap-1.5">
                    <p
                      className="min-w-0 break-words text-sm font-semibold leading-5 text-foreground"
                      title={repo.fullName}
                    >
                      {repo.fullName}
                    </p>
                    {isSyncing ? (
                      <>
                        <Loader2
                          className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground"
                          aria-label="同步中"
                        />
                        <span className="shrink-0 text-xs font-medium text-muted-foreground">
                          {Math.round(syncProgressByRepoId[repo.id]?.progress ?? 0)}%
                        </span>
                      </>
                    ) : null}
                  </div>
                  <p className="mt-1 block max-w-full truncate text-xs text-muted-foreground" title={latestMessage}>
                    {latestMessage}
                  </p>
                  <div className="mt-2 flex min-w-0 items-center gap-2 overflow-hidden text-[11px] text-muted-foreground">
                    <GitBranch className="h-3 w-3 shrink-0" />
                    <span className="min-w-0 truncate">{repo.defaultBranch}</span>
                    <CircleDot className={cn('h-3 w-3 shrink-0', repo.isActive ? 'text-success-foreground' : 'text-muted-foreground')} />
                    <span className="shrink-0">{repo.isActive ? '监控中' : '已暂停'}</span>
                    {!repo.webhookId ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <AlertTriangle
                            className="ml-auto h-3 w-3 shrink-0 text-warning-foreground"
                            aria-label="Webhook 未配置"
                          />
                        </TooltipTrigger>
                        <TooltipContent side="right">
                          Webhook 未配置，点击进入仓库详情修复
                        </TooltipContent>
                      </Tooltip>
                    ) : null}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </ScrollArea>
      <div
        className="desktop-no-drag group absolute bottom-0 right-[-5px] top-0 z-40 w-2 cursor-col-resize outline-none"
        role="separator"
        tabIndex={0}
        aria-orientation="vertical"
        aria-valuemin={MIN_REPOSITORY_SIDEBAR_WIDTH}
        aria-valuemax={MAX_REPOSITORY_SIDEBAR_WIDTH}
        aria-valuenow={sidebarWidth}
        onPointerDown={handleResizePointerDown}
        onDoubleClick={() => setSidebarWidth(DEFAULT_REPOSITORY_SIDEBAR_WIDTH)}
        onKeyDown={handleResizeKeyDown}
      >
        <span className="absolute right-[3px] top-0 h-full w-px bg-transparent transition-colors group-hover:bg-primary/50 group-focus-visible:bg-primary" />
      </div>
      {contextMenu ? (
        <div
          className="fixed z-50 w-[280px] overflow-hidden rounded-2xl border border-border bg-popover/95 p-2 shadow-2xl backdrop-blur"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          {getRepositoryContextMenuItems({
            repository: contextMenu.repository,
            isMonitored: monitoredRepositoryIds.includes(contextMenu.repository.id),
            isSyncing: syncingRepoIds.has(contextMenu.repository.id),
            syncProgress: syncProgressByRepoId[contextMenu.repository.id]?.progress,
            onRemoveFromMonitoring,
            onToggleRepositoryActive,
            onSyncRepository,
            onOpenRepository,
            onDeleteRepository,
          }).map((item) => {
            if ('separator' in item) {
              return <div key={item.key} className="my-2 h-px bg-border" />;
            }

            const Icon = item.icon;

            return (
              <button
                key={item.key}
                type="button"
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium transition-colors',
                  item.destructive
                    ? 'text-destructive hover:bg-destructive/10'
                    : 'text-foreground hover:bg-secondary',
                  item.disabled && 'cursor-not-allowed opacity-45 hover:bg-transparent',
                )}
                disabled={item.disabled}
                onClick={() => {
                  item.onSelect();
                  setContextMenu(null);
                }}
              >
                <Icon className={cn('h-5 w-5 shrink-0', Icon === Loader2 && 'animate-spin')} />
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </aside>
  );
}

function WorkbenchHeader({
  activeView,
  repository,
  onAgent,
  onSearch,
  onOpenBranchMonitor,
}: {
  activeView: WorkbenchView;
  repository?: Repository;
  onAgent: () => void;
  onSearch: () => void;
  onOpenBranchMonitor: () => void;
}) {
  const titleByView: Record<WorkbenchView, string> = {
    inbox: '今日工作台',
    repository: repository?.fullName ?? '仓库会话',
    repositories: '仓库管理',
    watch: '关注动态',
    dashboard: '仓库看板',
    reports: '报告中心',
    agent: 'Agent 会话',
    settings: '设置',
  };
  const repositoryAvatarUrl = repository ? getRepositoryAvatarUrl(repository) : undefined;
  const dashboardHref = activeView === 'repository' && repository
    ? `/workbench/dashboard?repositoryId=${encodeURIComponent(repository.id)}`
    : '/workbench/dashboard';

  return (
    <header className="desktop-drag flex h-24 shrink-0 items-end justify-between gap-4 border-b border-border bg-background/95 px-6 pb-4 backdrop-blur">
      <div className="flex min-w-0 items-center gap-3">
        {activeView === 'repository' && repository ? (
          <Avatar className="desktop-no-drag h-12 w-12 rounded-xl border border-border">
            <AvatarImage src={repositoryAvatarUrl} alt={repository.fullName} className="object-cover" />
            <AvatarFallback className="rounded-xl bg-secondary text-sm font-semibold">
              {getRepoInitial(repository)}
            </AvatarFallback>
          </Avatar>
        ) : null}
        <div className="min-w-0">
          <p className="truncate text-sm text-muted-foreground">
            {activeView === 'repository' ? '可编辑仓库 / 独立 Agent 会话' : 'Repo-Pulse Desktop Workbench'}
          </p>
          <h1 className="truncate text-2xl font-semibold tracking-tight text-foreground">{titleByView[activeView]}</h1>
        </div>
      </div>
      <div className="desktop-no-drag flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="icon" variant="outline" aria-label="搜索会话" onClick={onSearch}>
              <Search className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>搜索会话</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="icon" variant="outline" asChild aria-label="看板">
              <Link to={dashboardHref}>
                <LayoutDashboard className="h-4 w-4" />
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent>{activeView === 'repository' ? '查看当前仓库看板' : '仓库看板'}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="icon" variant="outline" aria-label="分支监控" onClick={onOpenBranchMonitor}>
              <GitBranch className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>分支监控</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="icon" variant="outline" asChild aria-label="生成报告">
              <Link to="/workbench/reports">
                <FileText className="h-4 w-4" />
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent>生成报告</TooltipContent>
        </Tooltip>
        <Button className="gap-2" onClick={onAgent}>
          <Bot className="h-4 w-4" />
          让 Agent 处理
        </Button>
      </div>
    </header>
  );
}

function ConversationBubble({
  message,
  repository,
  onOpenDetail,
  onOpenAgent,
  onApproveMessage,
  onRejectMessage,
  approvalActionId,
  onContextMenu,
}: {
  message: ConversationMessage;
  repository: Repository;
  onOpenDetail: (message: ConversationMessage) => void;
  onOpenAgent: (prompt: string) => void;
  onApproveMessage: (message: ConversationMessage) => void;
  onRejectMessage: (message: ConversationMessage) => void;
  approvalActionId?: string;
  onContextMenu: (event: MouseEvent<HTMLDivElement>, message: ConversationMessage) => void;
}) {
  const Icon = message.kind === 'approval'
    ? ShieldAlert
    : message.kind === 'analysis'
      ? Sparkles
      : message.kind === 'notification'
        ? Bell
        : Github;
  const authorAvatarUrl = getAuthorAvatarUrl(message) ?? getRepositoryAvatarUrl(repository);

  return (
    <div
      className="group flex cursor-pointer gap-3"
      role="button"
      tabIndex={0}
      onClick={() => onOpenDetail(message)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpenDetail(message);
        }
      }}
      onContextMenu={(event) => onContextMenu(event, message)}
    >
      <Avatar className="mt-1 h-10 w-10 shrink-0 rounded-xl border border-border">
        <AvatarImage src={authorAvatarUrl} alt={message.author} className="object-cover" />
        <AvatarFallback className="rounded-xl bg-secondary text-sm font-semibold">
          {getMessageAvatarFallback(message, repository)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1 rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
          <Badge variant="outline" className={cn('rounded-full text-[11px]', getMessageKindBadgeClass(message))}>
            {getMessageKindLabel(message)}
          </Badge>
          <span className="text-sm font-semibold text-foreground">{message.author}</span>
          <span className="text-xs text-muted-foreground">{message.time}</span>
          <Badge variant="outline" className={cn('rounded-full text-[11px]', getRiskBadgeClass(message.risk))}>
            {message.risk === 'high' ? '需要处理' : message.risk === 'medium' ? '建议关注' : '通知'}
          </Badge>
          {message.branch ? (
            <Badge variant="secondary" className="rounded-full text-[11px]">
              <GitBranch className="mr-1 h-3 w-3" />
              {message.branch}
            </Badge>
          ) : null}
        </div>
        <h3 className="mt-3 text-base font-semibold text-foreground">{message.title}</h3>
        <MarkdownContent className="mt-2 line-clamp-3 prose-headings:my-1 prose-h1:text-base prose-h2:text-sm prose-h3:text-sm prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-pre:my-2 prose-pre:max-h-32">
          {message.body}
        </MarkdownContent>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {message.externalUrl ? (
            <Button size="sm" variant="outline" className="gap-2" asChild onClick={(event) => event.stopPropagation()}>
              <a href={message.externalUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="h-3.5 w-3.5" />
                GitHub
              </a>
            </Button>
          ) : null}
          <Button
            size="sm"
            variant={message.risk === 'high' ? 'default' : 'secondary'}
            className="gap-2"
            onClick={(event) => {
              event.stopPropagation();
              onOpenAgent(`处理这条消息：${message.title}`);
            }}
          >
            <Bot className="h-3.5 w-3.5" />
            使用 Agent 处理
          </Button>
          {message.kind === 'approval' && message.approvalId && message.approvalStatus === 'PENDING' ? (
            <>
              <Button
                size="sm"
                variant="outline"
                className="gap-2 border-success/40 text-success-foreground hover:bg-success/10"
                disabled={approvalActionId === message.approvalId}
                onClick={(event) => {
                  event.stopPropagation();
                  onApproveMessage(message);
                }}
              >
                <CheckSquare className="h-3.5 w-3.5" />
                通过
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-2 border-destructive/40 text-destructive hover:bg-destructive/10"
                disabled={approvalActionId === message.approvalId}
                onClick={(event) => {
                  event.stopPropagation();
                  onRejectMessage(message);
                }}
              >
                <XCircle className="h-3.5 w-3.5" />
                拒绝
              </Button>
            </>
          ) : message.kind === 'approval' && message.approvalStatus ? (
            <Badge variant="secondary" className="rounded-full">
              {message.approvalStatus}
            </Badge>
          ) : (
            <Button size="sm" variant="ghost" className="gap-2" onClick={(event) => event.stopPropagation()}>
              <CheckSquare className="h-3.5 w-3.5" />
              创建审批
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function MessageDetailSheet({
  message,
  repository,
  onClose,
  onOpenAgent,
  onApproveMessage,
  onRejectMessage,
  approvalActionId,
}: {
  message: ConversationMessage | null;
  repository: Repository;
  onClose: () => void;
  onOpenAgent: (prompt: string) => void;
  onApproveMessage: (message: ConversationMessage) => void;
  onRejectMessage: (message: ConversationMessage) => void;
  approvalActionId?: string;
}) {
  const repositoryAvatarUrl = getRepositoryAvatarUrl(repository);
  const authorAvatarUrl = message
    ? getAuthorAvatarUrl(message) ?? repositoryAvatarUrl
    : repositoryAvatarUrl;

  return (
    <Sheet open={Boolean(message)} onOpenChange={(open) => {
      if (!open) {
        onClose();
      }
    }}>
      <SheetContent side="right" className="w-full overflow-y-auto border-border bg-background sm:max-w-2xl">
        {message ? (
          <>
            <SheetHeader className="space-y-4 text-left">
              <div className="flex items-center gap-3">
                <Avatar className="h-11 w-11 rounded-xl border border-border">
                  <AvatarImage src={authorAvatarUrl} alt={message.author} className="object-cover" />
                  <AvatarFallback className="rounded-xl bg-secondary text-sm font-semibold">
                    {getMessageAvatarFallback(message, repository)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate text-sm text-muted-foreground">{repository.fullName}</p>
                  <SheetTitle className="text-xl leading-7">{message.title}</SheetTitle>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={cn('rounded-full text-[11px]', getRiskBadgeClass(message.risk))}>
                  {message.risk === 'high' ? '需要处理' : message.risk === 'medium' ? '建议关注' : '通知'}
                </Badge>
                <Badge variant="secondary" className="rounded-full text-[11px]">
                  {getMessageKindLabel(message)}
                </Badge>
                <span className="text-xs text-muted-foreground">{message.author} · {message.time}</span>
              </div>
            </SheetHeader>

            <div className="mt-6 space-y-5">
              {message.branch ? (
                <div className="rounded-xl border border-border bg-card p-4">
                  <p className="text-xs text-muted-foreground">分支</p>
                  <p className="mt-1 text-sm font-medium text-foreground">{message.branch}</p>
                </div>
              ) : null}

              <div className="rounded-xl border border-border bg-card p-5">
                <p className="mb-3 text-sm font-medium text-foreground">消息正文</p>
                <MarkdownContent>{message.body}</MarkdownContent>
              </div>

              <div className="flex flex-wrap gap-2">
                {message.externalUrl ? (
                  <Button variant="outline" className="gap-2" asChild>
                    <a href={message.externalUrl} target="_blank" rel="noreferrer">
                      <ExternalLink className="h-4 w-4" />
                      打开 GitHub
                    </a>
                  </Button>
                ) : null}
                <Button
                  className="gap-2"
                  onClick={() => onOpenAgent(`处理这条消息：${message.title}`)}
                >
                  <Bot className="h-4 w-4" />
                  使用 Agent 处理
                </Button>
                {message.kind === 'approval' && message.approvalId && message.approvalStatus === 'PENDING' ? (
                  <>
                    <Button
                      variant="outline"
                      className="gap-2 border-success/40 text-success-foreground hover:bg-success/10"
                      disabled={approvalActionId === message.approvalId}
                      onClick={() => onApproveMessage(message)}
                    >
                      <CheckSquare className="h-4 w-4" />
                      通过审批
                    </Button>
                    <Button
                      variant="outline"
                      className="gap-2 border-destructive/40 text-destructive hover:bg-destructive/10"
                      disabled={approvalActionId === message.approvalId}
                      onClick={() => onRejectMessage(message)}
                    >
                      <XCircle className="h-4 w-4" />
                      拒绝审批
                    </Button>
                  </>
                ) : null}
              </div>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function ConversationSearchSheet({
  open,
  query,
  messages,
  repositories,
  selectedRepository,
  onQueryChange,
  onOpenChange,
}: {
  open: boolean;
  query: string;
  messages: ConversationMessage[];
  repositories: Repository[];
  selectedRepository?: Repository;
  onQueryChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const repositoryMap = useMemo(
    () => new Map(repositories.map((repository) => [repository.id, repository])),
    [repositories],
  );
  const normalizedQuery = query.trim().toLowerCase();
  const scopedMessages = selectedRepository
    ? messages.filter((message) => message.sourceRepositoryId === selectedRepository.id)
    : messages;
  const results = normalizedQuery
    ? scopedMessages.filter((message) => [
        message.title,
        message.body,
        message.author,
        message.branch ?? '',
        message.eventTypeLabel ?? '',
      ].join(' ').toLowerCase().includes(normalizedQuery)).slice(0, 50)
    : scopedMessages.slice(0, 20);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto border-border bg-background sm:max-w-xl">
        <SheetHeader className="space-y-3 text-left">
          <SheetTitle>搜索会话记录</SheetTitle>
          <Input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={selectedRepository ? `搜索 ${selectedRepository.fullName}` : '搜索全部会话'}
            autoFocus
          />
        </SheetHeader>
        <div className="mt-5 space-y-2">
          {results.length > 0 ? results.map((message) => {
            const repository = message.sourceRepositoryId
              ? repositoryMap.get(message.sourceRepositoryId)
              : undefined;

            return (
              <Link
                key={message.id}
                to={message.sourceRepositoryId ? `/workbench/repository/${message.sourceRepositoryId}` : '/workbench'}
                className="block rounded-xl border border-border bg-card p-4 transition-colors hover:bg-secondary/50"
                onClick={() => onOpenChange(false)}
              >
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={cn('rounded-full text-[11px]', getMessageKindBadgeClass(message))}>
                    {getMessageKindLabel(message)}
                  </Badge>
                  <span className="min-w-0 truncate text-xs text-muted-foreground">
                    {repository?.fullName ?? '未知仓库'} · {message.time}
                  </span>
                </div>
                <p className="mt-2 truncate text-sm font-medium text-foreground">{message.title}</p>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{message.body}</p>
              </Link>
            );
          }) : (
            <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
              没有匹配的真实消息。
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function BranchMonitorSheet({
  open,
  repository,
  monitoredRepositoryIds,
  selectedBranches,
  saving,
  onOpenChange,
  onToggleRepository,
  onToggleBranch,
  onResetBranches,
}: {
  open: boolean;
  repository?: Repository;
  monitoredRepositoryIds: string[];
  selectedBranches: string[];
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onToggleRepository: () => void;
  onToggleBranch: (branchName: string) => void;
  onResetBranches: () => void;
}) {
  const branchesQuery = useRepositoryBranchesQuery(repository?.id ?? '', Boolean(open && repository?.id));
  const isRepositoryMonitored = repository ? monitoredRepositoryIds.includes(repository.id) : false;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto border-border bg-background sm:max-w-xl">
        <SheetHeader className="space-y-2 text-left">
          <SheetTitle>分支监控</SheetTitle>
          <p className="text-sm text-muted-foreground">
            {repository ? repository.fullName : '请先选择一个可编辑仓库。'}
          </p>
        </SheetHeader>
        {repository ? (
          <div className="mt-5 space-y-4">
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-4 text-left"
              onClick={onToggleRepository}
              disabled={saving}
            >
              <Checkbox checked={isRepositoryMonitored} className="pointer-events-none" />
              <div>
                <p className="text-sm font-medium text-foreground">加入监控范围</p>
                <p className="text-xs text-muted-foreground">关闭后该仓库不会进入 Dashboard 监控范围。</p>
              </div>
            </button>

            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-foreground">监控分支</p>
                  <p className="text-xs text-muted-foreground">不选择分支时默认监控全部分支。</p>
                </div>
                <Button variant="outline" size="sm" onClick={onResetBranches} disabled={saving || !isRepositoryMonitored}>
                  全部分支
                </Button>
              </div>
              <div className="mt-4 space-y-2">
                {branchesQuery.isLoading ? (
                  <p className="text-sm text-muted-foreground">正在加载分支...</p>
                ) : branchesQuery.data && branchesQuery.data.length > 0 ? (
                  branchesQuery.data.map((branch) => (
                    <button
                      key={branch.name}
                      type="button"
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-secondary"
                      onClick={() => onToggleBranch(branch.name)}
                      disabled={saving || !isRepositoryMonitored}
                    >
                      <Checkbox checked={selectedBranches.includes(branch.name)} className="pointer-events-none" />
                      <span className="min-w-0 flex-1 truncate text-sm text-foreground">{branch.name}</span>
                      {branch.isDefault ? (
                        <Badge variant="secondary" className="rounded-full text-[11px]">默认</Badge>
                      ) : null}
                    </button>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">暂无可用分支。</p>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function getWebhookStatusMeta(status: WebhookStatus) {
  switch (status) {
    case WebhookStatus.ACTIVE:
      return {
        label: '已配置（GitHub 上有效）',
        Icon: CheckCircle2,
        badgeClass: 'border-success/40 bg-success/10 text-success-foreground',
      };
    case WebhookStatus.INSUFFICIENT_SCOPE:
      return {
        label: '权限不足，请重新授权',
        Icon: ShieldAlert,
        badgeClass: 'border-warning/40 bg-warning/10 text-warning-foreground',
      };
    case WebhookStatus.NOT_FOUND:
      return {
        label: 'GitHub 上不存在',
        Icon: AlertTriangle,
        badgeClass: 'border-warning/40 bg-warning/10 text-warning-foreground',
      };
    case WebhookStatus.FAILED:
      return {
        label: '配置失败',
        Icon: AlertTriangle,
        badgeClass: 'border-destructive/40 bg-destructive/10 text-destructive',
      };
    case WebhookStatus.NOT_CONFIGURED:
    default:
      return {
        label: '未配置',
        Icon: AlertTriangle,
        badgeClass: 'border-border bg-secondary text-muted-foreground',
      };
  }
}

function RepositoryWebhookSection({ repository }: { repository: Repository }) {
  const [secretVisible, setSecretVisible] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const autoRetryTriggeredRef = useRef(false);
  const statusQuery = useWebhookStatusQuery(repository.id);
  const retryMutation = useRetryWebhookMutation();
  const testMutation = useTestWebhookMutation();
  const data = statusQuery.data;

  const handleCopy = (text: string, label: string) => {
    void navigator.clipboard.writeText(text).then(
      () => toast.success(`${label}已复制`),
      () => toast.error(`复制${label}失败`),
    );
  };

  const handleRetry = async () => {
    try {
      const result = await retryMutation.mutateAsync(repository.id);
      if (result.webhookStatus === WebhookStatus.ACTIVE) {
        toast.success('Webhook 重建成功');
      } else {
        toast.warning(
          `Webhook 仍未配置成功：${result.webhookError ?? result.webhookStatus}`,
        );
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '重建失败');
    }
  };

  // OAuth 重新授权回来后自动 retry（URL 带 ?webhook_recheck=1）
  useEffect(() => {
    if (autoRetryTriggeredRef.current) {
      return;
    }
    if (searchParams.get('webhook_recheck') !== '1') {
      return;
    }
    autoRetryTriggeredRef.current = true;

    // 先清除参数避免刷新页面又触发
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('webhook_recheck');
    setSearchParams(nextParams, { replace: true });

    toast.info('授权完成，正在自动重新创建 webhook…');
    void handleRetry();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleTest = async () => {
    try {
      await testMutation.mutateAsync(repository.id);
      toast.success('已要求 GitHub 重发 ping，请稍候查看 Recent Deliveries');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '测试失败');
    }
  };

  if (statusQuery.isLoading) {
    return (
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          正在加载 webhook 状态…
        </div>
      </div>
    );
  }

  if (statusQuery.isError || !data) {
    return (
      <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4">
        <div className="flex items-center gap-2 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4" />
          无法加载 webhook 状态
        </div>
      </div>
    );
  }

  const meta = getWebhookStatusMeta(data.status);
  const StatusIcon = meta.Icon;
  const secretDisplay = data.secret
    ? secretVisible
      ? data.secret
      : '•'.repeat(Math.min(data.secret.length, 32))
    : '未生成';

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Webhook className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">Webhook 配置</span>
        </div>
        <Badge variant="outline" className={cn('gap-1 rounded-full text-[11px]', meta.badgeClass)}>
          <StatusIcon className="h-3 w-3" />
          {meta.label}
        </Badge>
      </div>

      <div className="mt-3 space-y-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="w-14 shrink-0 text-muted-foreground">URL</span>
          <code className="min-w-0 flex-1 truncate rounded bg-secondary px-2 py-1 text-foreground">
            {data.url}
          </code>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => handleCopy(data.url, 'URL')}
            aria-label="复制 URL"
          >
            <Copy className="h-3.5 w-3.5" />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <span className="w-14 shrink-0 text-muted-foreground">Secret</span>
          <code className="min-w-0 flex-1 truncate rounded bg-secondary px-2 py-1 font-mono text-foreground">
            {secretDisplay}
          </code>
          {data.secret ? (
            <>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setSecretVisible((value) => !value)}
                aria-label={secretVisible ? '隐藏 secret' : '显示 secret'}
              >
                {secretVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => handleCopy(data.secret as string, 'Secret')}
                aria-label="复制 secret"
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </>
          ) : null}
        </div>

        {data.lastError ? (
          <div className="flex items-start gap-2">
            <span className="w-14 shrink-0 text-muted-foreground">错误</span>
            <span className="min-w-0 flex-1 text-destructive">{data.lastError}</span>
          </div>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {data.status === WebhookStatus.INSUFFICIENT_SCOPE ? (
          <Button
            type="button"
            size="sm"
            variant="default"
            className="gap-1.5"
            onClick={() => {
              const returnPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
              const authUrl = authService.getGithubAuthUrl(returnPath);
              if (isDesktopRuntime()) {
                void window.repoPulseDesktop?.openExternal(authUrl);
                toast.info('已在浏览器打开 GitHub 授权页，授权完成后请回应用点 "重新创建"');
              } else {
                window.location.href = authUrl;
              }
            }}
          >
            <ShieldAlert className="h-3.5 w-3.5" />
            重新授权 GitHub 权限
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="gap-1.5"
          onClick={handleRetry}
          disabled={retryMutation.isPending}
        >
          {retryMutation.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RotateCcw className="h-3.5 w-3.5" />
          )}
          重新创建
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="gap-1.5"
          onClick={handleTest}
          disabled={testMutation.isPending || !data.webhookId}
        >
          {testMutation.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <TestTube2 className="h-3.5 w-3.5" />
          )}
          发送测试
        </Button>
      </div>
    </div>
  );
}

function RepositoryConversation({
  repository,
  messages,
  onOpenAgent,
  onApproveMessage,
  onRejectMessage,
  approvalActionId,
}: {
  repository: Repository;
  messages: ConversationMessage[];
  onOpenAgent: (prompt: string) => void;
  onApproveMessage: (message: ConversationMessage) => void;
  onRejectMessage: (message: ConversationMessage) => void;
  approvalActionId?: string;
}) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<ConversationMessage | null>(null);
  const [activeFilter, setActiveFilter] = useState<MessageFilterKey>('all');
  const filteredMessages = useMemo(
    () => messages.filter((message) => doesMessageMatchFilter(message, activeFilter)),
    [activeFilter, messages],
  );

  useEffect(() => {
    if (!contextMenu) {
      return;
    }

    function close() {
      setContextMenu(null);
    }

    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [contextMenu]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-border bg-background px-6 py-3">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-2">
          {messageFilters.map((filter) => (
            <Button
              key={filter.key}
              type="button"
              size="sm"
              variant={activeFilter === filter.key ? 'default' : 'outline'}
              className="h-8 rounded-full"
              onClick={() => setActiveFilter(filter.key)}
            >
              {filter.label}
            </Button>
          ))}
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto flex max-w-4xl flex-col gap-4 px-6 py-6">
          <RepositoryWebhookSection repository={repository} />
          {filteredMessages.length > 0 ? (
            filteredMessages.map((message) => (
              <ConversationBubble
                key={message.id}
                message={message}
                repository={repository}
                onOpenDetail={setSelectedMessage}
                onOpenAgent={onOpenAgent}
                onApproveMessage={onApproveMessage}
                onRejectMessage={onRejectMessage}
                approvalActionId={approvalActionId}
                onContextMenu={(event, selectedMessage) => {
                  event.preventDefault();
                  setContextMenu({ x: event.clientX, y: event.clientY, message: selectedMessage });
                }}
              />
            ))
          ) : (
            <div className="flex min-h-[360px] flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/40 px-6 text-center">
              <MessageSquare className="h-10 w-10 text-muted-foreground" />
              <h2 className="mt-4 text-lg font-semibold text-foreground">
                {messages.length > 0 ? '当前类型暂无消息' : '暂无真实会话消息'}
              </h2>
              <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                {messages.length > 0
                  ? '切换上方消息类型筛选，可以查看这个仓库的其他消息。'
                  : '当前仓库还没有从后端返回事件、审批或通知。新的 GitHub 事件进入系统后，会直接转化为这里的消息卡片。'}
              </p>
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="border-t border-border bg-background px-6 py-4">
        <div className="mx-auto flex max-w-4xl items-center gap-3 rounded-xl border border-border bg-card p-2">
          <Input
            className="border-0 bg-transparent focus-visible:ring-0"
            placeholder={`让 Agent 在 ${repository.fullName} 中执行任务，需要确认后才会操作`}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                onOpenAgent((event.currentTarget as HTMLInputElement).value || `检查 ${repository.fullName} 的最近风险`);
              }
            }}
          />
          <Button size="icon" onClick={() => onOpenAgent(`检查 ${repository.fullName} 的最近风险`)}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {contextMenu ? (
        <div
          className="fixed z-50 w-56 overflow-hidden rounded-xl border border-border bg-popover p-1 shadow-xl"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-secondary"
            onClick={() => onOpenAgent(`处理这条消息：${contextMenu.message.title}`)}
          >
            <Bot className="h-4 w-4" />
            使用 Agent 处理
          </button>
          <button type="button" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-secondary">
            <CheckSquare className="h-4 w-4" />
            创建审批事项
          </button>
          <button type="button" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-secondary">
            <ExternalLink className="h-4 w-4" />
            复制消息链接
          </button>
        </div>
      ) : null}

      <MessageDetailSheet
        message={selectedMessage}
        repository={repository}
        onClose={() => setSelectedMessage(null)}
        onOpenAgent={onOpenAgent}
        onApproveMessage={onApproveMessage}
        onRejectMessage={onRejectMessage}
        approvalActionId={approvalActionId}
      />
    </div>
  );
}

function InboxView({
  repositories,
  messages,
  pendingApprovalCount,
}: {
  repositories: Repository[];
  messages: ConversationMessage[];
  pendingApprovalCount: number;
}) {
  const highRiskMessages = messages.filter((message) => message.risk === 'high').slice(0, 4);

  return (
    <ScrollArea className="h-full">
      <div className="mx-auto max-w-6xl space-y-6 p-6">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-border bg-card p-5">
            <p className="text-sm text-muted-foreground">待审批</p>
            <p className="mt-3 text-3xl font-semibold text-foreground">{pendingApprovalCount}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-5">
            <p className="text-sm text-muted-foreground">高风险消息</p>
            <p className="mt-3 text-3xl font-semibold text-foreground">{highRiskMessages.length}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-5">
            <p className="text-sm text-muted-foreground">可编辑仓库</p>
            <p className="mt-3 text-3xl font-semibold text-foreground">{repositories.length}</p>
          </div>
        </div>

        <section className="rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div>
              <h2 className="font-semibold text-foreground">今日优先处理</h2>
              <p className="text-sm text-muted-foreground">来自真实仓库事件、审批和通知的会话摘要</p>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link to="/dashboard">打开旧 Dashboard</Link>
            </Button>
          </div>
          <div className="divide-y divide-border">
            {(highRiskMessages.length > 0 ? highRiskMessages : messages.slice(0, 5)).length > 0 ? (
              (highRiskMessages.length > 0 ? highRiskMessages : messages.slice(0, 5)).map((message) => (
                <Link
                  key={message.id}
                  to={`/workbench/repository/${message.sourceRepositoryId ?? repositories[0]?.id ?? ''}`}
                  className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-secondary/40"
                >
                  <ShieldAlert className={cn('h-5 w-5', message.risk === 'high' ? 'text-destructive' : 'text-muted-foreground')} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{message.title}</p>
                    <p className="truncate text-xs text-muted-foreground">{message.body}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </Link>
              ))
            ) : (
              <div className="px-5 py-12 text-center text-sm text-muted-foreground">
                暂无来自后端的事件、审批或通知。
              </div>
            )}
          </div>
        </section>
      </div>
    </ScrollArea>
  );
}

function WatchFeed({
  items,
}: {
  items: SearchResult[];
}) {
  return (
    <ScrollArea className="h-full">
      <div className="mx-auto max-w-3xl divide-y divide-border border-x border-border">
        <div className="sticky top-0 z-10 border-b border-border bg-background/95 px-5 py-4 backdrop-blur">
          <h2 className="text-xl font-semibold text-foreground">关注动态</h2>
          <p className="text-sm text-muted-foreground">了解 star 仓库和 follow 用户正在发生什么</p>
        </div>
        {items.length === 0 ? (
          <div className="px-5 py-16 text-center text-sm text-muted-foreground">
            暂无关注动态。连接 GitHub 后，star 仓库会在这里变成信息流。
          </div>
        ) : items.map((item) => (
          <article key={item.id} className="px-5 py-5 transition-colors hover:bg-secondary/20">
            <div className="flex gap-4">
              <Avatar className="h-11 w-11">
                <AvatarImage src={item.owner.avatarUrl} alt={item.owner.login} />
                <AvatarFallback>{item.owner.login.slice(0, 1).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-foreground">{item.fullName}</span>
                  <span className="text-sm text-muted-foreground">@{item.owner.login}</span>
                  <Badge variant="outline" className="rounded-full">starred</Badge>
                </div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{getWatchDescription(item)}</p>
                <div className="mt-4 rounded-xl border border-border bg-background p-4">
                  <p className="font-medium text-foreground">{item.name}</p>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{item.description || '这个仓库值得持续观察，后续可以加入监控范围。'}</p>
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-4">
                  <Button size="sm" variant="secondary" className="gap-2">
                    <Plus className="h-3.5 w-3.5" />
                    加入监控
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-2"
                    onClick={() => toast.info(`AI 将分析 ${item.fullName} 与当前项目的关联影响`)}
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    AI 分析
                  </Button>
                  <Button size="sm" variant="ghost" className="gap-2">
                    <MessageSquare className="h-3.5 w-3.5" />
                    转发
                  </Button>
                  <Button size="sm" variant="ghost" className="gap-2" asChild>
                    <a href={item.htmlUrl} target="_blank" rel="noreferrer">
                      <ExternalLink className="h-3.5 w-3.5" />
                      GitHub
                    </a>
                  </Button>
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>
    </ScrollArea>
  );
}

function AgentRunView({
  repository,
  prompt,
}: {
  repository?: Repository;
  prompt: string;
}) {
  return (
    <ScrollArea className="h-full">
      <div className="mx-auto grid max-w-6xl gap-6 p-6 xl:grid-cols-[1fr_320px]">
        <section className="rounded-xl border border-border bg-card">
          <div className="border-b border-border px-5 py-4">
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Badge variant="secondary" className="rounded-full">
                {repository ? `${repository.name}-agent` : 'workspace-agent'}
              </Badge>
              <Badge variant="outline" className="rounded-full">
                独立 Agent 会话
              </Badge>
            </div>
            <h2 className="mt-3 text-xl font-semibold text-foreground">{prompt || `检查 ${repository?.fullName ?? '当前工作台'} 的待处理事项`}</h2>
          </div>
          <div className="space-y-4 p-5">
            {['读取仓库事件与审批上下文', '生成执行计划和影响范围', '等待用户确认后执行命令'].map((step, index) => (
              <div key={step} className="flex gap-3">
                <div className={cn('mt-1 h-6 w-6 rounded-full border text-center text-xs leading-6', index < 2 ? 'border-success-foreground text-success-foreground' : 'border-primary text-primary')}>
                  {index + 1}
                </div>
                <div>
                  <p className="font-medium text-foreground">{step}</p>
                  <p className="text-sm text-muted-foreground">{index < 2 ? '已完成' : '需要确认'}</p>
                </div>
              </div>
            ))}

            <div className="rounded-xl border border-border bg-background p-4 font-mono text-sm text-muted-foreground">
              <p>$ git status --short</p>
              <p>$ pnpm --filter @repo-pulse/web test -- --runInBand</p>
              <p className="text-primary">等待确认：不会在未经确认时执行写操作</p>
            </div>

            <div className="rounded-xl border border-primary/30 bg-primary/10 p-4">
              <p className="font-semibold text-foreground">确认执行</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Agent 将基于当前仓库事件执行建议动作，并保留审批、报告和命令结果记录。
              </p>
              <div className="mt-4 flex gap-2">
                <Button className="gap-2">
                  <Command className="h-4 w-4" />
                  确认执行
                </Button>
                <Button variant="outline">继续调整计划</Button>
              </div>
            </div>
          </div>
        </section>

        <aside className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="font-semibold text-foreground">影响范围</h3>
            <div className="mt-3 space-y-2 text-sm text-muted-foreground">
              <p>仓库：{repository?.fullName ?? '未选择'}</p>
              <p>分支：{repository?.defaultBranch ?? 'main'}</p>
              <p>策略：确认后执行</p>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="font-semibold text-foreground">与 Agent 继续对话</h3>
            <div className="mt-3 flex gap-2">
              <Input placeholder="补充约束或问题" />
              <Button size="icon">
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </aside>
      </div>
    </ScrollArea>
  );
}

export function DesktopWorkbench() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const params = useParams<{ view?: string; repositoryId?: string }>();
  const [searchParams] = useSearchParams();
  const [approvalActionId, setApprovalActionId] = useState<string>();
  const [isPrimaryRailCollapsed, setIsPrimaryRailCollapsed] = useState(true);
  const [isRepositorySidebarCollapsed, setIsRepositorySidebarCollapsed] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isBranchMonitorOpen, setIsBranchMonitorOpen] = useState(false);
  const syncProgressByRepoId = useSyncProgressStore((s) => s.byRepoId);
  const syncingRepoIds = useMemo(
    () => new Set(Object.keys(syncProgressByRepoId)),
    [syncProgressByRepoId],
  );
  const repositoriesQuery = useRepositoryListQuery();
  const starredQuery = useStarredRepositoryCandidatesQuery(true);
  const notificationsQuery = useNotificationsQuery();
  const unreadNotificationCountQuery = useUnreadNotificationCountQuery();
  const repositories = useMemo(() => repositoriesQuery.data ?? [], [repositoriesQuery.data]);
  const repositoryIds = useMemo(() => repositories.map((repository) => repository.id), [repositories]);
  const selectedRepository = repositories.find((repository) => repository.id === params.repositoryId) ?? repositories[0];
  const agentRepository = repositories.find((repository) => repository.id === searchParams.get('repo')) ?? selectedRepository;
  const {
    monitoringScope,
    persistMonitoringScope,
    updatePreferencesMutation,
  } = useMonitoringScopePreferences();

  useRepositoryRealtimeSubscription(repositoryIds);

  const eventsQuery = useApiQuery({
    queryKey: ['workbench', 'events', repositoryIds.join(',')],
    queryFn: () => eventService.getAll(repositoryIds, undefined, {
      page: 1,
      pageSize: 80,
      sortBy: 'occurredAt',
      sortOrder: 'desc',
    }),
    enabled: repositoryIds.length > 0,
    staleTime: 30 * 1000,
  });

  const pendingApprovalCountQuery = useApiQuery({
    queryKey: ['workbench', 'pending-approvals', repositoryIds.join(',')],
    queryFn: () => approvalService.getPendingCount(repositoryIds),
    enabled: repositoryIds.length > 0,
    staleTime: 30 * 1000,
  });

  const approvalsQuery = useApiQuery({
    queryKey: ['workbench', 'approvals', repositoryIds.join(',')],
    queryFn: () => approvalService.getApprovals({ limit: 80, offset: 0 }),
    enabled: repositoryIds.length > 0,
    staleTime: 30 * 1000,
  });

  const allMessages = useMemo(() => {
    const eventMessages = (eventsQuery.data?.items ?? []).map(toConversationMessage);
    const approvalMessages = (approvalsQuery.data?.approvals ?? [])
      .map(toApprovalMessage)
      .filter((message): message is ConversationMessage => Boolean(message));
    const notificationMessages = (notificationsQuery.data?.notifications ?? [])
      .map(toNotificationMessage)
      .filter((message): message is ConversationMessage => Boolean(message));

    return [...eventMessages, ...approvalMessages, ...notificationMessages]
      .filter((message) => !Number.isNaN(message.createdAtMs))
      .sort((left, right) => right.createdAtMs - left.createdAtMs);
  }, [approvalsQuery.data, eventsQuery.data, notificationsQuery.data]);

  const activeView: WorkbenchView = params.repositoryId
    ? 'repository'
    : params.view === 'repositories'
      ? 'repositories'
      : params.view === 'watch'
      ? 'watch'
      : params.view === 'dashboard'
        ? 'dashboard'
        : params.view === 'reports'
          ? 'reports'
          : params.view === 'agent'
            ? 'agent'
            : params.view === 'settings'
              ? 'settings'
              : 'inbox';
  const shouldShowRepositorySidebar = activeView === 'inbox' || activeView === 'repository';

  const selectedMessages = getRepoMessages(selectedRepository?.id, allMessages);
  const unreadCount = unreadNotificationCountQuery.data?.count ?? allMessages.length;
  const pendingApprovalCount = pendingApprovalCountQuery.data?.count ?? 0;
  const monitoredRepositoryIds = monitoringScope.repositoryIds ?? [];
  const selectedRepositoryBranches = selectedRepository
    ? monitoringScope.repositoryBranchScopes?.[selectedRepository.id] ?? []
    : [];

  const openAgent = (prompt?: string, repository = selectedRepository) => {
    const params = new URLSearchParams();
    if (repository?.id) {
      params.set('repo', repository.id);
    }
    if (prompt) {
      params.set('prompt', prompt);
    }
    navigate(`/workbench/agent?${params.toString()}`);
  };

  const refreshApprovalMessages = async () => {
    await Promise.all([
      approvalsQuery.refetch(),
      pendingApprovalCountQuery.refetch(),
      queryClient.invalidateQueries({ queryKey: notificationQueryKeys.all }),
    ]);
    window.dispatchEvent(new Event('approval-updated'));
  };

  const handleApproveMessage = async (message: ConversationMessage) => {
    if (!message.approvalId) {
      return;
    }

    setApprovalActionId(message.approvalId);
    try {
      await approvalService.approve(message.approvalId);
      toast.success('审批已通过');
      await refreshApprovalMessages();
    } catch (error) {
      console.error(error);
      toast.error('审批通过失败');
    } finally {
      setApprovalActionId(undefined);
    }
  };

  const handleRejectMessage = async (message: ConversationMessage) => {
    if (!message.approvalId) {
      return;
    }

    setApprovalActionId(message.approvalId);
    try {
      await approvalService.reject(message.approvalId);
      toast.success('审批已拒绝');
      await refreshApprovalMessages();
    } catch (error) {
      console.error(error);
      toast.error('审批拒绝失败');
    } finally {
      setApprovalActionId(undefined);
    }
  };

  const persistSelectedRepositoryScope = async (
    nextRepositoryIds: string[],
    nextRepositoryBranchScopes = monitoringScope.repositoryBranchScopes ?? {},
  ) => {
    await persistMonitoringScope({
      repositoryIds: nextRepositoryIds,
      branchNames: [],
      repositoryBranchScopes: nextRepositoryBranchScopes,
    });
  };

  const handleToggleSelectedRepositoryMonitoring = async () => {
    if (!selectedRepository) {
      return;
    }

    const nextRepositoryIds = monitoredRepositoryIds.includes(selectedRepository.id)
      ? monitoredRepositoryIds.filter((repositoryId) => repositoryId !== selectedRepository.id)
      : [...monitoredRepositoryIds, selectedRepository.id];
    const nextBranchScopes = { ...(monitoringScope.repositoryBranchScopes ?? {}) };
    if (!nextRepositoryIds.includes(selectedRepository.id)) {
      delete nextBranchScopes[selectedRepository.id];
    }

    await persistSelectedRepositoryScope(nextRepositoryIds, nextBranchScopes);
    toast.success('分支监控范围已更新');
  };

  const handleToggleSelectedRepositoryBranch = async (branchName: string) => {
    if (!selectedRepository) {
      return;
    }

    const currentRepositoryIds = monitoredRepositoryIds.includes(selectedRepository.id)
      ? monitoredRepositoryIds
      : [...monitoredRepositoryIds, selectedRepository.id];
    const currentBranches = monitoringScope.repositoryBranchScopes?.[selectedRepository.id] ?? [];
    const nextBranches = currentBranches.includes(branchName)
      ? currentBranches.filter((branch) => branch !== branchName)
      : [...currentBranches, branchName].sort((left, right) => left.localeCompare(right));

    await persistSelectedRepositoryScope(currentRepositoryIds, {
      ...(monitoringScope.repositoryBranchScopes ?? {}),
      [selectedRepository.id]: nextBranches,
    });
    toast.success('分支监控范围已更新');
  };

  const handleResetSelectedRepositoryBranches = async () => {
    if (!selectedRepository) {
      return;
    }

    const nextBranchScopes = { ...(monitoringScope.repositoryBranchScopes ?? {}) };
    delete nextBranchScopes[selectedRepository.id];
    const currentRepositoryIds = monitoredRepositoryIds.includes(selectedRepository.id)
      ? monitoredRepositoryIds
      : [...monitoredRepositoryIds, selectedRepository.id];

    await persistSelectedRepositoryScope(currentRepositoryIds, nextBranchScopes);
    toast.success('已切换为监控全部分支');
  };

  const removeRepositoryFromMonitoring = async (repository: Repository) => {
    const nextRepositoryIds = monitoredRepositoryIds.filter((repositoryId) => repositoryId !== repository.id);
    const nextBranchScopes = { ...(monitoringScope.repositoryBranchScopes ?? {}) };
    delete nextBranchScopes[repository.id];

    await persistMonitoringScope({
      repositoryIds: nextRepositoryIds,
      branchNames: [],
      repositoryBranchScopes: nextBranchScopes,
    });
    toast.success(`${repository.fullName} 已移出监控范围`);
  };

  const toggleRepositoryActive = async (repository: Repository) => {
    try {
      await repositoryService.update(repository.id, { isActive: !repository.isActive });
      await queryClient.invalidateQueries({ queryKey: repositoryQueryKeys.all });
      toast.success(repository.isActive ? '仓库已停用' : '仓库已启用');
    } catch (error) {
      console.error(error);
      toast.error('更新仓库状态失败');
    }
  };

  const syncRepository = async (repository: Repository) => {
    if (syncingRepoIds.has(repository.id)) {
      return;
    }
    try {
      const { jobId } = await repositoryService.sync(repository.id);
      useSyncProgressStore.getState().start(repository.id, jobId);
      toast.success(`已开始同步 ${repository.fullName}`);
    } catch (error) {
      console.error(error);
      toast.error('同步入队失败');
    }
  };

  const openRepository = (repository: Repository) => {
    window.open(repository.url, '_blank', 'noopener,noreferrer');
  };

  const deleteRepository = async (repository: Repository) => {
    const confirmed = window.confirm(`确定要移除 ${repository.fullName} 吗？`);
    if (!confirmed) {
      return;
    }

    try {
      await repositoryService.delete(repository.id);
      await queryClient.invalidateQueries({ queryKey: repositoryQueryKeys.all });
      if (selectedRepository?.id === repository.id) {
        navigate('/workbench', { replace: true });
      }
      toast.success(`${repository.fullName} 已移除`);
    } catch (error) {
      console.error(error);
      toast.error('移除仓库失败');
    }
  };

  return (
    <TooltipProvider>
      <div className="flex h-screen overflow-hidden bg-background text-foreground">
        <PrimaryRail
          activeView={activeView}
          unreadCount={unreadCount}
          collapsed={isPrimaryRailCollapsed}
          onToggleCollapsed={() => setIsPrimaryRailCollapsed((current) => !current)}
        />
        {shouldShowRepositorySidebar ? (
          <RepositorySidebar
            repositories={repositories}
            selectedRepositoryId={activeView === 'repository' ? selectedRepository?.id : undefined}
            messages={allMessages}
            monitoredRepositoryIds={monitoredRepositoryIds}
            syncingRepoIds={syncingRepoIds}
            collapsed={isRepositorySidebarCollapsed}
            onToggleCollapsed={() => setIsRepositorySidebarCollapsed((current) => !current)}
            onRemoveFromMonitoring={removeRepositoryFromMonitoring}
            onToggleRepositoryActive={toggleRepositoryActive}
            onSyncRepository={syncRepository}
            onOpenRepository={openRepository}
            onDeleteRepository={deleteRepository}
          />
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col">
          <WorkbenchHeader
            activeView={activeView}
            repository={selectedRepository}
            onAgent={() => openAgent(undefined, selectedRepository)}
            onSearch={() => setIsSearchOpen(true)}
            onOpenBranchMonitor={() => setIsBranchMonitorOpen(true)}
          />
          <main className="min-h-0 flex-1 overflow-hidden">
            {activeView === 'repository' && selectedRepository ? (
              <RepositoryConversation
                repository={selectedRepository}
                messages={selectedMessages}
                onOpenAgent={(prompt) => openAgent(prompt, selectedRepository)}
                onApproveMessage={handleApproveMessage}
                onRejectMessage={handleRejectMessage}
                approvalActionId={approvalActionId}
              />
            ) : null}

            {activeView === 'inbox' ? (
              <InboxView
                repositories={repositories}
                messages={allMessages}
                pendingApprovalCount={pendingApprovalCount}
              />
            ) : null}

            {activeView === 'watch' ? (
              <WatchFeed items={starredQuery.data ?? []} />
            ) : null}

            {activeView === 'repositories' ? (
              <ScrollArea className="h-full">
                <div className="p-6">
                  <Repositories />
                </div>
              </ScrollArea>
            ) : null}

            {activeView === 'dashboard' ? (
              <ScrollArea className="h-full">
                <div className="p-6">
                  <Dashboard scopedRepositoryId={searchParams.get('repositoryId') ?? undefined} />
                </div>
              </ScrollArea>
            ) : null}

            {activeView === 'reports' ? (
              <ScrollArea className="h-full">
                <div className="p-6">
                  <Reports />
                </div>
              </ScrollArea>
            ) : null}

            {activeView === 'agent' ? (
              <AgentRunView
                repository={agentRepository}
                prompt={searchParams.get('prompt') ?? ''}
              />
            ) : null}

            {activeView === 'settings' ? (
              <ScrollArea className="h-full">
                <div className="p-6">
                  <SettingsPage />
                </div>
              </ScrollArea>
            ) : null}
          </main>
        </div>
        <ConversationSearchSheet
          open={isSearchOpen}
          query={searchQuery}
          messages={allMessages}
          repositories={repositories}
          selectedRepository={activeView === 'repository' ? selectedRepository : undefined}
          onQueryChange={setSearchQuery}
          onOpenChange={setIsSearchOpen}
        />
        <BranchMonitorSheet
          open={isBranchMonitorOpen}
          repository={selectedRepository}
          monitoredRepositoryIds={monitoredRepositoryIds}
          selectedBranches={selectedRepositoryBranches}
          saving={updatePreferencesMutation.isPending}
          onOpenChange={setIsBranchMonitorOpen}
          onToggleRepository={handleToggleSelectedRepositoryMonitoring}
          onToggleBranch={handleToggleSelectedRepositoryBranch}
          onResetBranches={handleResetSelectedRepositoryBranches}
        />
      </div>
    </TooltipProvider>
  );
}
