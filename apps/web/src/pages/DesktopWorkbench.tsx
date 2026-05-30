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
  Bell,
  Bot,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Command,
  Eye,
  EyeOff,
  ExternalLink,
  FileText,
  Filter,
  GitBranch,
  Github,
  LayoutDashboard,
  Loader2,
  LogOut,
  MessageSquare,
  PauseCircle,
  Pin,
  PinOff,
  Plus,
  RotateCcw,
  Search,
  Send,
  Settings,
  ShieldAlert,
  Sparkles,
  Star,
  SlidersHorizontal,
  CheckCheck,
  Trash2,
  VolumeX,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useApiQuery } from '@/lib/query-hooks';
import {
  useRepositoryBranchesQuery,
  useRepositoryListQuery,
  repositoryQueryKeys,
  useSearchRepositoryCandidatesQuery,
} from '@/hooks/queries/use-repository-queries';
import {
  useChatRepositoriesQuery,
  useConversationMessagesQuery,
  useWatchFeedQuery,
} from '@/hooks/queries/use-workbench-queries';
import { useMonitoringScopePreferences } from '@/hooks/use-monitoring-scope-preferences';
import {
  useNotificationsQuery,
  notificationQueryKeys,
  useUnreadNotificationCountQuery,
} from '@/hooks/queries/use-notification-queries';
import {
  useCurrentUserQuery,
  useLogoutMutation,
} from '@/hooks/queries/use-auth-queries';
import { useRepositoryRealtimeSubscription } from '@/hooks/use-web-socket';
import { eventService } from '@/services/event.service';
import { approvalService, type Approval } from '@/services/approval.service';
import { repositoryService } from '@/services/repository.service';
import { workbenchService } from '@/services/workbench.service';
import { getApiBaseUrl } from '@/lib/desktop';
import {
  useWorkbenchUnreadStore,
  type WorkbenchUnreadBoundary,
} from '@/stores/workbench-unread.store';
import type { Notification } from '@/services/notification.service';
import { Dashboard } from '@/pages/Dashboard';
import { Repositories } from '@/pages/Repositories';
import { Reports } from '@/pages/Reports';
import { Settings as SettingsPage } from '@/pages/Settings';
import type {
  Event,
  Repository,
  SearchResult,
  ChatRepositoryItem,
  WorkbenchConversationMessage,
  WorkbenchConversationState,
  MessageAction,
  RiskLevel,
  WatchFeedItem,
  WatchRepositoryItem,
} from '@/types/api';

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
  /** 当前仓库是否可操作（控制 requiresPermission actions 的显示） */
  repositoryCanOperate?: boolean;
  /** 后端返回的操作按钮列表 */
  actions?: MessageAction[];
  /** 后端返回的风险等级 */
  riskLevel?: RiskLevel;
  /** 是否未读（来自后端） */
  isUnread?: boolean;
  /** 是否有待审批动作（来自后端） */
  hasPendingApprovalAction?: boolean;
  /** 是否有待 Agent 动作（来自后端） */
  hasPendingAgentAction?: boolean;
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
const CONTEXT_MENU_VIEWPORT_PADDING = 12;
const REPOSITORY_CONTEXT_MENU_WIDTH = 280;
const REPOSITORY_CONTEXT_MENU_ESTIMATED_HEIGHT = 420;
const MESSAGE_CONTEXT_MENU_WIDTH = 224;
const MESSAGE_CONTEXT_MENU_ESTIMATED_HEIGHT = 136;

function clampRepositorySidebarWidth(width: number) {
  return Math.min(MAX_REPOSITORY_SIDEBAR_WIDTH, Math.max(MIN_REPOSITORY_SIDEBAR_WIDTH, width));
}

function getSafeContextMenuPosition(
  clientX: number,
  clientY: number,
  menuWidth: number,
  menuHeight: number,
) {
  if (typeof window === 'undefined') {
    return { x: clientX, y: clientY };
  }

  const maxX = Math.max(CONTEXT_MENU_VIEWPORT_PADDING, window.innerWidth - menuWidth - CONTEXT_MENU_VIEWPORT_PADDING);
  const maxY = Math.max(CONTEXT_MENU_VIEWPORT_PADDING, window.innerHeight - menuHeight - CONTEXT_MENU_VIEWPORT_PADDING);

  return {
    x: Math.min(Math.max(clientX, CONTEXT_MENU_VIEWPORT_PADDING), maxX),
    y: Math.min(Math.max(clientY, CONTEXT_MENU_VIEWPORT_PADDING), maxY),
  };
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

function getTimestamp(value?: string | null) {
  if (!value) {
    return null;
  }

  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function isMessageCoveredByRead(messageAt?: string | null, readAt?: string | null) {
  const readAtMs = getTimestamp(readAt);
  if (readAtMs === null) {
    return false;
  }

  const messageAtMs = getTimestamp(messageAt);
  if (messageAtMs === null) {
    return true;
  }

  return messageAtMs <= readAtMs;
}

function getLatestWorkbenchMessageAt(messages: Array<Pick<WorkbenchConversationMessage, 'createdAt'>>) {
  return messages.reduce<string | null>((latest, message) => {
    const messageAt = getTimestamp(message.createdAt);
    if (messageAt === null) {
      return latest;
    }

    const latestAt = getTimestamp(latest);
    return latestAt === null || messageAt > latestAt ? message.createdAt : latest;
  }, null);
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

/** Derive GitHub avatar URL from a WatchFeedItem's repositoryFullName (e.g. "owner/repo") */
function getWatchFeedAvatarUrl(repositoryFullName: string) {
  const owner = repositoryFullName.split('/')[0];
  if (!owner) return undefined;
  return `https://github.com/${encodeURIComponent(owner)}.png`;
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

function riskLevelToRisk(riskLevel?: RiskLevel): ConversationMessage['risk'] {
  switch (riskLevel) {
    case 'CRITICAL':
    case 'HIGH':
      return 'high';
    case 'MEDIUM':
      return 'medium';
    case 'LOW':
    default:
      return 'low';
  }
}

function workbenchMessageToConversationMessage(
  msg: WorkbenchConversationMessage,
  conversationState?: WorkbenchConversationState,
): ConversationMessage {
  const createdAtMs = new Date(msg.createdAt).getTime();
  const risk = riskLevelToRisk(msg.riskLevel);

  let kind: ConversationMessage['kind'] = 'event';
  if (msg.type === 'approval') kind = 'approval';
  else if (msg.type === 'notification') kind = 'notification';

  let eventTypeLabel: string | undefined;
  switch (msg.type) {
    case 'issue':
      eventTypeLabel = 'Issue';
      break;
    case 'pull_request':
      eventTypeLabel = 'Pull Request';
      break;
    case 'push':
      eventTypeLabel = 'Push';
      break;
    case 'release':
      eventTypeLabel = 'Release';
      break;
    case 'security':
      eventTypeLabel = 'Security';
      break;
    case 'approval':
      eventTypeLabel = '审批';
      break;
    case 'notification':
      eventTypeLabel = '通知';
      break;
    case 'agent':
      eventTypeLabel = 'Agent';
      break;
  }

  return {
    id: msg.id,
    kind,
    title: msg.title,
    body: msg.body,
    author: msg.author,
    time: formatRelativeTime(msg.createdAt),
    createdAtMs,
    risk,
    eventTypeLabel,
    externalUrl: msg.externalUrl,
    authorAvatar: msg.authorAvatar,
    approvalId: msg.approvalId,
    approvalStatus: msg.approvalStatus as Approval['status'],
    sourceRepositoryId: msg.repositoryId,
    repositoryCanOperate: msg.repositoryCanOperate,
    actions: msg.actions,
    riskLevel: msg.riskLevel,
    isUnread: msg.isUnread,
    hasPendingApprovalAction: msg.hasPendingApprovalAction,
    hasPendingAgentAction: msg.hasPendingAgentAction,
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
  isPinned,
  onRemoveFromMonitoring,
  onToggleRepositoryActive,
  onSyncRepository,
  onOpenRepository,
  onDeleteRepository,
  onPinRepository,
  onUnpinRepository,
  onMarkRead,
  onFilterByType,
}: {
  repository: Repository;
  isMonitored: boolean;
  isSyncing: boolean;
  isPinned?: boolean;
  onRemoveFromMonitoring: (repository: Repository) => void;
  onToggleRepositoryActive: (repository: Repository) => void;
  onSyncRepository: (repository: Repository) => void;
  onOpenRepository: (repository: Repository) => void;
  onDeleteRepository: (repository: Repository) => void;
  onPinRepository: (repository: Repository) => void;
  onUnpinRepository: (repository: Repository) => void;
  onMarkRead: (repository: Repository) => void;
  onFilterByType: (repository: Repository, type: string) => void;
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
      label: isSyncing ? '同步中…' : '同步',
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
    isPinned
      ? {
          key: 'unpin',
          label: '取消置顶',
          icon: PinOff,
          onSelect: () => onUnpinRepository(repository),
        }
      : {
          key: 'pin',
          label: '置顶会话',
          icon: Pin,
          onSelect: () => onPinRepository(repository),
        },
    {
      key: 'mark-read',
      label: '标记已读',
      icon: Eye,
      onSelect: () => onMarkRead(repository),
    },
    { key: 'separator-filter', separator: true },
    {
      key: 'filter-issue',
      label: '只看 Issue',
      icon: Filter,
      onSelect: () => onFilterByType(repository, 'issue'),
    },
    {
      key: 'filter-pr',
      label: '只看 PR',
      icon: Filter,
      onSelect: () => onFilterByType(repository, 'pull-request'),
    },
    {
      key: 'filter-push',
      label: '只看 Push',
      icon: Filter,
      onSelect: () => onFilterByType(repository, 'push'),
    },
    { key: 'separator-3', separator: true },
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
  editableRepos,
  monitoredRepos,
  selectedRepositoryId,
  syncingRepoIds,
  pinnedRepoIds,
  collapsed,
  onToggleCollapsed,
  onRemoveFromMonitoring,
  onToggleRepositoryActive,
  onSyncRepository,
  onOpenRepository,
  onDeleteRepository,
  onPinRepository,
  onUnpinRepository,
  onMarkRead,
  onFilterByType,
  newlyMonitoredRepoIds,
}: {
  editableRepos: ChatRepositoryItem[];
  monitoredRepos: ChatRepositoryItem[];
  selectedRepositoryId?: string;
  syncingRepoIds: Set<string>;
  pinnedRepoIds: Set<string>;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onRemoveFromMonitoring: (repository: Repository) => void;
  onToggleRepositoryActive: (repository: Repository) => void;
  onSyncRepository: (repository: Repository) => void;
  onOpenRepository: (repository: Repository) => void;
  onDeleteRepository: (repository: Repository) => void;
  onPinRepository: (repository: Repository) => void;
  onUnpinRepository: (repository: Repository) => void;
  onMarkRead: (repository: Repository) => void;
  onFilterByType: (repository: Repository, type: string) => void;
  newlyMonitoredRepoIds?: Set<string>;
}) {
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_REPOSITORY_SIDEBAR_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const [contextMenu, setContextMenu] = useState<RepositoryContextMenuState | null>(null);
  const [repositorySearch, setRepositorySearch] = useState('');
  const optimisticReadAtByRepository = useWorkbenchUnreadStore(
    (state) => state.optimisticReadAtByRepository,
  );
  const resizeStartRef = useRef({
    clientX: 0,
    width: DEFAULT_REPOSITORY_SIDEBAR_WIDTH,
  });
  const normalizedRepositorySearch = repositorySearch.trim().toLowerCase();

  const filterBySearch = (items: ChatRepositoryItem[]) =>
    items.filter((item) => {
      if (!normalizedRepositorySearch) {
        // 没有搜索词时，隐藏尚无可渲染消息的仓库。
        // 但如果是当前选中的、置顶的，或者刚刚加入监控的仓库，则强制展示，避免新加入侧边栏找不到。
        return (
          !!item.latestMessagePreview ||
          item.repository.id === selectedRepositoryId ||
          pinnedRepoIds.has(item.repository.id) ||
          newlyMonitoredRepoIds?.has(item.repository.id)
        );
      }
      return [
        item.repository.name,
        item.repository.fullName,
        item.repository.defaultBranch,
        item.latestMessagePreview,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(normalizedRepositorySearch);
    });

  const sortWithPinned = (items: ChatRepositoryItem[]) =>
    [...items].sort((left, right) => {
      const leftPinned = pinnedRepoIds.has(left.repository.id);
      const rightPinned = pinnedRepoIds.has(right.repository.id);
      if (leftPinned !== rightPinned) {
        return rightPinned ? 1 : -1;
      }
      // Then sort by latest message
      const leftAt = left.latestMessageAt ? new Date(left.latestMessageAt).getTime() : 0;
      const rightAt = right.latestMessageAt ? new Date(right.latestMessageAt).getTime() : 0;
      return rightAt - leftAt;
    });

  const filteredEditable = sortWithPinned(filterBySearch(editableRepos));
  const filteredMonitored = sortWithPinned(filterBySearch(monitoredRepos));
  const allFilteredRepos = [...filteredEditable, ...filteredMonitored];

  function getEffectiveUnread(item: ChatRepositoryItem): number {
    const optimisticReadAt = optimisticReadAtByRepository[item.repository.id];
    if (isMessageCoveredByRead(item.latestMessageAt, optimisticReadAt)) {
      return 0;
    }

    return item.unreadCount || 0;
  }

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

  function renderRepoListItem(item: ChatRepositoryItem, kind: 'editable' | 'monitored-readonly') {
    const repo = item.repository;
    const selected = repo.id === selectedRepositoryId;
    const unread = Math.min(getEffectiveUnread(item), 99);
    const avatarUrl = getRepositoryAvatarUrl(repo);
    const latestMessage = item.latestMessagePreview || '等待新的仓库事件';
    const isSyncing = syncingRepoIds.has(repo.id);
    const hasPendingApproval = item.hasPendingApproval || item.pendingApprovalCount > 0;
    const hasPendingAgentAction = item.hasPendingAgentAction || item.pendingAgentActionCount > 0;
    const hasUnreadRiskAttention =
      unread > 0 && (item.unreadRiskLevel === 'HIGH' || item.unreadRiskLevel === 'CRITICAL');
    const hasAttention = unread > 0 || hasPendingApproval || hasPendingAgentAction || hasUnreadRiskAttention;

    return (
      <Link
        key={repo.id}
        to={`/workbench/repository/${repo.id}`}
        onContextMenu={(event) => {
          event.preventDefault();
          const position = getSafeContextMenuPosition(
            event.clientX,
            event.clientY,
            REPOSITORY_CONTEXT_MENU_WIDTH,
            REPOSITORY_CONTEXT_MENU_ESTIMATED_HEIGHT,
          );
          setContextMenu({
            x: position.x,
            y: position.y,
            repository: repo,
          });
        }}
        className={cn(
          'relative flex w-full min-w-0 gap-3 rounded-xl border border-transparent px-3 py-3 text-left transition-colors hover:bg-secondary/70',
          selected && 'border-primary/30 bg-primary/10',
          hasAttention && !selected && 'border-warning/20 bg-warning/5',
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
        <div className={cn('min-w-0 flex-1', unread > 0 && 'pr-14')}>
          <div className="flex min-w-0 items-center gap-1.5">
            <p
              className="min-w-0 truncate text-sm font-semibold leading-5 text-foreground"
              title={repo.fullName}
            >
              {repo.fullName}
            </p>
            {isSyncing ? (
              <Loader2
                className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground"
                aria-label="同步中"
              />
            ) : null}
          </div>
          <p className="mt-1 block max-w-full truncate text-xs text-muted-foreground" title={latestMessage}>
            {latestMessage}
          </p>
          <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
            {hasPendingApproval ? (
              <Badge
                variant="outline"
                className="shrink-0 rounded-full border-warning/40 bg-warning/10 px-1.5 py-0 text-[10px] text-warning-foreground"
              >
                待审批 {item.pendingApprovalCount}
              </Badge>
            ) : null}
            {hasUnreadRiskAttention ? (
              <Badge
                variant="outline"
                className="shrink-0 rounded-full border-destructive/40 bg-destructive/10 px-1.5 py-0 text-[10px] text-destructive-foreground"
              >
                高风险
              </Badge>
            ) : null}
            <Badge
              variant="outline"
              className={cn(
                'shrink-0 rounded-full px-1.5 py-0 text-[10px]',
                kind === 'editable'
                  ? 'border-success/40 text-success-foreground'
                  : 'border-muted-foreground/30 text-muted-foreground',
              )}
            >
              {kind === 'editable' ? '可操作' : '只读监控'}
            </Badge>
            <GitBranch className="h-3 w-3 shrink-0" />
            <span className="min-w-0 truncate">{repo.defaultBranch}</span>
          </div>
        </div>
      </Link>
    );
  }

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
            {allFilteredRepos.map((item) => {
              const repo = item.repository;
              const selected = repo.id === selectedRepositoryId;
              const unread = Math.min(getEffectiveUnread(item), 99);
              const avatarUrl = getRepositoryAvatarUrl(repo);
              const isSyncing = syncingRepoIds.has(repo.id);
              const repoKindLabel = item.kind === 'editable' ? '可操作仓库' : '只读监控';

              const compactLink = (
                <Link
                  key={repo.id}
                  to={`/workbench/repository/${repo.id}`}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    const position = getSafeContextMenuPosition(
                      event.clientX,
                      event.clientY,
                      REPOSITORY_CONTEXT_MENU_WIDTH,
                      REPOSITORY_CONTEXT_MENU_ESTIMATED_HEIGHT,
                    );
                    setContextMenu({
                      x: position.x,
                      y: position.y,
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
                      <p className="text-xs text-muted-foreground">{repoKindLabel}</p>
                      <p className="truncate text-xs text-muted-foreground">{item.latestMessagePreview}</p>
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
            className="fixed z-50 w-[280px] overflow-y-auto rounded-2xl border border-border bg-popover/95 p-2 shadow-2xl backdrop-blur"
            style={{
              left: contextMenu.x,
              top: contextMenu.y,
              maxHeight: `calc(100vh - ${contextMenu.y + CONTEXT_MENU_VIEWPORT_PADDING}px)`,
            }}
            onClick={(event) => event.stopPropagation()}
          >
            {getRepositoryContextMenuItems({
              repository: contextMenu.repository,
              isMonitored: monitoredRepos.some((r) => r.repository.id === contextMenu.repository.id),
              isSyncing: syncingRepoIds.has(contextMenu.repository.id),
              isPinned: pinnedRepoIds.has(contextMenu.repository.id),
              onRemoveFromMonitoring,
              onToggleRepositoryActive,
              onSyncRepository,
              onOpenRepository,
              onDeleteRepository,
              onPinRepository,
              onUnpinRepository,
              onMarkRead,
              onFilterByType,
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
        'relative hidden h-screen shrink-0 flex-col overflow-visible border-r border-border bg-background/60 lg:flex',
        !isResizing && 'transition-[width] duration-200',
      )}
    >
      <div className="desktop-drag shrink-0 border-b border-border px-4 pb-4 pt-9">
        <div className="desktop-no-drag flex items-center justify-between gap-3">
          <div>
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

      <ScrollArea className="min-h-0 flex-1 overflow-hidden">
        <div className="w-full min-w-0 space-y-1 overflow-hidden p-3">
          {filteredEditable.length > 0 && (
            <>
              <p className="px-2 pt-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                可操作仓库
              </p>
              {filteredEditable.map((item) => renderRepoListItem(item, 'editable'))}
            </>
          )}
          {filteredMonitored.length > 0 && (
            <>
              <p className="px-2 pt-4 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                只读监控
              </p>
              {filteredMonitored.map((item) => renderRepoListItem(item, 'monitored-readonly'))}
            </>
          )}
          {allFilteredRepos.length === 0 && (
            <p className="px-2 py-8 text-center text-xs text-muted-foreground">
              暂无仓库会话，请先添加仓库
            </p>
          )}
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
          className="fixed z-50 w-[280px] overflow-y-auto rounded-2xl border border-border bg-popover/95 p-2 shadow-2xl backdrop-blur"
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
            maxHeight: `calc(100vh - ${contextMenu.y + CONTEXT_MENU_VIEWPORT_PADDING}px)`,
          }}
          onClick={(event) => event.stopPropagation()}
        >
          {getRepositoryContextMenuItems({
            repository: contextMenu.repository,
            isMonitored: monitoredRepos.some((r) => r.repository.id === contextMenu.repository.id),
            isSyncing: syncingRepoIds.has(contextMenu.repository.id),
            isPinned: pinnedRepoIds.has(contextMenu.repository.id),
            onRemoveFromMonitoring,
            onToggleRepositoryActive,
            onSyncRepository,
            onOpenRepository,
            onDeleteRepository,
            onPinRepository,
            onUnpinRepository,
            onMarkRead,
            onFilterByType,
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
  repositoryCanOperate,
  onAgent,
  onSearch,
  onOpenBranchMonitor,
  feedSearchKeyword,
  onFeedSearchKeywordChange,
  feedFilters,
  onFeedFiltersChange,
  isRefreshing,
  onRefresh,
  onMarkAllRead,
  onAddRepositoryClick,
}: {
  activeView: WorkbenchView;
  repository?: Repository;
  repositoryCanOperate?: boolean;
  onAgent: () => void;
  onSearch: () => void;
  onOpenBranchMonitor: () => void;
  feedSearchKeyword?: string;
  onFeedSearchKeywordChange?: (value: string) => void;
  feedFilters?: {
    showOnlyDefaultBranch: boolean;
    hideBranchDelete: boolean;
    showPRAndIssueOnly: boolean;
  };
  onFeedFiltersChange?: (filters: {
    showOnlyDefaultBranch: boolean;
    hideBranchDelete: boolean;
    showPRAndIssueOnly: boolean;
  }) => void;
  isRefreshing?: boolean;
  onRefresh?: () => void;
  onMarkAllRead?: () => void;
  onAddRepositoryClick?: () => void;
}) {
  const [searchParams] = useSearchParams();
  const repositoryIdParam = searchParams.get('repositoryId');
  const hasRepositoryContext = activeView === 'repository' || ((activeView === 'dashboard' || activeView === 'reports') && repositoryIdParam);

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
  const subtitleByView: Partial<Record<WorkbenchView, string>> = {
    watch: 'Watch Feed / 关注源管理',
    repositories: 'Repository inventory / 监控范围管理',
    dashboard: 'Dashboard / 仓库指标',
    reports: 'Reports / Markdown 与 PDF',
    agent: 'Agent run / 独立执行上下文',
    settings: 'Workspace settings',
  };
  const repositoryAvatarUrl = repository ? getRepositoryAvatarUrl(repository) : undefined;

  const dashboardHref = (activeView === 'repository' && repository) || ((activeView === 'dashboard' || activeView === 'reports') && repositoryIdParam && repository)
    ? `/workbench/dashboard?repositoryId=${encodeURIComponent(repository.id)}`
    : '/workbench/dashboard';

  const reportsHref = (activeView === 'repository' && repository) || ((activeView === 'dashboard' || activeView === 'reports') && repositoryIdParam && repository)
    ? `/workbench/reports?repositoryId=${encodeURIComponent(repository.id)}`
    : '/workbench/reports';

  const isReadOnly = hasRepositoryContext && repositoryCanOperate === false;

  return (
    <header className="desktop-drag flex h-24 shrink-0 items-end justify-between gap-4 border-b border-border bg-background/95 px-6 pb-4 backdrop-blur">
      <div className="flex min-w-0 items-center gap-3">
        {hasRepositoryContext && repository ? (
          <Avatar className="desktop-no-drag h-12 w-12 rounded-xl border border-border">
            <AvatarImage src={repositoryAvatarUrl} alt={repository.fullName} className="object-cover" />
            <AvatarFallback className="rounded-xl bg-secondary text-sm font-semibold">
              {getRepoInitial(repository)}
            </AvatarFallback>
          </Avatar>
        ) : null}
        <div className="min-w-0">
          <p className="truncate text-sm text-muted-foreground">
            {isReadOnly
              ? '只读监控 · 仅查看权限'
              : hasRepositoryContext
                ? '可编辑仓库 / 独立 Agent 会话'
                : subtitleByView[activeView] ?? 'Repo-Pulse Desktop Workbench'}
          </p>
          <h1 className="truncate text-2xl font-semibold tracking-tight text-foreground">
            {hasRepositoryContext && repository && activeView !== 'repository'
              ? `${repository.fullName} · ${titleByView[activeView]}`
              : titleByView[activeView]}
            {isReadOnly ? (
              <Badge variant="outline" className="ml-3 align-middle rounded-full border-muted-foreground/30 text-xs text-muted-foreground">
                只读监控
              </Badge>
            ) : null}
          </h1>
        </div>
      </div>
      {activeView === 'watch' ? (
        <div className="desktop-no-drag flex items-center gap-2">
          {/* Dynamic Search Filter */}
          <div className="relative w-48 sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={feedSearchKeyword ?? ''}
              onChange={(e) => onFeedSearchKeywordChange?.(e.target.value)}
              placeholder="搜索动态内容..."
              className="h-9 w-full rounded-lg border-border bg-background/50 pl-8 pr-7 text-xs focus-visible:ring-1 focus-visible:ring-primary"
            />
            {feedSearchKeyword ? (
              <button
                type="button"
                onClick={() => onFeedSearchKeywordChange?.('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <XCircle className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>

          {/* Noise Reduction Filter Popover */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-9 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                <span>降噪</span>
                {(feedFilters?.showOnlyDefaultBranch || feedFilters?.hideBranchDelete || feedFilters?.showPRAndIssueOnly) ? (
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                ) : null}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-56 p-3 bg-popover border-border">
              <div className="space-y-3">
                <div className="text-xs font-semibold text-foreground">降噪与过滤</div>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground cursor-pointer">
                    <Checkbox
                      checked={feedFilters?.showOnlyDefaultBranch ?? false}
                      onCheckedChange={(checked) =>
                        onFeedFiltersChange?.({
                          ...feedFilters!,
                          showOnlyDefaultBranch: Boolean(checked),
                        })
                      }
                    />
                    <span>仅显示默认分支</span>
                  </label>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground cursor-pointer">
                    <Checkbox
                      checked={feedFilters?.hideBranchDelete ?? false}
                      onCheckedChange={(checked) =>
                        onFeedFiltersChange?.({
                          ...feedFilters!,
                          hideBranchDelete: Boolean(checked),
                        })
                      }
                    />
                    <span>隐藏分支删除</span>
                  </label>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground cursor-pointer">
                    <Checkbox
                      checked={feedFilters?.showPRAndIssueOnly ?? false}
                      onCheckedChange={(checked) =>
                        onFeedFiltersChange?.({
                          ...feedFilters!,
                          showPRAndIssueOnly: Boolean(checked),
                        })
                      }
                    />
                    <span>仅 Issue & PR</span>
                  </label>
                </div>
              </div>
            </PopoverContent>
          </Popover>

          {/* Refresh Button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9 text-muted-foreground hover:text-foreground"
                onClick={onRefresh}
                disabled={isRefreshing}
              >
                <RotateCcw className={cn("h-4 w-4 transition-transform duration-200 active:scale-90", isRefreshing && "animate-refresh")} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>刷新动态</TooltipContent>
          </Tooltip>

          {/* Mark All Ignored */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9 text-muted-foreground hover:text-foreground"
                onClick={onMarkAllRead}
              >
                <CheckCheck className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>忽略当前全部动态</TooltipContent>
          </Tooltip>

          {/* Add Repository */}
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            onClick={onAddRepositoryClick}
          >
            <Plus className="h-3.5 w-3.5" />
            添加仓库
          </Button>
        </div>
      ) : activeView !== 'watch' ? (
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
            <TooltipContent>{hasRepositoryContext ? '查看当前仓库看板' : '仓库看板'}</TooltipContent>
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
                <Link to={reportsHref}>
                  <FileText className="h-4 w-4" />
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent>生成报告</TooltipContent>
          </Tooltip>
          {!isReadOnly ? (
            <Button className="gap-2" onClick={onAgent}>
              <Bot className="h-4 w-4" />
              让 Agent 处理
            </Button>
          ) : null}
        </div>
      ) : null}
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

  // Filter actions: hide requiresPermission actions when repositoryCanOperate is false
  const visibleActions = (message.actions ?? []).filter(
    (action) => !action.requiresPermission || message.repositoryCanOperate,
  );

  function renderActionButton(action: MessageAction) {
    const isApproveAction = action.key === 'approve' && message.approvalId;
    const isRejectAction = action.key === 'reject' && message.approvalId;

    if (action.key === 'open_github' && message.externalUrl) {
      return (
        <Button key={action.key} size="sm" variant="outline" className="gap-2" asChild onClick={(event) => event.stopPropagation()}>
          <a href={message.externalUrl} target="_blank" rel="noreferrer">
            <ExternalLink className="h-3.5 w-3.5" />
            {action.label}
          </a>
        </Button>
      );
    }

    if (action.key === 'ai_analyze') {
      return (
        <Button
          key={action.key}
          size="sm"
          variant="ghost"
          className="gap-2"
          onClick={(event) => {
            event.stopPropagation();
            toast.info(`AI 正在分析：${message.title}`);
          }}
        >
          <Sparkles className="h-3.5 w-3.5" />
          {action.label}
        </Button>
      );
    }

    if (action.key === 'agent_handle') {
      return (
        <Button
          key={action.key}
          size="sm"
          variant={message.risk === 'high' ? 'default' : 'secondary'}
          className="gap-2"
          onClick={(event) => {
            event.stopPropagation();
            onOpenAgent(`处理这条消息：${message.title}`);
          }}
        >
          <Bot className="h-3.5 w-3.5" />
          {action.label}
        </Button>
      );
    }

    if (isApproveAction) {
      return (
        <Button
          key={action.key}
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
          {action.label}
        </Button>
      );
    }

    if (isRejectAction) {
      return (
        <Button
          key={action.key}
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
          {action.label}
        </Button>
      );
    }

    return null;
  }

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
          {visibleActions.map((action) => renderActionButton(action))}
          {visibleActions.length === 0 && message.approvalStatus && message.kind === 'approval' ? (
            <Badge variant="secondary" className="rounded-full">
              {message.approvalStatus}
            </Badge>
          ) : null}
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
                {message.actions?.filter((action) => !action.requiresPermission || message.repositoryCanOperate).map((action) => {
                  if (action.key === 'open_github' && message.externalUrl) {
                    return (
                      <Button key={action.key} variant="outline" className="gap-2" asChild>
                        <a href={message.externalUrl} target="_blank" rel="noreferrer">
                          <ExternalLink className="h-4 w-4" />
                          {action.label}
                        </a>
                      </Button>
                    );
                  }
                  if (action.key === 'agent_handle') {
                    return (
                      <Button key={action.key} className="gap-2" onClick={() => onOpenAgent(`处理这条消息：${message.title}`)}>
                        <Bot className="h-4 w-4" />
                        {action.label}
                      </Button>
                    );
                  }
                  if (action.key === 'approve') {
                    return (
                      <Button
                        key={action.key}
                        variant="outline"
                        className="gap-2 border-success/40 text-success-foreground hover:bg-success/10"
                        disabled={approvalActionId === message.approvalId}
                        onClick={() => onApproveMessage(message)}
                      >
                        <CheckSquare className="h-4 w-4" />
                        {action.label}
                      </Button>
                    );
                  }
                  if (action.key === 'reject') {
                    return (
                      <Button
                        key={action.key}
                        variant="outline"
                        className="gap-2 border-destructive/40 text-destructive hover:bg-destructive/10"
                        disabled={approvalActionId === message.approvalId}
                        onClick={() => onRejectMessage(message)}
                      >
                        <XCircle className="h-4 w-4" />
                        {action.label}
                      </Button>
                    );
                  }
                  if (action.key === 'ai_analyze') {
                    return (
                      <Button key={action.key} variant="ghost" className="gap-2" onClick={() => toast.info(`AI 正在分析：${message.title}`)}>
                        <Sparkles className="h-4 w-4" />
                        {action.label}
                      </Button>
                    );
                  }
                  return null;
                })}
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

function RepositoryConversation({
  repository,
  messages,
  unreadBoundary,
  repositoryCanOperate,
  onOpenAgent,
  onApproveMessage,
  onRejectMessage,
  approvalActionId,
}: {
  repository: Repository;
  messages: ConversationMessage[];
  unreadBoundary?: WorkbenchUnreadBoundary | null;
  repositoryCanOperate?: boolean;
  onOpenAgent: (prompt: string) => void;
  onApproveMessage: (message: ConversationMessage) => void;
  onRejectMessage: (message: ConversationMessage) => void;
  approvalActionId?: string;
}) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<ConversationMessage | null>(null);
  const [activeFilter, setActiveFilter] = useState<MessageFilterKey>('all');
  const [pendingUnreadJump, setPendingUnreadJump] = useState(false);
  const unreadBoundaryRef = useRef<HTMLDivElement | null>(null);
  const filteredMessages = useMemo(
    () => messages.filter((message) => doesMessageMatchFilter(message, activeFilter)),
    [activeFilter, messages],
  );
  const hasUnreadBoundary = Boolean(
    unreadBoundary &&
      unreadBoundary.repositoryId === repository.id &&
      messages.some((message) => message.id === unreadBoundary.messageId),
  );
  const isUnreadBoundaryVisible = Boolean(
    hasUnreadBoundary &&
      filteredMessages.some((message) => message.id === unreadBoundary?.messageId),
  );

  const handleJumpToUnread = () => {
    if (!hasUnreadBoundary) {
      return;
    }

    if (!isUnreadBoundaryVisible) {
      setActiveFilter('all');
    }
    setPendingUnreadJump(true);
  };

  useEffect(() => {
    if (!pendingUnreadJump || !hasUnreadBoundary) {
      return;
    }

    if (!isUnreadBoundaryVisible) {
      return;
    }

    unreadBoundaryRef.current?.scrollIntoView({
      block: 'end',
      behavior: 'smooth',
    });
    const frame = window.requestAnimationFrame(() => {
      setPendingUnreadJump(false);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [hasUnreadBoundary, isUnreadBoundaryVisible, pendingUnreadJump]);

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
          <div className="flex flex-wrap items-center gap-2">
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
          {hasUnreadBoundary && unreadBoundary ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="ml-auto h-8 rounded-full border border-primary/30 bg-primary/10 text-primary hover:bg-primary/15"
              onClick={handleJumpToUnread}
            >
              跳到未读 · {unreadBoundary.unreadCount}
            </Button>
          ) : null}
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto flex max-w-4xl flex-col gap-4 px-6 py-6">
          {filteredMessages.length > 0 ? (
            filteredMessages.map((message) => {
              const shouldRenderUnreadBoundary =
                hasUnreadBoundary && unreadBoundary?.messageId === message.id;

              return (
                <div key={message.id} className="contents">
                  <ConversationBubble
                    message={message}
                    repository={repository}
                    onOpenDetail={setSelectedMessage}
                    onOpenAgent={onOpenAgent}
                    onApproveMessage={onApproveMessage}
                    onRejectMessage={onRejectMessage}
                    approvalActionId={approvalActionId}
                    onContextMenu={(event, selectedMessage) => {
                      event.preventDefault();
                      const position = getSafeContextMenuPosition(
                        event.clientX,
                        event.clientY,
                        MESSAGE_CONTEXT_MENU_WIDTH,
                        MESSAGE_CONTEXT_MENU_ESTIMATED_HEIGHT,
                      );
                      setContextMenu({ x: position.x, y: position.y, message: selectedMessage });
                    }}
                  />
                  {shouldRenderUnreadBoundary ? (
                    <div
                      ref={unreadBoundaryRef}
                      className="flex scroll-mb-6 items-center gap-3 py-1"
                    >
                      <div className="h-px flex-1 bg-primary/40" />
                      <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-medium text-primary">
                        未读消息
                      </span>
                      <div className="h-px flex-1 bg-primary/40" />
                    </div>
                  ) : null}
                </div>
              );
            })
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
        {repositoryCanOperate !== false ? (
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
        ) : (
          <p className="text-center text-xs text-muted-foreground">
            只读监控模式下无法执行 Agent 操作。如需操作权限，请将该仓库设为可编辑模式。
          </p>
        )}
      </div>

      {contextMenu ? (
        <div
          className="fixed z-50 w-56 overflow-y-auto rounded-xl border border-border bg-popover p-1 shadow-xl"
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
            maxHeight: `calc(100vh - ${contextMenu.y + CONTEXT_MENU_VIEWPORT_PADDING}px)`,
          }}
        >
          {repositoryCanOperate !== false ? (
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-secondary"
              onClick={() => onOpenAgent(`处理这条消息：${contextMenu.message.title}`)}
            >
              <Bot className="h-4 w-4" />
              使用 Agent 处理
            </button>
          ) : null}
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

const watchFeedEventTypes = [
  { key: '', label: '全部' },
  { key: 'issue', label: 'Issue' },
  { key: 'pull_request', label: 'PR' },
  { key: 'push', label: 'Push' },
  { key: 'release', label: 'Release' },
  { key: 'security', label: 'Security' },
  { key: 'favorite', label: '收藏' },
] as const;

const watchFeedTypeMeta: Record<WatchFeedItem['type'], {
  label: string;
  icon: typeof CircleDot;
  badgeClass: string;
  dotClass: string;
}> = {
  issue: {
    label: 'Issue',
    icon: CircleDot,
    badgeClass: 'border-warning/40 bg-warning/10 text-warning',
    dotClass: 'bg-warning',
  },
  pull_request: {
    label: 'PR',
    icon: GitBranch,
    badgeClass: 'border-primary/40 bg-primary/10 text-primary',
    dotClass: 'bg-primary',
  },
  push: {
    label: 'Push',
    icon: GitBranch,
    badgeClass: 'border-border bg-secondary text-muted-foreground',
    dotClass: 'bg-muted-foreground',
  },
  release: {
    label: 'Release',
    icon: FileText,
    badgeClass: 'border-foreground/15 bg-foreground/5 text-foreground',
    dotClass: 'bg-foreground',
  },
  security: {
    label: 'Security',
    icon: ShieldAlert,
    badgeClass: 'border-destructive/40 bg-destructive/10 text-destructive',
    dotClass: 'bg-destructive',
  },
};

function WatchFeedActionBar({
  item,
  onAddToMonitoring,
  onIgnore,
  onAfterAction,
  favoriteEventIds,
  onToggleFavorite,
}: {
  item: WatchFeedItem;
  onAddToMonitoring: (item: WatchFeedItem) => void | Promise<void>;
  onIgnore: (item: WatchFeedItem) => void;
  onAfterAction?: () => void;
  favoriteEventIds?: Set<string>;
  onToggleFavorite?: (eventId: string) => void;
}) {
  const isFavorited = favoriteEventIds?.has(item.id) ?? false;
  return (
    <div className="flex flex-nowrap items-center gap-2 shrink-0">
      <Button
        size="sm"
        variant="outline"
        className="gap-1.5"
        onClick={() => toast.info(`AI 正在分析 ${item.repositoryFullName} 的事件...`)}
      >
        <Sparkles className="h-3.5 w-3.5" />
        AI 分析
      </Button>
      {item.canAddToMonitoring ? (
        <Button
          size="sm"
          variant="secondary"
          className="gap-1.5"
          onClick={() => {
            void onAddToMonitoring(item);
            onAfterAction?.();
          }}
        >
          <Plus className="h-3.5 w-3.5" />
          加入监控
        </Button>
      ) : null}
      {item.externalUrl ? (
        <Button size="sm" variant="ghost" className="gap-1.5" asChild>
          <a href={item.externalUrl} target="_blank" rel="noreferrer">
            <ExternalLink className="h-3.5 w-3.5" />
            GitHub
          </a>
        </Button>
      ) : null}
      <Button
        size="sm"
        variant="ghost"
        className="gap-1.5 text-muted-foreground"
        onClick={() => {
          onIgnore(item);
          onAfterAction?.();
        }}
      >
        <EyeOff className="h-3.5 w-3.5" />
        忽略
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className={cn(
          "gap-1.5 transition-colors",
          isFavorited ? "text-primary hover:text-primary/80" : "text-muted-foreground"
        )}
        onClick={() => {
          onToggleFavorite?.(item.id);
        }}
      >
        <Star className={cn("h-3.5 w-3.5", isFavorited && "fill-current")} />
        {isFavorited ? '已收藏' : '收藏'}
      </Button>
    </div>
  );
}

function WatchFeedCard({
  item,
  onOpenPreview,
  onAddToMonitoring,
  onIgnore,
  favoriteEventIds,
  onToggleFavorite,
}: {
  item: WatchFeedItem;
  onOpenPreview: (item: WatchFeedItem) => void;
  onAddToMonitoring: (item: WatchFeedItem) => void | Promise<void>;
  onIgnore: (item: WatchFeedItem) => void;
  favoriteEventIds: Set<string>;
  onToggleFavorite: (eventId: string) => void;
}) {
  const meta = watchFeedTypeMeta[item.type];
  const TypeIcon = meta.icon;
  const preview = item.summary || item.aiInsight || item.title;
  const githubUrl = item.externalUrl || (() => {
    const base = `https://github.com/${item.repositoryFullName}`;
    switch (item.type) {
      case 'issue': return `${base}/issues`;
      case 'pull_request': return `${base}/pulls`;
      case 'push': return `${base}/commits`;
      case 'release': return `${base}/releases`;
      case 'security': return `${base}/security/advisories`;
      default: return base;
    }
  })();

  const openPreview = () => onOpenPreview(item);
  const isFavorited = favoriteEventIds.has(item.id);

  return (
    <article className="group overflow-hidden rounded-xl border border-border bg-card/80 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:bg-card">
      <div
        role="button"
        tabIndex={0}
        aria-label={`${item.title} 预览`}
        className="cursor-pointer rounded-t-xl p-5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
        onClick={openPreview}
        onKeyDown={(event: KeyboardEvent<HTMLElement>) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openPreview();
          }
        }}
      >
        <div className="flex gap-4">
          <div className="relative shrink-0">
            <Avatar className="h-12 w-12 rounded-xl border border-border bg-background">
              <AvatarImage src={item.repositoryAvatar || getWatchFeedAvatarUrl(item.repositoryFullName)} alt={item.repositoryFullName} />
              <AvatarFallback className="rounded-xl bg-secondary text-sm font-semibold">
                {item.repositoryFullName.slice(0, 1).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className={cn(
              'absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-md border border-background text-background',
              meta.dotClass,
            )}>
              <TypeIcon className="h-3 w-3" />
            </span>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="truncate font-medium text-foreground">{item.repositoryFullName}</span>
              <span>{formatRelativeTime(item.occurredAt)}</span>
              <span>{item.author}</span>
              <Badge variant="outline" className={cn('rounded-md px-2 py-0.5 text-[11px]', meta.badgeClass)}>
                {meta.label}
              </Badge>
              {item.canAddToMonitoring ? (
                <Badge variant="secondary" className="rounded-md px-2 py-0.5 text-[11px]">
                  可监控
                </Badge>
              ) : null}
              <a
                href={githubUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:text-primary"
                onClick={(event) => event.stopPropagation()}
              >
                <ExternalLink className="h-3 w-3" />
                GitHub
              </a>
            </div>

            <div className="mt-3 flex gap-3">
              <div className={cn('mt-1 h-2 w-2 shrink-0 rounded-full', meta.dotClass)} />
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-semibold leading-6 text-foreground transition-colors group-hover:text-primary">
                  {item.title}
                </h3>
                <MarkdownContent className="mt-2 line-clamp-3 prose-headings:my-1 prose-h1:text-base prose-h2:text-sm prose-h3:text-sm prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-pre:my-2 prose-pre:max-h-32">
                  {preview}
                </MarkdownContent>
                {item.aiInsight ? (
                  <div className="mt-4 border-l border-primary/50 pl-3">
                    <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-primary">
                      <Sparkles className="h-3.5 w-3.5" />
                      AI 洞察
                    </div>
                    <p className="line-clamp-2 text-sm leading-6 text-foreground/90">{item.aiInsight}</p>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-border/70 px-5 py-2.5">
        <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', meta.dotClass)} />
          <span className="truncate">{item.repositoryFullName}</span>
          <span>·</span>
          <span>{formatRelativeTime(item.occurredAt)}</span>
        </div>
        <div className="flex items-center gap-1">
          {item.canAddToMonitoring ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  onClick={(event) => { event.stopPropagation(); void onAddToMonitoring(item); }}
                  aria-label="加入监控"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>加入监控</TooltipContent>
            </Tooltip>
          ) : null}
          <Tooltip>
            <TooltipTrigger asChild>
              <a
                href={githubUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                onClick={(event) => event.stopPropagation()}
                aria-label="在 GitHub 中查看"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </TooltipTrigger>
            <TooltipContent>在 GitHub 中查看</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className={cn(
                  "inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-secondary",
                  isFavorited ? "text-primary" : "text-muted-foreground hover:text-foreground"
                )}
                onClick={(event) => { event.stopPropagation(); onToggleFavorite(item.id); }}
                aria-label={isFavorited ? "取消收藏" : "收藏"}
              >
                <Star className={cn("h-3.5 w-3.5", isFavorited && "fill-current")} />
              </button>
            </TooltipTrigger>
            <TooltipContent>{isFavorited ? "取消收藏" : "收藏"}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                onClick={(event) => { event.stopPropagation(); onIgnore(item); }}
                aria-label="忽略"
              >
                <EyeOff className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent>忽略</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </article>
  );
}

function WatchFeedPreviewDialog({
  item,
  onOpenChange,
  onAddToMonitoring,
  onIgnore,
  favoriteEventIds,
  onToggleFavorite,
}: {
  item: WatchFeedItem | null;
  onOpenChange: (item: WatchFeedItem | null) => void;
  onAddToMonitoring: (item: WatchFeedItem) => void | Promise<void>;
  onIgnore: (item: WatchFeedItem) => void;
  favoriteEventIds: Set<string>;
  onToggleFavorite: (eventId: string) => void;
}) {
  const meta = item ? watchFeedTypeMeta[item.type] : null;
  const TypeIcon = meta?.icon ?? CircleDot;

  return (
    <Dialog open={Boolean(item)} onOpenChange={(open) => {
      if (!open) {
        onOpenChange(null);
      }
    }}>
      {item && meta ? (
        <DialogContent className="max-h-[min(760px,calc(100dvh-2rem))] w-[calc(100vw-2rem)] max-w-3xl gap-0 overflow-hidden rounded-xl border-border bg-background p-0">
          <DialogHeader className="border-b border-border bg-card/80 px-6 py-5 pr-12 text-left">
            <div className="flex items-start gap-4">
              <Avatar className="h-12 w-12 rounded-xl border border-border bg-background">
                <AvatarImage src={item.repositoryAvatar || getWatchFeedAvatarUrl(item.repositoryFullName)} alt={item.repositoryFullName} />
                <AvatarFallback className="rounded-xl bg-secondary text-sm font-semibold">
                  {item.repositoryFullName.slice(0, 1).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="truncate font-medium text-foreground">{item.repositoryFullName}</span>
                  <span>{item.author}</span>
                  <span>{formatRelativeTime(item.occurredAt)}</span>
                  <Badge variant="outline" className={cn('rounded-md px-2 py-0.5 text-[11px]', meta.badgeClass)}>
                    <TypeIcon className="mr-1 h-3 w-3" />
                    {meta.label}
                  </Badge>
                </div>
                <DialogTitle className="mt-3 text-xl leading-7 text-foreground">
                  {item.title}
                </DialogTitle>
                <DialogDescription className="sr-only">
                  {item.repositoryFullName} 的关注动态正文预览
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <ScrollArea className="max-h-[calc(100dvh-18rem)]">
            <div className="space-y-6 px-6 py-5">
              <section>
                <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  正文
                </div>
                <MarkdownContent className="prose-pre:max-h-none">
                  {item.summary || item.title}
                </MarkdownContent>
              </section>

              {item.aiInsight ? (
                <section className="border-t border-border pt-5">
                  <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
                    <Sparkles className="h-4 w-4 text-primary" />
                    AI 洞察
                  </div>
                  <MarkdownContent className="prose-pre:max-h-none">
                    {item.aiInsight}
                  </MarkdownContent>
                </section>
              ) : null}
            </div>
          </ScrollArea>

          <DialogFooter className="border-t border-border bg-background/95 px-6 py-4 sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
              <span className={cn('h-2 w-2 shrink-0 rounded-full', meta.dotClass)} />
              <span className="truncate">{item.repositoryFullName}</span>
            </div>
            <WatchFeedActionBar
              item={item}
              onAddToMonitoring={onAddToMonitoring}
              onIgnore={onIgnore}
              onAfterAction={() => onOpenChange(null)}
              favoriteEventIds={favoriteEventIds}
              onToggleFavorite={onToggleFavorite}
            />
          </DialogFooter>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

function getSearchResultKey(candidate: SearchResult) {
  return `${candidate.platform}:${candidate.fullName}`;
}

function WatchRepositoryPanel({
  repositories,
  loading,
  onAddRepositoryToMonitoring,
}: {
  repositories: WatchRepositoryItem[];
  loading?: boolean;
  onAddRepositoryToMonitoring: (repository: WatchRepositoryItem) => void | Promise<void>;
}) {
  const [filterQuery, setFilterQuery] = useState('');

  const filteredRepositories = useMemo(() => {
    if (!filterQuery.trim()) return repositories;
    const query = filterQuery.toLowerCase();
    return repositories.filter((repo) => repo.fullName.toLowerCase().includes(query));
  }, [repositories, filterQuery]);

  return (
    <aside className="min-w-0 space-y-4 lg:sticky lg:top-6 lg:self-start">
      <section className="rounded-xl border border-border bg-card/80 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground">关注源</p>
          </div>
          <Badge variant="secondary" className="rounded-md">
            {filteredRepositories.length}
          </Badge>
        </div>

        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            placeholder="搜索关注源仓库..."
            className="h-8 rounded-lg border-border bg-background/50 pl-8 pr-7 text-xs focus-visible:ring-1 focus-visible:ring-primary"
          />
          {filterQuery ? (
            <button
              type="button"
              onClick={() => setFilterQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <XCircle className="h-3 w-3" />
            </button>
          ) : null}
        </div>

        <div className="mt-3 lg:max-h-[calc(100vh-280px)] max-h-[400px] overflow-y-auto scrollbar-thin pr-1.5 space-y-2">
          {loading ? (
            [0, 1, 2].map((item) => (
              <div key={item} className="flex animate-pulse items-center gap-3 rounded-lg border border-border bg-background/50 p-3">
                <div className="h-9 w-9 rounded-lg bg-secondary" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="h-3 w-2/3 rounded bg-secondary" />
                  <div className="h-3 w-1/2 rounded bg-secondary" />
                </div>
              </div>
            ))
          ) : filteredRepositories.length > 0 ? (
            filteredRepositories.map((repository) => {
              const avatarUrl = getRepositoryAvatarUrl(repository);
              return (
                <div
                  key={repository.id}
                  className="flex items-center gap-3 rounded-lg border border-border bg-background/45 p-3 hover:bg-secondary/45 transition-colors cursor-pointer group"
                  onClick={() => window.open(repository.url, '_blank', 'noopener,noreferrer')}
                >
                  <Avatar className="h-9 w-9 shrink-0 rounded-lg border border-border">
                    <AvatarImage src={avatarUrl} alt={repository.fullName} className="object-cover" />
                    <AvatarFallback className="rounded-lg bg-secondary text-xs font-semibold">
                      {getRepoInitial(repository)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <p className="truncate text-sm font-medium text-foreground group-hover:text-primary transition-colors" title={repository.fullName}>
                          {repository.fullName}
                        </p>
                      </TooltipTrigger>
                      <TooltipContent side="top" align="start" className="max-w-[280px] break-all bg-popover/95 border border-border text-foreground p-2 text-xs shadow-xl">
                        {repository.fullName}
                      </TooltipContent>
                    </Tooltip>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {repository.eventCount} 条事件
                      {repository.isMonitored ? ' · 已监控' : ' · 关注中'}
                    </p>
                  </div>
                  {repository.canAddToMonitoring ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          className="text-muted-foreground hover:text-foreground"
                          onClick={(e) => {
                            e.stopPropagation();
                            void onAddRepositoryToMonitoring(repository);
                          }}
                          aria-label={`将 ${repository.fullName} 加入监控`}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>加入监控</TooltipContent>
                    </Tooltip>
                  ) : null}
                </div>
              );
            })
          ) : (
            <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
              {filterQuery ? '无匹配关注源仓库' : '还没有关注源。'}
            </div>
          )}
        </div>
      </section>
    </aside>
  );
}

function WatchFeed({
  items,
  loading,
  activeType,
  onTypeChange,
  watchRepositories,
  watchRepositoriesLoading,
  onAddToMonitoring,
  onAddWatchRepositoryToMonitoring,
  onIgnore,
  favoriteEventIds,
  onToggleFavorite,
  isRefreshing,
}: {
  items: WatchFeedItem[];
  loading?: boolean;
  activeType: string;
  onTypeChange: (type: string) => void;
  watchRepositories: WatchRepositoryItem[];
  watchRepositoriesLoading?: boolean;
  onAddToMonitoring: (item: WatchFeedItem) => void;
  onAddWatchRepositoryToMonitoring: (repository: WatchRepositoryItem) => void | Promise<void>;
  onIgnore: (item: WatchFeedItem) => void;
  favoriteEventIds: Set<string>;
  onToggleFavorite: (eventId: string) => void;
  isRefreshing?: boolean;
}) {
  const [previewItem, setPreviewItem] = useState<WatchFeedItem | null>(null);

  return (
    <>
      <ScrollArea className="h-full">
        <div className="mx-auto grid max-w-7xl gap-5 p-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <section className="min-w-0 space-y-4">
            <div className="sticky top-0 z-10 rounded-xl border border-border bg-background/95 p-3 backdrop-blur">
              <div className="flex flex-wrap gap-1.5 rounded-lg border border-border bg-card/80 p-1" aria-label="关注动态筛选">
                {watchFeedEventTypes.map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={activeType === key}
                    className={cn(
                      'rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground',
                      activeType === key && 'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground',
                    )}
                    onClick={() => onTypeChange(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="relative">
              {/* Pull-down Weibo-style Loading Spinner */}
              <div className={cn(
                "flex items-center justify-center transition-all duration-300 ease-in-out overflow-hidden",
                isRefreshing ? "h-14 opacity-100" : "h-0 opacity-0"
              )}>
                <div className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card shadow-lg">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                </div>
              </div>

              {/* Feed Card List with translation transition */}
              <div className={cn(
                "transition-all duration-300 ease-in-out",
                isRefreshing ? "translate-y-2" : "translate-y-0"
              )}>
                {loading ? (
                  <div className="space-y-3">
                    {[0, 1, 2].map((item) => (
                      <div key={item} className="rounded-xl border border-border bg-card/70 p-5">
                        <div className="flex animate-pulse gap-4">
                          <div className="h-12 w-12 rounded-xl bg-secondary" />
                          <div className="min-w-0 flex-1 space-y-3">
                            <div className="h-3 w-1/3 rounded bg-secondary" />
                            <div className="h-5 w-2/3 rounded bg-secondary" />
                            <div className="h-3 w-full rounded bg-secondary" />
                            <div className="h-3 w-4/5 rounded bg-secondary" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : items.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border bg-card/60 px-6 py-14 text-center">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-background">
                      <Star className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <p className="mt-4 text-base font-semibold text-foreground">暂无关注动态</p>
                    <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                      添加关注源或同步 GitHub 后，会展示可加入监控的仓库事件。
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {items.map((item) => (
                      <WatchFeedCard
                        key={item.id}
                        item={item}
                        onOpenPreview={setPreviewItem}
                        onAddToMonitoring={onAddToMonitoring}
                        onIgnore={onIgnore}
                        favoriteEventIds={favoriteEventIds}
                        onToggleFavorite={onToggleFavorite}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>

          <WatchRepositoryPanel
            repositories={watchRepositories}
            loading={watchRepositoriesLoading}
            onAddRepositoryToMonitoring={onAddWatchRepositoryToMonitoring}
          />
        </div>
      </ScrollArea>

      <WatchFeedPreviewDialog
        item={previewItem}
        onOpenChange={setPreviewItem}
        onAddToMonitoring={onAddToMonitoring}
        onIgnore={onIgnore}
        favoriteEventIds={favoriteEventIds}
        onToggleFavorite={onToggleFavorite}
      />
    </>
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
  const [syncingRepoIds, setSyncingRepoIds] = useState<Set<string>>(() => new Set());
  const [newlyMonitoredRepoIds, setNewlyMonitoredRepoIds] = useState<Set<string>>(() => new Set());
  const [watchFeedType, setWatchFeedType] = useState('');
  const [ignoredFeedIds, setIgnoredFeedIds] = useState<Set<string>>(() => new Set());
  const [feedSearchKeyword, setFeedSearchKeyword] = useState('');
  const [feedFilters, setFeedFilters] = useState({
    showOnlyDefaultBranch: false,
    hideBranchDelete: false,
    showPRAndIssueOnly: false,
  });
  const [favoriteEventIds, setFavoriteEventIds] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('repo-pulse:favorite-events');
      return stored ? new Set(JSON.parse(stored) as string[]) : new Set();
    } catch {
      return new Set();
    }
  });

  const handleToggleFavoriteEvent = (eventId: string) => {
    setFavoriteEventIds((current) => {
      const next = new Set(current);
      if (next.has(eventId)) {
        next.delete(eventId);
      } else {
        next.add(eventId);
      }
      localStorage.setItem('repo-pulse:favorite-events', JSON.stringify([...next]));
      return next;
    });
  };

  const [isAddRepositoryOpen, setIsAddRepositoryOpen] = useState(false);
  const [watchRepositorySearch, setWatchRepositorySearch] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const autoReadRequestRef = useRef<Record<string, string>>({});
  const autoReadSessionRef = useRef<{ repositoryId?: string; initialized: boolean }>({
    initialized: false,
  });
  const unreadBoundaries = useWorkbenchUnreadStore((state) => state.boundaries);
  const setOptimisticRead = useWorkbenchUnreadStore((state) => state.setOptimisticRead);
  const clearOptimisticRead = useWorkbenchUnreadStore((state) => state.clearOptimisticRead);
  const clearUnreadBoundary = useWorkbenchUnreadStore((state) => state.clearBoundary);
  const [addingWatchRepositoryKey, setAddingWatchRepositoryKey] = useState<string>();

  // Pinned repositories (persisted in localStorage)
  const [pinnedRepoIds, setPinnedRepoIds] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('repo-pulse-pinned-repos');
      return stored ? new Set(JSON.parse(stored) as string[]) : new Set();
    } catch {
      return new Set();
    }
  });

  const handlePinRepository = (repo: Repository) => {
    setPinnedRepoIds((current) => {
      const next = new Set(current);
      next.add(repo.id);
      localStorage.setItem('repo-pulse-pinned-repos', JSON.stringify([...next]));
      return next;
    });
    toast.success(`${repo.fullName} 已置顶`);
  };

  const handleUnpinRepository = (repo: Repository) => {
    setPinnedRepoIds((current) => {
      const next = new Set(current);
      next.delete(repo.id);
      localStorage.setItem('repo-pulse-pinned-repos', JSON.stringify([...next]));
      return next;
    });
    toast.success(`${repo.fullName} 已取消置顶`);
  };

  const handleMarkRepoRead = async (repo: Repository) => {
    const chatItem = [...editableRepos, ...monitoredRepos].find((item) => item.repository.id === repo.id);
    const readAt = chatItem?.latestMessageAt ?? new Date().toISOString();
    setOptimisticRead(repo.id, readAt);
    clearUnreadBoundary(repo.id);

    try {
      await workbenchService.markConversationRead(repo.id, { upToMessageAt: readAt });
      // 刷新仓库列表和当前会话，获取最新的 lastReadAt 和未读数
      await Promise.all([
        chatReposQuery.refetch(),
        conversationMessagesQuery.refetch(),
      ]);
      toast.success(`${repo.fullName} 已标记为已读`);
    } catch (error) {
      console.error(error);
      clearOptimisticRead(repo.id);
      toast.error('标记已读失败');
    }
  };

  const handleFilterRepoByType = (repo: Repository, type: string) => {
    // Navigate to the repository conversation with a type filter
    navigate(`/workbench/repository/${repo.id}?filter=${type}`);
    toast.success(`已切换到${type === 'issue' ? 'Issue' : type === 'pull-request' ? 'PR' : 'Push'}视图`);
  };

  const repositoriesQuery = useRepositoryListQuery();
  const notificationsQuery = useNotificationsQuery();
  const unreadNotificationCountQuery = useUnreadNotificationCountQuery();
  const repositories = useMemo(() => repositoriesQuery.data ?? [], [repositoriesQuery.data]);

  // Workbench chat repositories (grouped by editable / monitored-readonly)
  const chatReposQuery = useChatRepositoriesQuery();
  const editableRepos = useMemo(
    () => chatReposQuery.data?.editableRepositories ?? [],
    [chatReposQuery.data],
  );
  const monitoredRepos = useMemo(
    () => chatReposQuery.data?.monitoredRepositories ?? [],
    [chatReposQuery.data],
  );

  // GitHub repository search queries inside DesktopWorkbench
  const searchCandidatesQuery = useSearchRepositoryCandidatesQuery(
    watchRepositorySearch,
    watchRepositorySearch.trim().length > 1
  );
  const searchResults = searchCandidatesQuery.data ?? [];
  const searchLoading = searchCandidatesQuery.isLoading || searchCandidatesQuery.isFetching;

  // Watch Feed query
  const queryType = watchFeedType === 'favorite' ? '' : watchFeedType;
  const watchFeedQuery = useWatchFeedQuery(queryType);

  const watchFeedItems = useMemo(() => {
    let items = watchFeedQuery.data?.items ?? [];

    // Filter ignored items
    items = items.filter((item) => !ignoredFeedIds.has(item.id));

    // Filter by favorites if the active tab is 'favorite'
    if (watchFeedType === 'favorite') {
      items = items.filter((item) => favoriteEventIds.has(item.id));
    }

    // Filter by noise reduction checkboxes
    items = items.filter((item) => {
      if (feedFilters.showPRAndIssueOnly && item.type !== 'pull_request' && item.type !== 'issue') {
        return false;
      }
      if (feedFilters.hideBranchDelete && item.type === 'push' && (
        item.title.toLowerCase().includes('delete branch') ||
        item.title.toLowerCase().includes('deleted branch') ||
        item.title.toLowerCase().includes('delete')
      )) {
        return false;
      }
      if (feedFilters.showOnlyDefaultBranch) {
        if (item.type === 'push') {
          const titleLower = item.title.toLowerCase();
          const isPushToDefault = titleLower.includes('main') || titleLower.includes('master');
          if (titleLower.includes('push') && !isPushToDefault) {
            return false;
          }
        }
      }
      return true;
    });

    // Filter by search keyword
    if (feedSearchKeyword.trim()) {
      const keyword = feedSearchKeyword.toLowerCase();
      items = items.filter(
        (item) =>
          item.title.toLowerCase().includes(keyword) ||
          item.summary.toLowerCase().includes(keyword) ||
          item.author.toLowerCase().includes(keyword) ||
          item.repositoryFullName.toLowerCase().includes(keyword)
      );
    }

    return items;
  }, [watchFeedQuery.data, watchFeedType, ignoredFeedIds, favoriteEventIds, feedFilters, feedSearchKeyword]);

  const handleRefreshFeed = async () => {
    setIsRefreshing(true);
    try {
      await watchFeedQuery.refetch();
      toast.success('关注动态已刷新');
    } catch (error) {
      console.error(error);
      toast.error('刷新失败');
    } finally {
      setTimeout(() => setIsRefreshing(false), 800);
    }
  };

  const handleIgnoreAllVisibleFeedItems = () => {
    if (watchFeedItems.length === 0) {
      toast.info('当前没有可忽略的动态');
      return;
    }
    setIgnoredFeedIds((current) => {
      const next = new Set(current);
      watchFeedItems.forEach((item) => next.add(item.id));
      return next;
    });
    toast.success(`已忽略 ${watchFeedItems.length} 条动态`);
  };

  const watchRepositoriesQuery = useApiQuery({
    queryKey: ['workbench', 'watch-repositories'],
    queryFn: () => workbenchService.getWatchRepositories(),
    staleTime: 30 * 1000,
  });
  const watchRepositories = useMemo(
    () => watchRepositoriesQuery.data ?? [],
    [watchRepositoriesQuery.data],
  );

  const handleAddToMonitoring = async (item: WatchFeedItem) => {
    try {
      const nextRepositoryIds = [...monitoredRepositoryIds, item.repositoryId];
      await persistMonitoringScope({
        repositoryIds: nextRepositoryIds,
        branchNames: [],
        repositoryBranchScopes: monitoringScope.repositoryBranchScopes ?? {},
      });
      toast.success(`${item.repositoryFullName} 已加入监控`);
      await Promise.all([
        chatReposQuery.refetch(),
        watchFeedQuery.refetch(),
      ]);
    } catch (error) {
      console.error(error);
      toast.error('加入监控失败');
    }
  };

  const handleAddWatchRepositoryToMonitoring = async (repository: WatchRepositoryItem) => {
    try {
      const nextRepositoryIds = Array.from(new Set([...monitoredRepositoryIds, repository.id]));
      await persistMonitoringScope({
        repositoryIds: nextRepositoryIds,
        branchNames: [],
        repositoryBranchScopes: monitoringScope.repositoryBranchScopes ?? {},
      });
      setNewlyMonitoredRepoIds((current) => {
        const next = new Set(current);
        next.add(repository.id);
        return next;
      });
      toast.success(`${repository.fullName} 已加入监控`);
      await Promise.all([
        chatReposQuery.refetch(),
        watchFeedQuery.refetch(),
        watchRepositoriesQuery.refetch(),
      ]);
    } catch (error) {
      console.error(error);
      toast.error('加入监控失败');
    }
  };

  const handleAddWatchRepository = async (candidate: SearchResult) => {
    const [owner, repo] = candidate.fullName.split('/');
    if (!owner || !repo) {
      toast.error('仓库名称格式无效');
      return;
    }

    const key = getSearchResultKey(candidate);
    setAddingWatchRepositoryKey(key);
    try {
      const addedRepo = await workbenchService.addWatchRepository({
        platform: candidate.platform,
        owner,
        repo,
      });
      toast.success(`${candidate.fullName} 已加入关注源`);

      // Trigger repository sync in the background so events/messages sync immediately
      if (addedRepo && addedRepo.id) {
        repositoryService.sync(addedRepo.id)
          .then(() => {
            watchFeedQuery.refetch();
            watchRepositoriesQuery.refetch();
          })
          .catch((err) => console.error('Auto-sync failed:', err));
      }

      await Promise.all([
        watchRepositoriesQuery.refetch(),
        watchFeedQuery.refetch(),
        repositoriesQuery.refetch(),
        chatReposQuery.refetch(),
      ]);
      await queryClient.invalidateQueries({ queryKey: repositoryQueryKeys.list() });
    } catch (error) {
      console.error(error);
      toast.error('添加关注仓库失败');
    } finally {
      setAddingWatchRepositoryKey(undefined);
    }
  };

  const handleIgnoreFeedItem = (item: WatchFeedItem) => {
    setIgnoredFeedIds((current) => {
      const next = new Set(current);
      next.add(item.id);
      return next;
    });
    toast.success('已忽略');
  };

  const repositoryIds = useMemo(() => repositories.map((repository) => repository.id), [repositories]);
  const selectedRepository = repositories.find((repository) => repository.id === (params.repositoryId || searchParams.get('repositoryId'))) ?? repositories[0];
  const agentRepository = repositories.find((repository) => repository.id === searchParams.get('repo')) ?? selectedRepository;

  // Determine if currently selected repository is editable
  const selectedRepositoryCanOperate = useMemo(() => {
    if (!selectedRepository) return undefined;
    const allChatRepos = [...editableRepos, ...monitoredRepos];
    const chatItem = allChatRepos.find((item) => item.repository.id === selectedRepository.id);
    return chatItem?.kind === 'editable' ? true : chatItem ? false : undefined;
  }, [editableRepos, monitoredRepos, selectedRepository]);

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

  const approvalsQuery = useApiQuery({
    queryKey: ['workbench', 'approvals', repositoryIds.join(',')],
    queryFn: () => approvalService.getApprovals({ limit: 80, offset: 0 }),
    enabled: repositoryIds.length > 0,
    staleTime: 30 * 1000,
  });

  // 当前选中仓库的 Workbench 统一会话消息（替代前端自行拼接 events + approvals + notifications）
  const conversationMessagesQuery = useConversationMessagesQuery(selectedRepository?.id);

  const conversationState = conversationMessagesQuery.data?.conversation ?? null;

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
  const shouldShowRepositorySidebar =
    activeView === 'inbox' ||
    activeView === 'repository' ||
    activeView === 'dashboard' ||
    activeView === 'reports';

  useEffect(() => {
    if (activeView !== 'repository' || !selectedRepository?.id) {
      autoReadSessionRef.current = { initialized: false };
      return;
    }

    if (autoReadSessionRef.current.repositoryId !== selectedRepository.id) {
      autoReadSessionRef.current = {
        repositoryId: selectedRepository.id,
        initialized: false,
      };
    }
  }, [activeView, selectedRepository?.id]);

  // 仓库会话消息：使用后端统一接口，替代前端自行拼接
  const selectedMessages = useMemo(() => {
    if (!selectedRepository) return [];
    // 优先使用 Workbench 统一会话接口
    if (conversationMessagesQuery.data) {
      return conversationMessagesQuery.data.messages.map((msg) =>
        workbenchMessageToConversationMessage(msg, conversationMessagesQuery.data.conversation),
      );
    }
    // 降级：使用前端拼接的消息
    return getRepoMessages(selectedRepository.id, allMessages);
  }, [conversationMessagesQuery.data, selectedRepository, allMessages]);
  const selectedUnreadBoundary = selectedRepository
    ? unreadBoundaries[selectedRepository.id] ?? null
    : null;

  useEffect(() => {
    if (activeView !== 'repository' || !selectedRepository?.id || !conversationMessagesQuery.data) {
      return;
    }

    const repositoryId = selectedRepository.id;
    if (autoReadSessionRef.current.repositoryId !== repositoryId) {
      autoReadSessionRef.current = {
        repositoryId,
        initialized: false,
      };
    }

    if (autoReadSessionRef.current.initialized) {
      return;
    }

    autoReadSessionRef.current.initialized = true;

    const { conversation, messages } = conversationMessagesQuery.data;
    if (conversation.unreadCount <= 0) {
      clearUnreadBoundary(repositoryId);
      return;
    }

    const hasUnreadMessage = messages.some((message) => message.isUnread);
    const readUpToMessageAt = getLatestWorkbenchMessageAt(messages);
    if (!hasUnreadMessage || !readUpToMessageAt) {
      return;
    }

    const optimisticReadAt =
      useWorkbenchUnreadStore.getState().optimisticReadAtByRepository[repositoryId];
    if (isMessageCoveredByRead(readUpToMessageAt, optimisticReadAt)) {
      clearUnreadBoundary(repositoryId);
      return;
    }

    const requestKey = `${repositoryId}:${readUpToMessageAt}`;
    if (autoReadRequestRef.current[repositoryId] === requestKey) {
      return;
    }

    autoReadRequestRef.current[repositoryId] = requestKey;
    setOptimisticRead(repositoryId, readUpToMessageAt);
    clearUnreadBoundary(repositoryId);

    void workbenchService
      .markConversationRead(repositoryId, { upToMessageAt: readUpToMessageAt })
      .then(async () => {
        await Promise.all([
          chatReposQuery.refetch(),
          conversationMessagesQuery.refetch(),
        ]);
      })
      .catch((error) => {
        console.error(error);
        delete autoReadRequestRef.current[repositoryId];
        autoReadSessionRef.current = {
          repositoryId,
          initialized: false,
        };
        clearOptimisticRead(repositoryId);
        toast.error('自动标记已读失败');
      });
  }, [
    activeView,
    chatReposQuery,
    clearUnreadBoundary,
    clearOptimisticRead,
    conversationMessagesQuery,
    selectedRepository?.id,
    setOptimisticRead,
  ]);

  useEffect(() => {
    if (!selectedRepository?.id || !conversationMessagesQuery.data) {
      return;
    }

    const boundary = useWorkbenchUnreadStore.getState().boundaries[selectedRepository.id];
    if (!boundary) {
      return;
    }

    const boundaryMessageExists = conversationMessagesQuery.data.messages.some(
      (message) => message.id === boundary.messageId,
    );
    if (!boundaryMessageExists) {
      clearUnreadBoundary(selectedRepository.id);
    }
  }, [clearUnreadBoundary, conversationMessagesQuery.data, selectedRepository?.id]);

  const unreadCount = unreadNotificationCountQuery.data?.count ?? allMessages.length;
  // 待审批计数：优先使用仓库列表聚合接口的数据
  const pendingApprovalCount = useMemo(() => {
    const allChatRepos = [...editableRepos, ...monitoredRepos];
    return allChatRepos.reduce((sum, item) => sum + (item.pendingApprovalCount || 0), 0);
  }, [editableRepos, monitoredRepos]);
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
      chatReposQuery.refetch(),
      conversationMessagesQuery.refetch(),
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
    setSyncingRepoIds((current) => {
      const next = new Set(current);
      next.add(repository.id);
      return next;
    });
    try {
      await repositoryService.sync(repository.id);
      await Promise.all([
        repositoriesQuery.refetch(),
        eventsQuery.refetch(),
        approvalsQuery.refetch(),
      ]);
      toast.success(`${repository.fullName} 已同步`);
    } catch (error) {
      console.error(error);
      toast.error('同步仓库失败');
    } finally {
      setSyncingRepoIds((current) => {
        if (!current.has(repository.id)) {
          return current;
        }
        const next = new Set(current);
        next.delete(repository.id);
        return next;
      });
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
            editableRepos={editableRepos}
            monitoredRepos={monitoredRepos}
            selectedRepositoryId={
              (activeView === 'repository' || ((activeView === 'dashboard' || activeView === 'reports') && searchParams.get('repositoryId')))
                ? selectedRepository?.id
                : undefined
            }
            syncingRepoIds={syncingRepoIds}
            pinnedRepoIds={pinnedRepoIds}
            newlyMonitoredRepoIds={newlyMonitoredRepoIds}
            collapsed={isRepositorySidebarCollapsed}
            onToggleCollapsed={() => setIsRepositorySidebarCollapsed((current) => !current)}
            onRemoveFromMonitoring={removeRepositoryFromMonitoring}
            onToggleRepositoryActive={toggleRepositoryActive}
            onSyncRepository={syncRepository}
            onOpenRepository={openRepository}
            onDeleteRepository={deleteRepository}
            onPinRepository={handlePinRepository}
            onUnpinRepository={handleUnpinRepository}
            onMarkRead={handleMarkRepoRead}
            onFilterByType={handleFilterRepoByType}
          />
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col">
          <WorkbenchHeader
            activeView={activeView}
            repository={selectedRepository}
            repositoryCanOperate={selectedRepositoryCanOperate}
            onAgent={() => openAgent(undefined, selectedRepository)}
            onSearch={() => setIsSearchOpen(true)}
            onOpenBranchMonitor={() => setIsBranchMonitorOpen(true)}
            feedSearchKeyword={feedSearchKeyword}
            onFeedSearchKeywordChange={setFeedSearchKeyword}
            feedFilters={feedFilters}
            onFeedFiltersChange={setFeedFilters}
            isRefreshing={isRefreshing}
            onRefresh={handleRefreshFeed}
            onMarkAllRead={handleIgnoreAllVisibleFeedItems}
            onAddRepositoryClick={() => setIsAddRepositoryOpen(true)}
          />
          <main className="min-h-0 flex-1 overflow-hidden">
            {activeView === 'repository' && selectedRepository ? (
              <RepositoryConversation
                repository={selectedRepository}
                messages={selectedMessages}
                unreadBoundary={selectedUnreadBoundary}
                repositoryCanOperate={selectedRepositoryCanOperate}
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
              <WatchFeed
                items={watchFeedItems}
                loading={watchFeedQuery.isLoading}
                activeType={watchFeedType}
                onTypeChange={setWatchFeedType}
                watchRepositories={watchRepositories}
                watchRepositoriesLoading={watchRepositoriesQuery.isLoading}
                onAddToMonitoring={handleAddToMonitoring}
                onAddWatchRepositoryToMonitoring={handleAddWatchRepositoryToMonitoring}
                onIgnore={handleIgnoreFeedItem}
                favoriteEventIds={favoriteEventIds}
                onToggleFavorite={handleToggleFavoriteEvent}
                isRefreshing={isRefreshing}
              />
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
                  <Reports scopedRepositoryId={searchParams.get('repositoryId') ?? undefined} />
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
        <Dialog open={isAddRepositoryOpen} onOpenChange={setIsAddRepositoryOpen}>
          <DialogContent className="max-w-md bg-card border-border text-foreground">
            <DialogHeader>
              <DialogTitle>添加关注仓库</DialogTitle>
              <DialogDescription>
                搜索尚未进入关注源的公开仓库，添加后会纳入关注动态。
              </DialogDescription>
            </DialogHeader>
            <div className="relative mt-4">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={watchRepositorySearch}
                onChange={(event) => setWatchRepositorySearch(event.target.value)}
                placeholder="搜索 owner/repo 或关键词"
                className="h-9 rounded-lg border-border bg-background/70 pl-9 text-sm"
              />
            </div>

            <div className="mt-4 max-h-[300px] overflow-y-auto space-y-2 pr-1.5 scrollbar-thin">
              {searchLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : watchRepositorySearch.trim().length > 1 && searchResults.length > 0 ? (
                searchResults.slice(0, 5).map((candidate) => {
                  const key = getSearchResultKey(candidate);
                  const isAdding = addingWatchRepositoryKey === key;
                  return (
                    <div key={key} className="flex items-center gap-3 rounded-lg border border-border bg-background/45 p-3">
                      <Avatar className="h-9 w-9 shrink-0 rounded-lg border border-border">
                        <AvatarImage src={candidate.owner.avatarUrl} alt={candidate.owner.login} className="object-cover" />
                        <AvatarFallback className="rounded-lg bg-secondary text-xs font-semibold">
                          {candidate.owner.login.slice(0, 1).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground" title={candidate.fullName}>
                          {candidate.fullName}
                        </p>
                        <p className="mt-1 truncate text-xs text-muted-foreground" title={getWatchDescription(candidate)}>
                          {getWatchDescription(candidate)}
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="gap-1.5"
                        disabled={isAdding}
                        onClick={async () => {
                          await handleAddWatchRepository(candidate);
                        }}
                      >
                        {isAdding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                        关注
                      </Button>
                    </div>
                  );
                })
              ) : watchRepositorySearch.trim().length > 1 ? (
                <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                  没有可添加的匹配仓库。
                </div>
              ) : (
                <div className="rounded-lg border border-border bg-background/35 px-4 py-4 text-xs leading-5 text-muted-foreground">
                  输入至少 2 个字符开始搜索。
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
