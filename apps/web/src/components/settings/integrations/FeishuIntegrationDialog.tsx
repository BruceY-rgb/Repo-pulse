import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import {
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Clipboard,
  GitBranch,
  Loader2,
  RefreshCw,
  Save,
  Search,
  ChevronLeft,
  Trash2,
  Plus,
  Bot
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useLanguage } from '@/contexts/LanguageContext';
import { useRepositoryBranchesQuery } from '@/hooks/queries/use-repository-queries';
import { normalizeBranchOption, repositoryService } from '@/services/repository.service';
import {
  imService,
  type FeishuConnectionStatus,
  type FeishuConnectionTestResult,
  type ImStageStatus,
  type ImSubscription,
  type PairingCodeResult,
} from '@/services/im.service';
import type { Repository, RepositoryBranchScopeMap, RepositoryBranchScopeOption } from '@/types/api';
import { cn } from '@/lib/utils';

interface FeishuIntegrationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConnectionChange?: (connected: boolean) => void;
}

const GITHUB_EVENT_TYPES = [
  'PUSH',
  'PR_OPENED',
  'PR_MERGED',
  'PR_CLOSED',
  'PR_REVIEW',
  'ISSUE_OPENED',
  'ISSUE_CLOSED',
  'ISSUE_COMMENT',
  'RELEASE',
  'BRANCH_CREATED',
  'BRANCH_DELETED',
] as const;
const DEFAULT_EVENTS = ['PUSH', 'PR_OPENED', 'PR_MERGED', 'PR_CLOSED', 'ISSUE_OPENED', 'ISSUE_CLOSED'];
const FEISHU_PERMISSION_SCOPES_JSON = JSON.stringify({
  scopes: {
    tenant: [
      'contact:contact.base:readonly',
      'im:chat:readonly',
      'im:chat.members:read',
      'im:message',
      'im:message.group_at_msg:readonly',
      'im:message.group_msg',
      'im:message.p2p_msg:readonly',
      'im:message:send_as_bot',
      'im:resource',
    ],
    user: [],
  },
}, null, 2);

function getErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'response' in error) {
    const response = (error as { response?: { status?: number; data?: { message?: string } } }).response;
    if (response?.status === 401) return '登录已过期，请重新登录';
    if (response?.data?.message) return response.data.message;
  }
  if (error instanceof Error) return error.message;
  return 'Request failed';
}

function isUnauthorizedError(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === 'object' &&
    'response' in error &&
    (error as { response?: { status?: number } }).response?.status === 401,
  );
}

function isConnected(status: FeishuConnectionStatus | null): boolean {
  return Boolean(status?.connected || status?.state === 'connected' || status?.state === 'ready');
}

function buildFallbackStages(status: FeishuConnectionStatus | null): ImStageStatus[] {
  if (status?.stages?.length) return status.stages;
  return [
    {
      id: 'configured',
      state: status?.state && status.state !== 'not_configured' ? 'verified' : 'missing',
    },
    {
      id: 'credential_valid',
      state: isConnected(status) ? 'verified' : 'unknown',
    },
    {
      id: 'ws_connected',
      state: status?.state === 'ready' || status?.state === 'connected' ? 'verified' : 'unknown',
    },
    {
      id: 'bot_reachable',
      state: status?.state === 'ready' ? 'verified' : 'unknown',
    },
    {
      id: 'subscription_ready',
      state: 'unknown',
    },
  ];
}

function hasReadySubscription(status: FeishuConnectionStatus | null): boolean {
  return Boolean(
    status?.stages?.some((stage) => stage.id === 'subscription_ready' && stage.state === 'verified'),
  );
}

function normalizeSelectedEvents(events: string[] | undefined): string[] {
  const selected = (events || []).filter((event) =>
    (GITHUB_EVENT_TYPES as readonly string[]).includes(event),
  );
  return selected.length > 0 ? selected : DEFAULT_EVENTS;
}

function createDefaultSubscription(chatName: string): ImSubscription {
  return {
    id: 'default',
    chatName,
    repositoryIds: [],
    branches: [],
    repositoryBranchScopes: {},
    events: DEFAULT_EVENTS,
    enabled: true,
  };
}

function formatBranchSummary(branches: string[], fallbackLabel: string) {
  if (branches.length === 0) return fallbackLabel;
  if (branches.length === 1) return branches[0];
  return `${branches[0]} +${branches.length - 1}`;
}

function handleKeyboardClick(event: KeyboardEvent, action: () => void) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  action();
}

interface FeishuRepositorySubscriptionItemProps {
  repo: Repository;
  checked: boolean;
  expanded: boolean;
  branchSummary: string;
  selectedBranches: string[];
  allBranchesLabel: string;
  notSelectedLabel: string;
  onToggleRepository: (repositoryId: string) => void;
  onToggleExpanded: (repositoryId: string) => void;
  onToggleBranch: (repositoryId: string, branchName: string) => void;
  onResetBranches: (repositoryId: string) => void;
  t: (key: string) => string;
}

function FeishuRepositorySubscriptionItem({
  repo,
  checked,
  expanded,
  branchSummary,
  selectedBranches,
  allBranchesLabel,
  notSelectedLabel,
  onToggleRepository,
  onToggleExpanded,
  onToggleBranch,
  onResetBranches,
  t,
}: FeishuRepositorySubscriptionItemProps) {
  const branchesQuery = useRepositoryBranchesQuery(repo.id, expanded);
  const branchOptions = (branchesQuery.data ?? [])
    .map((branch) => normalizeBranchOption(branch))
    .filter((branch): branch is RepositoryBranchScopeOption => Boolean(branch));

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--github-border)]/80 bg-white/[0.02]">
      <div className="flex items-center gap-3 px-3 py-2">
        <div
          role="button"
          tabIndex={0}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          onClick={() => onToggleRepository(repo.id)}
          onKeyDown={(event) => handleKeyboardClick(event, () => onToggleRepository(repo.id))}
        >
          <Checkbox checked={checked} className="pointer-events-none border-[var(--github-border)]" />
          <GitBranch className="h-4 w-4 shrink-0 text-[var(--github-text-secondary)]" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{repo.fullName}</p>
            <p className="truncate text-xs text-[var(--github-text-secondary)]">
              {checked ? branchSummary : notSelectedLabel}
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-lg text-[var(--github-text-secondary)] hover:bg-white/5 hover:text-white"
          onClick={() => onToggleExpanded(repo.id)}
        >
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </Button>
      </div>

      {expanded ? (
        <div className="space-y-3 border-t border-[var(--github-border)]/80 bg-black/10 px-3 py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-[var(--github-text-secondary)]">
                {t('dashboard.scope.branches.title')}
              </p>
              <p className="mt-1 truncate text-xs text-[var(--github-text-secondary)]">
                {t('dashboard.scope.branches.description')}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 shrink-0 rounded-lg px-2 text-xs text-[var(--github-accent)] hover:bg-[var(--github-accent)]/10 hover:text-white"
              onClick={() => onResetBranches(repo.id)}
            >
              {allBranchesLabel}
            </Button>
          </div>

          {branchesQuery.isLoading ? (
            <div className="flex items-center gap-2 rounded-lg border border-[var(--github-border)]/70 bg-white/[0.03] px-3 py-3 text-sm text-[var(--github-text-secondary)]">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('dashboard.scope.branches.loading')}
            </div>
          ) : branchOptions.length === 0 ? (
            <div className="rounded-lg border border-[var(--github-border)]/70 bg-white/[0.03] px-3 py-3 text-sm text-[var(--github-text-secondary)]">
              {t('dashboard.scope.branches.empty')}
            </div>
          ) : (
            <div className="grid gap-2">
              {branchOptions.map((branch) => {
                const branchChecked = selectedBranches.includes(branch.name);

                return (
                  <div
                    key={`${repo.id}-${branch.name}`}
                    role="button"
                    tabIndex={0}
                    className="flex items-center gap-3 rounded-lg border border-[var(--github-border)]/70 bg-white/[0.02] px-3 py-2 text-left transition-colors hover:border-[var(--github-accent)]/40 hover:bg-white/[0.05]"
                    onClick={() => onToggleBranch(repo.id, branch.name)}
                    onKeyDown={(event) => handleKeyboardClick(event, () => onToggleBranch(repo.id, branch.name))}
                  >
                    <Checkbox checked={branchChecked} className="pointer-events-none border-[var(--github-border)]" />
                    <span className="min-w-0 flex-1 truncate text-sm text-white">{branch.name}</span>
                    {branch.isDefault ? (
                      <span className="rounded-full bg-[var(--github-accent)]/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--github-accent)]">
                        default
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function FeishuIntegrationDialog({
  open,
  onOpenChange,
  onConnectionChange,
}: FeishuIntegrationDialogProps) {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState('credentials');
  const [appId, setAppId] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [botName, setBotName] = useState('');
  const [status, setStatus] = useState<FeishuConnectionStatus | null>(null);
  const [testResult, setTestResult] = useState<FeishuConnectionTestResult | null>(null);
  const [pairingCode, setPairingCode] = useState<PairingCodeResult | null>(null);
  const [subscriptions, setSubscriptions] = useState<ImSubscription[]>([]);
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [repositorySearch, setRepositorySearch] = useState('');
  const [repositoryListMode, setRepositoryListMode] = useState<'monitored' | 'all'>('monitored');
  const [expandedRepositoryIds, setExpandedRepositoryIds] = useState<string[]>([]);
  const [guideOpen, setGuideOpen] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [loadingRepositories, setLoadingRepositories] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [sendingTestNotification, setSendingTestNotification] = useState(false);
  const [pairing, setPairing] = useState(false);
  const [savingSubscriptions, setSavingSubscriptions] = useState(false);
  const [statusError, setStatusError] = useState('');

  // 二级管理状态
  const [selectedBot, setSelectedBot] = useState<FeishuConnectionStatus | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const selectedBotRef = useRef<FeishuConnectionStatus | null>(null);
  selectedBotRef.current = selectedBot;

  const resetBotState = useCallback(() => {
    setSelectedBot(null);
    setAppId('');
    setAppSecret('');
    setBotName('');
    setTestResult(null);
    setPairingCode(null);
    setSubscriptions([]);
    setIsAdding(false);
    setActiveTab('credentials');
    setStatusError('');
  }, []);

  const stages = useMemo(() => buildFallbackStages(selectedBot), [selectedBot]);
  const connected = isConnected(selectedBot);
  const subscriptionReady = hasReadySubscription(selectedBot);
  const canSubmitCredentials = appId.trim().length > 0 && appSecret.trim().length > 0;

  const bots = useMemo(() => status?.bots || [], [status]);

  const getBaseSubscription = useCallback(() => (
    subscriptions[0] ?? createDefaultSubscription(t('settings.integrations.feishu.defaultChat'))
  ), [subscriptions, t]);

  const loadSubscriptionsForBot = useCallback(async (botId: string) => {
    try {
      const nextSubscriptions = await imService.listSubscriptions('feishu', botId);
      setSubscriptions(
        nextSubscriptions.length > 0
          ? nextSubscriptions
          : [createDefaultSubscription(t('settings.integrations.feishu.defaultChat'))],
      );
    } catch (error) {
      if (!isUnauthorizedError(error)) {
        setStatusError(getErrorMessage(error));
      }
      setSubscriptions([createDefaultSubscription(t('settings.integrations.feishu.defaultChat'))]);
    }
  }, [t]);

  const refreshStatus = useCallback(async (options?: { silent?: boolean; skipSelectedBotUpdate?: boolean }) => {
    if (!options?.silent) {
      setLoadingStatus(true);
    }
    setStatusError('');
    try {
      const nextStatus = await imService.getImStatus();
      const feishuStatus = nextStatus.feishu ?? null;
      setStatus(feishuStatus);
      onConnectionChange?.(isConnected(feishuStatus));

      const currentSelectedBot = selectedBotRef.current;
      if (currentSelectedBot && !options?.skipSelectedBotUpdate) {
        const updatedBot = feishuStatus?.bots?.find(b => b.appId === currentSelectedBot.appId) || currentSelectedBot;
        setSelectedBot(updatedBot);
        await loadSubscriptionsForBot(updatedBot.appId || '');
      }

      return feishuStatus;
    } catch (error) {
      setStatusError(getErrorMessage(error));
      if (isUnauthorizedError(error)) {
        onOpenChange(false);
      }
      setStatus(null);
      onConnectionChange?.(false);
      return null;
    } finally {
      if (!options?.silent) {
        setLoadingStatus(false);
      }
    }
  }, [onConnectionChange, onOpenChange, loadSubscriptionsForBot]);

  const loadRepositories = useCallback(async () => {
    setLoadingRepositories(true);
    try {
      const nextRepositories = await repositoryService.getAll();
      setRepositories(nextRepositories);
    } catch (error) {
      toast.error(getErrorMessage(error));
      setRepositories([]);
    } finally {
      setLoadingRepositories(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    void (async () => {
      const nextStatus = await refreshStatus();
      if (!cancelled && nextStatus) {
        await loadRepositories();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loadRepositories, open]); // Removed refreshStatus to avoid infinite loops

  useEffect(() => {
    if (!open || activeTab !== 'binding' || !pairingCode?.expiresAt || subscriptionReady || !selectedBot?.appId) return;

    const expiresAt = new Date(pairingCode.expiresAt).getTime();
    if (Number.isNaN(expiresAt) || expiresAt <= Date.now()) return;

    const interval = window.setInterval(() => {
      void refreshStatus({ silent: true }).then((nextStatus) => {
        const targetBot = nextStatus?.bots?.find(b => b.appId === selectedBot.appId);
        if (targetBot && hasReadySubscription(targetBot)) {
          toast.success(t('settings.integrations.feishu.bindingReady'));
          setActiveTab('subscriptions');
        }
      });
    }, 3000);

    return () => window.clearInterval(interval);
  }, [activeTab, open, pairingCode?.expiresAt, refreshStatus, subscriptionReady, t, selectedBot?.appId]);

  const handleSelectBot = async (bot: FeishuConnectionStatus) => {
    setSelectedBot(bot);
    setAppId(bot.appId ?? '');
    setAppSecret('');
    setBotName(bot.botName ?? '');
    setIsAdding(false);
    setTestResult(null);
    setPairingCode(null);
    setActiveTab('credentials');
    await loadSubscriptionsForBot(bot.appId || '');
  };

  const handleAddBotClick = () => {
    setSelectedBot(null);
    setAppId('');
    setAppSecret('');
    setBotName('');
    setIsAdding(true);
    setTestResult(null);
    setPairingCode(null);
    setActiveTab('credentials');
    setSubscriptions([createDefaultSubscription(t('settings.integrations.feishu.defaultChat'))]);
  };

  const handleDeleteBot = async (botAppId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    if (!window.confirm('确定要删除此机器人配置吗？')) return;
    try {
      const newStatus = await imService.deleteFeishuConnection(botAppId);
      setStatus(newStatus.feishu ?? null);
      toast.success('机器人配置已删除');
      if (selectedBot?.appId === botAppId) {
        setSelectedBot(null);
      }
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const saveCredentials = async () => {
    if (!canSubmitCredentials) {
      toast.error(t('settings.integrations.feishu.validation'));
      return;
    }

    setSaving(true);
    try {
      const nextBot = await imService.saveFeishuConnection({
        appId: appId.trim(),
        appSecret: appSecret.trim(),
        botName: botName.trim() || undefined,
      } as any);

      setTestResult(null);
      toast.success(t('settings.integrations.feishu.saved'));
      
      const updatedStatus = await imService.getImStatus();
      setStatus(updatedStatus.feishu ?? null);
      
      const foundBot = updatedStatus.feishu?.bots?.find(b => b.appId === nextBot.appId) || nextBot;
      setSelectedBot(foundBot);
      setIsAdding(false);
      
      setActiveTab('test');
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    if (!canSubmitCredentials) {
      toast.error(t('settings.integrations.feishu.validation'));
      return;
    }

    setTesting(true);
    setTestResult(null);
    try {
      const result = await imService.testFeishuConnection({
        appId: appId.trim(),
        appSecret: appSecret.trim(),
        botName: botName.trim() || undefined,
      } as any);
      setTestResult(result);
      const nextBotStatus = {
        provider: 'feishu' as const,
        appId: appId.trim(),
        botName: botName.trim() || undefined,
        state: result.state,
        connected: result.success,
        summary: result.message,
        nextStep: result.nextStep,
        stages: result.stages,
      };
      setSelectedBot(nextBotStatus);
      void refreshStatus({ silent: true });
      toast[result.success ? 'success' : 'error'](result.message);
    } catch (error) {
      const message = getErrorMessage(error);
      setTestResult({
        success: false,
        state: 'error',
        message,
        nextStep: t('settings.integrations.feishu.nextStepSecret'),
      });
      toast.error(message);
    } finally {
      setTesting(false);
    }
  };

  const createPairingCode = async () => {
    setPairing(true);
    try {
      const result = await imService.createPairingCode('feishu');
      setPairingCode(result);
      setActiveTab('binding');
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setPairing(false);
    }
  };

  const sendTestNotification = async () => {
    if (!selectedBot?.appId) return;
    setSendingTestNotification(true);
    try {
      const result = await imService.sendFeishuTestNotification(selectedBot.appId);
      toast[result.sent > 0 ? 'success' : 'error'](result.message);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSendingTestNotification(false);
    }
  };

  const copyPairingCommand = async () => {
    if (!pairingCode?.code) return;
    await navigator.clipboard.writeText(`/bind ${pairingCode.code}`);
    toast.success(t('settings.integrations.feishu.copied'));
  };

  const saveSubscriptions = async () => {
    if (!selectedBot?.appId) return;
    const draftSubscription = getBaseSubscription();

    setSavingSubscriptions(true);
    try {
      const nextSubscriptions = await imService.saveSubscriptions({
        subscriptions: [{
          ...draftSubscription,
          branches: [],
          repositoryBranchScopes: normalizedRepositoryBranchScopes,
          events: normalizeSelectedEvents(draftSubscription.events),
        }],
      }, 'feishu', selectedBot.appId);
      setSubscriptions(nextSubscriptions);
      toast.success(t('settings.integrations.feishu.subscriptionSaved'));
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSavingSubscriptions(false);
    }
  };

  const toggleEvent = (eventName: string) => {
    const baseSubscription = getBaseSubscription();
    const currentEvents = normalizeSelectedEvents(baseSubscription.events);
    const nextEvents = currentEvents.includes(eventName)
      ? currentEvents.filter((event) => event !== eventName)
      : [...currentEvents, eventName];

    setSubscriptions([{ ...baseSubscription, events: nextEvents }]);
  };

  const toggleSubscriptionEnabled = (enabled: boolean) => {
    const baseSubscription = getBaseSubscription();

    setSubscriptions([{ ...baseSubscription, enabled }]);
  };

  const selectAllRepositories = () => {
    const baseSubscription = getBaseSubscription();
    setSubscriptions([{ ...baseSubscription, repositoryIds: [], branches: [], repositoryBranchScopes: {} }]);
  };

  const toggleRepository = (repositoryId: string) => {
    const baseSubscription = getBaseSubscription();
    const currentRepositoryIds = allRepositoriesSelected ? [] : baseSubscription.repositoryIds || [];
    const nextRepositoryIds = currentRepositoryIds.includes(repositoryId)
      ? currentRepositoryIds.filter((id) => id !== repositoryId)
      : [...currentRepositoryIds, repositoryId];
    const nextRepositoryBranchScopes = { ...normalizedRepositoryBranchScopes };
    if (currentRepositoryIds.includes(repositoryId)) {
      delete nextRepositoryBranchScopes[repositoryId];
    }

    setSubscriptions([{
      ...baseSubscription,
      repositoryIds: nextRepositoryIds,
      branches: [],
      repositoryBranchScopes: nextRepositoryBranchScopes,
    }]);
  };

  const toggleExpandedRepository = (repositoryId: string) => {
    setExpandedRepositoryIds((current) =>
      current.includes(repositoryId)
        ? current.filter((id) => id !== repositoryId)
        : [...current, repositoryId],
    );
  };

  const toggleRepositoryBranch = (repositoryId: string, branchName: string) => {
    const baseSubscription = getBaseSubscription();
    const repositoryIds = allRepositoriesSelected
      ? [repositoryId]
      : selectedRepositoryIds.includes(repositoryId)
        ? selectedRepositoryIds
        : [...selectedRepositoryIds, repositoryId];
    const currentBranches = normalizedRepositoryBranchScopes[repositoryId] ?? [];
    const nextBranches = currentBranches.includes(branchName)
      ? currentBranches.filter((branch) => branch !== branchName)
      : [...currentBranches, branchName].sort((left, right) => left.localeCompare(right));

    setSubscriptions([{
      ...baseSubscription,
      repositoryIds,
      branches: [],
      repositoryBranchScopes: {
        ...normalizedRepositoryBranchScopes,
        [repositoryId]: nextBranches,
      },
    }]);
  };

  const resetRepositoryBranches = (repositoryId: string) => {
    if (allRepositoriesSelected || !selectedRepositoryIds.includes(repositoryId)) {
      return;
    }

    const baseSubscription = getBaseSubscription();
    setSubscriptions([{
      ...baseSubscription,
      branches: [],
      repositoryBranchScopes: {
        ...normalizedRepositoryBranchScopes,
        [repositoryId]: [],
      },
    }]);
  };

  const currentSubscription = subscriptions[0];
  const selectedEvents = normalizeSelectedEvents(currentSubscription?.events);
  const selectedRepositoryIds = useMemo(
    () => currentSubscription?.repositoryIds ?? [],
    [currentSubscription?.repositoryIds],
  );
  const allRepositoriesSelected = selectedRepositoryIds.length === 0;
  const availableRepositoryIds = useMemo(() => repositories.map((repository) => repository.id), [repositories]);
  const availableRepositoryIdSet = useMemo(() => new Set(availableRepositoryIds), [availableRepositoryIds]);
  const normalizedRepositoryBranchScopes: RepositoryBranchScopeMap = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(currentSubscription?.repositoryBranchScopes ?? {})
          .filter(([repositoryId]) => availableRepositoryIdSet.has(repositoryId))
          .map(([repositoryId, branches]) => [
            repositoryId,
            Array.from(new Set(branches)).sort((left, right) => left.localeCompare(right)),
          ]),
      ),
    [availableRepositoryIdSet, currentSubscription?.repositoryBranchScopes],
  );
  const visibleRepositories = useMemo(() => (
    repositoryListMode === 'monitored'
      ? repositories.filter((repository) =>
          allRepositoriesSelected
            ? repository.isActive
            : selectedRepositoryIds.includes(repository.id),
        )
      : repositories
  ), [allRepositoriesSelected, repositories, repositoryListMode, selectedRepositoryIds]);
  const filteredRepositories = useMemo(() => {
    const keyword = repositorySearch.trim().toLowerCase();
    if (!keyword) return visibleRepositories;
    return visibleRepositories.filter((repository) =>
      repository.fullName.toLowerCase().includes(keyword) ||
      repository.name.toLowerCase().includes(keyword),
    );
  }, [repositorySearch, visibleRepositories]);

  const copyPermissionScopes = async () => {
    await navigator.clipboard.writeText(FEISHU_PERMISSION_SCOPES_JSON);
    toast.success(t('settings.integrations.feishu.copied'));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] flex-col overflow-hidden border-[var(--github-border)] bg-[#0d1117] text-white sm:max-h-[min(760px,calc(100dvh-3rem))] sm:max-w-2xl">
        
        {/* Level 1: 机器人列表视图 */}
        {!selectedBot && !isAdding ? (
          <>
            <DialogHeader className="shrink-0 flex flex-row items-center justify-between pb-4 border-b border-[var(--github-border)]">
              <div>
                <DialogTitle className="text-lg font-bold text-white flex items-center gap-2">
                  <Bot className="h-5 w-5 text-[var(--github-accent)]" />
                  飞书多机器人管理
                </DialogTitle>
                <DialogDescription className="text-[var(--github-text-secondary)] mt-1">
                  同一个飞书渠道中，您可以配置多个不同的机器人，并为其分别指定订阅的仓库和规则。
                </DialogDescription>
              </div>
              <Button onClick={handleAddBotClick} className="btn-x-primary h-8 text-xs font-semibold px-3 gap-1">
                <Plus className="h-3.5 w-3.5" />
                新增机器人
              </Button>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto py-4 space-y-3 min-h-0">
              {loadingStatus ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <Loader2 className="h-6 w-6 animate-spin text-[var(--github-accent)]" />
                  <p className="text-xs text-[var(--github-text-secondary)]">加载配置列表中...</p>
                </div>
              ) : bots.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 border border-dashed border-[var(--github-border)] rounded-xl bg-white/[0.01]">
                  <Bot className="h-10 w-10 text-[var(--github-text-secondary)] opacity-50 mb-3" />
                  <p className="text-sm font-medium text-[var(--github-text-secondary)]">暂未配置任何飞书机器人</p>
                  <p className="text-xs text-[var(--github-text-secondary)]/70 mt-1 mb-4">连接自定义飞书机器人以开启通知推送</p>
                  <Button onClick={handleAddBotClick} size="sm" className="btn-x-primary text-xs h-8">
                    添加第一个机器人
                  </Button>
                </div>
              ) : (
                <div className="grid gap-3">
                  {bots.map((bot) => {
                    const isBotReady = bot.state === 'ready';
                    return (
                      <div
                        key={bot.appId}
                        onClick={() => handleSelectBot(bot)}
                        className="group flex items-center justify-between p-4 rounded-xl border border-[var(--github-border)] bg-card/20 hover:bg-white/5 hover:border-[var(--github-accent)]/30 transition-all cursor-pointer"
                      >
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "flex h-9 w-9 items-center justify-center rounded-lg border transition-all duration-200 bg-white/5 border-border/40",
                            isBotReady && "bg-primary/10 border-primary/20 text-primary"
                          )}>
                            <Bot className="h-4.5 w-4.5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-semibold text-white group-hover:text-[var(--github-accent)] transition-colors">
                                {bot.botName || '未命名机器人'}
                              </p>
                              {bot.isDefault && (
                                <Badge className="bg-[var(--github-accent)]/15 text-[var(--github-accent)] hover:bg-[var(--github-accent)]/15 border-transparent text-[10px] scale-90">
                                  默认
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-[var(--github-text-secondary)] mt-0.5">App ID: {bot.appId}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Badge className={cn(
                            "text-[11px] font-medium border-transparent",
                            isBotReady ? "bg-green-400/10 text-green-400" :
                            bot.state === 'error' ? "bg-red-400/10 text-red-400" :
                            "bg-amber-400/10 text-amber-400"
                          )}>
                            {isBotReady ? '在线 / Ready' : bot.state === 'configured' ? '已配置' : '连接异常'}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(event) => handleDeleteBot(bot.appId || '', event)}
                            className="h-8 w-8 text-[var(--github-text-secondary)] hover:text-red-400 hover:bg-white/5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                          <ChevronRight className="h-4 w-4 text-[var(--github-text-secondary)] group-hover:text-white transition-colors" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            
            <DialogFooter className="shrink-0 border-t border-[var(--github-border)] pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="border-[var(--github-border)] h-8 text-xs font-semibold rounded-lg">
                关闭
              </Button>
            </DialogFooter>
          </>
        ) : (
          /* Level 2: 机器人详情管理视图 */
          <>
            <DialogHeader className="shrink-0 border-b border-[var(--github-border)] pb-3">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    resetBotState();
                    void refreshStatus({ skipSelectedBotUpdate: true });
                  }}
                  className="h-8 px-2 text-[var(--github-accent)] hover:bg-white/5 rounded-lg"
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  返回列表
                </Button>
                <Separator orientation="vertical" className="h-4 bg-[var(--github-border)]" />
                <DialogTitle className="text-base font-bold text-white">
                  {isAdding ? '新增飞书机器人' : `配置: ${selectedBot?.botName || '未命名机器人'}`}
                </DialogTitle>
                {connected && !isAdding ? (
                  <Badge className="bg-green-400/20 text-green-400">
                    {t('settings.integrations.connected')}
                  </Badge>
                ) : null}
              </div>
              <DialogDescription className="text-[var(--github-text-secondary)] mt-1 ml-2">
                {selectedBot?.summary || testResult?.message || '配置机器人凭证、测试连接状态、完成群聊绑定以及订阅规则设置。'}
              </DialogDescription>
            </DialogHeader>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex min-h-0 flex-1 flex-col gap-4 pt-3">
              <TabsList className="grid w-full shrink-0 grid-cols-4 border border-[var(--github-border)] bg-[var(--github-surface)]">
                <TabsTrigger value="credentials">{t('settings.integrations.feishu.tab.credentials')}</TabsTrigger>
                <TabsTrigger value="test" disabled={isAdding}>{t('settings.integrations.feishu.tab.test')}</TabsTrigger>
                <TabsTrigger value="binding" disabled={isAdding}>{t('settings.integrations.feishu.tab.binding')}</TabsTrigger>
                <TabsTrigger value="subscriptions" disabled={isAdding}>{t('settings.integrations.feishu.tab.subscriptions')}</TabsTrigger>
              </TabsList>

              <TabsContent value="credentials" className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
                {loadingStatus ? (
                  <div className="flex items-center gap-2 rounded-lg border border-[var(--github-border)] bg-white/5 px-3 py-2 text-xs text-[var(--github-text-secondary)]">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--github-accent)]" />
                    {t('settings.integrations.feishu.stageState.unknown')}
                  </div>
                ) : null}

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="feishu-bot-name">机器人名称 (自定义)</Label>
                    <Input
                      id="feishu-bot-name"
                      value={botName}
                      onChange={(event) => setBotName(event.target.value)}
                      className="border-[var(--github-border)] bg-[var(--github-surface)]"
                      placeholder="e.g. 项目告警机器人"
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="feishu-app-id">{t('settings.integrations.feishu.appId')}</Label>
                      <Input
                        id="feishu-app-id"
                        value={appId}
                        onChange={(event) => setAppId(event.target.value)}
                        className="border-[var(--github-border)] bg-[var(--github-surface)]"
                        placeholder="cli_xxxxxxxxxx"
                        disabled={!isAdding}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="feishu-app-secret">{t('settings.integrations.feishu.appSecret')}</Label>
                      <Input
                        id="feishu-app-secret"
                        type="password"
                        value={appSecret}
                        onChange={(event) => setAppSecret(event.target.value)}
                        className="border-[var(--github-border)] bg-[var(--github-surface)]"
                        placeholder={isAdding ? "••••••••" : "留空则保持原密钥"}
                      />
                    </div>
                  </div>
                </div>

                <Collapsible open={guideOpen} onOpenChange={setGuideOpen}>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 px-0 text-[var(--github-accent)] hover:bg-transparent">
                      {t('settings.integrations.feishu.guide')}
                      <ChevronDown className="ml-1 h-4 w-4" />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="rounded-lg border border-[var(--github-border)] bg-white/5 p-3 text-xs leading-6 text-[var(--github-text-secondary)]">
                      <p>{t('settings.integrations.feishu.guideStep1')}</p>
                      <p>{t('settings.integrations.feishu.guideStep2')}</p>
                      <p>{t('settings.integrations.feishu.guideStep3')}</p>
                      <p>{t('settings.integrations.feishu.guideStep4')}</p>
                      <p>{t('settings.integrations.feishu.guideStep5')}</p>
                      <div className="mt-3 flex flex-col gap-2 rounded-md border border-[var(--github-border)] bg-[var(--github-surface)] p-2 sm:flex-row sm:items-center sm:justify-between">
                        <code className="text-[11px] text-white">
                          {t('settings.integrations.feishu.permissionScopes')}
                        </code>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 shrink-0 border-[var(--github-border)] text-xs"
                          onClick={copyPermissionScopes}
                        >
                          {t('settings.integrations.feishu.copy')}
                        </Button>
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </TabsContent>

              <TabsContent value="test" className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
                <div className="grid gap-3 sm:grid-cols-5">
                  {stages.map((stage) => (
                    <div key={stage.id} className="rounded-lg border border-[var(--github-border)] bg-white/5 p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="truncate text-xs font-medium text-white">
                          {t(`settings.integrations.feishu.stage.${stage.id}`)}
                        </p>
                        {stage.state === 'verified' ? (
                          <CheckCircle className="h-4 w-4 shrink-0 text-green-400" />
                        ) : stage.state === 'error' || stage.state === 'missing' ? (
                          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
                        ) : (
                          <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--github-text-secondary)]" />
                        )}
                      </div>
                      <p className="text-[11px] text-[var(--github-text-secondary)]">
                        {stage.message || t(`settings.integrations.feishu.stageState.${stage.state}`)}
                      </p>
                    </div>
                  ))}
                </div>

                {(statusError || testResult?.nextStep || selectedBot?.nextStep) ? (
                  <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-xs text-amber-100">
                    {statusError || testResult?.nextStep || selectedBot?.nextStep}
                  </div>
                ) : null}
              </TabsContent>

              <TabsContent value="binding" className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
                <div className="rounded-lg border border-[var(--github-border)] bg-white/5 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-medium text-white">
                        {pairingCode?.code ? `/bind ${pairingCode.code}` : t('settings.integrations.feishu.noPairingCode')}
                      </p>
                      <p className="mt-1 text-xs text-[var(--github-text-secondary)]">
                        {pairingCode?.expiresAt
                          ? t('settings.integrations.feishu.expiresAt', { time: new Date(pairingCode.expiresAt).toLocaleTimeString() })
                          : t('settings.integrations.feishu.bindingHint')}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-[var(--github-border)]"
                      disabled={!pairingCode?.code}
                      onClick={copyPairingCommand}
                    >
                      <Clipboard className="mr-2 h-4 w-4" />
                      {t('settings.integrations.feishu.copy')}
                    </Button>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="subscriptions" className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
                <div className="flex items-center justify-between rounded-lg border border-[var(--github-border)] bg-white/5 p-3">
                  <p className="text-sm text-white">
                    {t('settings.integrations.feishu.subscriptionEnabled')}
                  </p>
                  <Switch
                    checked={currentSubscription?.enabled ?? true}
                    onCheckedChange={toggleSubscriptionEnabled}
                  />
                </div>

                <div className="space-y-2">
                  <Label>{t('settings.integrations.feishu.repositories')}</Label>
                  <div className="overflow-hidden rounded-lg border border-[var(--github-border)] bg-white/[0.02]">
                    <div
                      role="button"
                      tabIndex={0}
                      className="flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left hover:bg-white/5"
                      onClick={selectAllRepositories}
                      onKeyDown={(event) => handleKeyboardClick(event, selectAllRepositories)}
                    >
                      <Checkbox
                        checked={allRepositoriesSelected}
                        aria-label={t('settings.integrations.feishu.allRepositories')}
                        className="pointer-events-none border-[var(--github-border)]"
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white">
                          {t('settings.integrations.feishu.allRepositories')}
                        </p>
                        <p className="mt-1 truncate text-xs text-[var(--github-text-secondary)]">
                          {t('settings.integrations.feishu.allRepositoriesHint')}
                        </p>
                      </div>
                    </div>

                    <Separator className="bg-[var(--github-border)]" />

                    <div className="p-2">
                      <div className="mb-2 grid grid-cols-2 rounded-md border border-[var(--github-border)] bg-[var(--github-surface)] p-1">
                        <button
                          type="button"
                          className={`h-8 rounded px-2 text-xs font-medium transition-colors ${
                            repositoryListMode === 'monitored'
                              ? 'bg-[var(--github-accent)] text-white'
                              : 'text-[var(--github-text-secondary)] hover:bg-white/5 hover:text-white'
                          }`}
                          onClick={() => setRepositoryListMode('monitored')}
                        >
                          {t('settings.integrations.feishu.repositoryMode.monitored')}
                        </button>
                        <button
                          type="button"
                          className={`h-8 rounded px-2 text-xs font-medium transition-colors ${
                            repositoryListMode === 'all'
                              ? 'bg-[var(--github-accent)] text-white'
                              : 'text-[var(--github-text-secondary)] hover:bg-white/5 hover:text-white'
                          }`}
                          onClick={() => setRepositoryListMode('all')}
                        >
                          {t('settings.integrations.feishu.repositoryMode.all')}
                        </button>
                      </div>
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--github-text-secondary)]" />
                        <Input
                          value={repositorySearch}
                          onChange={(event) => setRepositorySearch(event.target.value)}
                          className="h-9 border-[var(--github-border)] bg-[var(--github-surface)] pl-9 text-sm"
                          placeholder={t('settings.integrations.feishu.repositorySearch')}
                        />
                      </div>
                    </div>

                    <div className="max-h-80 overflow-y-auto px-2 pb-2">
                      {loadingRepositories ? (
                        <div className="flex items-center justify-center py-6">
                          <Loader2 className="h-4 w-4 animate-spin text-[var(--github-accent)]" />
                        </div>
                      ) : visibleRepositories.length === 0 ? (
                        <div className="px-2 py-4 text-xs text-[var(--github-text-secondary)]">
                          {repositoryListMode === 'monitored'
                            ? t('settings.integrations.feishu.noRepositories')
                            : t('settings.integrations.feishu.noAllRepositories')}
                        </div>
                      ) : filteredRepositories.length === 0 ? (
                        <div className="px-2 py-4 text-xs text-[var(--github-text-secondary)]">
                          {t('settings.integrations.feishu.noRepositoryMatches')}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {filteredRepositories.map((repository) => {
                            const selectedBranches = normalizedRepositoryBranchScopes[repository.id] ?? [];
                            const checked = selectedRepositoryIds.includes(repository.id);
                            const branchSummary = formatBranchSummary(
                              selectedBranches,
                              t('dashboard.scope.row.allBranches'),
                            );

                            return (
                              <FeishuRepositorySubscriptionItem
                                key={repository.id}
                                repo={repository}
                                checked={checked}
                                expanded={expandedRepositoryIds.includes(repository.id)}
                                branchSummary={branchSummary}
                                selectedBranches={selectedBranches}
                                allBranchesLabel={t('dashboard.scope.row.allBranches')}
                                notSelectedLabel={t('settings.integrations.feishu.repositoryNotSelected')}
                                onToggleRepository={toggleRepository}
                                onToggleExpanded={toggleExpandedRepository}
                                onToggleBranch={toggleRepositoryBranch}
                                onResetBranches={resetRepositoryBranches}
                                t={t}
                              />
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  {GITHUB_EVENT_TYPES.map((eventName) => (
                    <div key={eventName} className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-[var(--github-border)] bg-white/5 p-3">
                      <p className="truncate text-sm text-white">
                        {t(`settings.integrations.feishu.event.${eventName}`)}
                      </p>
                      <Switch
                        checked={selectedEvents.includes(eventName)}
                        onCheckedChange={() => toggleEvent(eventName)}
                      />
                    </div>
                  ))}
                </div>
              </TabsContent>
            </Tabs>

            <Separator className="shrink-0 bg-[var(--github-border)] mt-4" />

            <DialogFooter className="shrink-0 gap-2 pt-3">
              {activeTab === 'credentials' ? (
                <Button onClick={saveCredentials} disabled={saving || !canSubmitCredentials} className="btn-x-primary gap-2">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {t('settings.integrations.feishu.save')}
                </Button>
              ) : null}
              {activeTab === 'test' ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={sendTestNotification}
                    disabled={sendingTestNotification}
                    className="gap-2 border-[var(--github-border)]"
                  >
                    {sendingTestNotification ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    {t('settings.integrations.feishu.testPush')}
                  </Button>
                  <Button onClick={testConnection} disabled={testing || !canSubmitCredentials} className="btn-x-primary gap-2">
                    {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    {t('settings.integrations.feishu.test')}
                  </Button>
                </>
              ) : null}
              {activeTab === 'binding' ? (
                <Button onClick={createPairingCode} disabled={pairing} className="btn-x-primary gap-2">
                  {pairing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  {t('settings.integrations.feishu.generateCode')}
                </Button>
              ) : null}
              {activeTab === 'subscriptions' ? (
                <Button onClick={saveSubscriptions} disabled={savingSubscriptions} className="btn-x-primary gap-2">
                  {savingSubscriptions ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {t('settings.integrations.feishu.saveSubscriptions')}
                </Button>
              ) : null}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
