import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  Bot,
  CheckSquare,
  ChevronRight,
  CircleDot,
  Command,
  ExternalLink,
  FileText,
  GitBranch,
  Github,
  LayoutDashboard,
  MessageSquare,
  Plus,
  Search,
  Send,
  Settings,
  ShieldAlert,
  Sparkles,
  Star,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
  useRepositoryListQuery,
  useStarredRepositoryCandidatesQuery,
} from '@/hooks/queries/use-repository-queries';
import {
  useNotificationsQuery,
  notificationQueryKeys,
  useUnreadNotificationCountQuery,
} from '@/hooks/queries/use-notification-queries';
import { useRepositoryRealtimeSubscription } from '@/hooks/use-web-socket';
import { eventService } from '@/services/event.service';
import { approvalService, type Approval } from '@/services/approval.service';
import type { Notification } from '@/services/notification.service';
import { Dashboard } from '@/pages/Dashboard';
import { Reports } from '@/pages/Reports';
import { Settings as SettingsPage } from '@/pages/Settings';
import type { Event, Repository, SearchResult } from '@/types/api';

type WorkbenchView = 'inbox' | 'repository' | 'watch' | 'dashboard' | 'reports' | 'agent' | 'settings';

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

const routeByView: Record<Exclude<WorkbenchView, 'repository'>, string> = {
  inbox: '/workbench',
  watch: '/workbench/watch',
  dashboard: '/workbench/dashboard',
  reports: '/workbench/reports',
  agent: '/workbench/agent',
  settings: '/workbench/settings',
};

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

function getWatchDescription(item: SearchResult) {
  const language = item.language ? `${item.language} · ` : '';
  return `${language}${item.stargazersCount.toLocaleString()} stars · ${item.description || '关注仓库正在发生新的生态变化'}`;
}

function PrimaryRail({
  activeView,
  unreadCount,
}: {
  activeView: WorkbenchView;
  unreadCount: number;
}) {
  const railItems = [
    { view: 'inbox' as const, label: '仓库会话', icon: MessageSquare },
    { view: 'watch' as const, label: '关注动态', icon: Star },
    { view: 'agent' as const, label: 'Agent 会话', icon: Bot },
    { view: 'settings' as const, label: '设置', icon: Settings },
  ];

  return (
    <aside className="desktop-drag flex h-screen w-[72px] shrink-0 flex-col items-center border-r border-border bg-card pt-8">
      <Link
        to="/workbench"
        className="desktop-no-drag mb-6 flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/40 bg-primary/10 text-sm font-bold text-primary"
        aria-label="Repo-Pulse"
      >
        RP
      </Link>

      <nav className="desktop-no-drag flex flex-1 flex-col items-center gap-3">
        {railItems.map((item) => {
          const Icon = item.icon;
          const active = activeView === item.view || (item.view === 'inbox' && activeView === 'repository');
          return (
            <Tooltip key={item.view}>
              <TooltipTrigger asChild>
                <Link
                  to={routeByView[item.view]}
                  className={cn(
                    'relative flex h-11 w-11 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground',
                    active && 'bg-secondary text-foreground',
                  )}
                  aria-label={item.label}
                >
                  <Icon className="h-5 w-5" />
                  {item.view === 'inbox' && unreadCount > 0 ? (
                    <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-primary" />
                  ) : null}
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right">{item.label}</TooltipContent>
            </Tooltip>
          );
        })}
      </nav>
    </aside>
  );
}

function RepositorySidebar({
  repositories,
  selectedRepositoryId,
  messages,
}: {
  repositories: Repository[];
  selectedRepositoryId?: string;
  messages: ConversationMessage[];
}) {
  const sortedRepositories = useMemo(
    () => [...repositories].sort((left, right) => {
      const leftHasMessages = hasRepositoryMessages(left, messages);
      const rightHasMessages = hasRepositoryMessages(right, messages);
      if (leftHasMessages !== rightHasMessages) {
        return rightHasMessages ? 1 : -1;
      }

      const rightLatestAt = getRepositorySortTime(right, messages);
      const leftLatestAt = getRepositorySortTime(left, messages);
      return rightLatestAt - leftLatestAt;
    }),
    [messages, repositories],
  );

  return (
    <aside className="hidden h-screen w-[320px] shrink-0 border-r border-border bg-background/60 lg:block">
      <div className="desktop-drag border-b border-border px-4 pb-4 pt-9">
        <div className="desktop-no-drag flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground">Editable repositories</p>
            <h2 className="text-lg font-semibold text-foreground">仓库会话</h2>
          </div>
          <Button size="icon" variant="outline" className="h-9 w-9" asChild>
            <Link to="/repositories" aria-label="添加仓库">
              <Plus className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>

      <ScrollArea className="h-[calc(100vh-98px)]">
        <div className="space-y-1 p-3">
          {sortedRepositories.map((repo) => {
            const repoMessages = getRepoMessages(repo.id, messages);
            const selected = repo.id === selectedRepositoryId;
            const unread = Math.min(repoMessages.filter((message) => message.risk !== 'low').length || repo._count?.events || 0, 99);
            const avatarUrl = getRepositoryAvatarUrl(repo);
            return (
              <Link
                key={repo.id}
                to={`/workbench/repository/${repo.id}`}
                className={cn(
                  'flex min-w-0 gap-3 rounded-xl border border-transparent px-3 py-3 text-left transition-colors hover:bg-secondary/70',
                  selected && 'border-primary/30 bg-primary/10',
                )}
              >
                <Avatar className="h-11 w-11 rounded-xl">
                  <AvatarImage src={avatarUrl} alt={repo.fullName} className="object-cover" />
                  <AvatarFallback className="rounded-xl bg-secondary text-sm font-semibold">
                    {getRepoInitial(repo)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold text-foreground">{repo.fullName}</p>
                    {unread > 0 ? (
                      <Badge className="h-5 rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">
                        {unread}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {getLatestRepoMessage(repo, messages)}
                  </p>
                  <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                    <GitBranch className="h-3 w-3" />
                    <span className="truncate">{repo.defaultBranch}</span>
                    <CircleDot className={cn('h-3 w-3', repo.isActive ? 'text-success-foreground' : 'text-muted-foreground')} />
                    <span>{repo.isActive ? '监控中' : '已暂停'}</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </ScrollArea>
    </aside>
  );
}

function WorkbenchHeader({
  activeView,
  repository,
  onAgent,
}: {
  activeView: WorkbenchView;
  repository?: Repository;
  onAgent: () => void;
}) {
  const titleByView: Record<WorkbenchView, string> = {
    inbox: '今日工作台',
    repository: repository?.fullName ?? '仓库会话',
    watch: '关注动态',
    dashboard: '仓库看板',
    reports: '报告中心',
    agent: 'Agent 会话',
    settings: '设置',
  };
  const repositoryAvatarUrl = repository ? getRepositoryAvatarUrl(repository) : undefined;

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
            <Button size="icon" variant="outline" aria-label="搜索会话">
              <Search className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>搜索会话</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="icon" variant="outline" asChild aria-label="看板">
              <Link to="/workbench/dashboard">
                <LayoutDashboard className="h-4 w-4" />
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent>仓库看板</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="icon" variant="outline" aria-label="分支监控">
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
        <div className="prose prose-sm prose-invert mt-2 line-clamp-3 max-w-none text-muted-foreground prose-p:my-1 prose-pre:my-2 prose-pre:bg-background prose-code:text-foreground">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {message.body}
          </ReactMarkdown>
        </div>
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
                <div className="prose prose-sm prose-invert max-w-none text-muted-foreground prose-headings:text-foreground prose-a:text-info-foreground prose-pre:border prose-pre:border-border prose-pre:bg-background prose-code:text-foreground">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {message.body}
                  </ReactMarkdown>
                </div>
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
      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto flex max-w-4xl flex-col gap-4 px-6 py-6">
          {messages.length > 0 ? (
            messages.map((message) => (
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
              <h2 className="mt-4 text-lg font-semibold text-foreground">暂无真实会话消息</h2>
              <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                当前仓库还没有从后端返回事件、审批或通知。新的 GitHub 事件进入系统后，会直接转化为这里的消息卡片。
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

function ContextPanel({
  repository,
  messages,
  pendingApprovalCount,
}: {
  repository?: Repository;
  messages: ConversationMessage[];
  pendingApprovalCount: number;
}) {
  const highRiskCount = messages.filter((message) => message.risk === 'high').length;

  return (
    <aside className="hidden h-screen w-[300px] shrink-0 border-l border-border bg-background/60 xl:block">
      <div className="desktop-drag border-b border-border px-4 pb-4 pt-9">
        <p className="text-xs text-muted-foreground">Context</p>
        <h2 className="text-lg font-semibold text-foreground">上下文</h2>
      </div>
      <div className="space-y-4 p-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-sm font-medium text-foreground">仓库健康</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <p className="text-2xl font-semibold text-foreground">{highRiskCount}</p>
              <p className="text-xs text-muted-foreground">风险消息</p>
            </div>
            <div>
              <p className="text-2xl font-semibold text-foreground">{pendingApprovalCount}</p>
              <p className="text-xs text-muted-foreground">待审批</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-sm font-medium text-foreground">分支监控</p>
          <p className="mt-2 text-sm text-muted-foreground">{repository?.defaultBranch ?? '选择仓库后显示默认分支'}</p>
          <Button variant="outline" size="sm" className="mt-3 w-full gap-2">
            <GitBranch className="h-4 w-4" />
            管理监控分支
          </Button>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-sm font-medium text-foreground">复用入口</p>
          <div className="mt-3 grid gap-2">
            <Button variant="secondary" size="sm" asChild>
              <Link to="/workbench/dashboard">看板</Link>
            </Button>
            <Button variant="secondary" size="sm" asChild>
              <Link to="/workbench/reports">报告</Link>
            </Button>
            <Button variant="secondary" size="sm" asChild>
              <Link to="/workbench/settings">设置</Link>
            </Button>
          </div>
        </div>
      </div>
    </aside>
  );
}

export function DesktopWorkbench() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const params = useParams<{ view?: string; repositoryId?: string }>();
  const [searchParams] = useSearchParams();
  const [approvalActionId, setApprovalActionId] = useState<string>();
  const repositoriesQuery = useRepositoryListQuery();
  const starredQuery = useStarredRepositoryCandidatesQuery(true);
  const notificationsQuery = useNotificationsQuery();
  const unreadNotificationCountQuery = useUnreadNotificationCountQuery();
  const repositories = useMemo(() => repositoriesQuery.data ?? [], [repositoriesQuery.data]);
  const repositoryIds = useMemo(() => repositories.map((repository) => repository.id), [repositories]);
  const selectedRepository = repositories.find((repository) => repository.id === params.repositoryId) ?? repositories[0];
  const agentRepository = repositories.find((repository) => repository.id === searchParams.get('repo')) ?? selectedRepository;

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

  const selectedMessages = getRepoMessages(selectedRepository?.id, allMessages);
  const unreadCount = unreadNotificationCountQuery.data?.count ?? allMessages.length;
  const pendingApprovalCount = pendingApprovalCountQuery.data?.count ?? 0;

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

  return (
    <TooltipProvider>
      <div className="flex h-screen overflow-hidden bg-background text-foreground">
        <PrimaryRail activeView={activeView} unreadCount={unreadCount} />
        <RepositorySidebar
          repositories={repositories}
          selectedRepositoryId={selectedRepository?.id}
          messages={allMessages}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <WorkbenchHeader
            activeView={activeView}
            repository={selectedRepository}
            onAgent={() => openAgent(undefined, selectedRepository)}
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

            {activeView === 'dashboard' ? (
              <ScrollArea className="h-full">
                <div className="p-6">
                  <Dashboard />
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
        <ContextPanel
          repository={selectedRepository}
          messages={selectedMessages}
          pendingApprovalCount={pendingApprovalCount}
        />
      </div>
    </TooltipProvider>
  );
}
