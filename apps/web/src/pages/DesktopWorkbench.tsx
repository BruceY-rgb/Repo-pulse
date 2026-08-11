import {
  useCallback,
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
  CheckCheck,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleDot,
  Command,
  CornerDownLeft,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  Filter,
  Folder,
  FolderPlus,
  GitBranch,
  GitMerge,
  Github,
  LayoutDashboard,
  Loader2,
  LogOut,
  MessageSquare,
  MoreHorizontal,
  PauseCircle,
  Pencil,
  Pin,
  PinOff,
  Play,
  Plus,
  RotateCcw,
  Search,
  Send,
  Settings,
  Settings2,
  Shield,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  Star,
  Terminal,
  TestTube2,
  Trash2,
  Users,
  VolumeX,
  X,
  Webhook,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { useSyncProgressStore } from '@/stores/sync-progress.store';
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
import { Textarea } from '@/components/ui/textarea';
import {
  Sheet,
  SheetContent,
  SheetDescription,
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
  workbenchQueryKeys,
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
import { apiClient } from '@/services/api-client';
import { repositoryService } from '@/services/repository.service';
import { workbenchService } from '@/services/workbench.service';
import { settingsService, PROVIDER_LABELS, type AIProvider } from '@/services/settings.service';
import { getApiBaseUrl, isDesktopRuntime } from '@/lib/desktop';
import { getProviderLogo } from '@/lib/provider-logo';
import { GitTreePanel } from '@/components/shared/GitTreePanel';
import {
  useWorkbenchUnreadStore,
  type WorkbenchUnreadBoundary,
} from '@/stores/workbench-unread.store';
import { authService } from '@/services/auth.service';
import type { Notification } from '@/services/notification.service';
import { Dashboard } from '@/pages/Dashboard';
import { Repositories } from '@/pages/Repositories';
import { Reports } from '@/pages/Reports';
import { Settings as SettingsPage } from '@/pages/Settings';
import { SiriAnalysisPanel } from '@/components/analysis/SiriAnalysisPanel';
import type {
  Event,
  Repository,
  SearchResult,
  ChatRepositoryItem,
  BranchSyncStatus,
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
  /** 同分支同步状态（后端从合成 alert 聚合而来） */
  branchSyncStatuses?: BranchSyncStatus[];
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

const CONVERSATION_MESSAGE_PAGE_SIZE = 50;
const WATCH_FEED_PAGE_SIZE = 20;

function isRepositoryMonitoredInScope(monitoredRepositoryIds: string[], repositoryId?: string) {
  if (!repositoryId) {
    return false;
  }
  return monitoredRepositoryIds.includes(repositoryId);
}

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
      'prose prose-sm prose-invert max-w-none text-muted-foreground break-words overflow-hidden w-full',
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
const REPOSITORY_SIDEBAR_WIDTH_STORAGE_KEY = 'repo-pulse:repository-sidebar-width';
const CONTEXT_MENU_VIEWPORT_PADDING = 12;
const REPOSITORY_CONTEXT_MENU_WIDTH = 280;
const REPOSITORY_CONTEXT_MENU_ESTIMATED_HEIGHT = 420;
const MESSAGE_CONTEXT_MENU_WIDTH = 224;
const MESSAGE_CONTEXT_MENU_ESTIMATED_HEIGHT = 136;

function clampRepositorySidebarWidth(width: number) {
  return Math.min(MAX_REPOSITORY_SIDEBAR_WIDTH, Math.max(MIN_REPOSITORY_SIDEBAR_WIDTH, width));
}

function getInitialRepositorySidebarWidth() {
  if (typeof window === 'undefined') {
    return DEFAULT_REPOSITORY_SIDEBAR_WIDTH;
  }
  const storedValue = localStorage.getItem(REPOSITORY_SIDEBAR_WIDTH_STORAGE_KEY);
  if (!storedValue) {
    return DEFAULT_REPOSITORY_SIDEBAR_WIDTH;
  }
  const storedWidth = Number(storedValue);
  return Number.isFinite(storedWidth)
    ? clampRepositorySidebarWidth(storedWidth)
    : DEFAULT_REPOSITORY_SIDEBAR_WIDTH;
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

function HighlightText({ text, query }: { text: string; query: string }) {
  if (!query || !query.trim() || !text) {
    return <>{text}</>;
  }
  const terms = query.trim().split(/\s+/).filter(Boolean);
  if (terms.length === 0) {
    return <>{text}</>;
  }

  const escapedTerms = terms.map(term => term.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&'));
  const regex = new RegExp(`(${escapedTerms.join('|')})`, 'gi');
  const parts = text.split(regex);

  return (
    <>
      {parts.map((part, index) =>
        regex.test(part) ? (
          <mark key={index} className="bg-primary/20 text-primary font-medium px-0.5 rounded border border-primary/10">
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </>
  );
}

function getSearchBodyPreview(body: string, query: string): string {
  if (!query || !query.trim() || !body) {
    return body;
  }
  const terms = query.trim().split(/\s+/).filter(Boolean);
  if (terms.length === 0) {
    return body;
  }

  const lowerBody = body.toLowerCase();
  let firstMatchIdx = -1;
  let matchedTermLength = 0;

  for (const term of terms) {
    const idx = lowerBody.indexOf(term.toLowerCase());
    if (idx !== -1 && (firstMatchIdx === -1 || idx < firstMatchIdx)) {
      firstMatchIdx = idx;
      matchedTermLength = term.length;
    }
  }

  if (firstMatchIdx === -1) {
    return body;
  }

  const contextBefore = 40;
  const contextAfter = 80;

  const start = Math.max(0, firstMatchIdx - contextBefore);
  const end = Math.min(body.length, firstMatchIdx + matchedTermLength + contextAfter);

  let snippet = body.slice(start, end);

  if (start > 0) {
    snippet = '...' + snippet;
  }
  if (end < body.length) {
    snippet = snippet + '...';
  }

  return snippet;
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

function getRepoInitial(repo?: Pick<Repository, 'name' | 'fullName'> | null) {
  if (!repo) return 'R';
  return (repo.name || repo.fullName || 'R').slice(0, 1).toUpperCase();
}

function getRepositoryOwner(repo?: Pick<Repository, 'fullName' | 'url'> | null) {
  if (!repo) return '';
  const fullName = repo.fullName || '';
  const [ownerFromFullName] = fullName.split('/');
  if (ownerFromFullName) {
    return ownerFromFullName;
  }

  try {
    if (!repo.url) return '';
    const url = new URL(repo.url);
    return url.pathname.split('/').filter(Boolean)[0] ?? '';
  } catch {
    return '';
  }
}

function getRepositoryAvatarUrl(repo?: Pick<Repository, 'fullName' | 'platform' | 'url'> | null) {
  if (!repo) return undefined;
  const owner = getRepositoryOwner(repo);
  if (!owner) {
    return undefined;
  }

  if (repo.platform === 'GITHUB') {
    return `https://github.com/${encodeURIComponent(owner)}.png`;
  }

  try {
    if (!repo.url) return undefined;
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

function getBranchSyncStatusLabel(status: BranchSyncStatus) {
  if (status.kind === 'upstream_behind') {
    return '落后上游';
  }
  return '分支领先';
}

function getBranchSyncStatusDescription(status: BranchSyncStatus) {
  if (status.kind === 'upstream_behind') {
    const upstream = status.upstreamRepository
      ? `${status.upstreamRepository}${status.upstreamBranch ? `:${status.upstreamBranch}` : ''}`
      : '上游仓库';
    return `${status.branch || '当前分支'} 需要同步 ${upstream}`;
  }

  return `${status.branch || '当前分支'} 领先 ${status.defaultBranch || '默认分支'}，当前未检测到活跃 PR`;
}

function formatBranchSyncSha(sha?: string) {
  return sha ? sha.slice(0, 7) : undefined;
}

function BranchSyncStatusList({
  statuses,
  compact = false,
}: {
  statuses: BranchSyncStatus[];
  compact?: boolean;
}) {
  return (
    <div className={cn('space-y-3', compact ? 'text-xs' : 'text-sm')}>
      {statuses.map((status) => (
        <div key={status.id} className="rounded-lg border border-border/70 bg-secondary/15 p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 font-semibold text-foreground">
                <GitBranch className="h-3.5 w-3.5 text-primary" />
                {getBranchSyncStatusLabel(status)}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {status.body || getBranchSyncStatusDescription(status)}
              </p>
            </div>
            {status.branch ? (
              <Badge variant="secondary" className="shrink-0 rounded-full text-[11px]">
                {status.branch}
              </Badge>
            ) : null}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            {typeof status.aheadBy === 'number' ? (
              <div className="rounded-md bg-background/70 px-2 py-1.5">
                <span className="text-muted-foreground">领先</span>
                <span className="ml-2 font-semibold text-foreground">{status.aheadBy}</span>
              </div>
            ) : null}
            {typeof status.behindBy === 'number' ? (
              <div className="rounded-md bg-background/70 px-2 py-1.5">
                <span className="text-muted-foreground">落后</span>
                <span className="ml-2 font-semibold text-foreground">{status.behindBy}</span>
              </div>
            ) : null}
            {status.lastCommitSha ? (
              <div className="rounded-md bg-background/70 px-2 py-1.5">
                <span className="text-muted-foreground">最新</span>
                <span className="ml-2 font-mono font-semibold text-foreground">
                  {formatBranchSyncSha(status.lastCommitSha)}
                </span>
              </div>
            ) : null}
            <div className="rounded-md bg-background/70 px-2 py-1.5">
              <span className="text-muted-foreground">检查</span>
              <span className="ml-2 font-semibold text-foreground">{formatRelativeTime(status.occurredAt)}</span>
            </div>
          </div>

          {status.commits.length > 0 ? (
            <div className="mt-3 space-y-1.5">
              {status.commits.slice(0, compact ? 2 : 3).map((commit, index) => (
                <div key={`${status.id}-${commit.sha ?? index}`} className="min-w-0 rounded-md bg-background/60 px-2 py-1.5">
                  <p className="truncate text-xs font-medium text-foreground">
                    {commit.message || 'Commit message unavailable'}
                  </p>
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    {[formatBranchSyncSha(commit.sha), commit.author].filter(Boolean).join(' · ')}
                  </p>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function BranchSyncStatusPopover({ statuses }: { statuses?: BranchSyncStatus[] }) {
  if (!statuses || statuses.length === 0) {
    return null;
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="ml-auto h-8 w-8 shrink-0 rounded-full border border-border/80 bg-secondary/40 text-muted-foreground hover:bg-secondary hover:text-foreground"
          aria-label="查看分支同步状态"
          onClick={(event) => event.stopPropagation()}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="top"
        className="w-80 max-w-[calc(100vw-32px)] border-border bg-popover p-3 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-foreground">分支同步状态</p>
          <Badge variant="outline" className="rounded-full text-[11px]">
            {statuses.length}
          </Badge>
        </div>
        <BranchSyncStatusList statuses={statuses} compact />
      </PopoverContent>
    </Popover>
  );
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
    branch: msg.branch || msg.targetBranch || msg.sourceBranch,
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
    branchSyncStatuses: msg.branchSyncStatuses,
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

function doesMessageMatchMonitoringScope(
  message: ConversationMessage,
  monitoredRepositoryIds: string[],
  repositoryBranchScopes: Record<string, string[]>,
) {
  const repositoryId = message.sourceRepositoryId;
  if (!repositoryId) {
    return true;
  }

  if (!monitoredRepositoryIds.includes(repositoryId)) {
    return false;
  }

  const scopedBranches = repositoryBranchScopes[repositoryId] ?? [];
  if (scopedBranches.length === 0) {
    return true;
  }

  const messageBranches = Array.from(
    new Set(
      [
        message.branch,
        message.sourceEvent?.branch,
        message.sourceEvent?.sourceBranch,
        message.sourceEvent?.targetBranch,
        ...(message.sourceEvent?.branches ?? []),
      ].filter((branch): branch is string => Boolean(branch)),
    ),
  );

  if (messageBranches.length === 0) {
    return message.eventTypeLabel === 'Issue' || message.eventTypeLabel === 'Release';
  }

  return messageBranches.some((branch) => scopedBranches.includes(branch));
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
  syncProgress,
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
  syncProgress?: number;
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
              <img src="/desktop-logo.png" alt="Repo-Pulse" className="h-10 w-10 shrink-0 rounded-full" />
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

        {!isDesktopRuntime() ? (
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
        ) : null}
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

function RepositorySidebarResizeHandle({
  width,
  isResizing,
  onStart,
  onMove,
  onEnd,
  onReset,
  onSetWidth,
}: {
  width: number;
  isResizing: boolean;
  onStart: () => void;
  onMove: (delta: number) => void;
  onEnd: () => void;
  onReset: () => void;
  onSetWidth: (width: number) => void;
}) {
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);

  const finishResize = (event: PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) {
      return;
    }

    isDraggingRef.current = false;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    onEnd();
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    isDraggingRef.current = true;
    startXRef.current = event.clientX;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    onStart();
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) {
      return;
    }

    const delta = event.clientX - startXRef.current;
    startXRef.current = event.clientX;
    onMove(delta);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      onMove(-SIDEBAR_KEYBOARD_STEP);
      onEnd();
      return;
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      onMove(SIDEBAR_KEYBOARD_STEP);
      onEnd();
      return;
    }

    if (event.key === 'Home') {
      event.preventDefault();
      onSetWidth(MIN_REPOSITORY_SIDEBAR_WIDTH);
      onEnd();
      return;
    }

    if (event.key === 'End') {
      event.preventDefault();
      onSetWidth(MAX_REPOSITORY_SIDEBAR_WIDTH);
      onEnd();
    }
  };

  return (
    <div
      className={cn(
        'desktop-no-drag absolute bottom-0 right-[-6px] top-0 z-40 flex h-full w-3 shrink-0 touch-none select-none items-center justify-center border-x border-transparent bg-transparent text-muted-foreground/60 transition-colors hover:bg-primary/10 hover:text-primary focus:bg-primary/15 focus:text-primary focus:outline-none',
        isResizing && 'bg-primary/10 text-primary',
      )}
      role="separator"
      tabIndex={0}
      aria-orientation="vertical"
      aria-valuemin={MIN_REPOSITORY_SIDEBAR_WIDTH}
      aria-valuemax={MAX_REPOSITORY_SIDEBAR_WIDTH}
      aria-valuenow={width}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishResize}
      onPointerCancel={finishResize}
      onLostPointerCapture={finishResize}
      onDoubleClick={onReset}
      onKeyDown={handleKeyDown}
    >
      <svg width="7" height="24" viewBox="0 0 7 24" fill="none" aria-hidden="true">
        <circle cx="2" cy="5" r="1.2" fill="currentColor" />
        <circle cx="2" cy="12" r="1.2" fill="currentColor" />
        <circle cx="2" cy="19" r="1.2" fill="currentColor" />
        <circle cx="5" cy="5" r="1.2" fill="currentColor" />
        <circle cx="5" cy="12" r="1.2" fill="currentColor" />
        <circle cx="5" cy="19" r="1.2" fill="currentColor" />
      </svg>
    </div>
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
  const [sidebarWidth, setSidebarWidth] = useState(getInitialRepositorySidebarWidth);
  const [isResizing, setIsResizing] = useState(false);
  const [contextMenu, setContextMenu] = useState<RepositoryContextMenuState | null>(null);
  const [repositorySearch, setRepositorySearch] = useState('');
  const optimisticReadAtByRepository = useWorkbenchUnreadStore(
    (state) => state.optimisticReadAtByRepository,
  );
  const syncProgressByRepoId = useSyncProgressStore((s) => s.byRepoId);
  const sidebarWidthRef = useRef(sidebarWidth);
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
    sidebarWidthRef.current = sidebarWidth;
  }, [sidebarWidth]);

  useEffect(() => {
    if (!isResizing) {
      return;
    }

    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
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

  const updateSidebarWidth = (width: number) => {
    const nextWidth = clampRepositorySidebarWidth(width);
    sidebarWidthRef.current = nextWidth;
    setSidebarWidth(nextWidth);
  };

  const persistSidebarWidth = () => {
    localStorage.setItem(REPOSITORY_SIDEBAR_WIDTH_STORAGE_KEY, String(sidebarWidthRef.current));
    setIsResizing(false);
  };

  const resetSidebarWidth = () => {
    updateSidebarWidth(DEFAULT_REPOSITORY_SIDEBAR_WIDTH);
    localStorage.setItem(REPOSITORY_SIDEBAR_WIDTH_STORAGE_KEY, String(DEFAULT_REPOSITORY_SIDEBAR_WIDTH));
  };

  function renderRepoListItem(item: ChatRepositoryItem, kind: 'editable' | 'monitored-readonly') {
    const repo = item.repository;
    const selected = repo.id === selectedRepositoryId;
    const unread = Math.min(getEffectiveUnread(item), 99);
    const avatarUrl = getRepositoryAvatarUrl(repo);
    const latestMessage = item.latestMessagePreview || '等待新的仓库事件';
    const isSyncing = syncingRepoIds.has(repo.id);
    const syncProgress = syncProgressByRepoId[repo.id]?.progress;
    const hasWebhookWarning = item.kind === 'editable' && !repo.webhookId;
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
              <>
                <Loader2
                  className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground"
                  aria-label="同步中"
                />
                <span className="shrink-0 text-xs font-medium text-muted-foreground">
                  {Math.round(syncProgress ?? 0)}%
                </span>
              </>
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
            {hasWebhookWarning ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <AlertTriangle
                    className="h-3 w-3 shrink-0 text-warning-foreground"
                    aria-label="Webhook 未配置"
                  />
                </TooltipTrigger>
                <TooltipContent side="right">Webhook 未配置，点击进入仓库详情修复</TooltipContent>
              </Tooltip>
            ) : null}
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
              const syncProgress = syncProgressByRepoId[repo.id]?.progress;
              const hasWebhookWarning = item.kind === 'editable' && !repo.webhookId;
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
                      {isSyncing ? (
                        <p className="text-xs text-muted-foreground">
                          同步中 {Math.round(syncProgress ?? 0)}%
                        </p>
                      ) : null}
                      {hasWebhookWarning ? (
                        <p className="text-xs text-warning-foreground">Webhook 未配置</p>
                      ) : null}
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
              syncProgress: syncProgressByRepoId[contextMenu.repository.id]?.progress,
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
      <RepositorySidebarResizeHandle
        width={sidebarWidth}
        isResizing={isResizing}
        onStart={() => setIsResizing(true)}
        onMove={(delta) => updateSidebarWidth(sidebarWidthRef.current + delta)}
        onEnd={persistSidebarWidth}
        onReset={resetSidebarWidth}
        onSetWidth={updateSidebarWidth}
      />
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
            syncProgress: syncProgressByRepoId[contextMenu.repository.id]?.progress,
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
  onOpenContributors,
  isMonitored,
  selectedRepositoryBranchesCount,
}: {
  activeView: Exclude<WorkbenchView, 'agent'>;
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
  onOpenContributors?: () => void;
  isMonitored?: boolean;
  selectedRepositoryBranchesCount?: number;
}) {
  const [searchParams] = useSearchParams();
  const repositoryIdParam = searchParams.get('repositoryId');
  const hasRepositoryContext = activeView === 'repository' || ((activeView === 'dashboard' || activeView === 'reports') && repositoryIdParam);

  const titleByView: Record<Exclude<WorkbenchView, 'agent'>, string> = {
    inbox: '今日工作台',
    repository: repository?.fullName ?? '仓库会话',
    repositories: '仓库管理',
    watch: '关注动态',
    dashboard: '仓库看板',
    reports: '报告中心',
    settings: '设置',
  };
  const subtitleByView: Partial<Record<Exclude<WorkbenchView, 'agent'>, string>> = {
    watch: 'Watch Feed / 关注源管理',
    repositories: 'Repository inventory / 监控范围管理',
    dashboard: 'Dashboard / 仓库指标',
    reports: 'Reports / Markdown 与 PDF',
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
      {activeView === 'settings' ? null : activeView === 'watch' ? (
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
      ) : (
        <div className="desktop-no-drag flex items-center gap-2">
          {activeView === 'repository' && onOpenContributors ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon" variant="outline" aria-label="查看贡献者" onClick={onOpenContributors}>
                  <Users className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>查看项目贡献者</TooltipContent>
            </Tooltip>
          ) : null}
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
              <span>
              <Button
                size="icon"
                variant="outline"
                aria-label="分支监控"
                disabled={!repository}
                onClick={onOpenBranchMonitor}
                className={cn(
                  "relative transition-all duration-200",
                  repository && !isMonitored && "text-muted-foreground/40 border-dashed border-muted-foreground/30 hover:text-muted-foreground/60 hover:bg-transparent",
                  repository && isMonitored && (selectedRepositoryBranchesCount ?? 0) > 0 && "border-primary/45 text-primary bg-primary/5 hover:bg-primary/10 shadow-[0_0_8px_rgba(139,92,246,0.1)] hover:border-primary/70"
                )}
              >
                <GitBranch className={cn("h-4 w-4", repository && !isMonitored && "opacity-60")} />
                {repository && isMonitored && (selectedRepositoryBranchesCount ?? 0) > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                  </span>
                )}
              </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {!repository
                ? '请先选择一个仓库'
                : !isMonitored
                ? '分支监控 (当前仓库监控已关闭)'
                : (selectedRepositoryBranchesCount ?? 0) > 0
                ? `分支监控 (已过滤监控分支: ${selectedRepositoryBranchesCount}个)`
                : '分支监控 (默认监控全部分支)'}
            </TooltipContent>
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
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon" variant="outline" aria-label="让 Agent 处理" onClick={onAgent}>
                  <Bot className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>让 Agent 处理</TooltipContent>
            </Tooltip>
          ) : null}
        </div>
      )}
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
  mergingActionId,
  onMergePR,
  onContextMenu,
  onOpenSiriAnalysis,
}: {
  message: ConversationMessage;
  repository: Repository;
  onOpenDetail: (message: ConversationMessage) => void;
  onOpenAgent: (prompt: string) => void;
  onApproveMessage: (message: ConversationMessage) => void;
  onRejectMessage: (message: ConversationMessage) => void;
  approvalActionId?: string;
  mergingActionId?: string;
  onMergePR?: (message: ConversationMessage, action: MessageAction) => void;
  onContextMenu: (event: MouseEvent<HTMLDivElement>, message: ConversationMessage) => void;
  onOpenSiriAnalysis?: (eventId: string, eventTitle: string) => void;
}) {
  const Icon = message.kind === 'approval'
    ? ShieldAlert
    : message.kind === 'analysis'
      ? Sparkles
      : message.kind === 'notification'
        ? Bell
        : Github;
  const authorAvatarUrl = getAuthorAvatarUrl(message) ?? getRepositoryAvatarUrl(repository);

  const isRealUser = Boolean(message.author && !['system', 'agent', 'bot', 'ai'].some(kw => message.author.toLowerCase().includes(kw)));

  const handleAvatarClick = (e: MouseEvent) => {
    if (!isRealUser) return;
    e.stopPropagation();
    const userUrl = repository.platform === 'GITLAB' 
      ? `https://gitlab.com/${message.author}` 
      : `https://github.com/${message.author}`;
    window.open(userUrl, '_blank', 'noopener,noreferrer');
  };

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
            onOpenSiriAnalysis?.(message.id, message.title);
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

    if (action.key === 'merge_pr') {
      return (
        <Button
          key={action.key}
          size="sm"
          variant="outline"
          className="gap-2"
          disabled={mergingActionId === message.id}
          onClick={(event) => {
            event.stopPropagation();
            onMergePR?.(message, action);
          }}
        >
          <GitMerge className="h-3.5 w-3.5" />
          {action.label}
        </Button>
      );
    }

    return null;
  }

  return (
    <div
      data-message-id={message.id}
      className="group flex cursor-pointer gap-3 w-full min-w-0 transition-all duration-300"
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
      <Avatar 
        onClick={handleAvatarClick} 
        className={cn(
          "mt-1 h-10 w-10 shrink-0 rounded-xl border border-border",
          isRealUser && "cursor-pointer hover:opacity-80 transition-opacity"
        )}
      >
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
          <BranchSyncStatusPopover statuses={message.branchSyncStatuses} />
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
  mergingActionId,
  onMergePR,
  onOpenSiriAnalysis,
}: {
  message: ConversationMessage | null;
  repository: Repository | undefined | null;
  onClose: () => void;
  onOpenAgent: (prompt: string) => void;
  onApproveMessage: (message: ConversationMessage) => void;
  onRejectMessage: (message: ConversationMessage) => void;
  approvalActionId?: string;
  mergingActionId?: string;
  onMergePR?: (message: ConversationMessage, action: MessageAction) => void;
  onOpenSiriAnalysis?: (eventId: string, eventTitle: string) => void;
}) {
  if (!message || !repository) {
    return null;
  }

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
      <SheetContent side="right" className="w-full overflow-y-auto border-l border-border bg-background/95 backdrop-blur-md sm:max-w-2xl p-0 shadow-2xl flex flex-col h-full">
        {message ? (
          <div className="flex flex-col h-full relative">
            {/* Top Glow Accent Bar */}
            <div className={cn(
              "absolute top-0 left-0 right-0 h-1.5 z-10",
              message.risk === 'high' ? 'bg-gradient-to-r from-destructive via-red-500 to-orange-500' :
              message.risk === 'medium' ? 'bg-gradient-to-r from-warning via-amber-400 to-yellow-500' :
              'bg-gradient-to-r from-primary via-indigo-500 to-blue-500'
            )} />

            <div className="flex-1 overflow-y-auto px-6 py-8 space-y-6">
              {/* Header section */}
              <div className="space-y-4 text-left border-b border-border/50 pb-6 mt-2">
                <div className="flex items-start gap-4">
                  <div className="relative">
                    <Avatar className={cn(
                      "h-12 w-12 rounded-xl border-2 transition-transform duration-300 hover:scale-105 shadow-inner",
                      message.risk === 'high' ? 'border-destructive/60' :
                      message.risk === 'medium' ? 'border-warning/60' :
                      'border-primary/60'
                    )}>
                      <AvatarImage src={authorAvatarUrl} alt={message.author} className="object-cover" />
                      <AvatarFallback className="rounded-xl bg-secondary/80 text-sm font-semibold">
                        {getMessageAvatarFallback(message, repository)}
                      </AvatarFallback>
                    </Avatar>
                    <span className={cn(
                      "absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-background shadow-md",
                      message.risk === 'high' ? 'bg-destructive animate-pulse' :
                      message.risk === 'medium' ? 'bg-warning' :
                      'bg-primary'
                    )} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground/75">
                      <Folder className="h-3.5 w-3.5 text-muted-foreground/60" />
                      {repository.fullName}
                    </p>
                    <SheetTitle className="text-xl font-bold tracking-tight text-foreground/90 mt-1 leading-snug">
                      {message.title}
                    </SheetTitle>
                    <SheetDescription className="sr-only">
                      {repository.fullName} 的会话消息详情。
                    </SheetDescription>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Badge variant="outline" className={cn('rounded-full text-[11px] font-medium backdrop-blur-sm shadow-sm', getRiskBadgeClass(message.risk))}>
                    {message.risk === 'high' ? '需要处理' : message.risk === 'medium' ? '建议关注' : '通知'}
                  </Badge>
                  <Badge variant="secondary" className="rounded-full text-[11px] font-medium bg-secondary/60 border border-border/50 text-secondary-foreground shadow-sm">
                    {getMessageKindLabel(message)}
                  </Badge>
                  <span className="text-xs text-muted-foreground flex items-center gap-1.5 ml-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/45" />
                    <span className="font-medium text-foreground/80">{message.author}</span>
                    <span className="text-muted-foreground/60">·</span>
                    <span>{message.time}</span>
                  </span>
                </div>
              </div>

              {/* Body Content */}
              <div className="space-y-6">
                {message.branch ? (
                  <div className="rounded-xl border border-border/60 bg-secondary/15 backdrop-blur-sm p-4 hover:bg-secondary/20 transition-all duration-200 shadow-sm flex items-center justify-between group">
                    <div>
                      <p className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wider flex items-center gap-1.5">
                        <GitBranch className="h-3.5 w-3.5 text-primary/70" />
                        目标分支
                      </p>
                      <p className="mt-1.5 text-sm font-mono font-medium text-foreground bg-secondary/30 px-2 py-0.5 rounded border border-border/40 inline-block">
                        {message.branch}
                      </p>
                    </div>
                  </div>
                ) : null}

                {message.branchSyncStatuses && message.branchSyncStatuses.length > 0 ? (
                  <div className="rounded-xl border border-border/60 bg-secondary/10 p-4 shadow-sm">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">
                        <GitBranch className="h-3.5 w-3.5 text-primary/70" />
                        分支同步状态
                      </p>
                      <Badge variant="outline" className="rounded-full text-[11px]">
                        {message.branchSyncStatuses.length}
                      </Badge>
                    </div>
                    <BranchSyncStatusList statuses={message.branchSyncStatuses} />
                  </div>
                ) : null}

                <div className="rounded-2xl border border-border/60 bg-secondary/10 backdrop-blur-sm p-6 shadow-sm">
                  <div className="flex items-center gap-2 mb-4 pb-2 border-b border-border/40">
                    <FileText className="h-4 w-4 text-primary/70" />
                    <p className="text-xs font-semibold text-muted-foreground/80 uppercase tracking-wider">消息正文</p>
                  </div>
                  <MarkdownContent className="prose-pre:bg-black/40 prose-pre:border prose-pre:border-border/50 prose-pre:rounded-xl">{message.body}</MarkdownContent>
                </div>

                {/* Actions Section */}
                <div className="flex flex-wrap items-center gap-2.5 pt-4 border-t border-border/40">
                  {message.actions?.filter((action) => !action.requiresPermission || message.repositoryCanOperate).map((action) => {
                    if (action.key === 'open_github' && message.externalUrl) {
                      return (
                        <Button key={action.key} variant="outline" className="gap-2 rounded-xl border-border/80 hover:bg-secondary transition-all" asChild>
                          <a href={message.externalUrl} target="_blank" rel="noreferrer">
                            <ExternalLink className="h-4 w-4" />
                            {action.label}
                          </a>
                        </Button>
                      );
                    }
                    if (action.key === 'agent_handle') {
                      return (
                        <Button
                          key={action.key}
                          className="gap-2 rounded-xl bg-gradient-to-r from-primary to-indigo-600 hover:from-primary/95 hover:to-indigo-600/95 text-primary-foreground shadow-sm hover:shadow-[0_0_12px_rgba(139,92,246,0.3)] transition-all duration-200 border-0"
                          onClick={() => onOpenAgent(`处理这条消息：${message.title}`)}
                        >
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
                          className="gap-2 rounded-xl border-success/40 text-success hover:bg-success/10 hover:border-success hover:shadow-[0_0_12px_rgba(34,197,94,0.15)] transition-all duration-200"
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
                          className="gap-2 rounded-xl border-destructive/40 text-destructive hover:bg-destructive/10 hover:border-destructive hover:shadow-[0_0_12px_rgba(239,68,68,0.15)] transition-all duration-200"
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
                        <Button
                          key={action.key}
                          variant="ghost"
                          className="gap-2 rounded-xl text-primary/80 hover:text-primary hover:bg-primary/10 transition-all"
                          onClick={() => onOpenSiriAnalysis?.(message.id, message.title)}
                        >
                          <Sparkles className="h-4 w-4" />
                          {action.label}
                        </Button>
                      );
                    }
                    if (action.key === 'merge_pr') {
                      return (
                        <Button
                          key={action.key}
                          variant="outline"
                          className="gap-2 rounded-xl border-border/80 hover:bg-secondary transition-all"
                          disabled={mergingActionId === message.id}
                          onClick={() => onMergePR?.(message, action)}
                        >
                          <GitMerge className="h-4 w-4" />
                          {action.label}
                        </Button>
                      );
                    }
                    return null;
                  })}
                </div>
              </div>
            </div>
          </div>
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
  onOpenDetail,
}: {
  open: boolean;
  query: string;
  messages: ConversationMessage[];
  repositories: Repository[];
  selectedRepository?: Repository;
  onQueryChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
  onOpenDetail: (message: ConversationMessage) => void;
}) {
  const repositoryMap = useMemo(
    () => new Map(repositories.map((repository) => [repository.id, repository])),
    [repositories],
  );

  const normalizedQuery = query.trim().toLowerCase();
  const queryTerms = useMemo(() => normalizedQuery.split(/\s+/).filter(Boolean), [normalizedQuery]);

  const scopedMessages = selectedRepository
    ? messages.filter((message) => message.sourceRepositoryId === selectedRepository.id)
    : messages;

  const results = useMemo(() => {
    if (queryTerms.length === 0) {
      return scopedMessages.slice(0, 20);
    }
    return scopedMessages
      .filter((message) => {
        const searchContent = [
          message.title,
          message.body,
          message.author,
          message.branch ?? '',
          message.eventTypeLabel ?? '',
        ].join(' ').toLowerCase();

        return queryTerms.every((term) => searchContent.includes(term));
      })
      .slice(0, 50);
  }, [scopedMessages, queryTerms]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto border-l border-border bg-background/95 backdrop-blur-md sm:max-w-xl p-0 shadow-2xl flex flex-col h-full">
        {/* Header with gradient glow accent */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary via-purple-500 to-indigo-500 z-10" />

        <div className="px-6 py-6 border-b border-border/50 bg-secondary/10 mt-1">
          <SheetHeader className="space-y-4 text-left">
            <div className="flex items-center justify-between">
              <SheetTitle className="text-lg font-bold tracking-tight text-foreground/90 flex items-center gap-2">
                <Command className="h-4.5 w-4.5 text-primary" />
                搜索会话记录
              </SheetTitle>
              <SheetDescription className="sr-only">
                按标题、正文、作者、分支或消息类型搜索当前会话记录。
              </SheetDescription>
              {results.length > 0 && (
                <span className="text-xs font-semibold text-muted-foreground/60 bg-secondary px-2.5 py-0.5 rounded-full border border-border/40">
                  找到 {results.length} 条记录
                </span>
              )}
            </div>

            <div className="relative flex items-center">
              <Search className="absolute left-3.5 h-4 w-4 text-muted-foreground/75" />
              <Input
                value={query}
                onChange={(event) => onQueryChange(event.target.value)}
                placeholder={selectedRepository ? `在 ${selectedRepository.fullName} 中搜索...` : '在所有会话中搜索关键词...'}
                className="pl-10 pr-10 py-5 rounded-xl bg-secondary/40 border-border/70 hover:bg-secondary/60 focus-visible:ring-primary/40 focus-visible:bg-secondary/35 transition-all text-sm placeholder:text-muted-foreground/65"
                autoFocus
              />
              {query && (
                <button
                  type="button"
                  onClick={() => onQueryChange('')}
                  className="absolute right-3.5 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </SheetHeader>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3.5">
          {results.length > 0 ? (
            results.map((message) => {
              const repository = message.sourceRepositoryId
                ? repositoryMap.get(message.sourceRepositoryId)
                : undefined;

              return (
                <Link
                  key={message.id}
                  to={message.sourceRepositoryId ? `/workbench/repository/${message.sourceRepositoryId}?messageId=${message.id}` : `/workbench?messageId=${message.id}`}
                  className="relative block rounded-xl border border-border/50 bg-card/45 backdrop-blur-sm p-4.5 pl-6 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:bg-secondary/30 hover:border-primary/25 overflow-hidden group"
                  onClick={() => {
                    onOpenChange(false);
                    onOpenDetail(message);
                  }}
                >
                  {/* Left accent indicator strip matching message risk */}
                  <div className={cn(
                    "absolute left-0 top-0 bottom-0 w-1 transition-all group-hover:w-1.5",
                    message.risk === 'high' ? 'bg-destructive' :
                    message.risk === 'medium' ? 'bg-warning' :
                    'bg-primary/70'
                  )} />

                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={cn('rounded-full text-[10px] font-medium backdrop-blur-sm shadow-sm scale-95 origin-left', getMessageKindBadgeClass(message))}>
                      {getMessageKindLabel(message)}
                    </Badge>
                    <span className="min-w-0 truncate text-xs text-muted-foreground/60 flex items-center gap-1.5">
                      <Folder className="h-3 w-3 text-muted-foreground/45" />
                      <span className="truncate hover:text-foreground/80 transition-colors">
                        {repository?.fullName ?? '未知仓库'}
                      </span>
                      <span>·</span>
                      <span>{message.time}</span>
                    </span>
                  </div>

                  <p className="mt-2.5 truncate text-sm font-semibold text-foreground/90 group-hover:text-primary transition-colors">
                    <HighlightText text={message.title} query={query} />
                  </p>

                  <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground/75 font-normal">
                    <HighlightText text={getSearchBodyPreview(message.body, query)} query={query} />
                  </p>
                </Link>
              );
            })
          ) : (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 px-4 py-16 text-center shadow-inner bg-secondary/5 mt-4">
              <div className="p-3 bg-secondary/40 rounded-full border border-border/40 text-muted-foreground/50 mb-3.5">
                <Search className="h-6 w-6" />
              </div>
              <p className="text-sm font-semibold text-foreground/80">没有匹配的消息记录</p>
              <p className="text-xs text-muted-foreground/65 mt-1 max-w-[280px]">
                我们无法搜索到与 "{query}" 相关的任何消息。您可以尝试更改或缩减关键词。
              </p>
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
  const isRepositoryMonitored = isRepositoryMonitoredInScope(monitoredRepositoryIds, repository?.id);
  const repositorySearchKey = repository?.id ?? '';
  const [branchSearch, setBranchSearch] = useState({ repositoryId: '', query: '' });
  const searchQuery = open && branchSearch.repositoryId === repositorySearchKey ? branchSearch.query : '';
  const setBranchSearchQuery = (query: string) => {
    setBranchSearch({ repositoryId: repositorySearchKey, query });
  };
  const handleSheetOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setBranchSearch({ repositoryId: repositorySearchKey, query: '' });
    }
    onOpenChange(nextOpen);
  };

  const filteredBranches = useMemo(() => {
    const data = branchesQuery.data ?? [];
    if (!searchQuery.trim()) {
      return data;
    }
    const normalized = searchQuery.toLowerCase().trim();
    return data.filter((branch) => branch.name.toLowerCase().includes(normalized));
  }, [branchesQuery.data, searchQuery]);

  return (
    <Sheet open={open} onOpenChange={handleSheetOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto border-l border-border bg-background/95 backdrop-blur-md sm:max-w-xl p-0 shadow-2xl flex flex-col h-full">
        {/* Header with gradient glow accent */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary via-purple-500 to-indigo-500 z-10" />

        <div className="px-6 py-6 border-b border-border/50 bg-secondary/10 mt-1">
          <SheetHeader className="space-y-2 text-left">
            <SheetTitle className="text-lg font-bold tracking-tight text-foreground/90 flex items-center gap-2">
              <GitBranch className="h-4.5 w-4.5 text-primary" />
              分支监控配置
            </SheetTitle>
            <SheetDescription className="sr-only">
              配置当前仓库是否纳入监控，以及需要监控的分支范围。
            </SheetDescription>
            <p className="text-xs text-muted-foreground flex items-center gap-1.5 font-medium">
              <Folder className="h-3.5 w-3.5 text-muted-foreground/60" />
              {repository ? repository.fullName : '未选择仓库'}
            </p>
          </SheetHeader>
        </div>

        {repository ? (
          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            {/* Join Monitoring Scope Switch Card */}
            <div
              className={cn(
                "flex w-full items-center justify-between gap-4 rounded-xl border p-4.5 text-left transition-all duration-200 shadow-sm",
                isRepositoryMonitored
                  ? "bg-primary/5 border-primary/20 hover:bg-primary/10"
                  : "bg-secondary/15 border-border/60 hover:bg-secondary/20",
                saving ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
              )}
              onClick={() => {
                if (!saving) {
                  onToggleRepository();
                }
              }}
            >
              <div className="flex items-center gap-3">
                <Checkbox checked={isRepositoryMonitored} className="pointer-events-none data-[state=checked]:bg-primary data-[state=checked]:border-primary" />
                <div>
                  <p className="text-sm font-semibold text-foreground/90">加入监控范围</p>
                  <p className="text-xs text-muted-foreground/75 mt-0.5">关闭后，该仓库的数据、变更和推送事件将不会出现在仪表盘或收件箱中。</p>
                </div>
              </div>
            </div>

            {/* Branch Filtering Card */}
            <div className={cn(
              "rounded-2xl border border-border/50 bg-secondary/10 backdrop-blur-sm p-5 shadow-sm transition-all duration-200",
              !isRepositoryMonitored && "opacity-50 pointer-events-none"
            )}>
              <div className="flex items-center justify-between gap-4 pb-3 border-b border-border/40">
                <div>
                  <p className="text-sm font-semibold text-foreground/90 flex items-center gap-1.5">
                    <SlidersHorizontal className="h-4 w-4 text-primary/70" />
                    监控特定分支
                  </p>
                  <p className="text-[11px] text-muted-foreground/75 mt-0.5">
                    {selectedBranches.length > 0
                      ? `已过滤监控 ${selectedBranches.length} 个分支`
                      : '默认监控全部分支 (未做任何筛选)'}
                  </p>
                </div>
                {selectedBranches.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7.5 px-3 text-xs rounded-lg border-border hover:bg-secondary transition-all"
                    onClick={onResetBranches}
                    disabled={saving || !isRepositoryMonitored}
                  >
                    重置为全部
                  </Button>
                )}
              </div>

              {isRepositoryMonitored && (
                <div className="mt-4 space-y-3">
                  {/* Branch Search Box */}
                  <div className="relative flex items-center">
                    <Search className="absolute left-3 h-3.5 w-3.5 text-muted-foreground/60" />
                    <Input
                      value={searchQuery}
                      onChange={(e) => setBranchSearchQuery(e.target.value)}
                      placeholder="搜索分支名称..."
                      className="pl-9 pr-9 h-9 rounded-lg bg-secondary/30 border-border/50 hover:bg-secondary/40 focus-visible:ring-primary/30 text-xs transition-all"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setBranchSearchQuery('')}
                        className="absolute right-3 p-0.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>

                  {/* Branch List */}
                  <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
                    {branchesQuery.isLoading ? (
                      <div className="flex items-center gap-2 py-6 justify-center text-xs text-muted-foreground/75">
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                        <span>正在加载分支列表...</span>
                      </div>
                    ) : filteredBranches.length > 0 ? (
                      filteredBranches.map((branch) => {
                        const isSelected = selectedBranches.includes(branch.name);
                        return (
                          <div
                            key={branch.name}
                            className={cn(
                              "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition-all duration-150 text-xs font-mono",
                              isSelected ? "bg-primary/5 text-primary" : "text-muted-foreground",
                              saving || !isRepositoryMonitored ? "opacity-50 cursor-not-allowed" : "hover:bg-secondary/40 hover:text-foreground cursor-pointer"
                            )}
                            onClick={() => {
                              if (!saving && isRepositoryMonitored) {
                                onToggleBranch(branch.name);
                              }
                            }}
                          >
                            <Checkbox checked={isSelected} className="pointer-events-none scale-90 data-[state=checked]:bg-primary data-[state=checked]:border-primary" />
                            <span className="min-w-0 flex-1 truncate">{branch.name}</span>
                            {branch.isDefault ? (
                              <Badge variant="secondary" className="rounded-full text-[9px] px-1.5 py-0 bg-secondary/80 text-secondary-foreground border border-border/40 font-sans font-medium">默认</Badge>
                            ) : null}
                          </div>
                        );
                      })
                    ) : (
                      <div className="py-8 text-center text-xs text-muted-foreground/60 border border-dashed border-border/50 rounded-xl bg-secondary/5">
                        {searchQuery ? '未找到匹配的分支' : '暂无可用分支数据'}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {!isRepositoryMonitored && (
                <div className="mt-4 p-4 text-center text-xs text-muted-foreground/65 border border-dashed border-border/50 rounded-xl bg-secondary/5">
                  请先开启仓库监控，以配置具体的分支过滤规则。
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center mt-10">
            <div className="bg-gradient-to-br from-primary/20 via-purple-500/10 to-indigo-500/20 rounded-full p-6 mb-4 shadow-inner">
              <GitBranch className="h-12 w-12 text-primary/60" />
            </div>
            <p className="text-sm font-semibold text-foreground/80">还未选择仓库</p>
            <p className="text-xs text-muted-foreground/65 mt-1.5 max-w-[260px] leading-relaxed">
              请从左侧仓库列表中选择一个仓库，即可配置分支监控
            </p>
          </div>
        )}
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

function getWebhookDeliveryMeta(lastResponse: {
  code: number | null;
  status: string | null;
  message: string | null;
} | null) {
  if (!lastResponse) {
    return {
      label: '暂无投递记录',
      className: 'text-muted-foreground',
    };
  }

  const status = lastResponse.status?.trim();
  const message = lastResponse.message?.trim();
  const code = lastResponse.code;
  const ok =
    status?.toLowerCase() === 'ok' ||
    (typeof code === 'number' && code >= 200 && code < 300);
  const prefix = typeof code === 'number' ? `${code}` : (status || 'unknown');
  const detail = message && message !== status ? ` · ${message}` : '';

  return {
    label: `${ok ? '成功' : '异常'}：${prefix}${detail}`,
    className: ok ? 'text-success-foreground' : 'text-destructive',
  };
}

function RepositoryWebhookSection({
  repository,
  canManageWebhook,
}: {
  repository: Repository;
  canManageWebhook?: boolean;
}) {
  const [secretVisible, setSecretVisible] = useState(false);
  const [isRefreshingTunnel, setIsRefreshingTunnel] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const autoRetryTriggeredRef = useRef(false);
  const canUseWebhookControls =
    canManageWebhook ?? repository.canOperate ?? repository.isEditable ?? true;
  const statusQuery = useWebhookStatusQuery(repository.id, canUseWebhookControls);
  const retryMutation = useRetryWebhookMutation();
  const testMutation = useTestWebhookMutation();
  const data = statusQuery.data;
  const isRetryingWebhook = retryMutation.isPending || isRefreshingTunnel;

  const handleCopy = (text: string, label: string) => {
    void navigator.clipboard.writeText(text).then(
      () => toast.success(`${label}已复制`),
      () => toast.error(`复制${label}失败`),
    );
  };

  const handleRetry = async () => {
    try {
      let refreshedTunnel = false;
      const tunnelBridge = isDesktopRuntime() ? window.repoPulseDesktop?.tunnel : undefined;
      if (tunnelBridge) {
        setIsRefreshingTunnel(true);
        const status = await tunnelBridge.refresh();
        refreshedTunnel = true;
        if (status.state === 'error') {
          throw new Error(status.error ?? '隧道刷新失败');
        }
        if (!status.publicUrl) {
          throw new Error('隧道刷新后未返回公网 URL');
        }
      }

      const result = await retryMutation.mutateAsync(repository.id);
      if (result.webhookStatus === WebhookStatus.ACTIVE) {
        toast.success(refreshedTunnel ? '隧道已刷新，Webhook 重建成功' : 'Webhook 重建成功');
      } else {
        toast.warning(
          `Webhook 仍未配置成功：${result.webhookError ?? result.webhookStatus}`,
        );
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '重建失败');
    } finally {
      setIsRefreshingTunnel(false);
    }
  };

  // OAuth 重新授权回来后自动 retry（URL 带 ?webhook_recheck=1）
  useEffect(() => {
    if (!canUseWebhookControls) {
      return;
    }
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
  }, [canUseWebhookControls, searchParams]);

  const handleTest = async () => {
    try {
      await testMutation.mutateAsync(repository.id);
      toast.success('已要求 GitHub 重发 ping，请稍候查看 Recent Deliveries');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '测试失败');
    }
  };

  if (!canUseWebhookControls) {
    return (
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Webhook className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold text-foreground">Webhook 配置</span>
          </div>
          <Badge
            variant="outline"
            className="rounded-full border-muted-foreground/30 bg-secondary text-[11px] text-muted-foreground"
          >
            只读监控
          </Badge>
        </div>
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          当前仓库没有可操作权限，不需要配置 webhook；事件会通过同步在允许范围内延迟更新。
        </p>
      </div>
    );
  }

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
  const deliveryMeta = getWebhookDeliveryMeta(data.lastResponse);
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

        <div className="flex items-start gap-2">
          <span className="w-14 shrink-0 text-muted-foreground">最近投递</span>
          <span className={cn('min-w-0 flex-1', deliveryMeta.className)}>
            {deliveryMeta.label}
          </span>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {data.status === WebhookStatus.INSUFFICIENT_SCOPE ? (
          <Button
            type="button"
            size="sm"
            variant="default"
            className="gap-1.5"
            onClick={() => {
              window.location.href = isDesktopRuntime() ? '#/workbench/settings' : '/workbench/settings';
              toast.info('请在设置的集成页更新 GitHub token 后再重新创建 webhook');
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
          disabled={isRetryingWebhook}
        >
          {isRetryingWebhook ? (
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
  unreadBoundary,
  repositoryCanOperate,
  onOpenAgent,
  onApproveMessage,
  onRejectMessage,
  approvalActionId,
  mergingActionId,
  onMergePR,
  onOpenDetail,
  onOpenSiriAnalysis,
  hasOlderMessages,
  loadingOlderMessages,
  onLoadOlderMessages,
}: {
  repository: Repository;
  messages: ConversationMessage[];
  unreadBoundary?: WorkbenchUnreadBoundary | null;
  repositoryCanOperate?: boolean;
  onOpenAgent: (prompt: string) => void;
  onApproveMessage: (message: ConversationMessage) => void;
  onRejectMessage: (message: ConversationMessage) => void;
  approvalActionId?: string;
  mergingActionId?: string;
  onMergePR?: (message: ConversationMessage, action: MessageAction) => void;
  onOpenDetail: (message: ConversationMessage | null) => void;
  onOpenSiriAnalysis?: (eventId: string, eventTitle: string) => void;
  hasOlderMessages?: boolean;
  loadingOlderMessages?: boolean;
  onLoadOlderMessages?: () => void;
}) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [activeFilter, setActiveFilter] = useState<MessageFilterKey>('all');
  const [pendingUnreadJump, setPendingUnreadJump] = useState(false);
  const [isGitTreeOpen, setIsGitTreeOpen] = useState(() => {
    return localStorage.getItem('repo-pulse:repo-git-tree-open') === 'true';
  });
  const unreadBoundaryRef = useRef<HTMLDivElement | null>(null);
  const coldLoadSentinelRef = useRef<HTMLDivElement | null>(null);
  const coldLoadGuardRef = useRef(false);

  const [searchParams, setSearchParams] = useSearchParams();
  const focusMessageId = searchParams.get('messageId');


  const [gitTreeWidth, setGitTreeWidth] = useState(() => {
    return Number(localStorage.getItem('repo-pulse:git-tree-sidebar-width')) || 320;
  });
  const [isGitTreeResizing, setIsGitTreeResizing] = useState(false);
  const gitTreeResizeStartRef = useRef({ clientX: 0, width: 320 });

  useEffect(() => {
    if (!isGitTreeResizing) {
      return;
    }

    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;

    function handlePointerMove(event: globalThis.PointerEvent) {
      const delta = event.clientX - gitTreeResizeStartRef.current.clientX;
      const newWidth = Math.min(600, Math.max(280, gitTreeResizeStartRef.current.width - delta));
      setGitTreeWidth(newWidth);
      localStorage.setItem('repo-pulse:git-tree-sidebar-width', String(newWidth));
    }

    function handlePointerUp() {
      setIsGitTreeResizing(false);
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
  }, [isGitTreeResizing]);

  const handleGitTreeResizePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    gitTreeResizeStartRef.current = {
      clientX: event.clientX,
      width: gitTreeWidth,
    };
    setIsGitTreeResizing(true);
  };
  const focusedMessage = useMemo(
    () => (focusMessageId ? messages.find((message) => message.id === focusMessageId) ?? null : null),
    [focusMessageId, messages],
  );
  const shouldResetFilterForFocus = Boolean(focusedMessage && !doesMessageMatchFilter(focusedMessage, activeFilter));
  const effectiveActiveFilter = shouldResetFilterForFocus ? 'all' : activeFilter;
  const filteredMessages = useMemo(
    () => messages.filter((message) => doesMessageMatchFilter(message, effectiveActiveFilter)),
    [effectiveActiveFilter, messages],
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

  // Handle auto-scroll, highlighting, opening drawer, and query cleaning
  useEffect(() => {
    if (focusMessageId) {
      const timer = setTimeout(() => {
        if (shouldResetFilterForFocus) {
          setActiveFilter('all');
        }
        const element = document.querySelector(`[data-message-id="${focusMessageId}"]`);
        if (element) {
          element.scrollIntoView({ block: 'center', behavior: 'smooth' });

          const card = element.querySelector('.bg-card');
          if (card) {
            card.classList.add('animate-message-highlight');
            setTimeout(() => {
              card.classList.remove('animate-message-highlight');
            }, 2500);
          }

          const targetMsg = messages.find((m) => m.id === focusMessageId);
          if (targetMsg) {
            onOpenDetail(targetMsg);
          }

          const nextParams = new URLSearchParams(searchParams);
          nextParams.delete('messageId');
          setSearchParams(nextParams, { replace: true });
        }
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [focusMessageId, messages, onOpenDetail, searchParams, setSearchParams, shouldResetFilterForFocus]);

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
    const sentinel = coldLoadSentinelRef.current;
    if (!sentinel || !hasOlderMessages || !onLoadOlderMessages) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting && !loadingOlderMessages && !coldLoadGuardRef.current) {
          coldLoadGuardRef.current = true;
          onLoadOlderMessages();
        }
      },
      { rootMargin: '200px' },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasOlderMessages, loadingOlderMessages, onLoadOlderMessages]);

  useEffect(() => {
    if (!loadingOlderMessages) {
      coldLoadGuardRef.current = false;
    }
  }, [loadingOlderMessages]);

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
    <div className="flex w-full h-full min-h-0 overflow-hidden bg-background">
      <style>{`
        @keyframes message-highlight-flash {
          0% { background-color: transparent; }
          20% { background-color: hsl(var(--primary) / 0.15); box-shadow: 0 0 16px hsl(var(--primary) / 0.12); border-color: hsl(var(--primary) / 0.4); }
          80% { background-color: hsl(var(--primary) / 0.15); box-shadow: 0 0 16px hsl(var(--primary) / 0.12); border-color: hsl(var(--primary) / 0.4); }
          100% { background-color: transparent; }
        }
        .animate-message-highlight {
          animation: message-highlight-flash 2.5s ease-out;
        }
      `}</style>
      <div className="flex-1 min-w-0 flex flex-col h-full min-h-0">
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
          <Button
            type="button"
            size="sm"
            variant={isGitTreeOpen ? "secondary" : "outline"}
            className={cn("h-8 rounded-full gap-1.5 text-xs font-semibold select-none", !hasUnreadBoundary && "ml-auto")}
            onClick={() => {
              setIsGitTreeOpen(prev => {
                const next = !prev;
                localStorage.setItem('repo-pulse:repo-git-tree-open', String(next));
                return next;
              });
            }}
          >
            <GitBranch className={cn("h-4 w-4", isGitTreeOpen && "text-primary")} />
            <span>Git 状态</span>
          </Button>
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1 min-w-0">
        <div className="mx-auto flex max-w-4xl flex-col gap-4 px-6 py-6">
          <RepositoryWebhookSection
            repository={repository}
            canManageWebhook={repositoryCanOperate}
          />
          {filteredMessages.length > 0 ? (
            <>
              {filteredMessages.map((message) => {
                const shouldRenderUnreadBoundary =
                  hasUnreadBoundary && unreadBoundary?.messageId === message.id;

                return (
                  <div key={message.id} className="contents">
                    <ConversationBubble
                      message={message}
                      repository={repository}
                      onOpenDetail={onOpenDetail}
                      onOpenAgent={onOpenAgent}
                      onApproveMessage={onApproveMessage}
                      onRejectMessage={onRejectMessage}
                      approvalActionId={approvalActionId}
                      mergingActionId={mergingActionId}
                      onMergePR={onMergePR}
                      onOpenSiriAnalysis={onOpenSiriAnalysis}
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
              })}
              {hasOlderMessages ? (
                <>
                  <div
                    ref={coldLoadSentinelRef}
                    className="h-px w-full"
                    aria-hidden
                  />
                  <div className="flex justify-center">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 gap-2 rounded-full"
                      disabled={loadingOlderMessages}
                      onClick={onLoadOlderMessages}
                    >
                      {loadingOlderMessages ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                      加载更早消息
                    </Button>
                  </div>
                </>
              ) : null}
            </>
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

      </div>

      {isGitTreeOpen && (
        <div
          className="border-l border-border bg-card flex flex-col h-full shrink-0 relative animate-in slide-in-from-right duration-250"
          style={{ width: gitTreeWidth }}
        >
          {/* Resize separator handle on the left edge */}
          <div
            className="desktop-no-drag group absolute bottom-0 left-[-4px] top-0 z-40 w-2 cursor-col-resize outline-none"
            role="separator"
            tabIndex={0}
            onPointerDown={handleGitTreeResizePointerDown}
            onDoubleClick={() => {
              setGitTreeWidth(320);
              localStorage.setItem('repo-pulse:git-tree-sidebar-width', '320');
            }}
          >
            <span className="absolute left-[3px] top-0 h-full w-px bg-transparent transition-colors group-hover:bg-primary/50 group-focus-visible:bg-primary" />
          </div>

          <GitTreePanel
            repositoryId={repository.id}
            repositoryUrl={repository.url}
            localCwd={getAgentWorkspaceMemory(repository.id)?.cwd}
            onAskAgent={onOpenAgent}
          />
        </div>
      )}
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
              <Link to="/workbench/dashboard">打开仓库看板</Link>
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
        <DialogContent
          style={{ display: 'flex', flexDirection: 'column' }}
          className="max-h-[min(760px,calc(100dvh-2rem))] w-[calc(100vw-2rem)] max-w-3xl gap-0 overflow-hidden rounded-xl border-border bg-background p-0"
        >
          <DialogHeader className="border-b border-border bg-card/80 px-6 py-5 pr-12 text-left shrink-0">
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

          <div className="flex-1 overflow-y-auto min-h-0 px-6 py-5 space-y-6">
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

          <DialogFooter className="border-t border-border bg-background/95 px-6 py-4 sm:items-center sm:justify-between shrink-0">
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
  hasMore,
  loadingMore,
  onLoadMore,
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
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
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
                "absolute left-1/2 -translate-x-1/2 z-0 refresh-transition",
                isRefreshing 
                  ? "top-4 opacity-100 scale-100 pointer-events-auto" 
                  : "-top-12 opacity-0 scale-50 pointer-events-none"
              )}>
                <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card shadow-lg ring-1 ring-black/5 dark:ring-white/10">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                </div>
              </div>

              {/* Feed Card List with translation transition */}
              <div className={cn(
                "refresh-transition",
                isRefreshing ? "translate-y-16" : "translate-y-0"
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
                    {hasMore ? (
                      <div className="flex justify-center pt-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-9 gap-2 rounded-full"
                          disabled={loadingMore}
                          onClick={onLoadMore}
                        >
                          {loadingMore ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                          加载更多动态
                        </Button>
                      </div>
                    ) : null}
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

type AgentSessionStatus = 'ready' | 'running' | 'waiting_permission' | 'error' | 'finished';
type AgentToolStatus = 'running' | 'success' | 'failed';
type AgentWorkflowStatus = 'pending' | 'running' | 'waiting' | 'success' | 'error';
type AgentWorkflowType = 'system' | 'thought' | 'tool' | 'permission' | 'result';

interface AgentChoiceOption {
  id: string;
  label: string;
  value: string;
}

type AgentMessage =
  | { id: string; type: 'user' | 'assistant' | 'thought' | 'system' | 'error'; content: string }
  | {
      id: string;
      type: 'choice_request';
      prompt: string;
      options: AgentChoiceOption[];
      sourceMessageId?: string;
      selectedOptionId?: string;
      customValue?: string;
      response?: string;
      status?: 'open' | 'submitted';
    }
  | {
      id: string;
      type: 'tool_call';
      toolUseID?: string;
      name?: string;
      command?: string;
      status: AgentToolStatus;
      output?: string;
      error?: string;
      permissionResolved?: 'approved' | 'rejected';
    };

interface AgentWorkflowTask {
  id: string;
  subject: string;
  status: 'pending' | 'in_progress' | 'completed' | 'deleted';
  activeForm?: string;
}

interface AgentWorkflowActivity {
  id: string;
  type: AgentWorkflowType;
  title: string;
  status: AgentWorkflowStatus;
  timestamp: string;
  detail?: string;
  command?: string;
  toolUseID?: string;
  toolName?: string;
  output?: string;
  error?: string;
  tasks?: AgentWorkflowTask[];
  permissionResolved?: 'approved' | 'rejected';
}

interface AgentSession {
  id: string;
  title: string;
  prompt: string;
  status: AgentSessionStatus;
  messages: AgentMessage[];
  workflowActivities: AgentWorkflowActivity[];
  error: string | null;
  createdAt: string;
  sdkSessionId?: string | null;
  sdkSessionUpdatedAt?: string | null;
  pendingPermission?: AgentPendingPermission | null;
}

interface AgentPendingPermission {
  toolUseID: string;
  toolName?: string;
  command?: string;
  input?: unknown;
  title?: string;
  description?: string;
  displayName?: string;
  blockedPath?: string;
  decisionReason?: string;
}

interface AgentIpcMessage extends Record<string, unknown> {
  type?: string;
  text?: string;
  message?: string;
  source?: string;
  remembered?: boolean;
  resumed?: boolean;
  cwd?: string;
  branch?: string;
  sessionId?: string;
  toolUseID?: string;
  name?: string;
  input?: unknown;
  output?: string;
  error?: string;
}

const createAgentId = () => Math.random().toString(36).substring(2, 9);

interface AgentWorkspaceMemory {
  cwd: string;
  branch?: string | null;
  authorizedAt: string;
}

const agentWorkspaceMemoryKey = (repoId: string) => `repo-pulse:agent-workspace-memory:${repoId}`;

function getAgentWorkspaceMemory(repoId: string): AgentWorkspaceMemory | null {
  if (!repoId) return null;
  try {
    const raw = localStorage.getItem(agentWorkspaceMemoryKey(repoId));
    const parsed = raw ? JSON.parse(raw) : null;
    if (typeof parsed?.cwd === 'string' && parsed.cwd.trim()) {
      return {
        cwd: parsed.cwd,
        branch: typeof parsed.branch === 'string' ? parsed.branch : null,
        authorizedAt: typeof parsed.authorizedAt === 'string' ? parsed.authorizedAt : new Date().toISOString(),
      };
    }
  } catch {
    localStorage.removeItem(agentWorkspaceMemoryKey(repoId));
  }
  return null;
}

function saveAgentWorkspaceMemory(repoId: string, memory: AgentWorkspaceMemory) {
  if (!repoId || !memory.cwd.trim()) return;
  localStorage.setItem(agentWorkspaceMemoryKey(repoId), JSON.stringify(memory));
}

function createDefaultAgentSession(title = '默认会话'): AgentSession {
  return {
    id: createAgentId(),
    title,
    prompt: '',
    status: 'ready',
    messages: [],
    workflowActivities: [],
    error: null,
    createdAt: new Date().toISOString(),
    sdkSessionId: null,
    sdkSessionUpdatedAt: null,
  };
}

function safeRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : null;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function stringifyCompact(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value == null) return '';
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function stripMarkdownInline(value: string): string {
  return value
    .replace(/\*\*/g, '')
    .replace(/__+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function createAgentChoiceRequestFromAssistant(message: { id: string; type: 'assistant'; content: string }): AgentMessage | null {
  const content = message.content.trim();
  if (!content) return null;

  const lines = content.split(/\r?\n/);
  let triggerIndex = -1;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (/(您希望我|你希望我|请选择|选择以下|请确认|确认一下|需要确认|需要您确认|能否告诉我|请告诉我)/.test(lines[index])) {
      triggerIndex = index;
      break;
    }
  }

  if (triggerIndex === -1) return null;

  const promptLine = lines.slice(triggerIndex).find((line) => /[?？]|(您希望我|你希望我|请选择|请确认|能否告诉我|请告诉我)/.test(line));
  const prompt = stripMarkdownInline(promptLine || '请选择下一步操作，或补充你的要求。');
  const options: AgentChoiceOption[] = [];

  for (const line of lines.slice(triggerIndex + 1)) {
    const match = line.match(/^\s*(?:[-*]|\d+[.)、）])\s+(.+?)\s*$/);
    if (!match) continue;
    const label = stripMarkdownInline(match[1] ?? '');
    if (!label) continue;
    options.push({
      id: `option-${options.length + 1}`,
      label,
      value: label,
    });
    if (options.length >= 5) break;
  }

  return {
    id: `choice:${message.id}`,
    type: 'choice_request',
    prompt,
    options,
    sourceMessageId: message.id,
    status: 'open',
  };
}

function appendChoiceRequestIfNeeded(messages: AgentMessage[]): AgentMessage[] {
  const hasOpenChoice = messages.some((item) => item.type === 'choice_request' && item.status !== 'submitted');
  if (hasOpenChoice) return messages;

  const lastAssistant = [...messages].reverse().find((item): item is { id: string; type: 'assistant'; content: string } => item.type === 'assistant');
  if (!lastAssistant) return messages;

  const choiceRequest = createAgentChoiceRequestFromAssistant(lastAssistant);
  if (!choiceRequest) return messages;

  const alreadyExists = messages.some((item) => item.id === choiceRequest.id);
  if (alreadyExists) return messages;
  return [...messages, choiceRequest];
}

function extractToolCommand(input: unknown): string {
  const record = safeRecord(input);
  if (!record) return stringifyCompact(input);

  const command = record.command ?? record.description ?? record.path ?? record.file_path ?? record.pattern;
  if (typeof command === 'string' && command.trim()) return command.trim();

  return stringifyCompact(input);
}

function getToolDisplayName(name?: string, input?: unknown): string {
  const record = safeRecord(input);
  if (name === 'Bash') return '执行命令';
  if (name === 'TodoWrite') return '更新任务列表';
  if (name === 'TaskCreate') return '创建任务';
  if (name === 'TaskUpdate') return '更新任务';
  if (name === 'Read') return '读取文件';
  if (name === 'Write' || name === 'Edit' || name === 'MultiEdit') return '修改文件';
  if (typeof record?._displayName === 'string') return record._displayName;
  return name ? `调用 ${name}` : '调用工具';
}

function getPermissionCommand(request?: AgentPendingPermission | null): string {
  if (!request) return '';
  if (typeof request.command === 'string' && request.command.trim()) {
    return request.command.trim();
  }

  const extracted = extractToolCommand(request.input);
  if (extracted && extracted !== '{}') return extracted;
  return '';
}

function getPermissionDisplayText(request?: AgentPendingPermission | null): string {
  const command = getPermissionCommand(request);
  if (command) return request?.toolName === 'Bash' ? `$ ${command}` : command;

  const record = safeRecord(request?.input);
  if (record && Object.keys(record).length > 0) {
    return JSON.stringify(record, null, 2);
  }

  return request?.title || request?.description || request?.displayName || '等待工具输入...';
}

function extractWorkflowTasks(input: unknown): AgentWorkflowTask[] | undefined {
  const record = safeRecord(input);
  if (!record) return undefined;

  if (Array.isArray(record.todos)) {
    return record.todos
      .map((todo, index) => {
        const item = safeRecord(todo);
        if (!item) return null;
        const status = item.status === 'in_progress' || item.status === 'completed' || item.status === 'deleted'
          ? item.status
          : 'pending';
        return {
          id: String(item.id ?? `todo-${index}`),
          subject: String(item.subject ?? item.content ?? '未命名任务'),
          status,
          activeForm: typeof item.activeForm === 'string' ? item.activeForm : undefined,
        };
      })
      .filter(Boolean) as AgentWorkflowTask[];
  }

  const subject = record.subject ?? record.description;
  if (typeof subject === 'string' && subject.trim()) {
    return [{
      id: String(record.taskId ?? record.task_id ?? record.id ?? subject),
      subject,
      status: record.status === 'in_progress' || record.status === 'completed' || record.status === 'deleted'
        ? record.status
        : 'pending',
      activeForm: typeof record.activeForm === 'string' ? record.activeForm : undefined,
    }];
  }

  return undefined;
}

function createWorkflowActivity(params: Omit<AgentWorkflowActivity, 'id' | 'timestamp'> & { id?: string; timestamp?: string }): AgentWorkflowActivity {
  return {
    ...params,
    id: params.id ?? createAgentId(),
    timestamp: params.timestamp ?? new Date().toISOString(),
  };
}

function upsertWorkflowActivity(
  activities: AgentWorkflowActivity[],
  next: AgentWorkflowActivity,
): AgentWorkflowActivity[] {
  const index = activities.findIndex((item) => {
    if (next.toolUseID && item.toolUseID === next.toolUseID && item.type === next.type) return true;
    return item.id === next.id;
  });

  if (index === -1) return [...activities, next];

  const updated = [...activities];
  updated[index] = {
    ...updated[index],
    ...next,
    timestamp: updated[index].timestamp,
  };
  return updated;
}

function finalizeWorkflowActivities(activities: AgentWorkflowActivity[], status: AgentWorkflowStatus) {
  return activities.map((item) => {
    if (item.status !== 'running' && item.status !== 'waiting') return item;
    return { ...item, status };
  });
}

function appendSystemMessage(messages: AgentMessage[], content: string): AgentMessage[] {
  const lastMessage = messages[messages.length - 1];
  if (lastMessage?.type === 'system' && lastMessage.content === content) return messages;
  return [...messages, { id: createAgentId(), type: 'system', content }];
}

function buildWorkflowFromMessages(messages: AgentMessage[]): AgentWorkflowActivity[] {
  return messages.flatMap((message) => {
    if (message.type === 'system') {
      return [createWorkflowActivity({
        type: 'system',
        title: message.content,
        status: 'success',
      })];
    }

    if (message.type === 'thought') {
      return [createWorkflowActivity({
        type: 'thought',
        title: '思考规划',
        detail: message.content,
        status: 'success',
      })];
    }

    if (message.type === 'tool_call') {
      return [createWorkflowActivity({
        type: 'tool',
        title: getToolDisplayName(message.name),
        detail: message.command,
        command: message.command,
        status: message.status === 'failed' ? 'error' : message.status === 'success' ? 'success' : 'running',
        toolUseID: message.toolUseID,
        toolName: message.name,
        output: message.output,
        error: message.error,
      })];
    }

    if (message.type === 'error') {
      return [createWorkflowActivity({
        type: 'result',
        title: '执行未成功完成',
        detail: message.content,
        status: 'error',
      })];
    }

    return [];
  });
}

function normalizeAgentSession(raw: unknown): AgentSession {
  const record = safeRecord(raw);
  const messages = Array.isArray(record?.messages) ? record.messages as AgentMessage[] : [];
  const workflowActivities = Array.isArray(record?.workflowActivities) && record.workflowActivities.length > 0
    ? record.workflowActivities as AgentWorkflowActivity[]
    : buildWorkflowFromMessages(messages);
  const status = typeof record?.status === 'string' && ['ready', 'running', 'waiting_permission', 'error', 'finished'].includes(record.status)
    ? record.status as AgentSessionStatus
    : 'ready';

  return {
    id: typeof record?.id === 'string' ? record.id : createAgentId(),
    title: typeof record?.title === 'string' ? record.title : '新会话',
    prompt: typeof record?.prompt === 'string' ? record.prompt : '',
    status,
    messages,
    workflowActivities,
    error: typeof record?.error === 'string' ? record.error : null,
    createdAt: typeof record?.createdAt === 'string' ? record.createdAt : new Date().toISOString(),
    sdkSessionId: typeof record?.sdkSessionId === 'string' ? record.sdkSessionId : null,
    sdkSessionUpdatedAt: typeof record?.sdkSessionUpdatedAt === 'string' ? record.sdkSessionUpdatedAt : null,
    pendingPermission: safeRecord(record?.pendingPermission) as AgentPendingPermission | null,
  };
}

function AgentWorkflowStatusIcon({ activity }: { activity: AgentWorkflowActivity }) {
  if (activity.status === 'running') {
    return <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />;
  }
  if (activity.status === 'waiting') {
    return <Shield className="h-3.5 w-3.5 text-amber-500" />;
  }
  if (activity.status === 'error') {
    return <XCircle className="h-3.5 w-3.5 text-destructive" />;
  }
  if (activity.type === 'tool') {
    return <Terminal className="h-3.5 w-3.5 text-muted-foreground" />;
  }
  return <CheckCheck className="h-3.5 w-3.5 text-emerald-500" />;
}

function AgentWorkflowCard({ session }: { session: AgentSession }) {
  const [expanded, setExpanded] = useState(true);
  const activities = useMemo(() => {
    return session.workflowActivities.length > 0
      ? session.workflowActivities
      : buildWorkflowFromMessages(session.messages);
  }, [session.messages, session.workflowActivities]);

  if (activities.length === 0) return null;

  const isForceExpanded = session.status === 'running' || session.status === 'waiting_permission';
  const isExpanded = expanded || isForceExpanded;
  const runningCount = activities.filter((activity) => activity.status === 'running' || activity.status === 'waiting').length;
  const completedCount = activities.filter((activity) => activity.status === 'success' || activity.status === 'error').length;
  const visibleActivities = isExpanded ? activities : activities.slice(-4);

  return (
    <div className="rounded-xl border border-border bg-card/90 shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(prev => !prev)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-secondary/35"
      >
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            {runningCount > 0 ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckSquare className="h-4 w-4" />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-foreground">Agent 工作流</p>
            <p className="truncate text-[11px] text-muted-foreground">
              {completedCount}/{activities.length} 已完成
              {runningCount > 0 ? ` · ${runningCount} 项进行中` : ''}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge
            variant="outline"
            className={cn(
              'rounded-full px-2 py-0 text-[10px] font-medium',
              runningCount > 0
                ? 'border-primary/30 bg-primary/5 text-primary'
                : session.status === 'error'
                  ? 'border-destructive/30 bg-destructive/5 text-destructive'
                  : 'border-emerald-500/30 bg-emerald-500/5 text-emerald-500',
            )}
          >
            {runningCount > 0 ? 'RUNNING' : session.status === 'error' ? 'ERROR' : 'READY'}
          </Badge>
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>

      <div className={cn(
        'grid transition-[grid-template-rows] duration-300 ease-out',
        expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
      )}>
        <div className="overflow-hidden">
          <div className="space-y-2 px-4 pb-4">
            {visibleActivities.map((activity) => {
              const resultText = activity.error || activity.output;
              return (
                <div key={activity.id} className="rounded-lg border border-border/60 bg-background/60 px-3 py-2.5">
                  <div className="flex items-start gap-2.5">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-secondary">
                      <AgentWorkflowStatusIcon activity={activity} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-xs font-medium text-foreground">{activity.title}</span>
                        {activity.toolName ? (
                          <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
                            {activity.toolName}
                          </span>
                        ) : null}
                      </div>
                      {activity.command || activity.detail ? (
                        <p className={cn(
                          'mt-1 line-clamp-2 text-[11px] leading-5 text-muted-foreground',
                          activity.command && 'font-mono',
                        )}>
                          {activity.command || activity.detail}
                        </p>
                      ) : null}

                      {activity.tasks && activity.tasks.length > 0 ? (
                        <div className="mt-2 space-y-1 rounded-md bg-secondary/35 px-2 py-1.5">
                          {activity.tasks.map((task) => (
                            <div key={task.id} className="flex items-center gap-1.5 text-[11px]">
                              {task.status === 'completed' ? (
                                <CheckCheck className="h-3 w-3 text-emerald-500" />
                              ) : task.status === 'in_progress' ? (
                                <Loader2 className="h-3 w-3 animate-spin text-primary" />
                              ) : (
                                <CircleDot className="h-3 w-3 text-muted-foreground/60" />
                              )}
                              <span className={cn(
                                'min-w-0 flex-1 truncate',
                                task.status === 'completed' && 'text-muted-foreground line-through',
                              )}>
                                {task.status === 'in_progress' && task.activeForm ? task.activeForm : task.subject}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : null}

                      {resultText ? (
                        <pre className={cn(
                          'mt-2 max-h-28 overflow-y-auto whitespace-pre-wrap break-words rounded-md px-2 py-1.5 text-[11px]',
                          activity.error
                            ? 'bg-destructive/10 text-destructive'
                            : 'bg-secondary/45 text-muted-foreground',
                        )}>
                          {resultText}
                        </pre>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}

            {!isExpanded && activities.length > visibleActivities.length ? (
              <p className="text-center text-[11px] text-muted-foreground">
                已收起 {activities.length - visibleActivities.length} 条更早流程
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function AgentChoiceRequestCard({
  message,
  onSubmit,
}: {
  message: Extract<AgentMessage, { type: 'choice_request' }>;
  onSubmit: (messageId: string, response: string) => void;
}) {
  const [selectedOptionId, setSelectedOptionId] = useState(message.selectedOptionId || message.options[0]?.id || '');
  const [customValue, setCustomValue] = useState(message.customValue || '');
  const selectedOption = message.options.find((option) => option.id === selectedOptionId);
  const submitted = message.status === 'submitted';
  const response = [
    selectedOption?.value,
    customValue.trim() ? `补充说明：${customValue.trim()}` : '',
  ].filter(Boolean).join('\n\n');

  return (
    <div className="ml-10 rounded-xl border border-primary/20 bg-card p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <MessageSquare className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <p className="text-sm font-semibold text-foreground">需要你的选择</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{message.prompt}</p>
          </div>

          {message.options.length > 0 ? (
            <div className="grid gap-2">
              {message.options.map((option) => {
                const isSelected = option.id === selectedOptionId;
                return (
                  <button
                    key={option.id}
                    type="button"
                    disabled={submitted}
                    onClick={() => setSelectedOptionId(option.id)}
                    className={cn(
                      'flex min-h-10 w-full items-start gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-colors',
                      isSelected
                        ? 'border-primary/40 bg-primary/10 text-foreground'
                        : 'border-border bg-background/60 text-muted-foreground hover:border-primary/25 hover:bg-secondary/35',
                    )}
                  >
                    {isSelected ? (
                      <CheckCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                    ) : (
                      <CircleDot className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
                    )}
                    <span className="min-w-0 flex-1 leading-5">{option.label}</span>
                  </button>
                );
              })}
            </div>
          ) : null}

          <Textarea
            value={customValue}
            disabled={submitted}
            onChange={(event) => setCustomValue(event.target.value)}
            placeholder="补充具体提交信息、目标分支，或直接描述你的要求..."
            className="min-h-20 resize-y rounded-lg bg-background/70 text-sm"
          />

          {submitted ? (
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-500">
              已发送选择
            </div>
          ) : (
            <div className="flex justify-end">
              <Button
                type="button"
                size="sm"
                disabled={!response.trim()}
                onClick={() => onSubmit(message.id, response)}
                className="h-8 gap-1.5 rounded-lg text-xs font-semibold"
              >
                <Send className="h-3.5 w-3.5" />
                发送选择
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AgentToolCallCard({
  item,
}: {
  item: Extract<AgentMessage, { type: 'tool_call' }>;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasResult = Boolean(item.output || item.error);
  const toggleExpanded = () => {
    if (hasResult) setExpanded(prev => !prev);
  };

  return (
    <div
      role={hasResult ? 'button' : undefined}
      tabIndex={hasResult ? 0 : undefined}
      aria-expanded={hasResult ? expanded : undefined}
      onClick={toggleExpanded}
      onKeyDown={(event) => {
        if (!hasResult) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          toggleExpanded();
        }
      }}
      className={cn(
        'ml-10 rounded-xl border border-border bg-slate-950 p-4 text-xs text-muted-foreground shadow-inner transition-colors',
        hasResult && 'cursor-pointer hover:border-slate-600',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-2">
          <Terminal className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-400" />
          <span className="min-w-0 whitespace-pre-wrap break-words font-mono font-bold leading-5 text-cyan-400">
            {item.command && item.command !== '{}' ? `$ ${item.command}` : getToolDisplayName(item.name)}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant="outline" className={cn(
            'rounded-full px-2 py-0 text-[9px]',
            item.status === 'success' ? 'border-green-500/30 text-green-400 bg-green-500/5' :
            item.status === 'failed' ? 'border-red-500/30 text-red-400 bg-red-500/5' :
            'border-cyan-500/30 text-cyan-400 animate-pulse bg-cyan-500/5',
          )}>
            {item.status === 'success' ? 'SUCCESS' : item.status === 'failed' ? 'FAILED' : 'RUNNING'}
          </Badge>
          {hasResult ? (
            <ChevronDown className={cn(
              'h-4 w-4 text-slate-400 transition-transform',
              expanded && 'rotate-180',
            )} />
          ) : null}
        </div>
      </div>

      {hasResult && expanded ? (
        <div className="mt-3 max-h-[340px] min-h-[112px] overflow-auto border-t border-slate-800 pt-3 sm:max-h-[380px]">
          {item.output ? (
            <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-5 text-slate-300">
              {item.output}
            </pre>
          ) : null}

          {item.error ? (
            <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-5 text-red-400">
              {item.error}
            </pre>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function AgentPermissionRequestCard({
  request,
  onResolve,
}: {
  request: AgentPendingPermission;
  onResolve: (approve: boolean, message?: string) => void;
}) {
  const [choice, setChoice] = useState<'allow' | 'deny'>('allow');
  const [denyMessage, setDenyMessage] = useState('');
  const displayText = getPermissionDisplayText(request);
  const toolLabel = request.displayName || getToolDisplayName(request.toolName, request.input);
  const title = request.toolName === 'Bash' ? 'Allow running this command?' : 'Allow using this tool?';
  const description = request.description || request.title || 'Agent 需要你的确认后才会继续执行。';
  const submit = () => {
    onResolve(choice === 'allow', choice === 'deny' ? denyMessage : undefined);
  };

  return (
    <div className="ml-10 rounded-xl border border-border bg-card p-3.5 shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-250">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Terminal className="h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="truncate text-sm font-semibold text-foreground">{title}</p>
        </div>
        <Badge variant="outline" className="shrink-0 rounded-md border-border bg-background/60 px-2 py-0 text-[10px] text-muted-foreground">
          {toolLabel}
        </Badge>
      </div>

      <pre className="max-h-[148px] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-background/70 px-3 py-2.5 font-mono text-xs leading-5 text-foreground">
        {displayText}
      </pre>

      {description && description !== title ? (
        <p className="mt-2 text-[11px] leading-5 text-muted-foreground">{description}</p>
      ) : null}

      {request.blockedPath ? (
        <p className="mt-2 text-[11px] text-muted-foreground">
          访问路径：<span className="font-mono text-foreground">{request.blockedPath}</span>
        </p>
      ) : null}

      <div className="mt-3 space-y-1.5">
        <button
          type="button"
          onClick={() => setChoice('allow')}
          className={cn(
            'flex min-h-9 w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-sm transition-colors',
            choice === 'allow'
              ? 'border-border bg-secondary text-foreground'
              : 'border-transparent text-muted-foreground hover:bg-secondary/45 hover:text-foreground',
          )}
        >
          <span className="flex h-5 min-w-5 items-center justify-center rounded bg-muted text-xs font-semibold text-muted-foreground">1</span>
          <span className="min-w-0 flex-1">Yes, allow this time</span>
        </button>

        <button
          type="button"
          onClick={() => setChoice('deny')}
          className={cn(
            'flex min-h-9 w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-sm transition-colors',
            choice === 'deny'
              ? 'border-border bg-secondary text-foreground'
              : 'border-transparent text-muted-foreground hover:bg-secondary/45 hover:text-foreground',
          )}
        >
          <span className="flex h-5 min-w-5 items-center justify-center rounded bg-muted text-xs font-semibold text-muted-foreground">2</span>
          <span className="min-w-0 flex-1">No, tell the agent what to do instead</span>
        </button>
      </div>

      {choice === 'deny' ? (
        <Textarea
          value={denyMessage}
          onChange={(event) => setDenyMessage(event.target.value)}
          placeholder="告诉 Agent 应该如何调整..."
          className="mt-3 min-h-20 resize-y rounded-lg bg-background/70 text-sm"
        />
      ) : null}

      <div className="mt-3 flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setChoice('deny');
            onResolve(false);
          }}
          className="h-8 rounded-lg px-3 text-xs font-semibold text-muted-foreground"
        >
          Skip
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={submit}
          className="h-8 gap-1.5 rounded-lg px-3 text-xs font-semibold"
        >
          Submit
          <CornerDownLeft className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

type AgentInputDraft = {
  id: number;
  prompt: string;
};

function AgentChatInputField({
  onSend,
  onStop,
  isRunning,
  hasApiKey,
  hasSessionPrompt,
  initialPrompt = '',
}: {
  onSend: (prompt: string) => void;
  onStop: () => void;
  isRunning: boolean;
  hasApiKey: boolean;
  hasSessionPrompt: boolean;
  initialPrompt?: string;
}) {
  const [input, setInput] = useState(initialPrompt);

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed && !hasSessionPrompt) {
      return;
    }
    if (!hasApiKey) {
      return;
    }
    setInput('');
    onSend(trimmed);
  }, [hasApiKey, hasSessionPrompt, input, onSend]);

  return (
    <div className="border-t border-border bg-background px-6 py-4">
      <div className="mx-auto flex max-w-4xl flex-col gap-2">
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-2 shadow-sm focus-within:ring-1 focus-within:ring-primary focus-within:border-primary">
          <Input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            className="border-0 bg-transparent focus-visible:ring-0 text-sm flex-1"
            placeholder={
              !hasApiKey
                ? '未检测到 API 密钥，请先前往“设置”配置 AI 渠道'
                : '向 Agent 补充说明或要求，回车发送...'
            }
            disabled={!hasApiKey}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') {
                return;
              }
              event.preventDefault();
              if (input.trim()) {
                handleSend();
              }
            }}
          />
          <div className="flex items-center gap-2 shrink-0">
            {isRunning ? (
              <Button
                onClick={onStop}
                variant="destructive"
                size="sm"
                className="h-8 gap-1.5 font-semibold text-xs rounded-lg"
              >
                <X className="h-3.5 w-3.5" />
                停止
              </Button>
            ) : (
              <Button
                onClick={handleSend}
                disabled={(!input.trim() && !hasSessionPrompt) || !hasApiKey}
                size="sm"
                className="h-8 gap-1.5 font-semibold text-xs rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                <Play className="h-3.5 w-3.5" />
                {hasSessionPrompt && !input.trim() ? '重试' : '运行'}
              </Button>
            )}
          </div>
        </div>
        {!hasApiKey && (
          <p className="text-[11px] text-amber-500 flex items-center gap-1.5 px-1 animate-pulse">
            <AlertTriangle className="h-3.5 w-3.5" />
            未在系统设置中配置有效的 Anthropic AI 渠道，Agent 无法使用。请在页面顶部的“设置”中进行配置。
          </p>
        )}
      </div>
    </div>
  );
}

function AgentRunView({
  repository: initialRepository,
  prompt: initialPrompt,
  editableRepos = [],
}: {
  repository?: Repository;
  prompt: string;
  editableRepos?: Repository[];
}) {
  const { data: currentUser } = useCurrentUserQuery();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');

  const [activeApiKey, setActiveApiKey] = useState('');
  const [activeModel, setActiveModel] = useState('claude-3-5-sonnet-latest');
  const [activeBaseUrl, setActiveBaseUrl] = useState('');
  const [activeProvider, setActiveProvider] = useState<AIProvider | null>(null);

  // Project List (Repository IDs)
  const [projectRepoIds, setProjectRepoIds] = useState<string[]>(() => {
    const stored = localStorage.getItem('repo-pulse:agent-projects');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        localStorage.removeItem('repo-pulse:agent-projects');
      }
    }
    return initialRepository ? [initialRepository.id] : [];
  });

  const [expandedRepos, setExpandedRepos] = useState<Record<string, boolean>>({});
  const [sessionsByRepo, setSessionsByRepo] = useState<Record<string, AgentSession[]>>({});
  
  const [activeRepoId, setActiveRepoId] = useState<string>('');
  const [activeSessionId, setActiveSessionId] = useState<string>('');

  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [sidebarRenameTitle, setSidebarRenameTitle] = useState('');

  const [isAddProjectOpen, setIsAddProjectOpen] = useState(false);
  const [chatInputDraft, setChatInputDraft] = useState<AgentInputDraft | null>(null);
  const [isGitTreeOpen, setIsGitTreeOpen] = useState(() => {
    return localStorage.getItem('repo-pulse:agent-git-tree-open') !== 'false';
  });
  const [gitRefreshTrigger, setGitRefreshTrigger] = useState(0);

  const [gitTreeWidth, setGitTreeWidth] = useState(() => {
    return Number(localStorage.getItem('repo-pulse:agent-git-tree-sidebar-width')) || 320;
  });
  const [isGitTreeResizing, setIsGitTreeResizing] = useState(false);
  const gitTreeResizeStartRef = useRef({ clientX: 0, width: 320 });

  useEffect(() => {
    if (!isGitTreeResizing) {
      return;
    }

    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;

    function handlePointerMove(event: globalThis.PointerEvent) {
      const delta = event.clientX - gitTreeResizeStartRef.current.clientX;
      const newWidth = Math.min(600, Math.max(280, gitTreeResizeStartRef.current.width - delta));
      setGitTreeWidth(newWidth);
      localStorage.setItem('repo-pulse:agent-git-tree-sidebar-width', String(newWidth));
    }

    function handlePointerUp() {
      setIsGitTreeResizing(false);
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
  }, [isGitTreeResizing]);

  const handleGitTreeResizePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    gitTreeResizeStartRef.current = {
      clientX: event.clientX,
      width: gitTreeWidth,
    };
    setIsGitTreeResizing(true);
  };

  const messageEndRef = useRef<HTMLDivElement>(null);
  const processedInitialPromptRef = useRef<string | null>(null);
  const activeSessionIdRef = useRef(activeSessionId);
  const activeRepoIdRef = useRef(activeRepoId);
  const runningAgentTargetRef = useRef<{ repoId: string; sessionId: string } | null>(null);

  // Sync projects to localStorage
  useEffect(() => {
    localStorage.setItem('repo-pulse:agent-projects', JSON.stringify(projectRepoIds));
  }, [projectRepoIds]);

  // Load configuration
  const loadConfig = async () => {
    setLoading(true);
    try {
      const config = await settingsService.getRawAIConfig();
      setActiveProvider(config.aiProvider ?? null);

      if (
        (config.aiProvider === 'anthropic' || config.aiProvider === 'deepseek' || config.aiProvider === 'custom') &&
        config.aiApiKey &&
        config.aiApiKey !== '***'
      ) {
        setActiveApiKey(config.aiApiKey);
        if (config.aiModel) {
          setActiveModel(config.aiModel);
        }
        if (config.aiProvider === 'deepseek') {
          setActiveBaseUrl(config.aiBaseUrl || 'https://api.deepseek.com/anthropic');
        } else {
          setActiveBaseUrl(config.aiBaseUrl || '');
        }
      } else {
        setActiveApiKey('');
        setActiveBaseUrl('');
      }
    } catch (err) {
      console.error('Failed to load AI config for Agent:', err);
      setActiveApiKey('');
      setActiveBaseUrl('');
      setActiveProvider(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfig();
  }, []);

  // Load sessions for all projects from localStorage
  useEffect(() => {
    const newSessionsByRepo: Record<string, AgentSession[]> = {};
    
    projectRepoIds.forEach(repoId => {
      const storedSessions = localStorage.getItem(`repo-pulse:agent-sessions:${repoId}`);
      let parsedSessions: AgentSession[] = [];
      try {
        parsedSessions = storedSessions ? JSON.parse(storedSessions) : [];
      } catch {
        parsedSessions = [];
      }

      parsedSessions = parsedSessions.map(normalizeAgentSession);

      if (parsedSessions.length === 0) {
        const defaultSession = createDefaultAgentSession();
        parsedSessions = [defaultSession];
        localStorage.setItem(`repo-pulse:agent-sessions:${repoId}`, JSON.stringify(parsedSessions));
      }
      newSessionsByRepo[repoId] = parsedSessions;
    });

    setSessionsByRepo(newSessionsByRepo);

    // Determine initial active repo and session
    if (projectRepoIds.length > 0) {
      let nextRepoId = activeRepoId;
      if (!nextRepoId || !projectRepoIds.includes(nextRepoId)) {
        nextRepoId = initialRepository?.id && projectRepoIds.includes(initialRepository.id)
          ? initialRepository.id
          : projectRepoIds[0];
      }
      setActiveRepoId(nextRepoId);

      const repoSessions = newSessionsByRepo[nextRepoId] || [];
      const storedActiveId = localStorage.getItem(`repo-pulse:active-agent-session:${nextRepoId}`);
      const validActiveId = repoSessions.some(s => s.id === storedActiveId)
        ? storedActiveId!
        : (repoSessions[0]?.id || '');
      setActiveSessionId(validActiveId);
    } else {
      setActiveRepoId('');
      setActiveSessionId('');
    }
  }, [projectRepoIds]);

  // Sync activeSessionId back to localStorage per repo
  useEffect(() => {
    if (activeRepoId && activeSessionId) {
      localStorage.setItem(`repo-pulse:active-agent-session:${activeRepoId}`, activeSessionId);
    }
  }, [activeSessionId, activeRepoId]);

  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
  }, [activeSessionId]);

  useEffect(() => {
    activeRepoIdRef.current = activeRepoId;
  }, [activeRepoId]);

  const activeRepository = editableRepos.find(r => r.id === activeRepoId);
  const activeSession = activeRepoId && sessionsByRepo[activeRepoId]
    ? sessionsByRepo[activeRepoId].find(s => s.id === activeSessionId)
    : null;

  // Scroll to bottom of messages
  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeSession?.messages, activeSession?.workflowActivities, activeSession?.status]);

  const updateRepoSessions = (repoId: string, updater: (prev: AgentSession[]) => AgentSession[]) => {
    setSessionsByRepo(prev => {
      const current = prev[repoId] || [];
      const updated = updater(current);
      localStorage.setItem(`repo-pulse:agent-sessions:${repoId}`, JSON.stringify(updated));
      return {
        ...prev,
        [repoId]: updated,
      };
    });
  };

  // Handle start session reactive to initialPrompt & activeApiKey
  useEffect(() => {
    if (initialPrompt && initialPrompt.trim() && processedInitialPromptRef.current !== initialPrompt) {
      processedInitialPromptRef.current = initialPrompt;

      // Stop current running sessions
      runningAgentTargetRef.current = null;
      void window.repoPulseDesktop?.agent?.stopSession();

      const targetRepo = initialRepository || activeRepository;
      if (!targetRepo) return;

      // 1. Ensure target repo is in projects
      if (!projectRepoIds.includes(targetRepo.id)) {
        setProjectRepoIds(prev => [...prev, targetRepo.id]);
      }

      // 2. Set active
      setActiveRepoId(targetRepo.id);

      const newSession: AgentSession = {
        id: createAgentId(),
        title: initialPrompt.length > 20 ? initialPrompt.slice(0, 20) + '...' : initialPrompt,
        prompt: initialPrompt,
        status: 'running',
        messages: [
          {
            id: createAgentId(),
            type: 'user',
            content: initialPrompt,
          },
        ],
        workflowActivities: [
          createWorkflowActivity({
            type: 'system',
            title: '正在准备本地 Git 工作区',
            status: 'running',
            detail: initialRepository?.fullName || activeRepository?.fullName,
          }),
        ],
        error: null,
        createdAt: new Date().toISOString(),
      };

      updateRepoSessions(targetRepo.id, (prev) => [newSession, ...prev.filter(s => s.prompt !== initialPrompt)]);
      setActiveSessionId(newSession.id);
      setExpandedRepos(prev => ({ ...prev, [targetRepo.id]: true }));

      setTimeout(() => {
        startSessionOnSession(newSession, initialPrompt, targetRepo);
      }, 300);

      // Clean search parameters to keep URL clean
      const updatedParams = new URLSearchParams(window.location.search);
      updatedParams.delete('prompt');
      navigate(`${window.location.pathname}?${updatedParams.toString()}`, { replace: true });
    }
  }, [initialPrompt, initialRepository?.id, activeRepository?.id]);

  // Set up electron agent listeners
  useEffect(() => {
    if (!window.repoPulseDesktop?.agent) return;

    const unsubscribeMessage = window.repoPulseDesktop.agent.onMessage((msg: AgentIpcMessage) => {
      if (msg && msg.type && ['finished', 'error', 'tool_result'].includes(msg.type)) {
        setGitRefreshTrigger(prev => prev + 1);
      }
      const runningTarget = runningAgentTargetRef.current;
      const activeId = runningTarget?.sessionId || activeSessionIdRef.current;
      const activeRepo = runningTarget?.repoId || activeRepoIdRef.current;
      if (!activeRepo || !activeId) return;
      
      updateRepoSessions(activeRepo, (prevSessions) => {
        const currentActive = prevSessions.find(s => s.id === activeId);
        if (!currentActive) return prevSessions;

        let updatedMessages = [...currentActive.messages];
        let updatedWorkflow = [...currentActive.workflowActivities];
        const lastMsg = updatedMessages[updatedMessages.length - 1];

        // 1. Handle message status updates
        if (msg.type === 'finished') {
          runningAgentTargetRef.current = null;
          updatedMessages = updatedMessages.map((item) => {
            if (item.type === 'tool_call' && item.status === 'running') {
              return { ...item, status: 'success' as const };
            }
            return item;
          });
          updatedMessages = appendChoiceRequestIfNeeded(updatedMessages);
          updatedMessages = appendSystemMessage(updatedMessages, 'Agent 执行完毕。');
          updatedWorkflow = finalizeWorkflowActivities(updatedWorkflow, 'success');
          updatedWorkflow = upsertWorkflowActivity(updatedWorkflow, createWorkflowActivity({
            id: 'session-finished',
            type: 'result',
            title: 'Agent 执行完毕',
            status: 'success',
          }));
          return prevSessions.map(s => {
            if (s.id !== activeId) return s;
            return {
              ...s,
              status: 'finished' as const,
              messages: updatedMessages,
              workflowActivities: updatedWorkflow,
            };
          });
        }

        if (msg.type === 'error') {
          runningAgentTargetRef.current = null;
          const errorMessage = msg.message || String(msg);
          updatedMessages.push({
            id: createAgentId(),
            type: 'error',
            content: errorMessage,
          });
          updatedWorkflow = finalizeWorkflowActivities(updatedWorkflow, 'error');
          updatedWorkflow = upsertWorkflowActivity(updatedWorkflow, createWorkflowActivity({
            id: `session-error:${errorMessage}`,
            type: 'result',
            title: '执行未成功完成',
            detail: errorMessage,
            status: 'error',
          }));
          return prevSessions.map(s => {
            if (s.id !== activeId) return s;
            return {
              ...s,
              status: 'error' as const,
              error: errorMessage,
              messages: updatedMessages,
              workflowActivities: updatedWorkflow,
            };
          });
        }

        if (msg.type === 'workspace_ready') {
          const isLocal = msg.source === 'local';
          const branchText = msg.branch ? ` · ${msg.branch}` : '';
          const title = isLocal
            ? (msg.remembered ? '已复用本地 Git 工作区授权' : '已使用本地 Git 工作区')
            : '已准备隔离工作区';
          const detail = `${msg.cwd || ''}${branchText}`;
          if (isLocal && typeof msg.cwd === 'string' && msg.cwd.trim()) {
            saveAgentWorkspaceMemory(activeRepo, {
              cwd: msg.cwd,
              branch: typeof msg.branch === 'string' ? msg.branch : null,
              authorizedAt: new Date().toISOString(),
            });
          } else if (!isLocal) {
            localStorage.removeItem(agentWorkspaceMemoryKey(activeRepo));
          }
          updatedWorkflow = upsertWorkflowActivity(updatedWorkflow, createWorkflowActivity({
            id: `workspace-ready:${msg.cwd || activeRepo}`,
            type: 'system',
            title,
            detail,
            status: 'success',
          }));
        } else if (msg.type === 'session_state' && typeof msg.sessionId === 'string' && msg.sessionId.trim()) {
          const alreadyBound = currentActive.sdkSessionId === msg.sessionId;
          const title = msg.resumed || alreadyBound ? '已恢复 SDK 会话记忆' : '已绑定 SDK 会话记忆';
          updatedWorkflow = upsertWorkflowActivity(updatedWorkflow, createWorkflowActivity({
            id: `sdk-session:${msg.sessionId}`,
            type: 'system',
            title,
            detail: msg.sessionId,
            status: 'success',
          }));
          return prevSessions.map(s => {
            if (s.id !== activeId) return s;
            return {
              ...s,
              sdkSessionId: msg.sessionId,
              sdkSessionUpdatedAt: new Date().toISOString(),
              messages: updatedMessages,
              workflowActivities: updatedWorkflow,
            };
          });
        } else if (msg.type === 'text') {
          if (lastMsg && lastMsg.type === 'assistant') {
            updatedMessages[updatedMessages.length - 1] = {
              ...lastMsg,
              content: msg.text || '',
            };
          } else {
            updatedMessages.push({
              id: createAgentId(),
              type: 'assistant',
              content: msg.text || '',
            });
          }
        } else if (msg.type === 'thought') {
          if (lastMsg && lastMsg.type === 'thought') {
            updatedMessages[updatedMessages.length - 1] = {
              ...lastMsg,
              content: msg.text || '',
            };
          } else {
            updatedMessages.push({
              id: createAgentId(),
              type: 'thought',
              content: msg.text || '',
            });
          }
          updatedWorkflow = upsertWorkflowActivity(updatedWorkflow, createWorkflowActivity({
            id: 'agent-thinking',
            type: 'thought',
            title: '思考规划',
            detail: msg.text,
            status: currentActive.status === 'finished' ? 'success' : 'running',
          }));
        } else if (msg.type === 'tool_use') {
          const command = extractToolCommand(msg.input);
          if (msg.name === 'Bash' && (!command || command === '{}')) {
            return prevSessions.map(s => {
              if (s.id !== activeId) return s;
              return {
                ...s,
                messages: updatedMessages,
                workflowActivities: updatedWorkflow,
              };
            });
          }
          const existingIndex = updatedMessages.findIndex((item) => item.type === 'tool_call' && item.toolUseID === msg.toolUseID);
          const nextToolMessage: AgentMessage = {
            id: msg.toolUseID || createAgentId(),
            type: 'tool_call',
            toolUseID: msg.toolUseID,
            name: msg.name,
            command,
            status: 'running',
          };

          if (existingIndex >= 0) {
            updatedMessages[existingIndex] = {
              ...updatedMessages[existingIndex],
              ...nextToolMessage,
            } as AgentMessage;
          } else {
            updatedMessages.push(nextToolMessage);
          }

          updatedWorkflow = upsertWorkflowActivity(updatedWorkflow, createWorkflowActivity({
            id: msg.toolUseID || createAgentId(),
            type: 'tool',
            title: getToolDisplayName(msg.name, msg.input),
            detail: command,
            command,
            status: 'running',
            toolUseID: msg.toolUseID,
            toolName: msg.name,
            tasks: extractWorkflowTasks(msg.input),
          }));
        } else if (msg.type === 'tool_result' && msg.toolUseID) {
          updatedMessages = updatedMessages.map((item) => {
            if (item.type === 'tool_call' && item.toolUseID === msg.toolUseID) {
              return {
                ...item,
                status: msg.error ? 'failed' : 'success',
                output: msg.output,
                error: msg.error,
              };
            }
            return item;
          });
          updatedWorkflow = updatedWorkflow.map((activity) => {
            if (activity.type !== 'tool' || activity.toolUseID !== msg.toolUseID) return activity;
            return {
              ...activity,
              status: msg.error ? 'error' : 'success',
              output: msg.output,
              error: msg.error,
            };
          });
        }

        return prevSessions.map(s => {
          if (s.id !== activeId) return s;
          return {
            ...s,
            messages: updatedMessages,
            workflowActivities: updatedWorkflow,
          };
        });
      });
    });

    const unsubscribePermission = window.repoPulseDesktop.agent.onPermissionRequest((req: AgentIpcMessage) => {
      const runningTarget = runningAgentTargetRef.current;
      const activeId = runningTarget?.sessionId || activeSessionIdRef.current;
      const activeRepo = runningTarget?.repoId || activeRepoIdRef.current;
      if (!activeRepo || !activeId) return;
      const pendingPermission = req as AgentPendingPermission;
      const command = getPermissionCommand(pendingPermission);

      updateRepoSessions(activeRepo, (prevSessions) => {
        return prevSessions.map(s => {
          if (s.id !== activeId) return s;
          return {
            ...s,
            status: 'waiting_permission' as const,
            pendingPermission,
            workflowActivities: upsertWorkflowActivity(s.workflowActivities, createWorkflowActivity({
              id: `permission:${pendingPermission.toolUseID}`,
              type: 'permission',
              title: '等待命令授权',
              detail: pendingPermission.description || pendingPermission.title,
              command,
              status: 'waiting',
              toolUseID: pendingPermission.toolUseID,
              toolName: pendingPermission.toolName,
            })),
          };
        });
      });
    });

    return () => {
      unsubscribeMessage();
      unsubscribePermission();
    };
  }, []);

  const handleCreateSessionInRepo = (repoId: string) => {
    const newSession = createDefaultAgentSession('新会话');
    updateRepoSessions(repoId, prev => [newSession, ...prev]);
    setActiveRepoId(repoId);
    setActiveSessionId(newSession.id);
    setExpandedRepos(prev => ({ ...prev, [repoId]: true }));
    runningAgentTargetRef.current = null;
    void window.repoPulseDesktop?.agent?.stopSession();
  };

  const handleDeleteSessionInRepo = (repoId: string, sessionId: string) => {
    const repoSessions = sessionsByRepo[repoId] || [];
    const isDeletingActive = sessionId === activeSessionId && repoId === activeRepoId;
    const remaining = repoSessions.filter(s => s.id !== sessionId);

    if (remaining.length === 0) {
      const defaultSession = createDefaultAgentSession();
      updateRepoSessions(repoId, () => [defaultSession]);
      if (isDeletingActive) {
        setActiveSessionId(defaultSession.id);
      }
    } else {
      updateRepoSessions(repoId, () => remaining);
      if (isDeletingActive) {
        setActiveSessionId(remaining[0].id);
      }
    }

    if (isDeletingActive) {
      runningAgentTargetRef.current = null;
      void window.repoPulseDesktop?.agent?.stopSession();
    }
  };

  const handleRemoveProject = (repoId: string) => {
    setProjectRepoIds(prev => prev.filter(id => id !== repoId));
    if (activeRepoId === repoId) {
      setActiveRepoId('');
      setActiveSessionId('');
    }
  };

  const startSessionOnSession = async (session: AgentSession, customPrompt?: string, targetRepo?: Repository) => {
    console.log('[AgentRunView] startSessionOnSession called:', {
      sessionId: session.id,
      customPrompt,
      targetRepoId: targetRepo?.id,
    });
    const promptToUse = customPrompt || session.prompt;
    if (!promptToUse.trim()) {
      toast.error('请输入执行指令');
      console.warn('[AgentRunView] startSessionOnSession: prompt is empty.');
      return;
    }

    if (!activeApiKey) {
      const errorMsg = '未检测到有效的 Anthropic API Key，无法启动会话。请先前往【设置】页面配置您的 AI 渠道。';
      toast.error('启动失败：未配置 API 密钥');
      console.warn('[AgentRunView] startSessionOnSession: activeApiKey is empty.');
      
      const repoId = targetRepo?.id || activeRepoId;
      if (repoId) {
        updateRepoSessions(repoId, prev => {
          return prev.map(s => {
            if (s.id !== session.id) return s;
            return {
              ...s,
              status: 'error',
              error: errorMsg,
              messages: [
                ...s.messages,
                {
                  id: createAgentId(),
                  type: 'error',
                  content: errorMsg,
                }
              ],
              workflowActivities: upsertWorkflowActivity(s.workflowActivities, createWorkflowActivity({
                id: 'missing-api-key',
                type: 'result',
                title: '启动失败',
                detail: errorMsg,
                status: 'error',
              })),
            };
          });
        });
      }
      return;
    }

    const repo = targetRepo || activeRepository;
    console.log('[AgentRunView] startSessionOnSession: resolved repository:', repo);
    if (!repo) {
      toast.error('未选择有效的仓库');
      console.warn('[AgentRunView] startSessionOnSession: repo is undefined.');
      return;
    }

    const workspaceMemory = getAgentWorkspaceMemory(repo.id);
    const hasWorkspaceMemory = Boolean(workspaceMemory?.cwd);
    const sdkSessionId = typeof session.sdkSessionId === 'string' && session.sdkSessionId.trim()
      ? session.sdkSessionId
      : null;

    runningAgentTargetRef.current = { repoId: repo.id, sessionId: session.id };

    console.log('[AgentRunView] startSessionOnSession: updating status to running for repo:', repo.id);
    updateRepoSessions(repo.id, prev => {
      return prev.map(s => {
        if (s.id !== session.id) return s;
        return {
          ...s,
          status: 'running',
          error: null,
          pendingPermission: null,
          messages: s.messages,
          workflowActivities: upsertWorkflowActivity(
            sdkSessionId
              ? upsertWorkflowActivity(s.workflowActivities, createWorkflowActivity({
                  id: `sdk-session-resume:${session.id}`,
                  type: 'system',
                  title: '恢复 SDK 会话记忆',
                  detail: sdkSessionId,
                  status: 'running',
                }))
              : s.workflowActivities,
            createWorkflowActivity({
              id: `workspace:${repo.id}:${session.id}`,
              type: 'system',
              title: hasWorkspaceMemory ? '复用本地工作区授权' : '准备本地工作区',
              detail: workspaceMemory?.cwd || repo.fullName,
              status: 'running',
            }),
          ),
        };
      });
    });

    let gitUrl = repo.url;

    try {
      console.log('[AgentRunView] startSessionOnSession: invoking agent.startSession via desktop IPC.');
      await window.repoPulseDesktop!.agent!.startSession({
        repositoryId: repo.id,
        gitUrl,
        defaultBranch: repo.defaultBranch,
        prompt: promptToUse,
        apiKey: activeApiKey,
        model: activeModel,
        baseUrl: activeBaseUrl || undefined,
        authorizedLocalCwd: workspaceMemory?.cwd,
        sdkSessionId,
      });
      toast.success('Agent 会话已启动');
      console.log('[AgentRunView] startSessionOnSession: agent.startSession resolved successfully.');
    } catch (err) {
      const errorMsg = getErrorMessage(err);
      console.error('[AgentRunView] startSessionOnSession: agent.startSession rejected with error:', err);
      updateRepoSessions(repo.id, prev => {
        return prev.map(s => {
          if (s.id !== session.id) return s;
          return {
            ...s,
            status: 'error',
            error: errorMsg,
            messages: [
              ...s.messages,
              {
                id: createAgentId(),
                type: 'error',
                content: `启动失败: ${errorMsg}`,
              }
            ],
            workflowActivities: upsertWorkflowActivity(
              finalizeWorkflowActivities(s.workflowActivities, 'error'),
              createWorkflowActivity({
                id: `session-error:${errorMsg}`,
                type: 'result',
                title: '启动失败',
                detail: errorMsg,
                status: 'error',
              }),
            ),
          };
        });
      });
    }
  };

  const stopSessionOnSession = async (session: AgentSession) => {
    if (!activeRepoId) return;
    try {
      await window.repoPulseDesktop!.agent!.stopSession();
      runningAgentTargetRef.current = null;
      updateRepoSessions(activeRepoId, prev => {
        return prev.map(s => {
          if (s.id !== session.id) return s;
          return {
            ...s,
            status: 'ready',
            messages: [
              ...s.messages,
              {
                id: createAgentId(),
                type: 'system',
                content: '用户已终止会话。',
              }
            ],
            workflowActivities: upsertWorkflowActivity(
              finalizeWorkflowActivities(s.workflowActivities, 'error'),
              createWorkflowActivity({
                id: `session-stopped:${session.id}`,
                type: 'result',
                title: '用户已终止会话',
                status: 'error',
              }),
            ),
          };
        });
      });
      toast.info('会话已终止');
    } catch (err) {
      toast.error(`停止会话失败: ${getErrorMessage(err)}`);
    }
  };

  const resolvePermission = async (approve: boolean, message?: string) => {
    const activeRepo = activeRepoIdRef.current;
    const activeId = activeSessionIdRef.current;
    if (!activeRepo || !activeId) return;
    
    const repoSessions = sessionsByRepo[activeRepo] || [];
    const activeSession = repoSessions.find(s => s.id === activeId);
    if (!activeSession || !activeSession.pendingPermission) return;
    
    const pendingPermission = activeSession.pendingPermission as AgentPendingPermission;
    const toolUseID = pendingPermission.toolUseID;
    const command = getPermissionCommand(pendingPermission) || getToolDisplayName(pendingPermission.toolName, pendingPermission.input);

    try {
      await window.repoPulseDesktop!.agent!.resolvePermission({
        toolUseID,
        approve,
        message,
      });

      updateRepoSessions(activeRepo, prev => {
        return prev.map(s => {
          if (s.id !== activeSession.id) return s;
          
          const updatedMessages: AgentMessage[] = s.messages.map((item): AgentMessage => {
            if (item.type === 'tool_call' && item.toolUseID === toolUseID) {
              return {
                ...item,
                permissionResolved: approve ? 'approved' as const : 'rejected' as const,
              };
            }
            return item;
          });

          return {
            ...s,
            pendingPermission: null,
            status: 'running',
            messages: appendSystemMessage(updatedMessages, `用户已${approve ? '批准' : '拒绝'}命令执行: ${command}`),
            workflowActivities: s.workflowActivities.map((activity) => {
              if (activity.toolUseID !== toolUseID) return activity;
              if (activity.type === 'permission') {
                return {
                  ...activity,
                  status: approve ? 'success' : 'error',
                  permissionResolved: approve ? 'approved' : 'rejected',
                };
              }
              if (activity.type === 'tool') {
                return {
                  ...activity,
                  status: approve ? activity.status : 'error',
                  permissionResolved: approve ? 'approved' : 'rejected',
                };
              }
              return activity;
            }),
          };
        });
      });
    } catch (err) {
      toast.error(`回应权限请求失败: ${getErrorMessage(err)}`);
    }
  };

  const handleSaveTitle = () => {
    if (!editedTitle.trim() || !activeRepoId || !activeSessionId) return;
    updateRepoSessions(activeRepoId, prev => prev.map(s => {
      if (s.id === activeSessionId) {
        return {
          ...s,
          title: editedTitle.trim(),
        };
      }
      return s;
    }));
    setIsEditingTitle(false);
  };

  const handleSaveSidebarRename = (repoId: string, sessionId: string) => {
    const trimmed = sidebarRenameTitle.trim();
    if (trimmed) {
      updateRepoSessions(repoId, prev => prev.map(s => {
        if (s.id === sessionId) {
          return {
            ...s,
            title: trimmed,
          };
        }
        return s;
      }));
    }
    setEditingSessionId(null);
  };

  const handleSubmitChoiceResponse = (messageId: string, response: string) => {
    const trimmed = response.trim();
    if (!trimmed || !activeRepoId || !activeSessionId) return;

    updateRepoSessions(activeRepoId, prev => prev.map(s => {
      if (s.id !== activeSessionId) return s;
      return {
        ...s,
        messages: s.messages.map((message) => {
          if (message.type !== 'choice_request' || message.id !== messageId) return message;
          return {
            ...message,
            status: 'submitted',
            response: trimmed,
          };
        }),
      };
    }));

    void handleSendChat(trimmed);
  };

  const handleSendChat = async (overridePrompt?: string) => {
    console.log('[AgentRunView] handleSendChat called.');
    if (!activeSession || !activeRepoId) {
      console.warn('[AgentRunView] handleSendChat: activeSession or activeRepoId is missing.');
      return;
    }
    const userPrompt = overridePrompt?.trim() ?? '';
    const nextPrompt = userPrompt || activeSession.prompt;
    if (!nextPrompt) {
      console.warn('[AgentRunView] handleSendChat: prompt is empty.');
      return;
    }
    
    console.log('[AgentRunView] handleSendChat: updating session details (prompt and title).');
    let freshActiveSession = { ...activeSession };
    
    updateRepoSessions(activeRepoId, prev => prev.map(s => {
      if (s.id === activeSession.id) {
        const msgs = [...s.messages];
        if (userPrompt) {
          msgs.push({
            id: createAgentId(),
            type: 'user',
            content: userPrompt,
          });
        }
        freshActiveSession = {
          ...s,
          prompt: nextPrompt,
          title: userPrompt ? (userPrompt.length > 20 ? userPrompt.slice(0, 20) + '...' : userPrompt) : s.title,
          messages: msgs,
        };
        return freshActiveSession;
      }
      return s;
    }));

    // Ensure we stop any running agent session first. Wrap in try-catch to avoid blocking errors.
    try {
      if (window.repoPulseDesktop?.agent?.stopSession) {
        console.log('[AgentRunView] handleSendChat: stopping active agent session...');
        await window.repoPulseDesktop!.agent!.stopSession();
        runningAgentTargetRef.current = null;
        console.log('[AgentRunView] handleSendChat: stopSession completed.');
      }
    } catch (err) {
      console.error('[AgentRunView] handleSendChat: error stopping session:', err);
    }
    
    console.log('[AgentRunView] handleSendChat: starting session with prompt:', nextPrompt);
    void startSessionOnSession(freshActiveSession, nextPrompt);
  };

  if (loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">正在加载 AI 配置与本地工作区...</p>
      </div>
    );
  }

  const availableRepos = editableRepos.filter(repo => !projectRepoIds.includes(repo.id));
  const assistantProviderLogo = activeProvider ? getProviderLogo(activeProvider) : undefined;
  const assistantProviderLabel = activeProvider ? (PROVIDER_LABELS[activeProvider] ?? 'AI') : 'AI';

  return (
    <div className="flex h-full overflow-hidden bg-background text-foreground animate-in fade-in-50 duration-350">
      {/* Left Sidebar: Project & Session List */}
      <div className="w-[240px] shrink-0 border-r border-border bg-card flex flex-col h-full select-none">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="font-semibold text-xs text-muted-foreground uppercase tracking-wider">Agent 项目</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary"
            onClick={() => setIsAddProjectOpen(true)}
            title="添加项目"
          >
            <FolderPlus className="h-4 w-4" />
          </Button>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-2 space-y-2">
            {projectRepoIds.map((repoId) => {
              const repo = editableRepos.find(r => r.id === repoId);
              if (!repo) return null;

              const isExpanded = expandedRepos[repoId] !== false;
              const repoSessions = sessionsByRepo[repoId] || [];
              const isActiveRepo = repoId === activeRepoId;

              return (
                <div key={repoId} className="space-y-1">
                  {/* Project Folder Header */}
                  <div
                    className={cn(
                      "group flex items-center justify-between px-2 py-1.5 rounded-lg text-sm font-medium text-foreground hover:bg-secondary/40 cursor-pointer select-none transition-colors",
                      isActiveRepo && "bg-secondary/20"
                    )}
                    onClick={() => {
                      setExpandedRepos(prev => ({
                        ...prev,
                        [repoId]: !isExpanded
                      }));
                      if (repoId !== activeRepoId && repoSessions.length > 0) {
                        setActiveRepoId(repoId);
                        const storedActiveId = localStorage.getItem(`repo-pulse:active-agent-session:${repoId}`);
                        const validActiveId = repoSessions.some(s => s.id === storedActiveId)
                          ? storedActiveId!
                          : repoSessions[0].id;
                        setActiveSessionId(validActiveId);
                      }
                    }}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-muted-foreground/85 p-0.5 rounded-md hover:bg-secondary shrink-0">
                        {isExpanded ? (
                          <ChevronDown className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5" />
                        )}
                      </span>
                      <Folder className="h-4 w-4 text-primary shrink-0 animate-in zoom-in-50 duration-200" />
                      <span className="truncate text-xs font-semibold">{repo.name || repo.fullName.split('/').pop() || repo.fullName}</span>
                    </div>

                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCreateSessionInRepo(repoId);
                        }}
                        className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-secondary/80"
                        title="新建会话"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveProject(repoId);
                        }}
                        className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-secondary/80"
                        title="移除项目"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Project Sessions List */}
                  {isExpanded && (
                    <div className="ml-4 pl-3 border-l border-border/60 space-y-1 mt-0.5 animate-in slide-in-from-top-1 duration-150">
                      {repoSessions.map((session) => {
                        const isActiveSession = session.id === activeSessionId && isActiveRepo;
                        return (
                          <div
                            key={session.id}
                            onClick={() => {
                              setActiveRepoId(repoId);
                              setActiveSessionId(session.id);
                            }}
                            className={cn(
                              "group/session relative flex items-center justify-between p-2 rounded-lg cursor-pointer text-xs transition-colors",
                              isActiveSession 
                                ? "bg-secondary text-foreground font-semibold" 
                                : "text-muted-foreground hover:bg-secondary/40 hover:text-foreground"
                            )}
                          >
                            <div className="flex items-center gap-2 min-w-0 flex-1 pr-1">
                              <span className={cn(
                                "h-1.5 w-1.5 rounded-full shrink-0",
                                session.status === 'running' && "bg-blue-500 animate-pulse",
                                session.status === 'waiting_permission' && "bg-amber-500 animate-pulse",
                                session.status === 'error' && "bg-destructive",
                                session.status === 'finished' && "bg-emerald-500",
                                session.status === 'ready' && "bg-muted-foreground/40"
                              )} />
                              {editingSessionId === session.id ? (
                                <Input
                                  value={sidebarRenameTitle}
                                  onChange={(e) => setSidebarRenameTitle(e.target.value)}
                                  className="h-6 py-0 px-1 text-xs bg-background border-border flex-1 min-w-0 font-normal"
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      handleSaveSidebarRename(repoId, session.id);
                                    } else if (e.key === 'Escape') {
                                      setEditingSessionId(null);
                                    }
                                  }}
                                  onBlur={() => handleSaveSidebarRename(repoId, session.id)}
                                  onClick={(e) => e.stopPropagation()}
                                  autoFocus
                                />
                              ) : (
                                <span
                                  className="truncate max-w-[120px] flex-1 select-none"
                                  title={session.title}
                                  onDoubleClick={(e) => {
                                    e.stopPropagation();
                                    setEditingSessionId(session.id);
                                    setSidebarRenameTitle(session.title || '新会话');
                                  }}
                                >
                                  {session.title || '新会话'}
                                </span>
                              )}
                            </div>

                            {editingSessionId !== session.id && (
                              <div className="flex items-center gap-0.5 opacity-0 group-hover/session:opacity-100 focus-within:opacity-100 transition-opacity shrink-0">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingSessionId(session.id);
                                    setSidebarRenameTitle(session.title || '新会话');
                                  }}
                                  className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-all"
                                  title="重命名会话"
                                >
                                  <Pencil className="h-3 w-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteSessionInRepo(repoId, session.id);
                                  }}
                                  className="p-0.5 rounded text-muted-foreground hover:text-destructive hover:bg-secondary/80 transition-all"
                                  title="删除会话"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </div>

      {/* Main Workspace */}
      <div className="flex-1 flex flex-col h-full min-w-0 bg-background/50 relative">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4 bg-card">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <Bot className="h-5 w-5 animate-in spin-in-12 duration-300" />
            </div>
            <div>
              {isEditingTitle ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={editedTitle}
                    onChange={(e) => setEditedTitle(e.target.value)}
                    className="h-7 py-0 px-2 text-sm bg-background border-border max-w-[200px]"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleSaveTitle();
                      } else if (e.key === 'Escape') {
                        setIsEditingTitle(false);
                      }
                    }}
                    autoFocus
                  />
                  <Button
                    onClick={handleSaveTitle}
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-emerald-500 hover:bg-emerald-500/10"
                  >
                    <CheckCheck className="h-4 w-4" />
                  </Button>
                  <Button
                    onClick={() => setIsEditingTitle(false)}
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-destructive hover:bg-destructive/10"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : activeSession ? (
                <div className="flex items-center gap-2 group/title">
                  <h3 className="font-semibold text-foreground text-sm">
                    {activeSession.title || '新会话'}
                  </h3>
                  <button
                    onClick={() => {
                      setEditedTitle(activeSession.title);
                      setIsEditingTitle(true);
                    }}
                    className="opacity-0 group-hover/title:opacity-100 p-0.5 text-muted-foreground hover:text-foreground transition-opacity"
                    title="重命名会话"
                  >
                    <Settings2 className="h-3 w-3" />
                  </button>
                  <Badge
                    variant={
                      activeSession.status === 'running' 
                        ? "default" 
                        : activeSession.status === 'error' 
                        ? "destructive" 
                        : activeSession.status === 'finished' 
                        ? "secondary" 
                        : "outline"
                    }
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-medium",
                      activeSession.status === 'waiting_permission' && "border-amber-500/30 text-amber-500 bg-amber-500/10"
                    )}
                  >
                    {activeSession.status === 'running' 
                      ? '运行中' 
                      : activeSession.status === 'waiting_permission' 
                      ? '等待审批' 
                      : activeSession.status === 'error' 
                      ? '执行失败' 
                      : activeSession.status === 'finished' 
                      ? '执行成功' 
                      : '就绪'}
                  </Badge>
                </div>
              ) : (
                <h3 className="font-semibold text-foreground text-sm">Agent 控制台</h3>
              )}
              {activeSession && (
                <p className="text-xs text-muted-foreground mt-0.5 animate-in slide-in-from-left-1 duration-200">
                  基于 {activeModel} · 本地工作区隔离执行
                </p>
              )}
            </div>
          </div>
          {activeSession && activeRepository && (
            <div className="flex items-center gap-2">
              <Button
                variant={isGitTreeOpen ? "secondary" : "ghost"}
                size="sm"
                onClick={() => {
                  setIsGitTreeOpen(prev => {
                    const next = !prev;
                    localStorage.setItem('repo-pulse:agent-git-tree-open', String(next));
                    return next;
                  });
                }}
                className="gap-1.5 h-8 font-semibold text-xs rounded-lg text-muted-foreground hover:text-foreground"
                title={isGitTreeOpen ? "收起 Git 状态" : "展开 Git 状态"}
              >
                <GitBranch className={cn("h-4 w-4", isGitTreeOpen && "text-primary")} />
                <span>Git 状态</span>
              </Button>
            </div>
          )}
        </div>

        {/* Timeline Content */}
        {!activeSession || !activeRepository ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-xl mx-auto space-y-6 animate-in zoom-in-95 duration-250">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <FolderPlus className="h-7 w-7" />
            </div>
            <div>
              <h4 className="text-base font-semibold text-foreground">选择或添加一个项目开始</h4>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                请在左侧边栏添加您的监控仓库为 Agent 项目，或展开现有项目并选择一个会话。
              </p>
            </div>
            <Button
              onClick={() => setIsAddProjectOpen(true)}
              className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs gap-1.5 font-semibold shadow-md"
            >
              <Plus className="h-4 w-4" />
              添加项目
            </Button>
          </div>
        ) : activeSession.messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-xl mx-auto space-y-6 animate-in zoom-in-95 duration-250">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Sparkles className="h-7 w-7" />
            </div>
            <div>
              <h4 className="text-base font-semibold text-foreground">开始在 {activeRepository.name || activeRepository.fullName.split('/').pop() || activeRepository.fullName} 中使用 Git Workspace Agent</h4>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                请输入您的 Git 调整命令或在下方选择推荐操作。Agent 将在本地安全沙箱内分析代码并协助您自动执行。
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-md pt-2">
              <button
                onClick={() => {
                  const cmd = '帮我检查当前分支状态并进行合并';
                  void handleSendChat(cmd);
                }}
                className="p-3 text-left rounded-xl border border-border bg-card hover:bg-secondary/40 hover:border-primary/20 transition-all text-xs space-y-1"
              >
                <div className="font-semibold text-foreground">合并分支</div>
                <div className="text-muted-foreground text-[10px]">检查本地更改，将特定分支安全合并</div>
              </button>
              <button
                onClick={() => {
                  const cmd = '同步上游分支最新修改，评估潜在冲突';
                  void handleSendChat(cmd);
                }}
                className="p-3 text-left rounded-xl border border-border bg-card hover:bg-secondary/40 hover:border-primary/20 transition-all text-xs space-y-1"
              >
                <div className="font-semibold text-foreground">同步上游 (Sync Upstream)</div>
                <div className="text-muted-foreground text-[10px]">拉取上游 commits 并同步到本地分支</div>
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6 scrollbar-thin">
            {activeSession.error && (
              <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-4 flex gap-3 text-destructive-foreground text-sm animate-in fade-in-50 duration-200">
                <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-semibold">会话执行提示</p>
                  <p className="mt-1 text-xs text-muted-foreground">{activeSession.error}</p>
                </div>
              </div>
            )}

            <AgentWorkflowCard session={activeSession} />

            <div className="space-y-4">
              {activeSession.messages.map((item, index) => (
                <div key={item.id || index} className="space-y-2 animate-in fade-in-50 duration-200">
                  {item.type === 'user' && (
                    <div className="flex gap-3 justify-end">
                      <div className="max-w-[85%] rounded-xl bg-secondary/80 border border-border p-3.5 text-sm text-foreground shadow-sm">
                        <p className="whitespace-pre-wrap leading-relaxed">{item.content}</p>
                      </div>
                      <Avatar className="h-7 w-7 rounded-lg border border-border mt-0.5 shrink-0">
                        <AvatarImage src={currentUser?.avatar || undefined} />
                        <AvatarFallback className="bg-secondary text-muted-foreground text-xs font-bold">
                          U
                        </AvatarFallback>
                      </Avatar>
                    </div>
                  )}

                  {item.type === 'system' && (
                    <div className="flex justify-center my-2">
                      <span className="text-[11px] text-muted-foreground bg-secondary/40 px-3 py-1 rounded-full border border-border/50">
                        {item.content}
                      </span>
                    </div>
                  )}

                  {item.type === 'assistant' && (
                    <div className="flex gap-3">
                      <Avatar
                        className="h-8 w-8 rounded-full border border-border/70 bg-background mt-0.5 shrink-0 shadow-sm ring-2 ring-background"
                        title={assistantProviderLabel}
                      >
                        {assistantProviderLogo ? (
                          <AvatarImage
                            src={assistantProviderLogo}
                            alt={assistantProviderLabel}
                            className="rounded-full object-cover"
                          />
                        ) : null}
                        <AvatarFallback className="rounded-full bg-primary/10 text-primary text-xs font-bold">
                          AI
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 rounded-xl bg-card border border-border p-4 text-sm text-foreground prose dark:prose-invert max-w-none">
                        <MarkdownContent>{item.content}</MarkdownContent>
                      </div>
                    </div>
                  )}

                  {item.type === 'choice_request' && (
                    <AgentChoiceRequestCard
                      message={item}
                      onSubmit={handleSubmitChoiceResponse}
                    />
                  )}

                  {item.type === 'thought' && (
                    <details className="group ml-10 border-l border-border pl-4 space-y-2">
                      <summary className="text-xs text-muted-foreground cursor-pointer select-none hover:text-foreground">
                        思考逻辑 (点击展开)
                      </summary>
                      <div className="rounded-lg bg-secondary/30 px-3 py-2">
                        <MarkdownContent className="text-xs prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-pre:my-2 prose-pre:max-h-64 prose-pre:overflow-auto">
                          {item.content}
                        </MarkdownContent>
                      </div>
                    </details>
                  )}

                  {item.type === 'tool_call' && (
                    <AgentToolCallCard item={item} />
                  )}

                  {item.type === 'error' && (
                    <div className="ml-10 rounded-xl border border-destructive/20 bg-destructive/5 p-4 flex gap-3 text-destructive-foreground text-xs">
                      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-destructive" />
                      <div>
                        <p className="font-semibold">执行未成功完成</p>
                        <p className="mt-1 text-muted-foreground">{item.content}</p>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {activeSession.pendingPermission && (
                <AgentPermissionRequestCard
                  request={activeSession.pendingPermission}
                  onResolve={resolvePermission}
                />
              )}

              {activeSession.status === 'running' && (
                <div className="flex gap-3 animate-in fade-in-50 duration-200">
                  <Avatar
                    className="h-8 w-8 rounded-full border border-border/70 bg-background mt-0.5 shrink-0 shadow-sm ring-2 ring-background animate-pulse"
                    title={assistantProviderLabel}
                  >
                    {assistantProviderLogo ? (
                      <AvatarImage
                        src={assistantProviderLogo}
                        alt={assistantProviderLabel}
                        className="rounded-full object-cover"
                      />
                    ) : null}
                    <AvatarFallback className="rounded-full bg-primary/10 text-primary text-xs font-bold">
                      AI
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-grow rounded-xl bg-card border border-border p-4 text-sm text-foreground flex items-center gap-2.5">
                    <style>{`
                      @keyframes agentThinkingGlow {
                        0%, 100% {
                          opacity: 0.45;
                          text-shadow: 0 0 2px rgba(139, 92, 246, 0.2);
                        }
                        50% {
                          opacity: 1;
                          text-shadow: 0 0 8px rgba(139, 92, 246, 0.6);
                          color: #c084fc;
                        }
                      }
                      .agent-thinking-text {
                        animation: agentThinkingGlow 2s infinite ease-in-out;
                      }
                    `}</style>
                    <Sparkles className="h-4 w-4 text-primary animate-spin shrink-0" style={{ animationDuration: '3s' }} />
                    <span className="font-semibold text-primary/90 agent-thinking-text">
                      Agent 正在思考并执行中...
                    </span>
                  </div>
                </div>
              )}

              <div ref={messageEndRef} />
            </div>
          </div>
        )}

        {/* Chat Input Area */}
        {activeSession && activeRepository && (
          <AgentChatInputField
            key={chatInputDraft?.id ?? 0}
            onSend={(prompt) => {
              void handleSendChat(prompt);
            }}
            onStop={() => stopSessionOnSession(activeSession)}
            isRunning={
              activeSession.status === 'running' ||
              activeSession.status === 'waiting_permission'
            }
            hasApiKey={Boolean(activeApiKey)}
            hasSessionPrompt={Boolean(activeSession.prompt)}
            initialPrompt={chatInputDraft?.prompt}
          />
        )}
      </div>

      {isGitTreeOpen && activeRepository && activeSession && (
        <div
          className="border-l border-border bg-card flex flex-col h-full shrink-0 relative animate-in slide-in-from-right duration-250"
          style={{ width: gitTreeWidth }}
        >
          {/* Resize separator handle on the left edge */}
          <div
            className="desktop-no-drag group absolute bottom-0 left-[-4px] top-0 z-40 w-2 cursor-col-resize outline-none"
            role="separator"
            tabIndex={0}
            onPointerDown={handleGitTreeResizePointerDown}
            onDoubleClick={() => {
              setGitTreeWidth(320);
              localStorage.setItem('repo-pulse:agent-git-tree-sidebar-width', '320');
            }}
          >
            <span className="absolute left-[3px] top-0 h-full w-px bg-transparent transition-colors group-hover:bg-primary/50 group-focus-visible:bg-primary" />
          </div>

          <GitTreePanel
            repositoryId={activeRepository.id}
            repositoryUrl={activeRepository.url}
            localCwd={getAgentWorkspaceMemory(activeRepository.id)?.cwd}
            refreshTrigger={gitRefreshTrigger}
            onAskAgent={(prompt) => {
              setChatInputDraft((current) => ({
                id: (current?.id ?? 0) + 1,
                prompt,
              }));
            }}
          />
        </div>
      )}

      {/* Add Project Dialog */}
      <Dialog open={isAddProjectOpen} onOpenChange={setIsAddProjectOpen}>
        <DialogContent className="sm:max-w-md bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="text-foreground">添加 Agent 项目</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              选择一个可编辑的 Git 仓库作为项目，在其中开展 Agent 会话。
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[300px] overflow-y-auto mt-2 pr-1.5 scrollbar-thin w-full">
            <div className="space-y-1 p-1">
              {availableRepos.length === 0 ? (
                <p className="text-center text-xs text-muted-foreground py-6">
                  暂无其他可编辑仓库。请先在“仓库管理”中添加新仓库。
                </p>
              ) : (
                availableRepos.map((repo) => (
                  <div
                    key={repo.id}
                    onClick={() => {
                      setProjectRepoIds(prev => [...prev, repo.id]);
                      setExpandedRepos(prev => ({ ...prev, [repo.id]: true }));
                      setActiveRepoId(repo.id);
                      setIsAddProjectOpen(false);
                    }}
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-secondary/40 cursor-pointer transition-colors border border-transparent hover:border-border"
                  >
                    <Folder className="h-5 w-5 text-primary shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-foreground truncate">{repo.name || repo.fullName.split('/').pop() || repo.fullName}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{repo.fullName}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => setIsAddProjectOpen(false)}
              variant="outline"
              size="sm"
              className="border-border text-muted-foreground hover:bg-secondary"
            >
              取消
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function DesktopWorkbench() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const params = useParams<{ view?: string; repositoryId?: string }>();
  const [searchParams] = useSearchParams();
  const [approvalActionId, setApprovalActionId] = useState<string>();
  const [mergingActionId, setMergingActionId] = useState<string>();
  const [isPrimaryRailCollapsed, setIsPrimaryRailCollapsed] = useState(true);
  const [isRepositorySidebarCollapsed, setIsRepositorySidebarCollapsed] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<ConversationMessage | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isBranchMonitorOpen, setIsBranchMonitorOpen] = useState(false);
  const [isContributorsOpen, setIsContributorsOpen] = useState(false);
  const [newlyMonitoredRepoIds, setNewlyMonitoredRepoIds] = useState<Set<string>>(() => new Set());
  const [siriAnalysis, setSiriAnalysis] = useState<{
    isOpen: boolean;
    eventId: string;
    eventTitle: string;
  }>({
    isOpen: false,
    eventId: '',
    eventTitle: '',
  });
  const [watchFeedType, setWatchFeedType] = useState('');
  const [ignoredFeedIds, setIgnoredFeedIds] = useState<Set<string>>(() => new Set());
  const [watchFeedPages, setWatchFeedPages] = useState<WatchFeedItem[][]>([]);
  const [watchFeedNextCursor, setWatchFeedNextCursor] = useState<string | null>(null);
  const [isLoadingMoreWatchFeed, setIsLoadingMoreWatchFeed] = useState(false);
  const [olderConversationMessages, setOlderConversationMessages] = useState<WorkbenchConversationMessage[]>([]);
  const [conversationNextCursor, setConversationNextCursor] = useState<string | null>(null);
  const [isLoadingOlderConversationMessages, setIsLoadingOlderConversationMessages] = useState(false);
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

  const syncProgressByRepoId = useSyncProgressStore((s) => s.byRepoId);
  const syncingRepoIds = useMemo(
    () => new Set(Object.keys(syncProgressByRepoId)),
    [syncProgressByRepoId],
  );
  const repositoriesQuery = useRepositoryListQuery();
  const notificationsQuery = useNotificationsQuery();
  const unreadNotificationCountQuery = useUnreadNotificationCountQuery();
  const repositories = useMemo(() => repositoriesQuery.data ?? [], [repositoriesQuery.data]);

  const selectedMessageRepository = useMemo(() => {
    if (!selectedMessage || !selectedMessage.sourceRepositoryId) return undefined;
    return repositories.find((r) => r.id === selectedMessage.sourceRepositoryId);
  }, [selectedMessage, repositories]);

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
  const watchFeedQuery = useWatchFeedQuery(queryType, { limit: WATCH_FEED_PAGE_SIZE });

  useEffect(() => {
    if (!watchFeedQuery.data) {
      setWatchFeedPages([]);
      setWatchFeedNextCursor(null);
      return;
    }

    setWatchFeedPages([watchFeedQuery.data.items]);
    setWatchFeedNextCursor(watchFeedQuery.data.nextCursor);
  }, [watchFeedQuery.data]);

  const watchFeedItems = useMemo(() => {
    const seenItemIds = new Set<string>();
    let items = watchFeedPages
      .flat()
      .filter((item) => {
        if (seenItemIds.has(item.id)) {
          return false;
        }
        seenItemIds.add(item.id);
        return true;
      });

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
  }, [watchFeedPages, watchFeedType, ignoredFeedIds, favoriteEventIds, feedFilters, feedSearchKeyword]);

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

  const handleLoadMoreWatchFeed = async () => {
    if (!watchFeedNextCursor || isLoadingMoreWatchFeed) {
      return;
    }

    setIsLoadingMoreWatchFeed(true);
    try {
      const nextPage = await workbenchService.getWatchFeed({
        type: queryType || undefined,
        cursor: watchFeedNextCursor,
        limit: WATCH_FEED_PAGE_SIZE,
      });
      setWatchFeedPages((current) => [...current, nextPage.items]);
      setWatchFeedNextCursor(nextPage.nextCursor);
    } catch (error) {
      console.error(error);
      toast.error('加载更多动态失败');
    } finally {
      setIsLoadingMoreWatchFeed(false);
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
    queryKey: workbenchQueryKeys.watchRepositories(),
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
        queryClient.invalidateQueries({ queryKey: ['workbench'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
        queryClient.invalidateQueries({ queryKey: notificationQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: repositoryQueryKeys.list() }),
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
        queryClient.invalidateQueries({ queryKey: ['workbench'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
        queryClient.invalidateQueries({ queryKey: notificationQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: repositoryQueryKeys.list() }),
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
  const monitoredRepositoryIds = monitoringScope.repositoryIds ?? [];
  const effectiveMonitoredRepositoryIds = useMemo(
    () => monitoredRepositoryIds,
    [monitoredRepositoryIds],
  );
  const realtimeRepositoryIds = useMemo(
    () =>
      Array.from(
        new Set([
          ...effectiveMonitoredRepositoryIds,
          ...watchRepositories.map((repository) => repository.id),
        ]),
      ),
    [effectiveMonitoredRepositoryIds, watchRepositories],
  );
  const repositoryBranchScopes = monitoringScope.repositoryBranchScopes ?? {};
  const repositoryBranchScopesKey = useMemo(
    () => JSON.stringify(repositoryBranchScopes),
    [repositoryBranchScopes],
  );

  useRepositoryRealtimeSubscription(realtimeRepositoryIds);

  const eventsQuery = useApiQuery({
    queryKey: ['workbench', 'events', effectiveMonitoredRepositoryIds.join(','), repositoryBranchScopesKey],
    queryFn: () => eventService.getAll(effectiveMonitoredRepositoryIds, repositoryBranchScopes, {
      page: 1,
      pageSize: 80,
      sortBy: 'occurredAt',
      sortOrder: 'desc',
    }),
    enabled: effectiveMonitoredRepositoryIds.length > 0,
    staleTime: 30 * 1000,
  });

  const approvalsQuery = useApiQuery({
    queryKey: ['workbench', 'approvals', repositoryIds.join(',')],
    queryFn: () => approvalService.getApprovals({ limit: 80, offset: 0 }),
    enabled: repositoryIds.length > 0,
    staleTime: 30 * 1000,
  });

  // 当前选中仓库的 Workbench 统一会话消息（替代前端自行拼接 events + approvals + notifications）
  const conversationMessagesQuery = useConversationMessagesQuery(selectedRepository?.id, {
    take: CONVERSATION_MESSAGE_PAGE_SIZE,
    repositoryBranchScopes,
  });

  useEffect(() => {
    setOlderConversationMessages([]);
    setConversationNextCursor(conversationMessagesQuery.data?.pagination?.nextCursor ?? null);
  }, [conversationMessagesQuery.data, selectedRepository?.id]);

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
      .filter((message) =>
        doesMessageMatchMonitoringScope(message, monitoredRepositoryIds, repositoryBranchScopes),
      )
      .sort((left, right) => right.createdAtMs - left.createdAtMs);
  }, [
    approvalsQuery.data,
    eventsQuery.data,
    monitoredRepositoryIds,
    notificationsQuery.data,
    repositoryBranchScopes,
  ]);

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
      const seenMessageIds = new Set<string>();
      return [...conversationMessagesQuery.data.messages, ...olderConversationMessages]
        .filter((msg) => {
          if (seenMessageIds.has(msg.id)) {
            return false;
          }
          seenMessageIds.add(msg.id);
          return true;
        })
        .map((msg) =>
        workbenchMessageToConversationMessage(msg, conversationMessagesQuery.data.conversation),
      );
    }
    // 降级：使用前端拼接的消息
    return getRepoMessages(selectedRepository.id, allMessages);
  }, [conversationMessagesQuery.data, olderConversationMessages, selectedRepository, allMessages]);

  const handleLoadOlderConversationMessages = useCallback(async () => {
    if (!selectedRepository?.id || !conversationNextCursor || isLoadingOlderConversationMessages) {
      return;
    }

    setIsLoadingOlderConversationMessages(true);
    try {
      const nextPage = await workbenchService.getConversationMessages(selectedRepository.id, {
        cursor: conversationNextCursor,
        take: CONVERSATION_MESSAGE_PAGE_SIZE,
      });
      setOlderConversationMessages((current) => [...current, ...nextPage.messages]);
      setConversationNextCursor(nextPage.pagination?.nextCursor ?? null);
    } catch (error) {
      console.error(error);
      toast.error('加载更早消息失败');
    } finally {
      setIsLoadingOlderConversationMessages(false);
    }
  }, [conversationNextCursor, isLoadingOlderConversationMessages, selectedRepository?.id]);

  // 通过后端 API 接口查询该仓库的完整贡献者列表（集成后端缓存与鉴权支持）
  const contributorsQuery = useApiQuery({
    queryKey: ['repository', selectedRepository?.id, 'contributors'],
    queryFn: () => repositoryService.getContributors(selectedRepository!.id),
    enabled: Boolean(selectedRepository?.id && activeView === 'repository'),
    staleTime: 5 * 60 * 1000, // 5分钟前端缓存
  });

  // 融合计算活跃贡献者列表：优先使用官方完整 API，若加载中或为空则降级为会话消息提取
  const contributors = useMemo(() => {
    // 1. 如果官方 API 数据加载成功且有数据，优先展示
    if (contributorsQuery.data && contributorsQuery.data.length > 0) {
      return contributorsQuery.data.map((c) => ({
        username: c.username,
        avatarUrl: c.avatarUrl || `https://github.com/${encodeURIComponent(c.username)}.png`,
      }));
    }

    // 2. 降级：从当前已加载的会话消息中实时提取
    if (!selectedMessages || selectedMessages.length === 0) return [];
    const map = new Map<string, { username: string; avatarUrl?: string | null }>();
    
    selectedMessages.forEach((msg) => {
      if (!msg.author) return;
      const authorLower = msg.author.toLowerCase();
      const isBot = ['system', 'agent', 'bot', 'ai analysis', 'feishu'].some((kw) =>
        authorLower.includes(kw)
      );
      if (isBot) return;

      if (!map.has(msg.author)) {
        map.set(msg.author, {
          username: msg.author,
          avatarUrl: getAuthorAvatarUrl(msg),
        });
      } else {
        const existing = map.get(msg.author)!;
        if (!existing.avatarUrl) {
          existing.avatarUrl = getAuthorAvatarUrl(msg);
        }
      }
    });
    
    return Array.from(map.values());
  }, [contributorsQuery.data, selectedMessages]);

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
  const selectedRepositoryBranches = selectedRepository
    ? repositoryBranchScopes[selectedRepository.id] ?? []
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

  const handleMergePR = async (message: ConversationMessage, action: MessageAction) => {
    setMergingActionId(message.id);
    try {
      const httpMethod = action.method?.toLowerCase() === 'get' ? apiClient.get : apiClient.post;
      await httpMethod(action.endpoint!);
      toast.success('Pull Request 合并请求已提交');
      await conversationMessagesQuery.refetch();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      console.error(error);
      toast.error(err?.response?.data?.message || '合并失败');
    } finally {
      setMergingActionId(undefined);
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
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['workbench'] }),
      queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      queryClient.invalidateQueries({ queryKey: notificationQueryKeys.all }),
      queryClient.invalidateQueries({ queryKey: repositoryQueryKeys.list() }),
    ]);
  };

  const handleToggleSelectedRepositoryMonitoring = async () => {
    if (!selectedRepository) {
      return;
    }

    const nextRepositoryIds =
      monitoredRepositoryIds.includes(selectedRepository.id)
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

    await persistSelectedRepositoryScope(nextRepositoryIds, nextBranchScopes);
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
          {activeView !== 'agent' && (
            <WorkbenchHeader
              activeView={activeView}
              repository={activeView === 'repository' ? selectedRepository : undefined}
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
              onOpenContributors={() => setIsContributorsOpen(true)}
              isMonitored={isRepositoryMonitoredInScope(monitoredRepositoryIds, selectedRepository?.id)}
              selectedRepositoryBranchesCount={selectedRepositoryBranches.length}
            />
          )}
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
                mergingActionId={mergingActionId}
                onMergePR={handleMergePR}
                onOpenDetail={setSelectedMessage}
                onOpenSiriAnalysis={(eventId, eventTitle) => setSiriAnalysis({ isOpen: true, eventId, eventTitle })}
                hasOlderMessages={Boolean(conversationNextCursor)}
                loadingOlderMessages={isLoadingOlderConversationMessages}
                onLoadOlderMessages={handleLoadOlderConversationMessages}
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
                hasMore={Boolean(watchFeedNextCursor)}
                loadingMore={isLoadingMoreWatchFeed}
                onLoadMore={handleLoadMoreWatchFeed}
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
                editableRepos={editableRepos.map((item) => item.repository)}
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
          onOpenDetail={setSelectedMessage}
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
        <MessageDetailSheet
          message={selectedMessage}
          repository={selectedMessageRepository ?? selectedRepository ?? repositories[0]}
          onClose={() => setSelectedMessage(null)}
          onOpenAgent={(prompt) => openAgent(prompt, selectedMessageRepository ?? selectedRepository)}
          onApproveMessage={handleApproveMessage}
          onRejectMessage={handleRejectMessage}
          approvalActionId={approvalActionId}
          mergingActionId={mergingActionId}
          onMergePR={handleMergePR}
          onOpenSiriAnalysis={(eventId, eventTitle) => setSiriAnalysis({ isOpen: true, eventId, eventTitle })}
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
        <Dialog open={isContributorsOpen} onOpenChange={setIsContributorsOpen}>
          <DialogContent className="max-w-md bg-card border-border text-foreground">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-lg">
                <Users className="h-5 w-5 text-primary" />
                项目贡献者
              </DialogTitle>
              <DialogDescription>
                以下是当前监控会话中活跃的项目贡献者（点击头像跳转 GitHub 主页）。
              </DialogDescription>
            </DialogHeader>

            <ScrollArea className="mt-4 max-h-[320px] pr-3">
              {contributors.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                  暂无活跃贡献者事件记录。
                </div>
              ) : (
                <div className="flex flex-wrap gap-3 py-2 justify-center sm:justify-start">
                  {contributors.map((contrib) => {
                    const profileUrl = selectedRepository?.platform === 'GITLAB'
                      ? `https://gitlab.com/${contrib.username}`
                      : `https://github.com/${contrib.username}`;
                    
                    return (
                      <Tooltip key={contrib.username}>
                        <TooltipTrigger asChild>
                          <a
                            href={profileUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="group relative transition-all duration-200 hover:scale-110 active:scale-95"
                          >
                            <Avatar className="h-12 w-12 rounded-full border-2 border-border group-hover:border-primary transition-colors shadow-sm">
                              <AvatarImage 
                                src={contrib.avatarUrl ?? undefined} 
                                alt={contrib.username} 
                                className="object-cover" 
                              />
                              <AvatarFallback className="rounded-full bg-secondary text-sm font-semibold uppercase text-muted-foreground">
                                {contrib.username.slice(0, 2)}
                              </AvatarFallback>
                            </Avatar>
                          </a>
                        </TooltipTrigger>
                        <TooltipContent className="bg-popover text-foreground border border-border px-2 py-1 text-xs">
                          {contrib.username}
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
            
            <DialogFooter className="mt-4 border-t border-border pt-4">
              <Button 
                type="button" 
                variant="outline" 
                size="sm" 
                onClick={() => setIsContributorsOpen(false)}
              >
                关闭
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <SiriAnalysisPanel
          eventId={siriAnalysis.eventId}
          eventTitle={siriAnalysis.eventTitle}
          isOpen={siriAnalysis.isOpen}
          onClose={() => setSiriAnalysis((prev) => ({ ...prev, isOpen: false }))}
        />
      </div>
    </TooltipProvider>
  );
}
